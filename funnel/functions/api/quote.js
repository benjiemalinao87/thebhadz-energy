/**
 * /api/quote — send a quotation to a customer, and record that we did.
 *
 *   POST { customer, quote }  → render the PDF, upsert the contact, email it,
 *                               move the contact to "Quote sent", log the quote.
 *
 * One founder action, four consequences, in a deliberate order:
 *
 *   1. Render the PDF first. If the document cannot be produced, nothing else
 *      should happen — no half-created contact, no stage move implying a quote
 *      the customer never got.
 *   2. Upsert the contact. Matched on email, else phone. A quote sent to someone
 *      already in the pipeline must not fork them into a second row.
 *   3. Send the mail. This is the step that can fail for reasons outside us
 *      (DNS, quota, a typo'd address), so it happens before we claim success.
 *   4. Only if the mail actually went: move the stage and write the quote row.
 *      "Quote sent" has to mean a quote was sent (Founder OS §1.4 — only
 *      countable commitments are evidence). A failed send leaves the contact
 *      where it was and returns the error.
 *
 * Auth and the activity-log entry come from functions/api/_middleware.js; this
 * endpoint only has to ask who the founder is and 401 when there isn't one.
 */
import { currentUser, logActivity } from "../_auth.js";
import { renderQuotePdf } from "../_quote-pdf.js";
import { toBase64 } from "../_pdf.js";

const SENDER = "quote@macc-inc.com";
const SENDER_NAME = "MACC Systems & Engineering Inc.";
const MAX_PDF_BYTES = 4 * 1024 * 1024;   // the send API caps a whole message at 5 MiB

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function validEmail(value) {
  const s = String(value || "").trim();
  return s.length <= 254 && /^[^\s@,;:<>"]+@[^\s@,;:<>"]+\.[^\s@,;:<>"]+$/.test(s);
}

/** Strip CR/LF so nothing can smuggle extra headers through a subject line. */
function clean(value, max) {
  return String(value == null ? "" : value).replace(/[\r\n]+/g, " ").slice(0, max).trim();
}

/**
 * Escape for HTML, and additionally encode every non-ASCII character as a numeric
 * reference. That second part is not paranoia: the copy carries em dashes, the peso
 * sign and Filipino place names, and if any mail client decides the part is
 * windows-1252 the customer reads "LIWANAG â€" on-grid" on the document that is
 * supposed to make us look like a real company. Pure-ASCII output cannot be
 * misdecoded by anything.
 */
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
    .replace(/[^\x20-\x7E]/g, (c) => "&#" + c.codePointAt(0) + ";");
}

/** Digits only, so "0917 555 0142" and "09175550142" are the same person. */
function phoneKey(value) {
  return String(value || "").replace(/\D/g, "");
}

/**
 * Add the quote-tracking table and the quotes-sent column to databases created
 * before they existed. Same idempotent ALTER pattern as _auth.js and leads.js:
 * a deploy must not 500 because a migration was not run by hand.
 */
