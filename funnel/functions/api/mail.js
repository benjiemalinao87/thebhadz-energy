/**
 * /api/mail — founder-gated mailboxes: one shared company mailbox, plus a private
 * personal mailbox per founder.
 *
 * Receives mail for the company addresses (routed in by the hello-fanout Email
 * Worker) and sends outbound as official@ / alternate@macc-inc.com — or, from a
 * founder's own personal address (users.mailbox, e.g. benjie@macc-inc.com).
 * Sending requires Email Sending enabled on the domain (macc-inc.com is enabled
 * zone-wide, so any @macc-inc.com From is valid).
 *
 * Scoping: an `emails.mailbox` address claimed in users.mailbox is PRIVATE to that
 * account — other founders cannot list, open, mark or delete those rows. Every
 * other address (hello@, main@, official@, alternate@, quote@…) is the shared
 * company mailbox, visible to all founders. That rule is enforced here on every
 * verb, not just hidden in the list query.
 *
 *   GET    ?id=N                      → { ok, email }        (single, marks it read)
 *   GET    ?box=in|out|all&mbox=shared|mine
 *                                     → { ok, emails: [...], unread, my_mailbox }
 *                                       (list, newest first, no bodies; mbox
 *                                        defaults to shared)
 *   POST   { to, subject, body, from?, reply_to_id? } → send an email
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
 *   CF_ACCOUNT_ID — the Cloudflare account id that owns the sending domain
 *                   (macc-inc.com — same account as maccsyseng.com).
 * Plus the existing AUTH_SECRET (founder session) and DB (D1) bindings.
 */
import { currentUser } from "../_auth.js";

// Only addresses we actually own may appear in From — otherwise a founder could
// send as anyone and torch the domain's reputation. These must be on a domain
// that has Email Sending enabled (DKIM published) or the send API rejects them.
// A founder may additionally send as their own personal mailbox (users.mailbox) —
// theirs only, never someone else's; that check happens per-request in POST.
const SENDERS = ["official@macc-inc.com", "alternate@macc-inc.com"];
const DEFAULT_SENDER = "official@macc-inc.com";
// Personal mailboxes must be on the sending-enabled zone or the From is rejected.
const SENDING_DOMAIN = "macc-inc.com";

