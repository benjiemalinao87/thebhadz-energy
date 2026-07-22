/**
 * Email Routing fan-out worker for hello@ and main@maccsyseng.com.
 *
 * Two jobs, in priority order:
 *   1. FORWARD to the founders' Gmail inboxes. This is the job that must never
 *      break — Gmail holds the real copy, including attachments, and is what we
 *      fall back on for anything that matters (SEC/government correspondence).
 *   2. STORE a copy in D1 so /internal/mail.html can show a shared inbox.
 *      Best-effort: a D1 failure must never cost us a delivery.
 *
 * Cloudflare's message.forward() forwards to ONE recipient per call, so to copy
 * an incoming email to several inboxes we call it once per address.
 *
 * Destinations come from the FORWARD_TO var (see wrangler.toml) as a
 * comma-separated list. Every address MUST be a *verified* Destination Address
 * on the account — forwarding to a Pending/unverified address fails silently
 * and that recipient just never gets the mail.
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

export default {
  async email(message, env, ctx) {
    const destinations = (env.FORWARD_TO || "")
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
