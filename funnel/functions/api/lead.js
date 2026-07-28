/**
 * Cloudflare Pages Function — POST /api/lead
 *
 * Public endpoint hit by the funnel form. Validates, stores the lead in D1 (env.DB),
 * and optionally fires an instant notification (Slack/Discord webhook or email).
 * New leads enter the pipeline at stage "lead".
 *
 * Bindings/vars:
 *   DB (D1)            — required for storage; if absent the lead is still acknowledged.
 *   LEAD_WEBHOOK_URL   — optional Slack/Discord/Zapier incoming webhook.
 *   LEAD_NOTIFY_EMAIL  — optional; who gets the alert. Comma-separated for several.
 *   LEAD_FROM_EMAIL    — optional; defaults to official@macc-inc.com. Must be on a
 *                        domain configured for Cloudflare Email Sending.
 *   CF_API_TOKEN + CF_ACCOUNT_ID — required for the email alert. Already bound for
 *                        api/mail.js, which sends through the same REST endpoint.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/**
 * Add the columns this endpoint writes to databases created before they existed.
 *
 * Same pattern (and same reasoning) as ensureNextActionColumns in leads.js: SQLite has
 * no ADD COLUMN IF NOT EXISTS and a failing statement aborts a batch, so each runs alone
 * and "duplicate column" counts as success. Without this, deploying the wider INSERT
 * below against an older database would drop every lead on the floor.
 */