const MAX_SUBJECT = 300;
const MAX_BODY = 50000;
const LIST_LIMIT = 200;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// The founder behind this request, or null. functions/api/_middleware.js already
// resolved (and logged) them; currentUser reuses that same lookup.
function requireFounder(context) {
  return currentUser(context);
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

/**
 * Every address currently claimed as someone's personal mailbox. Rows carrying one
 * of these are private; everything else in `emails` is the shared company mailbox.
 */
async function personalMailboxes(env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT mailbox FROM users WHERE mailbox IS NOT NULL AND mailbox != ''`
    ).all();
    return (results || []).map((row) => String(row.mailbox).toLowerCase());
  } catch {
    // users.mailbox not migrated yet — no personal mailboxes exist.
    return [];
  }
}

/** This founder's own personal mailbox address, lowercased, or null. */
function ownMailbox(founder) {
  const mb = String((founder && founder.mailbox) || "").trim().toLowerCase();
  return mb || null;
}

/** May this founder read/modify a row that lives in `rowMailbox`? */
function mayTouch(founder, rowMailbox, personal) {
  const mb = String(rowMailbox || "").toLowerCase();
  if (!personal.includes(mb)) return true; // shared company mail
  return mb === ownMailbox(founder);
}

export async function onRequest(context) {
  const { request, env } = context;

  const founder = await requireFounder(context);
  if (!founder) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);
  }

  const url = new URL(request.url);
  const method = request.method;
  const personal = await personalMailboxes(env);

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
    if (!mayTouch(founder, email.mailbox, personal)) {
      return json({ ok: false, error: "That message is in another founder's personal mailbox." }, 403);
    }

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
    const mbox = url.searchParams.get("mbox") === "mine" ? "mine" : "shared";
    const mine = ownMailbox(founder);

    const clauses = [];
    const binds = [];
    if (box === "in") clauses.push(`direction = 'in'`);
    if (box === "out") clauses.push(`direction = 'out'`);

    if (mbox === "mine") {
      // No personal address assigned → an empty mailbox, not an error: the UI
      // explains how to get one (Team & access).
      if (!mine) return json({ ok: true, emails: [], unread: 0, my_mailbox: null });
      clauses.push(`lower(mailbox) = ?`);
      binds.push(mine);
    } else if (personal.length) {
      // Shared = everything not claimed as somebody's personal mailbox.
      clauses.push(`lower(mailbox) NOT IN (${personal.map(() => "?").join(", ")})`);
      binds.push(...personal);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const { results } = await env.DB.prepare(
      `SELECT id, direction, mailbox, sender, recipient, subject, attachments,
              sent_by, error, read_at, created_at,
              substr(body_text, 1, 180) AS preview
         FROM emails ${where}
        ORDER BY datetime(created_at) DESC
        LIMIT ${LIST_LIMIT}`
    ).bind(...binds).all();

    // Unread badge counts the scope being viewed, with the same privacy rule.
    const unreadClauses = [`direction = 'in'`, `read_at IS NULL`];
    const unreadBinds = [];
    if (mbox === "mine") {
      unreadClauses.push(`lower(mailbox) = ?`);
      unreadBinds.push(mine);
    } else if (personal.length) {
      unreadClauses.push(`lower(mailbox) NOT IN (${personal.map(() => "?").join(", ")})`);
      unreadBinds.push(...personal);
    }
    const unread = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM emails WHERE ${unreadClauses.join(" AND ")}`
    ).bind(...unreadBinds).first();

    return json({
      ok: true,
      emails: results || [],
      unread: (unread && unread.n) || 0,
      my_mailbox: mine,
    });
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

    // Allowed From: the shared company senders, plus this founder's OWN personal
    // mailbox (never another founder's — `mine` comes from the session, so the
    // request body cannot pick someone else's address).
    const mine = ownMailbox(founder);
    const allowedFrom = SENDERS.slice();
    if (mine && mine.endsWith("@" + SENDING_DOMAIN)) allowedFrom.push(mine);
    const requestedFrom = String(b.from || "").trim().toLowerCase();
    const from = allowedFrom.includes(requestedFrom) ? requestedFrom : DEFAULT_SENDER;
    const isPersonalSend = from === mine;

    const subject = clean(b.subject, MAX_SUBJECT);
    if (!subject) return json({ ok: false, error: "A subject is required." }, 422);

    const body = String(b.body == null ? "" : b.body).slice(0, MAX_BODY);
    if (!body.trim()) return json({ ok: false, error: "The message body is empty." }, 422);

    // "Who clicked send" is taken from the session, not the request body — an
    // outbound company email must be attributable to a real account.
    const sentBy = clean(founder.name || founder.email, 80);

    // Threading: if this is a reply, quote the original's Message-ID so mail
    // clients keep it in the same conversation.
    let headers;
    let inReplyTo = null;
    const replyToId = parseInt(b.reply_to_id, 10);
    if (Number.isInteger(replyToId)) {
      const original = await env.DB.prepare(
        `SELECT message_id, mailbox FROM emails WHERE id = ?`
      ).bind(replyToId).first();
      if (original && !mayTouch(founder, original.mailbox, personal)) {
        return json({ ok: false, error: "You cannot reply to a message in another founder's personal mailbox." }, 403);
      }
      if (original && original.message_id) {
        inReplyTo = original.message_id;
        headers = { "In-Reply-To": inReplyTo, References: inReplyTo };
      }
    }

    const payload = {
      to,
      // REST API uses `address` in the from object (the Workers binding uses `email`).
      // Personal sends carry the founder's name; shared sends stay the company's.
      from: { address: from, name: isPersonalSend ? clean(founder.name, 80) || "MACC Inc." : "MACC Inc." },
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

    const target = await env.DB.prepare(`SELECT mailbox FROM emails WHERE id = ?`).bind(id).first();
    if (!target) return json({ ok: false, error: "Email not found." }, 404);
    if (!mayTouch(founder, target.mailbox, personal)) {
      return json({ ok: false, error: "That message is in another founder's personal mailbox." }, 403);
    }

    const readAt = b.read === false ? null : new Date().toISOString();
    await env.DB.prepare(`UPDATE emails SET read_at = ? WHERE id = ?`).bind(readAt, id).run();
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
    // Rows in someone else's personal mailbox are refused outright — a bulk delete
    // must not silently skim over another founder's private mail.
    const placeholders = ids.map(() => "?").join(", ");
    const { results } = await env.DB.prepare(
      `SELECT id, mailbox FROM emails WHERE id IN (${placeholders})`
    ).bind(...ids).all();
    const rows = results || [];
    if (!rows.length) return json({ ok: false, error: "Email not found." }, 404);
    if (rows.some((row) => !mayTouch(founder, row.mailbox, personal))) {
      return json({ ok: false, error: "One of those messages is in another founder's personal mailbox." }, 403);
    }

    const r = await env.DB.prepare(`DELETE FROM emails WHERE id IN (${placeholders})`).bind(...ids).run();
    const removed = (r.meta && r.meta.changes) || 0;
    if (!removed) return json({ ok: false, error: "Email not found." }, 404);
    return json({ ok: true, deleted: removed });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