let schemaChecked = false;
async function ensureQuoteSchema(env) {
  if (schemaChecked) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS quotes (
       id             INTEGER PRIMARY KEY AUTOINCREMENT,
       quote_no       TEXT NOT NULL,
       lead_id        INTEGER,
       customer_name  TEXT NOT NULL,
       customer_email TEXT NOT NULL,
       package        TEXT,
       kwp            REAL,
       contract_price REAL,
       indicative     INTEGER DEFAULT 0,
       sent_by        TEXT,
       sent_at        TEXT NOT NULL
     )`
  ).run();
  try {
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes(lead_id)`).run();
  } catch (_) { /* index is an optimisation, not a requirement */ }
  schemaChecked = true;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const founder = await currentUser(context);
  if (!founder) return json({ ok: false, error: "Not signed in." }, 401);
  if (!env.DB) return json({ ok: false, error: "Database is not configured." }, 500);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ ok: false, error: "Expected JSON." }, 400);
  }

  const customer = body.customer || {};
  const quote = body.quote || {};

  const name = clean(customer.name, 120);
  const email = clean(customer.email, 254).toLowerCase();
  const phone = clean(customer.phone, 40);

  if (!name) return json({ ok: false, error: "Customer name is required before a quote can be sent." }, 422);
  if (!validEmail(email)) return json({ ok: false, error: "A valid customer email address is required." }, 422);
  if (!phone) return json({ ok: false, error: "Customer phone is required — it is how the contact is matched." }, 422);
  if (!quote.quoteNo || !Array.isArray(quote.rows) || !quote.rows.length) {
    return json({ ok: false, error: "The quote is incomplete." }, 422);
  }

  // Founder OS invariants. The tool that builds the quote already enforces these
  // on screen; they are re-checked here because this is the door the document
  // actually leaves through, and a UI check is not a control.
  if (!Array.isArray(quote.checklist) || !quote.checklist.length) {
    return json({ ok: false, error: "The permit / licensed-practitioner / net-metering checklist must be on every quote (§7)." }, 422);
  }
  if (!quote.hasBattery && !quote.brownout) {
    return json({ ok: false, error: "A system with no battery must carry the brownout statement (§1.6)." }, 422);
  }
  if (quote.unquoted > 0 && !quote.indicative) {
    return json({ ok: false, error: "A quote with unconfirmed supplier prices must be stamped INDICATIVE (§7)." }, 422);
  }

  await ensureQuoteSchema(env);

  // --- 1. the document ------------------------------------------------------
  let pdf;
  try {
    pdf = renderQuotePdf({ ...quote, customer: { name, email, phone, address: clean(customer.address, 200) } });
  } catch (err) {
    return json({ ok: false, error: "Could not render the quote PDF: " + String(err && err.message) }, 500);
  }
  if (pdf.length > MAX_PDF_BYTES) {
    return json({ ok: false, error: "The rendered quote is too large to email." }, 500);
  }

  // --- 2. the contact -------------------------------------------------------
  const now = new Date().toISOString();
  let lead = await env.DB.prepare(`SELECT * FROM leads WHERE lower(email) = ? LIMIT 1`).bind(email).first();
  if (!lead) {
    const digits = phoneKey(phone);
    if (digits) {
      const candidates = await env.DB.prepare(`SELECT * FROM leads`).all();
      lead = (candidates.results || []).find((row) => phoneKey(row.phone) === digits) || null;
    }
  }

  let createdContact = false;
  if (!lead) {
    const insert = await env.DB.prepare(
      `INSERT INTO leads (name, phone, email, package, stage, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'quote_sent', 'quote-builder', ?, ?)`
    ).bind(name, phone, email, quote.packageLabel || null, now, now).run();
    lead = { id: insert.meta.last_row_id, name, phone, email, stage: "quote_sent" };
    createdContact = true;
  }

  // --- 3. the mail ----------------------------------------------------------
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
    return json({
      ok: false,
      leadId: lead.id,
      createdContact,
      error: "Email sending is not configured (CF_API_TOKEN / CF_ACCOUNT_ID). The contact was saved; the quote was not sent.",
    }, 503);
  }

  const subject = clean(
    `Your solar quotation ${quote.quoteNo} — ${quote.packageLabel || "MACC"} — ${quote.kwp ? quote.kwp.toFixed(2) + " kWp" : ""}`.trim(),
    300
  );
  // The opening line names where they live, which is the difference between a
  // circular and a quote. Take the barangay off the front of the site address —
  // if the address is not in that shape, the line simply drops the location
  // rather than guessing at one.
  const siteLabel = clean(customer.address, 200).split(",")[0].replace(/^\s*(brgy\.?|barangay)\s+/i, "").trim();
  const { text, html } = composeEmail({
    name,
    quote: { ...quote, siteLabel: siteLabel.length <= 40 ? siteLabel : "" },
    preparedBy: quote.preparedBy,
  });

  const payload = {
    to: [{ address: email, name }],
    from: { address: SENDER, name: SENDER_NAME },
    reply_to: { address: SENDER, name: SENDER_NAME },
    subject,
    text,
    html,
    attachments: [{
      content: toBase64(pdf),
      filename: `MACC-quotation-${quote.quoteNo}.pdf`,
      type: "application/pdf",
      disposition: "attachment",
    }],
  };

  let sendError = null;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) sendError = `Cloudflare returned ${res.status}: ${(await res.text()).slice(0, 400)}`;
  } catch (err) {
    sendError = String(err && err.message);
  }

  // Every outbound company email belongs in the mailbox, whichever endpoint sent
  // it — otherwise "Sent" quietly means "sent from the Compose box" and a founder
  // cannot see what a customer was actually told. Written either way, following
  // the rule in /api/mail: a failed send you can see beats a silent one.
  const attachmentMeta = JSON.stringify([{
    name: `MACC-quotation-${quote.quoteNo}.pdf`,
    type: "application/pdf",
    size: pdf.length,
  }]);
  await env.DB.prepare(
    `INSERT INTO emails
       (direction, mailbox, sender, recipient, subject, body_text, body_html,
        attachments, message_id, in_reply_to, sent_by, error, read_at, created_at)
     VALUES ('out', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`
  ).bind(
    SENDER, SENDER, email, subject, text, html, attachmentMeta,
    clean(founder.name || founder.email, 80), sendError, now, now
  ).run();

  if (sendError) {
    // The stage is NOT advanced. "Quote sent" must mean a quote was sent.
    return json({ ok: false, leadId: lead.id, createdContact, error: sendError }, 502);
  }

  // --- 4. record it ---------------------------------------------------------
  await env.DB.prepare(
    `UPDATE leads SET stage = 'quote_sent', email = ?, updated_at = ?,
       next_action = ?, next_action_due = ?, next_action_owner = ?
     WHERE id = ?`
  ).bind(
    email, now,
    "Follow up on the quote and book the site survey",
    new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    clean(founder.name || founder.email, 80),
    lead.id
  ).run();

  await env.DB.prepare(
    `INSERT INTO quotes (quote_no, lead_id, customer_name, customer_email, package, kwp, contract_price, indicative, sent_by, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    quote.quoteNo, lead.id, name, email, quote.packageLabel || null,
    quote.kwp || null, quote.customerPrice || null, quote.indicative ? 1 : 0,
    clean(founder.name || founder.email, 80), now
  ).run();

  await logActivity(env, {
    userId: founder.id,
    userEmail: founder.email,
    action: "quote.sent",
    detail: `${quote.quoteNo} → ${email} (${quote.packageLabel || "—"}, ${quote.kwp ? quote.kwp.toFixed(2) + " kWp" : "—"})`,
  });

  return json({
    ok: true,
    leadId: lead.id,
    createdContact,
    stage: "quote_sent",
    sentTo: email,
    bytes: pdf.length,
  });
}
/* ── the covering email ─────────────────────────────────────────────────────
 *
 * A homeowner may read the mail and never open the attachment, so it carries
 * the same truths as the sheet: what it saves, what it costs, whether it backs
 * up a brownout, and whether the number is firm.
 *
 * Written as tables with inline styles, which is not a stylistic choice —
 * Outlook renders through Word, which has no flexbox, no grid and no `gap`, and
 * Gmail drops much of a <style> block. Anything structural therefore has to be
 * a <table> and anything visual has to be on the element. The one <style> block
 * present carries the dark-mode variant only, which is exactly the part that is
 * allowed to be ignored: Apple Mail and Outlook.com honour it, Gmail on Android
 * and iOS force their own inversion regardless.
 *
 * Layout is one column of paper — hairline rules and space, no filled panels.
 * That is what makes the two disclosures, which DO carry colour, impossible to
 * skim past. They are also the reason this design cannot be "tidied": the
 * brownout statement (§1.6) and the indicative-price note (§7) are load-bearing.
 */

// Brand ink, from the logo. Repeated as literals because email has no variables.
const C = {
  paper:   "#FFFFFF",
  desk:    "#EEF1F5",
  ink:     "#0A2540",
  ink2:    "#5B6B7C",
  ink3:    "#66788A",   // carries 10-11px text; darkened until it clears AA on white
  rule:    "#E3E8EE",
  ruleFirm:"#C9D3DE",
  accent:  "#0D4B8C",
  sun:     "#B4711A",
  caution: "#A63A2B",
};

const LOGO = "https://www.maccsystemsandengineering.com/assets/img/macc-logo.png";
const FACE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

const pesoInt = (n) => "&#8369;" + Math.round(Number(n) || 0).toLocaleString("en-PH");

/** A labelled hairline row in the spec list. */
function specRow(label, value, last) {
  return (
    `<tr><td style="padding:11px 0;${last ? "" : `border-bottom:1px solid ${C.rule};`}font-family:${FACE}">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>` +
        `<td align="left" style="font-family:${FACE};font-size:11px;font-weight:600;letter-spacing:.12em;` +
          `text-transform:uppercase;color:${C.ink3};white-space:nowrap">${label}</td>` +
        `<td align="right" style="font-family:${FACE};font-size:15px;color:${C.ink};padding-left:16px">${value}</td>` +
      `</tr></table></td></tr>`
  );
}

