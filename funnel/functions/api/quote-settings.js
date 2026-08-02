/**
 * /api/quote-settings — the numbers behind SC-16, held as data rather than code.
 *
 *   GET            → { ok, config, canEdit, updatedAt, updatedBy }
 *   PUT  { config } → replace the whole config
 *
 * The price ladder is NOT settled. Packages, their size ceilings and their prices
 * are still moving, and a number that moves does not belong in a JavaScript
 * constant where changing it is a deploy. The same goes for the sizing assumptions
 * the savings estimate hangs off — the daylight self-consumption share in
 * particular, which silently decides what a homeowner is promised per month.
 *
 * Stored as ONE json blob under a single key rather than a row per number. The
 * ladder is a list whose length changes when a tier is added or dropped, and a
 * key-per-field table would need a migration every time that happens — which is
 * the problem this endpoint exists to solve.
 *
 * Any signed-in founder can write, exactly as they can with the price list: the
 * founders are equals, and whoever is on the phone to a customer is the person who
 * knows the ladder needs to move. The control is the record, not the lock — every
 * write is audited by functions/api/_middleware.js and the dialog names who last
 * changed it and when.
 */
import { currentUser } from "../_auth.js";

const KEY = "config";

/**
 * What the tool assumes until a founder says otherwise. These are the values SC-16
 * shipped with, kept here as the fallback so a database that has never been written
 * to still produces the quotes the team is used to.
 */
export const DEFAULT_CONFIG = {
  // The SC-06 price ladder, matched top to bottom: the first tier whose ceilings
  // both fit wins. Nothing matches → CUSTOM, and the founder sets the price from
  // the market (Founder OS §3 — the corridor prices, never the cost sheet).
  tiers: [
    {
      name: "FLAGSHIP", maxKwp: 2.4, maxKwh: 3, price: 99500, priceBattery: null,
      note: "Inside the PHP 80-100k window - the fixed flagship price.",
    },
    {
      name: "PLUS", maxKwp: 4.0, maxKwh: 5.2, price: 149500, priceBattery: 189500,
      note: "PLUS tier of the SC-06 ladder.",
    },
  ],

  // Sizing. `tariff` and `yieldPerKwp` seed the two fields in "Their BILECO bill";
  // both are marked EST in SC-08 and the yield should be replaced with metered
  // output from the first reference install.
  tariff: 12.9458,
  yieldPerKwp: 4.0,
  daysPerMonth: 30,
  coverageLiwanag: 70,
  coverageIlaw: 85,
  coverageSandigan: 75,

  // The share of what the panels make that actually lands on the bill. Without
  // storage the rest exports at below retail, so counting it peso-for-peso would
  // overstate the saving on the customer's own quotation (§1.6).
  selfConsumption: 85,
  selfConsumptionBattery: 100,

  // Array geometry, which drives the balance-of-system quantities.
  panelsPerRow: 7,
  panelsPerString: 14,

  // Money. `fee*` is what the customer is charged for labour; `delivery*` is what
  // that labour actually costs us. They are separate on purpose — the gap is the
  // margin, and one field standing in for both is how a job looks profitable.
  vatRate: 12,
  feeBase: 12000,
  feePerPanel: 3000,
  deliveryBase: 12000,
  deliveryPerPanel: 1500,

  // Defaults for the founder-only fields in Money.
  benchPerKw: 70000,
  undercutPct: 5,
  floorPct: 20,
  referralPerKw: 1000,
  warrantyPct: 2,
  taxPct: 0,
};

/** field → [min, max]. Everything not a tier is a plain number with a sane range. */
const NUMBERS = {
  tariff: [0.01, 100],
  yieldPerKwp: [0.1, 12],
  daysPerMonth: [28, 31],
  coverageLiwanag: [10, 100],
  coverageIlaw: [10, 100],
  coverageSandigan: [10, 100],
  selfConsumption: [1, 100],
  selfConsumptionBattery: [1, 100],
  panelsPerRow: [1, 60],
  panelsPerString: [1, 60],
  vatRate: [0, 30],
  feeBase: [0, 5_000_000],
  feePerPanel: [0, 500_000],
  deliveryBase: [0, 5_000_000],
  deliveryPerPanel: [0, 500_000],
  benchPerKw: [0, 1_000_000],
  undercutPct: [0, 50],
  floorPct: [0, 90],
  referralPerKw: [0, 100_000],
  warrantyPct: [0, 20],
  taxPct: [0, 20],
};

const MAX_TIERS = 8;

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
    `CREATE TABLE IF NOT EXISTS quote_settings (
       key        TEXT PRIMARY KEY,
       value      TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       updated_by TEXT
     )`
  ).run();
  schemaChecked = true;
}

