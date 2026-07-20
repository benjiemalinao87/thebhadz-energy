/**
 * /api/recordings — founder-gated meeting recordings (D1 metadata + R2 media).
 *
 * The media file lives in the NOTES_R2 bucket under `recordings/`; metadata lives
 * in D1 (`meeting_recordings`, schema.sql). Uploads go through R2 multipart in
 * chunks so Zoom-sized files clear the per-request body limit, and playback is
 * streamed through a Range-aware GET so the player can seek.
 *
 *   GET    ?meeting=<meeting-id>                 → { ok, recordings: […] } (omit for all)
 *   GET    ?id=<id>&stream=1                     → media stream (supports Range / 206)
 *   POST   { action:"create", meetingId, name, type, size, title? }
 *                                                → { ok, id, uploadId, partSize }
 *   PUT    ?id=<id>&uploadId=…&part=N  (body = raw chunk)
 *                                                → { ok, partNumber, etag }
 *   POST   { action:"complete", id, uploadId, parts:[{partNumber, etag}] }
 *                                                → { ok, recording }
 *   POST   { action:"abort", id, uploadId }      → { ok }
 *   POST   { action:"rename", id, title }        → { ok }
 *   DELETE ?id=<id>                              → { ok } (removes D1 row + R2 object)
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB per recording
const PART_SIZE = 25 * 1024 * 1024; // 25 MB chunks (R2 multipart min is 5 MiB)
const ID_RE = /^[a-z0-9-]{1,64}$/;

const TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/webm": "weba",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
};
const EXT_RE = /\.(mp4|webm|mov|m4a|mp3|weba|wav|ogg)$/i;

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

function extensionFor(type, name) {
  if (TYPES[type]) return TYPES[type];
  const match = EXT_RE.exec(String(name || ""));
  return match ? match[1].toLowerCase() : null;
}

function rowToRecording(row) {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    title: row.title,
    name: row.original_name,
    type: row.content_type,
    size: row.size,
    status: row.status,
    createdAt: row.created_at,
  };
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || "");
  if (!m || (m[1] === "" && m[2] === "")) return null;
  const start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  const end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { offset: start, length: end - start + 1 };
}

async function getRow(env, id) {
  if (!ID_RE.test(String(id || ""))) return null;
  return env.DB.prepare(`SELECT * FROM meeting_recordings WHERE id = ?`).bind(id).first();
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!(await requireFounder(request, env))) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }
  if (!env.DB) return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);
  if (!env.NOTES_R2) return json({ ok: false, error: "Storage not configured (bind R2 as NOTES_R2)." }, 500);

  const url = new URL(request.url);

  // ---- List / stream ----
  if (request.method === "GET") {
    const id = url.searchParams.get("id");

    if (id && url.searchParams.get("stream")) {
      const row = await getRow(env, id);
      if (!row || row.status !== "ready") return json({ ok: false, error: "Not found." }, 404);
      const range = parseRange(request.headers.get("Range"), row.size);
      const obj = await env.NOTES_R2.get(row.r2_key, range ? { range } : undefined);
      if (!obj) return json({ ok: false, error: "Media object missing." }, 404);
      const headers = new Headers({
        "Content-Type": row.content_type || "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Content-Length": String(range ? range.length : row.size),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      });
      if (range) {
        headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${row.size}`);
        return new Response(obj.body, { status: 206, headers });
      }
      return new Response(obj.body, { headers });
    }

    const meeting = url.searchParams.get("meeting");
    let rows;
    if (meeting) {
      if (!ID_RE.test(meeting)) return json({ ok: false, error: "Invalid meeting id." }, 422);
      rows = await env.DB.prepare(
        `SELECT * FROM meeting_recordings WHERE meeting_id = ? AND status = 'ready' ORDER BY created_at DESC`
      ).bind(meeting).all();
    } else {
      rows = await env.DB.prepare(
        `SELECT * FROM meeting_recordings WHERE status = 'ready' ORDER BY created_at DESC`
      ).all();
    }
    return json({ ok: true, recordings: (rows.results || []).map(rowToRecording) });
  }

  // ---- Upload a chunk ----
  if (request.method === "PUT") {
    const row = await getRow(env, url.searchParams.get("id"));
    const uploadId = url.searchParams.get("uploadId") || "";
    const partNumber = Number(url.searchParams.get("part"));
    if (!row || row.status !== "pending" || row.upload_id !== uploadId) {
      return json({ ok: false, error: "Unknown or already-finished upload." }, 404);
    }
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      return json({ ok: false, error: "Invalid part number." }, 422);
    }
    const chunk = await request.arrayBuffer();
    if (!chunk.byteLength || chunk.byteLength > PART_SIZE + 1024) {
      return json({ ok: false, error: "Bad chunk size." }, 422);
    }
    const upload = env.NOTES_R2.resumeMultipartUpload(row.r2_key, uploadId);
    const part = await upload.uploadPart(partNumber, chunk);
    return json({ ok: true, partNumber: part.partNumber, etag: part.etag });
  }

  // ---- Create / complete / abort / rename ----
  if (request.method === "POST") {
    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }

    if (b.action === "create") {
      const meetingId = String(b.meetingId || "");
      if (!ID_RE.test(meetingId)) return json({ ok: false, error: "Invalid meeting id." }, 422);
      const size = Number(b.size);
      if (!Number.isFinite(size) || size <= 0) return json({ ok: false, error: "Invalid file size." }, 422);
      if (size > MAX_BYTES) return json({ ok: false, error: "File too large (max 2 GB)." }, 413);
      const ext = extensionFor(String(b.type || ""), b.name);
      if (!ext) return json({ ok: false, error: "Use an MP4, MOV, WebM, M4A, MP3, WAV, or OGG file." }, 415);
      const contentType = TYPES[b.type] ? String(b.type) : `application/octet-stream`;
      const id = crypto.randomUUID();
      const title = String(b.title || b.name || "Meeting recording").replace(/[\r\n]/g, "").slice(0, 200) || "Meeting recording";
      const key = `recordings/${meetingId}/${Date.now()}-${id.slice(0, 8)}.${ext}`;
      const upload = await env.NOTES_R2.createMultipartUpload(key, {
        httpMetadata: { contentType },
      });
      await env.DB.prepare(
        `INSERT INTO meeting_recordings (id, meeting_id, title, original_name, content_type, size, r2_key, upload_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).bind(
        id, meetingId, title,
        String(b.name || "").replace(/[\r\n]/g, "").slice(0, 200),
        contentType, size, key, upload.uploadId, new Date().toISOString()
      ).run();
      return json({ ok: true, id, uploadId: upload.uploadId, partSize: PART_SIZE });
    }

    if (b.action === "complete") {
      const row = await getRow(env, b.id);
      if (!row || row.status !== "pending" || row.upload_id !== String(b.uploadId || "")) {
        return json({ ok: false, error: "Unknown or already-finished upload." }, 404);
      }
      const parts = Array.isArray(b.parts) ? b.parts.map((p) => ({
        partNumber: Number(p.partNumber),
        etag: String(p.etag || ""),
      })) : [];
      if (!parts.length || parts.some((p) => !Number.isInteger(p.partNumber) || !p.etag)) {
        return json({ ok: false, error: "Invalid parts list." }, 422);
      }
      const upload = env.NOTES_R2.resumeMultipartUpload(row.r2_key, row.upload_id);
      const obj = await upload.complete(parts);
      await env.DB.prepare(
        `UPDATE meeting_recordings SET status = 'ready', size = ?, upload_id = NULL WHERE id = ?`
      ).bind(obj.size, row.id).run();
      const fresh = await getRow(env, row.id);
      return json({ ok: true, recording: rowToRecording(fresh) });
    }

    if (b.action === "abort") {
      const row = await getRow(env, b.id);
      if (!row) return json({ ok: true });
      if (row.status === "pending" && row.upload_id) {
        try { await env.NOTES_R2.resumeMultipartUpload(row.r2_key, row.upload_id).abort(); } catch {}
        await env.DB.prepare(`DELETE FROM meeting_recordings WHERE id = ?`).bind(row.id).run();
      }
      return json({ ok: true });
    }

    if (b.action === "rename") {
      const row = await getRow(env, b.id);
      if (!row) return json({ ok: false, error: "Not found." }, 404);
      const title = String(b.title || "").replace(/[\r\n]/g, "").trim().slice(0, 200);
      if (!title) return json({ ok: false, error: "Title required." }, 422);
      await env.DB.prepare(`UPDATE meeting_recordings SET title = ? WHERE id = ?`).bind(title, row.id).run();
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown action." }, 422);
  }

  // ---- Delete ----
  if (request.method === "DELETE") {
    const row = await getRow(env, url.searchParams.get("id"));
    if (!row) return json({ ok: false, error: "Not found." }, 404);
    if (row.status === "pending" && row.upload_id) {
      try { await env.NOTES_R2.resumeMultipartUpload(row.r2_key, row.upload_id).abort(); } catch {}
    }
    try { await env.NOTES_R2.delete(row.r2_key); } catch {}
    await env.DB.prepare(`DELETE FROM meeting_recordings WHERE id = ?`).bind(row.id).run();
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
