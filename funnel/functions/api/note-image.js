/**
 * /api/note-image — founder-gated attachment storage for team notes.
 *
 * The route name is retained for existing photo URLs. It now accepts images and
 * common business documents, stores them in private R2, and streams/downloads
 * them only after founder authentication.
 */
import { COOKIE_NAME, getCookie, verifyToken } from "../_auth.js";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const TYPES = {
  "image/png": { ext: "png", kind: "image" },
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "image/gif": { ext: "gif", kind: "image" },
  "image/heic": { ext: "heic", kind: "image" },
  "application/pdf": { ext: "pdf", kind: "document" },
  "application/msword": { ext: "doc", kind: "document" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", kind: "document" },
  "application/vnd.ms-excel": { ext: "xls", kind: "document" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", kind: "document" },
  "text/csv": { ext: "csv", kind: "document" },
  "application/vnd.ms-powerpoint": { ext: "ppt", kind: "document" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", kind: "document" },
  "text/plain": { ext: "txt", kind: "document" },
};
const EXTENSIONS = new Set([...Object.values(TYPES).map((entry) => entry.ext), "jpeg"]);

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

function safeFilename(value) {
  const name = String(value || "attachment").replace(/[\r\n]/g, "").slice(0, 200);
  return name || "attachment";
}

function encodedFilename(value) {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function extensionOf(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match && EXTENSIONS.has(match[1]) ? match[1] : "";
}

function classify(file) {
  if (TYPES[file.type]) return TYPES[file.type];
  const ext = extensionOf(file.name);
  if (!ext) return null;
  return { ext, kind: ["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext) ? "image" : "document" };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!(await requireFounder(request, env))) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }
  if (!env.NOTES_R2) {
    return json({ ok: false, error: "Attachment storage not configured (bind R2 as NOTES_R2)." }, 500);
  }

  // ---- Serve ----
  if (request.method === "GET") {
    const key = new URL(request.url).searchParams.get("key") || "";
    if (!key.startsWith("notes/") || key.includes("..")) {
      return json({ ok: false, error: "Invalid key." }, 400);
    }
    const obj = await env.NOTES_R2.get(key);
    if (!obj) return json({ ok: false, error: "Not found." }, 404);
    const originalName = safeFilename(obj.customMetadata?.originalName);
    const kind = obj.customMetadata?.kind || (String(obj.httpMetadata?.contentType || "").startsWith("image/") ? "image" : "document");
    const headers = new Headers({
      "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    });
    if (kind !== "image") {
      const asciiName = originalName.replace(/[^A-Za-z0-9._() -]/g, "_");
      headers.set("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedFilename(originalName)}`);
    }
    return new Response(obj.body, { headers });
  }

  // ---- Upload ----
  if (request.method === "POST") {
    const declaredSize = Number(request.headers.get("Content-Length") || 0);
    if (declaredSize > MAX_BYTES + 256 * 1024) {
      return json({ ok: false, error: "File too large (max 8 MB)." }, 413);
    }
    let form;
    try { form = await request.formData(); } catch {
      return json({ ok: false, error: "Send multipart/form-data with a `file` field." }, 400);
    }
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return json({ ok: false, error: "Missing `file` field." }, 422);
    }
    const classification = classify(file);
    if (!classification) {
      return json({ ok: false, error: "Use an image, PDF, Word, Excel, PowerPoint, CSV, or text file." }, 415);
    }
    if (file.size > MAX_BYTES) return json({ ok: false, error: "File too large (max 8 MB)." }, 413);

    const originalName = safeFilename(file.name);
    const key = `notes/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${classification.ext}`;
    await env.NOTES_R2.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { originalName, kind: classification.kind },
    });
    return json({
      ok: true,
      attachment: { key, name: originalName, type: file.type || "application/octet-stream", size: file.size, kind: classification.kind },
      key,
    });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