/**
 * Saved values layered over the defaults, so a config written before a field
 * existed still produces a complete object rather than undefined arithmetic.
 * Exported because the quote endpoint may one day need the same numbers.
 */
export async function readConfig(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare(`SELECT * FROM quote_settings WHERE key = ?`).bind(KEY).first();
  if (!row) return { config: { ...DEFAULT_CONFIG }, updatedAt: null, updatedBy: null };
  let saved = {};
  try { saved = JSON.parse(row.value) || {}; } catch (_) { saved = {}; }
  const config = { ...DEFAULT_CONFIG, ...saved };
  if (!Array.isArray(config.tiers) || !config.tiers.length) config.tiers = DEFAULT_CONFIG.tiers;
  return { config, updatedAt: row.updated_at, updatedBy: row.updated_by };
}

export async function onRequestGet(context) {
  const founder = await currentUser(context);
  if (!founder) return json({ ok: false, error: "Not signed in." }, 401);
  const { config, updatedAt, updatedBy } = await readConfig(context.env);
  // Sent so the dialog reflects the server's own answer rather than assuming one.
  return json({ ok: true, config, updatedAt, updatedBy, canEdit: true });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const founder = await currentUser(context);
  if (!founder) return json({ ok: false, error: "Not signed in." }, 401);
  await ensureSchema(env);

  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: "Expected JSON." }, 400); }
  const incoming = body && body.config;
  if (!incoming || typeof incoming !== "object") {
    return json({ ok: false, error: "Expected a config object." }, 422);
  }

  const config = { ...DEFAULT_CONFIG };

  for (const [field, [min, max]] of Object.entries(NUMBERS)) {
    if (incoming[field] === undefined || incoming[field] === null || incoming[field] === "") continue;
    const n = Number(incoming[field]);
    if (!Number.isFinite(n) || n < min || n > max) {
      return json({ ok: false, error: `${field} must be a number between ${min} and ${max}.` }, 422);
    }
    config[field] = n;
  }

  if (incoming.tiers !== undefined) {
    if (!Array.isArray(incoming.tiers) || !incoming.tiers.length) {
      return json({ ok: false, error: "The ladder needs at least one tier." }, 422);
    }
    if (incoming.tiers.length > MAX_TIERS) {
      return json({ ok: false, error: `The ladder holds at most ${MAX_TIERS} tiers.` }, 422);
    }
    const tiers = [];
    for (const raw of incoming.tiers) {
      const name = clean(raw && raw.name, 40).toUpperCase();
      if (!name) return json({ ok: false, error: "Every tier needs a name." }, 422);
      const maxKwp = Number(raw.maxKwp);
      const maxKwh = Number(raw.maxKwh);
      const price = Number(raw.price);
      if (!Number.isFinite(maxKwp) || maxKwp <= 0 || maxKwp > 100) {
        return json({ ok: false, error: `${name}: the kWp ceiling must be between 0 and 100.` }, 422);
      }
      if (!Number.isFinite(maxKwh) || maxKwh < 0 || maxKwh > 500) {
        return json({ ok: false, error: `${name}: the kWh ceiling must be between 0 and 500.` }, 422);
      }
      if (!Number.isFinite(price) || price <= 0 || price > 100_000_000) {
        return json({ ok: false, error: `${name}: the price must be a positive number.` }, 422);
      }
      const hasBatteryPrice = raw.priceBattery !== null && raw.priceBattery !== undefined && raw.priceBattery !== "";
      const priceBattery = hasBatteryPrice ? Number(raw.priceBattery) : null;
      if (priceBattery !== null && (!Number.isFinite(priceBattery) || priceBattery <= 0 || priceBattery > 100_000_000)) {
        return json({ ok: false, error: `${name}: the with-battery price must be a positive number.` }, 422);
      }
      tiers.push({ name, maxKwp, maxKwh, price, priceBattery, note: clean(raw.note, 200) });
    }
    // Matched top to bottom, so a tier whose ceiling is smaller than the one above
    // it could never be reached. Sorting is kinder than an error the founder has to
    // decode from a list they typed in whatever order made sense to them.
    tiers.sort((a, b) => a.maxKwp - b.maxKwp || a.maxKwh - b.maxKwh);
    config.tiers = tiers;
  }

  const now = new Date().toISOString();
  const by = clean(founder.name || founder.email, 80);
  await env.DB.prepare(
    `INSERT INTO quote_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).bind(KEY, JSON.stringify(config), now, by).run();

  return json({ ok: true, config, updatedAt: now, updatedBy: by });
}