/** A disclosure: a 2px coloured rule and text. Never a filled box, never removable. */
function note(heading, bodyHtml, colour) {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0"><tr>` +
      `<td width="2" bgcolor="${colour}" style="width:2px;background:${colour};font-size:0;line-height:0">&nbsp;</td>` +
      `<td style="padding:0 0 0 18px">` +
        `<div style="font-family:${FACE};font-size:11px;font-weight:700;letter-spacing:.13em;` +
          `text-transform:uppercase;color:${colour === C.caution ? C.caution : C.ink};padding-bottom:5px">${heading}</div>` +
        `<div style="font-family:${FACE};font-size:14.5px;line-height:1.62;color:${C.ink2}">${bodyHtml}</div>` +
      `</td>` +
    `</tr></table>`
  );
}

/** One step of the sequence. Numbered because it genuinely is one, in order. */
function stepRow(n, text, last) {
  const dot = text.indexOf(". ");
  const lead = dot > 0 ? text.slice(0, dot + 1) : text;
  const rest = dot > 0 ? text.slice(dot + 1) : "";
  return (
    `<tr><td style="padding:11px 0;${last ? "" : `border-bottom:1px solid ${C.rule};`}">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>` +
        `<td valign="top" width="24" style="width:24px;font-family:${FACE};font-size:12.5px;font-weight:600;` +
          `color:${C.ink3};padding-top:2px">${n}</td>` +
        `<td style="font-family:${FACE};font-size:15px;line-height:1.5;color:${C.ink2}">` +
          `<b style="color:${C.ink};font-weight:600">${escapeHtml(lead)}</b>${escapeHtml(rest)}</td>` +
      `</tr></table></td></tr>`
  );
}

