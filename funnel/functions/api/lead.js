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
 *   LEAD_NOTIFY_EMAIL + LEAD_FROM_EMAIL — optional email via MailChannels.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
  if (env.LEAD_NOTIFY_EMAIL && env.LEAD_FROM_EMAIL) {
    tasks.push(
      fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: env.LEAD_NOTIFY_EMAIL }] }],
          from: { email: env.LEAD_FROM_EMAIL, name: "Solar City Funnel" },
          subject: `New lead: ${lead.name} (${lead.goal})`,
          content: [
            {
              type: "text/plain",
              value: Object.entries(lead).map(([k, v]) => `${k}: ${v}`).join("\n"),
            },
          ],
        }),
      }).catch(() => {})
    );
  }
  if (tasks.length) {
    try { await Promise.allSettled(tasks); } catch { /* acknowledged regardless */ }
  }

  return json({ ok: true, message: "Lead received." });
}
