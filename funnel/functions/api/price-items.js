/**
 * /api/price-items — the SC-16 price list.
 *
 *   GET                       → { ok, items: [...] }
 *   PUT    { item_key, ... }  → create or update one line
 *   DELETE { item_key }       → remove a founder-added line (built-ins deactivate instead)
 *
 * The quote builder ships with a built-in catalogue in JavaScript: the Tacloban
 * supplier sheet for balance-of-system, plus equipment prices that are mostly
 * still estimates. This table holds edits on top of it, so when a supplier call
 * comes back the correction is a form submission rather than a code change.
 *
 * The one rule worth stating: `confirmed` cannot be set without a `source_note`.
 * That flag is what stops a quote printing stamped INDICATIVE (Founder OS §7),
 * so it is the difference between "we think this costs" and "a supplier told us
 * this costs". A one-click toggle that records nothing would quietly convert
 * every estimate into a firm price, which is precisely the failure the stamp
 * exists to prevent. Un-confirming needs no note — doubting a number is always
 * allowed.
 *
 * Auth and the audit row come from functions/api/_middleware.js.
 */
import { currentUser } from "../_auth.js";

const KINDS = ["inverter", "panel", "battery", "bos"];
const MAX_PRICE = 10_000_000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(value, max) {
  return String(value == null ? "" : value).replace(/[\r\n]+/g, " ").slice(0, max).trim();
}

let schemaChecked = false;
async function ensureSchema(env) {
  if (schemaChecked) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS price_items (
       id           INTEGER PRIMARY KEY AUTOINCREMENT,
       kind         TEXT NOT NULL,
       item_key     TEXT NOT NULL UNIQUE,
       label        TEXT NOT NULL,
       price        REAL NOT NULL,
       qty_fixed    REAL,
       group_name   TEXT,
       confirmed    INTEGER NOT NULL DEFAULT 0,
       source_note  TEXT,
       confirmed_at TEXT,
       confirmed_by TEXT,
       custom       INTEGER NOT NULL DEFAULT 0,
       active       INTEGER NOT NULL DEFAULT 1,
       spec         REAL,
       updated_at   TEXT NOT NULL,
       updated_by   TEXT
     )`
  ).run();
  try {
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_price_items_kind ON price_items(kind)`).run();
  } catch (_) { /* an index is an optimisation, not a requirement */ }
  // Tables created before founder-added equipment existed need the rating column.
  // ALTER TABLE has no IF NOT EXISTS in SQLite — the duplicate-column error is the
  // success case on every run after the first.
  try {
    await env.DB.prepare(`ALTER TABLE price_items ADD COLUMN spec REAL`).run();
  } catch (_) { /* already present */ }
  // Inverters only: 1 = hybrid (works with storage), 0 = on-grid string inverter.
  // Which one a package needs follows from whether that package has a battery, so
  // this replaced hard-coded lists of package names on each inverter.
  try {
    await env.DB.prepare(`ALTER TABLE price_items ADD COLUMN hybrid INTEGER`).run();
  } catch (_) { /* already present */ }
  schemaChecked = true;
}