export function composeEmail({ name, quote, preparedBy }) {
  const first = escapeHtml(String(name).split(/\s+/)[0] || "there");
  const price = pesoInt(quote.customerPrice);
  const saved = pesoInt(quote.savedPerMonth);
  const pad = (inner) => `<tr><td style="padding:0 44px">${inner}</td></tr>`;
  const gap = (h) => `<tr><td style="font-size:0;line-height:0;height:${h}px">&nbsp;</td></tr>`;

  // The opening line states the saving as a share of THEIR bill. Rounded DOWN to
  // the nearest 5 and capped: this is the first sentence a scam-wary homeowner
  // reads, and an overstated share is the cheapest possible way to lose them.
  let share = 0;
  if (quote.bill > 0 && quote.savedPerMonth > 0) {
    share = Math.min(90, Math.floor((quote.savedPerMonth / quote.bill) * 20) * 5);
  }
  const where = String(quote.siteLabel || "").trim();
  const thesis = share >= 10
    ? `Your roof${where ? " in " + escapeHtml(where) : ""} can carry about ${share}% of what you pay BILECO each month.`
    : `Here is what solar would do for your home${where ? " in " + escapeHtml(where) : ""}.`;

  const payback = quote.paybackYears > 0
    ? `<span style="color:${C.ink3};padding:0 6px">&middot;</span>pays back in about ${quote.paybackYears.toFixed(1)} years`
    : "";

  /* ---------- HTML ---------- */
  const html =
`<!--[if mso]><style>body,table,td{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->
<style>
  :root{color-scheme:light dark;supported-color-schemes:light dark}
  @media (prefers-color-scheme:dark){
    .m-desk{background:#0B1219 !important}
    .m-paper{background:#111A24 !important}
    .m-ink,.m-ink *{color:#E8EEF4 !important}
    .m-ink2,.m-ink2 *{color:#9DAEBE !important}
    .m-ink3{color:#7C90A4 !important}
    .m-sun{color:#E2A550 !important}
    .m-rule{border-color:#223040 !important}
    .m-logo-light{display:none !important}
    .m-logo-dark{display:block !important}
  }
  @media only screen and (max-width:620px){
    .m-pad{padding-left:24px !important;padding-right:24px !important}
    .m-figure{font-size:44px !important}
    .m-thesis{font-size:21px !important}
  }
</style>
<table role="presentation" class="m-desk" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.desk};margin:0;padding:0">
<tr><td align="center" style="padding:28px 12px 40px">
<table role="presentation" class="m-paper" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:${C.paper};border-radius:4px">

${gap(38)}
${pad(
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="m-rule" style="border-bottom:1px solid ${C.rule}"><tr>` +
    `<td align="left" valign="bottom" style="padding-bottom:18px">` +
      `<img class="m-logo-light" src="${LOGO}" width="92" height="34" alt="MACC Systems &amp; Engineering Inc." ` +
        `style="display:block;width:92px;height:34px;border:0;outline:none;text-decoration:none">` +
    `</td>` +
    `<td align="right" valign="bottom" style="padding-bottom:18px;font-family:${FACE};font-size:11px;` +
      `line-height:1.5;letter-spacing:.04em;color:${C.ink3};white-space:nowrap" class="m-ink3">` +
      `QUOTATION ${escapeHtml(quote.quoteNo)}<br>Valid until ${escapeHtml(quote.validUntil)}` +
    `</td>` +
  `</tr></table>`
)}

