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

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
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
  const { text, html } = composeEmail({ name, quote, preparedBy: quote.preparedBy });

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

/**
 * The covering email. It carries the same truths as the sheet, because a
 * homeowner may read the mail and never open the attachment: what the price is,
 * what it saves, whether it backs up a brownout, and whether the number is firm.
 */
function composeEmail({ name, quote, preparedBy }) {
  const price = "PHP " + Math.round(quote.customerPrice || 0).toLocaleString("en-PH");
  const saved = "PHP " + Math.round(quote.savedPerMonth || 0).toLocaleString("en-PH");
  const first = String(name).split(/\s+/)[0];

  const lines = [
    `Hi ${first},`,
    "",
    `Thank you for your time. Your quotation is attached as a PDF — quote number ${quote.quoteNo}, valid until ${quote.validUntil}.`,
    "",
    `The short version:`,
    `  Package:        ${quote.packageLabel}`,
    `  System size:    ${quote.kwp ? quote.kwp.toFixed(2) + " kWp" : "—"} (${quote.panelSummary})`,
    `  All-in price:   ${price}, installed`,
    `  Est. savings:   ${saved} per month (${quote.savingsBasis})`,
    `  Battery:        ${quote.batteryLabel}`,
  ];

  if (quote.brownout) lines.push("", "Please read this part before anything else:", quote.brownout);
  if (quote.indicative) lines.push("", "About the price:", quote.indicative);

  lines.push(
    "",
    "What happens next:",
    ...quote.steps.map((s, i) => `  ${i + 1}. ${s}`),
    "",
    "Before any deposit is accepted we complete the permit, licensed-electrician sign-off and",
    "net-metering checklist printed on the quotation. Nothing is due from you until then.",
    "",
    "Just reply to this email if anything is unclear, or if you would like the free site survey booked.",
    "",
    preparedBy || "MACC Systems & Engineering Inc.",
    "MACC Systems & Engineering Inc.",
    "Biliran Province, Philippines",
  );

  const text = lines.join("\n");
  const html =
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#14303a;max-width:640px">` +
    `<p>Hi ${escapeHtml(first)},</p>` +
    `<p>Thank you for your time. Your quotation is attached as a PDF — quote number <b>${escapeHtml(quote.quoteNo)}</b>, valid until ${escapeHtml(quote.validUntil)}.</p>` +
    `<table cellpadding="6" style="border-collapse:collapse;margin:18px 0;font-size:14px">` +
    [
      ["Package", quote.packageLabel],
      ["System size", (quote.kwp ? quote.kwp.toFixed(2) + " kWp" : "—") + " (" + quote.panelSummary + ")"],
      ["All-in price", "<b>" + price + "</b>, installed"],
      ["Est. savings", saved + " per month (" + quote.savingsBasis + ")"],
      ["Battery", quote.batteryLabel],
    ].map(([k, v]) =>
      `<tr><td style="border:1px solid #e4e1d6;color:#47636e">${escapeHtml(k)}</td>` +
      `<td style="border:1px solid #e4e1d6">${k === "All-in price" ? v : escapeHtml(String(v))}</td></tr>`
    ).join("") +
    `</table>` +
    (quote.brownout
      ? `<p style="border-left:4px solid #b5372b;padding:8px 12px;background:#fff0ed"><b>Please read this before anything else:</b><br>${escapeHtml(quote.brownout)}</p>`
      : "") +
    (quote.indicative
      ? `<p style="border-left:4px solid #b87a0a;padding:8px 12px;background:#fbf1dc"><b>About the price:</b><br>${escapeHtml(quote.indicative)}</p>`
      : "") +
    `<p><b>What happens next</b></p><ol>${quote.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>` +
    `<p style="color:#47636e;font-size:13.5px">Before any deposit is accepted we complete the permit, licensed-electrician sign-off and net-metering checklist printed on the quotation. Nothing is due from you until then.</p>` +
    `<p>Just reply to this email if anything is unclear, or if you would like the free site survey booked.</p>` +
    `<p style="margin-top:22px">${escapeHtml(preparedBy || "")}<br><b>MACC Systems &amp; Engineering Inc.</b><br>` +
    `<span style="color:#7e929b;font-size:13px">Biliran Province, Philippines</span></p></div>`;

  return { text, html };
}
