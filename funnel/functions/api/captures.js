/**
 * /api/captures — product/supplier captures clipped by the MACC Product Capture
 * browser extension (tools/product-scraper-extension), backed by D1 env.DB.
 *
 *   GET    ?q=&limit=         -> { ok, captures: [...] } newest first
 *   POST   { rows: [...] }    -> append captures (a single bare row object also works)
 *   PATCH  { id, ...fields }  -> correct a capture (any content field, incl. notes)
 *   DELETE { id }             -> remove a capture
 *
 * Auth and the activity log come from functions/api/_middleware.js like every
 * /api/* route. The extension authenticates with the founder's own session cookie
 * (it fetches with credentials: 'include'), so a capture is attributed to whoever
 * is signed in — created_by is stamped from the session, never from the body.
 */
import { currentUser } from "../_auth.js";

const FIELDS = [
  "brand", "product", "description", "cost", "currency", "location",
  "supplier", "moq", "source", "url", "image", "other", "notes",
];
const MAX_LEN = {
  brand: 200, product: 400, description: 2000, cost: 200, currency: 16,
  location: 200, supplier: 300, moq: 200, source: 200, url: 2000,
  image: 2000, other: 2000, notes: 2000,
};
const MAX_BATCH = 50;   // one extension queue flush, not a bulk import channel
const MAX_LIST = 500;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function cleanText(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

/** ISO-parseable stays as given; anything else becomes "now" rather than junk. */
function cleanCapturedAt(value) {
  const raw = String(value || "").trim().slice(0, 40);
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : new Date().toISOString();
}

/** The extension sends camelCase capturedAt; the sheet-era TSV used it too. */
function cleanRow(input) {
  if (!input || typeof input !== "object") return null;
  const row = {};
  for (const field of FIELDS) row[field] = cleanText(input[field], MAX_LEN[field]);
  if (!row.product && !row.description) return null;
  row.captured_at = cleanCapturedAt(input.captured_at || input.capturedAt);
  return row;
}

export async function onRequest(context) {
  const { request, env } = context;

  const user = await currentUser(context);
  if (!user) return json({ ok: false, error: "Not authorized." }, 401);
  if (!env.DB) return json({ ok: false, error: "Database not configured (bind D1 as DB)." }, 500);

  const method = request.method;

  if (method === "GET") {
    const url = new URL(request.url);
    const q = cleanText(url.searchParams.get("q"), 120);
    const limit = Math.min(MAX_LIST, Math.max(1, Number(url.searchParams.get("limit")) || MAX_LIST));
    let sql =
      `SELECT id, captured_at, brand, product, description, cost, currency, location,
              supplier, moq, source, url, image, other, notes, created_by, created_at, updated_at
       FROM product_captures`;
    const binds = [];
    if (q) {
      const like = "%" + q.replace(/([\\%_])/g, "\\$1") + "%";
      const hay = ["product", "brand", "supplier", "description", "location", "source", "notes"];
      sql += " WHERE " + hay.map((col) => `${col} LIKE ? ESCAPE '\\'`).join(" OR ");
      for (let i = 0; i < hay.length; i++) binds.push(like);
    }
    sql += " ORDER BY datetime(created_at) DESC, id DESC LIMIT ?";
    binds.push(limit);
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return json({ ok: true, captures: results || [] });
  }

  if (method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const input = Array.isArray(body.rows) ? body.rows : [body];
    if (input.length > MAX_BATCH) return json({ ok: false, error: `At most ${MAX_BATCH} rows per request.` }, 422);
    const rows = input.map(cleanRow).filter(Boolean);
    if (!rows.length) return json({ ok: false, error: "Each row needs at least a product name or description." }, 422);

    const now = new Date().toISOString();
    const createdBy = cleanText(user.name || user.email, 120);
    const statements = rows.map((row) =>
      env.DB.prepare(
        `INSERT INTO product_captures
           (captured_at, brand, product, description, cost, currency, location, supplier,
            moq, source, url, image, other, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        row.captured_at, row.brand, row.product, row.description, row.cost, row.currency,
        row.location, row.supplier, row.moq, row.source, row.url, row.image, row.other,
        row.notes, createdBy, now, now
      )
    );
    await env.DB.batch(statements);
    return json({ ok: true, added: rows.length, skipped: input.length - rows.length });
  }

  if (method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: "A valid id is required." }, 422);

    const sets = [];
    const binds = [];
    for (const field of FIELDS) {
      if (typeof body[field] === "string") {
        sets.push(`${field} = ?`);
        binds.push(cleanText(body[field], MAX_LEN[field]));
      }
    }
    if (!sets.length) return json({ ok: false, error: "Nothing to update." }, 422);
    sets.push("updated_at = ?");
    binds.push(new Date().toISOString());
    binds.push(id);
    const result = await env.DB.prepare(`UPDATE product_captures SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
    if (!result.meta || result.meta.changes === 0) return json({ ok: false, error: "Capture not found." }, 404);
    return json({ ok: true });
  }

  if (method === "DELETE") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: "A valid id is required." }, 422);
    const result = await env.DB.prepare(`DELETE FROM product_captures WHERE id = ?`).bind(id).run();
    if (!result.meta || result.meta.changes === 0) return json({ ok: false, error: "Capture not found." }, 404);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
}
