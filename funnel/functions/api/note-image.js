/**
 * /api/note-image — founder-gated image storage for team notes (Cloudflare R2, env.NOTES_R2).
 *
 *   POST  multipart/form-data with a `file` field → { ok, key }
 *         Accepts png / jpeg / webp / gif / heic, ≤ 8 MB. Stored at "notes/<ts>-<rand>.<ext>".
 *   GET   ?key=notes/…  → streams the image (auth required — the bucket is never public)
 *
 * Keys are returned to the client and saved on the note via /api/notes (images array).
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

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

export async function onRequest(context) {
  const { request, env } = context;

  if (!(await requireFounder(request, env))) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }
  if (!env.NOTES_R2) {
    return json({ ok: false, error: "Image storage not configured (bind R2 as NOTES_R2)." }, 500);
  }

  // ---- Serve ----
  if (request.method === "GET") {
    const key = new URL(request.url).searchParams.get("key") || "";
    if (!key.startsWith("notes/") || key.includes("..")) {
      return json({ ok: false, error: "Invalid key." }, 400);
    }
    const obj = await env.NOTES_R2.get(key);
    if (!obj) return json({ ok: false, error: "Not found." }, 404);
    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
        // Keys are unique per upload, so founders' browsers may cache them forever.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  // ---- Upload ----
  if (request.method === "POST") {
    let form;
    try { form = await request.formData(); } catch {
      return json({ ok: false, error: "Send multipart/form-data with a `file` field." }, 400);
    }
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return json({ ok: false, error: "Missing `file` field." }, 422);
    }
    const ext = TYPES[file.type];
    if (!ext) return json({ ok: false, error: "Only PNG, JPEG, WebP, GIF, or HEIC images are accepted." }, 415);
    if (file.size > MAX_BYTES) return json({ ok: false, error: "Image too large (max 8 MB)." }, 413);

    const key = `notes/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await env.NOTES_R2.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: String(file.name || "").slice(0, 200) },
    });
    return json({ ok: true, key });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
