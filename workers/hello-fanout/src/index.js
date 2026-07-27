/**
 * Email Routing fan-out worker for the company addresses (hello@ and
 * main@maccsyseng.com) AND the founders' personal addresses (@macc-inc.com,
 * one routing rule per address pointing at this same worker).
 *
 * Two jobs, in priority order:
 *   1. FORWARD to Gmail. This is the job that must never break — Gmail holds the
 *      real copy, including attachments, and is what we fall back on for anything
 *      that matters (SEC/government correspondence). Company addresses fan out to
 *      EVERY founder's Gmail (FORWARD_TO); a personal address forwards ONLY to its
 *      owner's Gmail (PERSONAL_FORWARDS) — a founder's personal mail must not land
 *      in the whole team's inboxes.
 *   2. STORE a copy in D1 so /internal/mail.html can show it. Best-effort: a D1
 *      failure must never cost us a delivery. The stored `mailbox` column is the
 *      address the mail arrived at, which is also what /api/mail uses to keep a
 *      personal mailbox private to the account that claims it (users.mailbox).
 *
 * Cloudflare's message.forward() forwards to ONE recipient per call, so to copy
 * an incoming email to several inboxes we call it once per address.
 *
 * Destinations come from wrangler.toml vars:
 *   FORWARD_TO        — comma-separated Gmail list for the shared company addresses.
 *   PERSONAL_FORWARDS — semicolon-separated `personal=gmail` pairs, e.g.
 *                       "benjie@macc-inc.com=benjiemalinao87@gmail.com;...".
 *                       Keep the left side in sync with users.mailbox in D1.
 * Every destination MUST be a *verified* Destination Address on the account —
 * forwarding to a Pending/unverified address fails silently and that recipient
 * just never gets the mail.
 */
import PostalMime from "postal-mime";

/** Body + attachment metadata from the raw MIME, or null if it won't parse. */
async function parseMessage(message) {
  // message.raw is a single-use stream — buffer it once, before anything else reads it.
  const buffer = await new Response(message.raw).arrayBuffer();
  const parsed = await PostalMime.parse(buffer);
  return {
    subject: parsed.subject || "",
    text: parsed.text || "",
    html: parsed.html || "",
    // Metadata only. We deliberately do NOT store attachment bytes: they'd bloat
    // D1 and the Gmail copy already has them. The UI shows the names so you know
    // to open Gmail when a filing has a PDF.
    attachments: (parsed.attachments || []).map((a) => ({
      name: a.filename || "attachment",
      type: a.mimeType || "application/octet-stream",
      size: a.content ? a.content.byteLength || 0 : 0,
    })),
  };
}

async function storeInbound(env, message, parsed) {
  await env.DB.prepare(
    `INSERT INTO emails
       (direction, mailbox, sender, recipient, subject, body_text, body_html,
        attachments, message_id, in_reply_to, created_at)
     VALUES ('in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      message.to,
      message.from,
      message.to,
      parsed.subject,
      parsed.text,
      parsed.html,
      JSON.stringify(parsed.attachments),
      message.headers.get("message-id") || null,
      message.headers.get("in-reply-to") || null,
      new Date().toISOString(),
    )
    .run();
}

/** Parse PERSONAL_FORWARDS ("addr=gmail;addr2=gmail2") into a lowercase map. */
function personalRoutes(env) {
  const map = {};
  for (const pair of String(env.PERSONAL_FORWARDS || "").split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const personal = pair.slice(0, idx).trim().toLowerCase();
    const dest = pair.slice(idx + 1).trim();
    if (personal && dest) map[personal] = dest;
  }
  return map;
}

export default {
  async email(message, env, ctx) {
    // A personal address forwards to its owner alone; everything else is a company
    // address and fans out to the whole team.
    const personalDest = personalRoutes(env)[String(message.to || "").toLowerCase()];
    const destinations = personalDest
      ? [personalDest]
      : (env.FORWARD_TO || "")
          .split(",")
          .map((addr) => addr.trim())
          .filter(Boolean);

    // Parse before forwarding: message.raw is single-use, and forwarding first
    // would leave nothing to read. If parsing fails we still forward.
    let parsed = null;
    try {
      parsed = await parseMessage(message);
    } catch (err) {
      console.error("parse failed, forwarding without storing:", err);
    }

    if (destinations.length === 0) {
      // Nothing to forward to — reject so the sender gets a bounce rather than
      // the mail vanishing silently (a handler that returns without acting
      // drops the message).
      message.setReject("No forwarding destinations configured");
      return;
    }

    // Fan out. Promise.allSettled so one bad/unverified address can't stop the
    // others from receiving the mail; we log any that fail for the tail.
    const results = await Promise.allSettled(
      destinations.map((addr) => message.forward(addr)),
    );

    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(`forward to ${destinations[i]} failed:`, result.reason);
      }
    });

    // Archive to the shared inbox after the forwards are away. waitUntil keeps
    // the handler's return fast and keeps a D1 outage off the delivery path.
    if (parsed && env.DB) {
      ctx.waitUntil(
        storeInbound(env, message, parsed).catch((err) => {
          console.error("D1 store failed (mail was still forwarded):", err);
        }),
      );
    }
  },
};