let schemaChecked = false;
async function ensureLeadColumns(env) {
  if (schemaChecked) return;
  const columns = [
    "ALTER TABLE leads ADD COLUMN address TEXT",
    "ALTER TABLE leads ADD COLUMN current_solution TEXT",
    "ALTER TABLE leads ADD COLUMN interview_opt_in INTEGER DEFAULT 0",
  ];
  for (const sql of columns) {
    try {
      await env.DB.prepare(sql).run();
    } catch (err) {
      if (!/duplicate column/i.test(String(err && err.message))) throw err;
    }
  }
  schemaChecked = true;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const name = (data.name || "").toString().trim();
  const phone = (data.phone || "").toString().trim();
  const goal = (data.goal || "").toString().trim();
  const digits = phone.replace(/[^\d]/g, "");

  if (!name) return json({ ok: false, error: "Name is required." }, 422);
  if (digits.length < 10 || digits.length > 13)
    return json({ ok: false, error: "A valid mobile number is required." }, 422);
  if (!goal) return json({ ok: false, error: "Please choose a goal." }, 422);

  // Honeypot — a bot filled the hidden field. Silently accept and drop.
  if (data.company) return json({ ok: true });

  const now = new Date().toISOString();
  const lead = {
    name,
    phone,
    email: (data.email || "").toString().trim(),
    goal,
    // The survey cannot be booked without this. It was collected by the form and
    // silently discarded here until 2026-07-27.
    address: (data.address || "").toString().trim(),
    monthly_bill: (data.monthly_bill || "").toString(),
    package: (data.package || "").toString(),
    financing: data.financing === "yes" || data.financing === true ? 1 : 0,
    // Research fields: what they already do about the problem (prior spend is the
    // signal that the pain is real), and whether they'll talk to us even if they
    // never buy.
    current_solution: (data.current_solution || "").toString().trim(),
    interview_opt_in: data.interview === "yes" || data.interview === true ? 1 : 0,
    source: (data.source || "funnel").toString(),
    utm_source: (data.utm_source || "").toString(),
    utm_medium: (data.utm_medium || "").toString(),
    utm_campaign: (data.utm_campaign || "").toString(),
    referrer: (data.referrer || "").toString(),
    ip: request.headers.get("CF-Connecting-IP") || "",
    country: (request.cf && request.cf.country) || "",
    created_at: now,
    updated_at: now,
  };

  // --- Store in D1 ---
  if (env.DB) {
    try {
      await ensureLeadColumns(env);
      await env.DB.prepare(
        `INSERT INTO leads
          (name, phone, email, goal, address, monthly_bill, package, financing,
           current_solution, interview_opt_in, stage,
           source, utm_source, utm_medium, utm_campaign, referrer, ip, country,
           created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'lead', ?,?,?,?,?,?,?, ?,?)`
      )
        .bind(
          lead.name, lead.phone, lead.email, lead.goal, lead.address,
          lead.monthly_bill, lead.package, lead.financing,
          lead.current_solution, lead.interview_opt_in,
          lead.source, lead.utm_source,
          lead.utm_medium, lead.utm_campaign, lead.referrer, lead.ip,
          lead.country, lead.created_at, lead.updated_at
        )
        .run();
    } catch (e) {
      // Storage failed — log server-side but still notify + acknowledge so a lead isn't lost.
      console.error("D1 insert failed:", e && e.message);
    }
  }

  // --- Optional instant notifications ---
  const tasks = [];
  if (env.LEAD_WEBHOOK_URL) {
    const text =
      `🟢 New Solar City lead\n` +
      `• ${lead.name} — ${lead.phone}\n` +
      `• Goal: ${lead.goal}${lead.package ? ` · ${lead.package}` : ""}\n` +
      `• Bill: ${lead.monthly_bill || "n/a"}${lead.financing ? " · wants financing" : ""}\n` +
      `• Address: ${lead.address || "not given"}\n` +
      `• Doing now: ${lead.current_solution || "not given"}${lead.interview_opt_in ? " · open to an interview" : ""}\n` +
      `• Source: ${lead.utm_source || lead.source}`;
    tasks.push(
      fetch(env.LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, content: text }),
      }).catch(() => {})
    );
  }
  // Email alert via Cloudflare Email Sending — the same REST path api/mail.js already
  // sends founder mail through, reusing CF_API_TOKEN + CF_ACCOUNT_ID. This replaced
  // MailChannels on 2026-07-28: MailChannels withdrew its free Cloudflare Workers
  // service, so that call had been failing silently and no lead alert ever arrived.
  //
  // LEAD_NOTIFY_EMAIL may be a comma-separated list. Sending is best-effort — a lead
  // is already stored and acknowledged before we get here, so a failed alert must
  // never fail the submission.
  const notify = String(env.LEAD_NOTIFY_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (notify.length && env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
    const line = (label, value) => `${label}: ${value || "—"}`;
    const body = [
      `New lead from the funnel.`,
      ``,
      line("Name", lead.name),
      line("Phone", lead.phone),
      line("Email", lead.email),
      line("Address", lead.address),
      ``,
      line("Wants", lead.goal),
      line("Package", lead.package),
      line("Monthly bill", lead.monthly_bill),
      line("Doing now", lead.current_solution),
      lead.financing ? "Asked about monthly installments." : null,
      lead.interview_opt_in ? "Open to a 15-minute call even if they don't buy." : null,
      ``,
      line("Source", lead.utm_source || lead.source),
      line("Received", lead.created_at),
      ``,
      `Reply today — the form promises a same-day reply.`,
      `Pipeline: https://thebhadz-energy.pages.dev/internal/leads`,
    ]
      .filter((l) => l !== null)
      .join("\n");

    const payload = {
      to: notify.map((address) => ({ address })),
      from: { address: env.LEAD_FROM_EMAIL || "official@macc-inc.com", name: "MACC Funnel" },
      subject: `New lead: ${lead.name}${lead.goal ? ` — ${lead.goal}` : ""}`,
      text: body,
      html: `<div style="white-space:pre-wrap;font-family:system-ui,sans-serif">${escapeHtml(body)}</div>`,
    };
    // Let the homeowner's own address be the reply target where they gave one.
    if (lead.email) payload.reply_to = { address: lead.email, name: lead.name };

    tasks.push(
      fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.CF_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      )
        .then(async (res) => {
          if (!res.ok) {
            const detail = await res.text();
            console.error("Lead alert send failed:", res.status, detail.slice(0, 400));
          }
        })
        .catch((err) => console.error("Lead alert request failed:", String(err).slice(0, 200)))
    );
  }
  if (tasks.length) {
    try { await Promise.allSettled(tasks); } catch { /* acknowledged regardless */ }
  }

  return json({ ok: true, message: "Lead received." });
}
