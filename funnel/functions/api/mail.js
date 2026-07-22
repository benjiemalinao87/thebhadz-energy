/**
 * /api/mail — founder-gated company mailbox for hello@ / main@maccsyseng.com.
 *
 *   GET    ?id=N                      → { ok, email }        (single, marks it read)
 *   GET    ?box=in|out|all            → { ok, emails: [...] } (list, newest first, no bodies)
 *   POST   { to, subject, body, from?, reply_to_id?, sent_by? } → send an email
 *   PATCH  { id, read }               → mark one message read/unread
 *   DELETE { id } | { ids: [...] }    → remove from this mailbox view
 *
 * Inbound rows are written by the hello-fanout Email Worker. This endpoint reads
 * them and sends outbound mail via the Email Sending REST API.
 *
 * Why REST and not a binding: Pages Functions support only a subset of bindings
 * (KV, D1, R2, DO, Queues) — `send_email` is Workers-only. So we call
 * POST /accounts/{id}/email/sending/send with an API token instead.
 *
 * Required env (set as Pages secrets):
 *   CF_API_TOKEN  — API token with "Email Sending: Edit" on this account.
 *   CF_ACCOUNT_ID — the Cloudflare account id that owns maccsyseng.com.
 * Plus the existing AUTH_SECRET (founder session) and DB (D1) bindings.
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

// Only addresses we actually own may appear in From — otherwise a founder could
// send as anyone and torch the domain's reputation.
const SENDERS = ["hello@maccsyseng.com", "main@maccsyseng.com"];
const DEFAULT_SENDER = "main@maccsyseng.com";

const MAX_SUBJECT = 300;
const MAX_BODY = 50000;
const LIST_LIMIT = 200;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function requireFounder(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  return env.AUTH_SECRET ? verifyToken(token, env.AUTH_SECRET) : false;
}

/** Loose RFC-ish check — enough to catch typos and header-injection attempts. */
function validEmail(value) {
  const s = String(value || "").trim();
  return s.length <= 254 && /^[^\s@,;:<>"]+@[^\s@,;:<>"]+\.[^\s@,;:<>"]+$/.test(s);
}

/** Strip CR/LF so nothing can smuggle extra headers through the subject. */
function clean(value, max) {
  return String(value == null ? "" : value).replace(/[\r\n]+/g, " ").slice(0, max).trim();
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!(await requireFounder(request, env))) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);
  }

  const url = new URL(request.url);
  const method = request.method;

  // ---- Read one (and mark it read) ----
  if (method === "GET" && url.searchParams.has("id")) {
    const id = parseInt(url.searchParams.get("id"), 10);
    if (!Number.isInteger(id)) return json({ ok: false, error: "A valid id is required." }, 422);

    const email = await env.DB.prepare(
      `SELECT id, direction, mailbox, sender, recipient, subject, body_text, body_html,
              attachments, message_id, in_reply_to, sent_by, error, read_at, created_at
         FROM emails WHERE id = ?`
    ).bind(id).first();
    if (!email) return json({ ok: false, error: "Email not found." }, 404);

    if (!email.read_at) {
      const now = new Date().toISOString();
      await env.DB.prepare(`UPDATE emails SET read_at = ? WHERE id = ?`).bind(now, id).run();
      email.read_at = now;
    }
    return json({ ok: true, email });
  }

  // ---- List (bodies omitted to keep the payload small) ----
  if (method === "GET") {
    const box = url.searchParams.get("box") || "all";
    const where = box === "in" ? "WHERE direction = 'in'"
                : box === "out" ? "WHERE direction = 'out'"
                : "";
    const { results } = await env.DB.prepare(
      `SELECT id, direction, mailbox, sender, recipient, subject, attachments,
              sent_by, error, read_at, created_at,
              substr(body_text, 1, 180) AS preview
         FROM emails ${where}
        ORDER BY datetime(created_at) DESC
        LIMIT ${LIST_LIMIT}`
    ).all();

    const unread = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM emails WHERE direction = 'in' AND read_at IS NULL`
    ).first();

    return json({ ok: true, emails: results || [], unread: (unread && unread.n) || 0 });
  }

  // ---- Send ----
  if (method === "POST") {
    if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
      return json({
        ok: false,
        error: "Sending is not configured — set CF_API_TOKEN and CF_ACCOUNT_ID as Pages secrets.",
      }, 500);
    }

    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }

    const to = String(b.to || "").trim();
    if (!validEmail(to)) return json({ ok: false, error: "A valid recipient address is required." }, 422);

    const from = SENDERS.includes(String(b.from || "").trim())
      ? String(b.from).trim()
      : DEFAULT_SENDER;

    const subject = clean(b.subject, MAX_SUBJECT);
    if (!subject) return json({ ok: false, error: "A subject is required." }, 422);

    const body = String(b.body == null ? "" : b.body).slice(0, MAX_BODY);
    if (!body.trim()) return json({ ok: false, error: "The message body is empty." }, 422);

    const sentBy = clean(b.sent_by, 80);

    // Threading: if this is a reply, quote the original's Message-ID so mail
    // clients keep it in the same conversation.
    let headers;
    let inReplyTo = null;
    const replyToId = parseInt(b.reply_to_id, 10);
    if (Number.isInteger(replyToId)) {
      const original = await env.DB.prepare(
        `SELECT message_id FROM emails WHERE id = ?`
      ).bind(replyToId).first();
      if (original && original.message_id) {
        inReplyTo = original.message_id;
        headers = { "In-Reply-To": inReplyTo, References: inReplyTo };
      }
    }

    const payload = {
      to,
      // REST API uses `address` in the from object (the Workers binding uses `email`).
      from: { address: from, name: "MACC Systems & Engineering" },
      subject,
      text: body,
      html: `<div style="white-space:pre-wrap;font-family:system-ui,sans-serif">${escapeHtml(body)}</div>`,
    };
    if (headers) payload.headers = headers;

    let sendError = null;
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.CF_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const detail = await res.text();
        sendError = `Cloudflare returned ${res.status}: ${detail.slice(0, 400)}`;
      }
    } catch (err) {
      sendError = `Request failed: ${String(err).slice(0, 400)}`;
    }

    // Log the attempt either way — a failed send you can see beats a silent one.
    const now = new Date().toISOString();
    const row = await env.DB.prepare(
      `INSERT INTO emails
         (direction, mailbox, sender, recipient, subject, body_text, body_html,
          attachments, message_id, in_reply_to, sent_by, error, read_at, created_at)
       VALUES ('out', ?, ?, ?, ?, ?, '', '[]', NULL, ?, ?, ?, ?, ?)`
    ).bind(from, from, to, subject, body, inReplyTo, sentBy, sendError, now, now).run();

    if (sendError) return json({ ok: false, error: sendError }, 502);
    return json({ ok: true, id: row.meta.last_row_id });
  }

  // ---- Mark read / unread ----
  if (method === "PATCH") {
    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = parseInt(b.id, 10);
    if (!Number.isInteger(id)) return json({ ok: false, error: "A valid id is required." }, 422);

    const readAt = b.read === false ? null : new Date().toISOString();
    const r = await env.DB.prepare(`UPDATE emails SET read_at = ? WHERE id = ?`).bind(readAt, id).run();
    if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "Email not found." }, 404);
    return json({ ok: true, read_at: readAt });
  }

  // ---- Delete ----
  // Only removes our D1 copy. Inbound mail was also forwarded to the founders'
  // Gmail inboxes, which stay the durable record — deleting here tidies this view,
  // it does not destroy the message.
  if (method === "DELETE") {
    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }

    const ids = (Array.isArray(b.ids) ? b.ids : [b.id])
      .map((value) => parseInt(value, 10))
      .filter(Number.isInteger);
    if (!ids.length) return json({ ok: false, error: "A valid id is required." }, 422);
    if (ids.length > 100) return json({ ok: false, error: "Too many ids in one request (max 100)." }, 422);

    // Build the placeholder list from the validated integers, never from raw input.
    const placeholders = ids.map(() => "?").join(", ");
    const r = await env.DB.prepare(`DELETE FROM emails WHERE id IN (${placeholders})`).bind(...ids).run();
    const removed = (r.meta && r.meta.changes) || 0;
    if (!removed) return json({ ok: false, error: "Email not found." }, 404);
    return json({ ok: true, deleted: removed });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