export async function onRequestGet(context) {
  const founder = await currentUser(context);
  if (!founder) return json({ ok: false, error: "Not signed in." }, 401);
  await ensureSchema(context.env);
  const { results } = await context.env.DB.prepare(
    `SELECT * FROM price_items ORDER BY kind, group_name, label`
  ).all();
  return json({ ok: true, items: results || [] });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const founder = await currentUser(context);
  if (!founder) return json({ ok: false, error: "Not signed in." }, 401);
  await ensureSchema(env);

  let b;
  try { b = await request.json(); } catch (_) { return json({ ok: false, error: "Expected JSON." }, 400); }

  const itemKey = clean(b.item_key, 80);
  const kind = clean(b.kind, 20);
  if (!itemKey) return json({ ok: false, error: "item_key is required." }, 422);
  if (!KINDS.includes(kind)) return json({ ok: false, error: "Unknown kind." }, 422);

  const price = Number(b.price);
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
    return json({ ok: false, error: "Price must be a number between 0 and 10,000,000." }, 422);
  }

  const label = clean(b.label, 120);
  if (!label) return json({ ok: false, error: "A label is required." }, 422);

  const confirmed = b.confirmed ? 1 : 0;
  const sourceNote = clean(b.source_note, 200);
  // The whole point of the flag. Marking a price firm without saying who quoted it
  // is how an estimate silently becomes a number on a contract.
  if (confirmed && !sourceNote) {
    return json({
      ok: false,
      error: "Say where the confirmed price came from — supplier, contact and date. A price cannot be marked confirmed without it.",
    }, 422);
  }

  const custom = b.custom ? 1 : 0;
  const qtyFixed = b.qty_fixed == null || b.qty_fixed === "" ? null : Number(b.qty_fixed);
  if (qtyFixed != null && (!Number.isFinite(qtyFixed) || qtyFixed < 0)) {
    return json({ ok: false, error: "Quantity must be a positive number." }, 422);
  }
  // A founder-added balance-of-system line has no geometry formula behind it, so it
  // has to carry its own quantity or it would silently contribute nothing.
  if (custom && kind === "bos" && qtyFixed == null) {
    return json({ ok: false, error: "A custom line needs a quantity." }, 422);
  }

  // `spec` is the equipment rating: watts per panel, kW for an inverter, kWh for a
  // battery. Panels and batteries feed the sizing math, so a founder-added one
  // without a rating would silently produce a 0 kWp array or a 0 kWh bank.
  const spec = b.spec == null || b.spec === "" ? null : Number(b.spec);
  if (spec != null && (!Number.isFinite(spec) || spec < 0 || spec > 100000)) {
    return json({ ok: false, error: "The rating must be a positive number." }, 422);
  }
  if (custom && kind === "panel" && !(spec > 0)) {
    return json({ ok: false, error: "A panel needs its watts (e.g. 615)." }, 422);
  }
  if (custom && kind === "battery" && !(spec > 0)) {
    return json({ ok: false, error: "A battery needs its kWh capacity (e.g. 5.12)." }, 422);
  }

  // Only meaningful for inverters; NULL elsewhere so nothing else has to care.
  const hybrid = kind === "inverter" ? (b.hybrid ? 1 : 0) : null;

  const now = new Date().toISOString();
  const by = clean(founder.name || founder.email, 80);
  const existing = await env.DB.prepare(`SELECT confirmed FROM price_items WHERE item_key = ?`)
    .bind(itemKey).first();

  // Keep the original confirmation's timestamp when nothing about it changed, so
  // "confirmed 2026-07-14" does not silently become today on an unrelated edit.
  const wasConfirmed = existing ? existing.confirmed === 1 : false;
  const confirmedAt = confirmed ? (wasConfirmed ? undefined : now) : null;

  if (existing) {
    await env.DB.prepare(
      `UPDATE price_items SET kind = ?, label = ?, price = ?, qty_fixed = ?, group_name = ?,
         confirmed = ?, source_note = ?, ${confirmedAt === undefined ? "" : "confirmed_at = ?,"}
         confirmed_by = ?, custom = ?, active = ?, spec = ?, hybrid = ?, updated_at = ?, updated_by = ?
       WHERE item_key = ?`
    ).bind(
      ...[kind, label, price, qtyFixed, clean(b.group_name, 60) || null, confirmed, sourceNote || null],
      ...(confirmedAt === undefined ? [] : [confirmedAt]),
      confirmed ? by : null, custom, b.active === 0 ? 0 : 1, spec, hybrid, now, by, itemKey
    ).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO price_items
         (kind, item_key, label, price, qty_fixed, group_name, confirmed, source_note,
          confirmed_at, confirmed_by, custom, active, spec, hybrid, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      kind, itemKey, label, price, qtyFixed, clean(b.group_name, 60) || null,
      confirmed, sourceNote || null, confirmed ? now : null, confirmed ? by : null,
      custom, b.active === 0 ? 0 : 1, spec, hybrid, now, by
    ).run();
  }

  const row = await env.DB.prepare(`SELECT * FROM price_items WHERE item_key = ?`).bind(itemKey).first();
  return json({ ok: true, item: row });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const founder = await currentUser(context);
  if (!founder) return json({ ok: false, error: "Not signed in." }, 401);
  await ensureSchema(env);

  let b;
  try { b = await request.json(); } catch (_) { return json({ ok: false, error: "Expected JSON." }, 400); }
  const itemKey = clean(b.item_key, 80);
  if (!itemKey) return json({ ok: false, error: "item_key is required." }, 422);

  const row = await env.DB.prepare(`SELECT custom FROM price_items WHERE item_key = ?`)
    .bind(itemKey).first();
  if (!row) return json({ ok: false, error: "No such line." }, 404);

  // A built-in line is part of the shipped catalogue — deleting the row would just
  // resurrect the hard-coded default and look like the edit failed. Deactivate it.
  if (row.custom !== 1) {
    await env.DB.prepare(
      `UPDATE price_items SET active = 0, updated_at = ?, updated_by = ? WHERE item_key = ?`
    ).bind(new Date().toISOString(), clean(founder.name || founder.email, 80), itemKey).run();
    return json({ ok: true, deactivated: true });
  }

  await env.DB.prepare(`DELETE FROM price_items WHERE item_key = ?`).bind(itemKey).run();
  return json({ ok: true, deleted: true });
}
