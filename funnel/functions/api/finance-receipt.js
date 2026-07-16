/** Founder-gated receipt upload/download using the existing private R2 binding. */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "image/heic": "heic", "application/pdf": "pdf",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function authorized(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  return env.AUTH_SECRET ? verifyToken(token, env.AUTH_SECRET) : false;
}

export async function onRequest({ request, env }) {
  if (!(await authorized(request, env))) return json({ ok: false, error: "Not authorized." }, 401);
  if (!env.NOTES_R2) return json({ ok: false, error: "Receipt storage is not configured." }, 500);

  if (request.method === "GET") {
    const key = new URL(request.url).searchParams.get("key") || "";
    if (!key.startsWith("finance/") || key.includes("..")) return json({ ok: false, error: "Invalid key." }, 400);
    const object = await env.NOTES_R2.get(key);
    if (!object) return json({ ok: false, error: "Receipt not found." }, 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${(object.customMetadata?.originalName || "receipt").replace(/[\"\\]/g, "")}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  if (request.method === "POST") {
    let form;
    try { form = await request.formData(); } catch { return json({ ok: false, error: "Send multipart form data." }, 400); }
    const file = form.get("file");
    if (!file || typeof file === "string") return json({ ok: false, error: "Choose a receipt file." }, 422);
    const extension = TYPES[file.type];
    if (!extension) return json({ ok: false, error: "Use PNG, JPEG, WebP, HEIC, or PDF." }, 415);
    if (file.size > MAX_BYTES) return json({ ok: false, error: "Receipt is larger than 10 MB." }, 413);
    const key = `finance/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
    await env.NOTES_R2.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: String(file.name || "receipt").slice(0, 200) },
    });
    return json({ ok: true, key }, 201);
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