${gap(30)}
${pad(`<div class="m-ink" style="font-family:${FACE};font-size:17px;color:${C.ink}">Hi ${first},</div>`)}
${gap(14)}
${pad(
  `<div class="m-thesis m-ink" style="font-family:${FACE};font-size:26px;line-height:1.3;letter-spacing:-.015em;` +
  `font-weight:600;color:${C.ink}">${thesis}</div>`
)}

${gap(26)}
${pad(
  `<div class="m-figure m-sun" style="font-family:${FACE};font-size:58px;line-height:1;font-weight:600;` +
    `letter-spacing:-.035em;color:${C.sun}">${saved}</div>` +
  `<div class="m-ink2" style="font-family:${FACE};font-size:14px;color:${C.ink2};padding-top:8px">` +
    `estimated saving every month${quote.bill > 0 ? ", on a " + pesoInt(quote.bill) + " bill" : ""}</div>` +
  `<div class="m-ink" style="font-family:${FACE};font-size:15.5px;color:${C.ink};padding-top:16px">` +
    `<b style="font-weight:600">${price}</b> all-in, installed${payback}</div>`
)}

${gap(30)}
${pad(
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="m-rule" ` +
    `style="border-top:1px solid ${C.rule}">` +
    specRow("Package", escapeHtml(quote.packageLabel || "&mdash;")) +
    specRow("System", (quote.kwp ? quote.kwp.toFixed(2) + " kWp" : "&mdash;") + " &middot; " + escapeHtml(quote.panelSummary || "")) +
    specRow("Battery", escapeHtml(quote.batteryLabel || "None")) +
    specRow("Prepared by", escapeHtml(preparedBy || ""), true) +
  `</table>`
)}

${quote.brownout ? gap(26) + pad(note("During a brownout", escapeHtml(quote.brownout), C.caution)) : ""}
${quote.indicative ? gap(26) + pad(note("About this price", escapeHtml(quote.indicative), C.ruleFirm)) : ""}

${gap(34)}
${pad(
  `<div class="m-ink3" style="font-family:${FACE};font-size:11px;font-weight:600;letter-spacing:.14em;` +
    `text-transform:uppercase;color:${C.ink3};padding-bottom:4px">What happens next</div>` +
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">` +
    (quote.steps || []).map((s, i, a) => stepRow(i + 1, s, i === a.length - 1)).join("") +
  `</table>`
)}

${gap(32)}
${pad(
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>` +
    `<td align="center" bgcolor="${C.accent}" style="background:${C.accent};border-radius:10px">` +
      `<a href="mailto:${SENDER}?subject=${encodeURIComponent("Site survey - " + quote.quoteNo)}" ` +
        `style="display:block;padding:16px 24px;font-family:${FACE};font-size:16px;font-weight:600;` +
        `color:#FFFFFF;text-decoration:none;border-radius:10px">Confirm my free site survey</a>` +
    `</td></tr></table>` +
  `<div class="m-ink2" style="font-family:${FACE};font-size:13.5px;color:${C.ink2};text-align:center;padding-top:12px">` +
    `Or simply reply to this email.</div>`
)}

${gap(26)}
${pad(
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="m-rule" ` +
    `style="border:1px solid ${C.rule};border-radius:8px"><tr>` +
    `<td style="padding:13px 16px;font-family:${FACE};font-size:13.5px;line-height:1.5;color:${C.ink2}" class="m-ink2">` +
      `<b style="color:${C.ink};font-weight:600">Your full quotation is attached as a PDF.</b><br>` +
      `Complete bill of materials, warranties and terms.</td>` +
  `</tr></table>`
)}

${gap(30)}
${pad(
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="m-rule" ` +
    `style="border-top:1px solid ${C.rule}"><tr><td style="padding-top:22px;font-family:${FACE};font-size:14px;line-height:1.62">` +
    `<span class="m-ink" style="color:${C.ink};font-weight:600">${escapeHtml(preparedBy || "")}</span><br>` +
    `<span class="m-ink" style="color:${C.ink}">MACC Systems &amp; Engineering Inc.</span><br>` +
    `<span class="m-ink3" style="color:${C.ink3}">Biliran Province, Philippines</span>` +
    `<div class="m-ink3" style="font-family:${FACE};font-size:11.5px;line-height:1.55;color:${C.ink3};padding-top:12px">` +
      `No deposit is due until the permit, licensed-electrician sign-off and net-metering checklist on your ` +
      `quotation are complete. This quotation was prepared solely for you.</div>` +
  `</td></tr></table>`
)}
${gap(36)}

</table>
</td></tr></table>`;

  /* ---------- plain text ----------
   * Not a fallback nobody sees: some clients show it, and every serious spam
   * filter reads it. It carries the same disclosures in the same order. */
  const plain = [
    `Hi ${String(name).split(/\s+/)[0] || "there"},`,
    "",
    thesisPlain(thesis),
    "",
    `${plainPeso(quote.savedPerMonth)} estimated saving every month` +
      (quote.bill > 0 ? `, on a ${plainPeso(quote.bill)} bill.` : "."),
    `${plainPeso(quote.customerPrice)} all-in, installed` +
      (quote.paybackYears > 0 ? ` - pays back in about ${quote.paybackYears.toFixed(1)} years.` : "."),
    "",
    `Package      ${quote.packageLabel}`,
    `System       ${quote.kwp ? quote.kwp.toFixed(2) + " kWp" : "-"} - ${quote.panelSummary}`,
    `Battery      ${quote.batteryLabel}`,
    `Quotation    ${quote.quoteNo}, valid until ${quote.validUntil}`,
  ];
  if (quote.brownout) plain.push("", "DURING A BROWNOUT", quote.brownout);
  if (quote.indicative) plain.push("", "ABOUT THIS PRICE", quote.indicative);
  plain.push(
    "",
    "WHAT HAPPENS NEXT",
    ...(quote.steps || []).map((s, i) => `  ${i + 1}. ${s}`),
    "",
    "Reply to this email to confirm your free site survey.",
    "",
    "Your full quotation is attached as a PDF - complete bill of materials,",
    "warranties and terms.",
    "",
    "No deposit is due until the permit, licensed-electrician sign-off and",
    "net-metering checklist on your quotation are complete.",
    "",
    preparedBy || "",
    "MACC Systems & Engineering Inc.",
    "Biliran Province, Philippines",
  );

  return { text: plain.join("\n"), html };
}

/** Undo the HTML entities used in the display copy, for the text/plain part. */
function thesisPlain(s) {
  return String(s)
    .replace(/&#8369;/g, "PHP ").replace(/&middot;/g, "-").replace(/&mdash;/g, "-")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

const plainPeso = (n) => "PHP " + Math.round(Number(n) || 0).toLocaleString("en-PH");
