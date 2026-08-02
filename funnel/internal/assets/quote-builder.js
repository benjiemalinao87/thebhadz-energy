/**
 * SC-16 Quote builder.
 *
 * Founder enters a customer's BILECO bill range; the tool sizes a system, builds an
 * itemised bill of materials, prices it, and renders a printable quote sheet.
 *
 * Four things this file deliberately refuses to do, because the Founder Operating
 * System (CLAUDE.md) makes them non-negotiable:
 *
 *  1. It will not let a LIWANAG (on-grid) quote leave without the brownout truth on
 *     it. Anti-islanding shuts an on-grid system off in an outage; implying otherwise
 *     is the value gap that kills word-of-mouth (§1.6).
 *  2. It will not print a quote without the permit / licensed-electrical-practitioner /
 *     BILECO net-metering checklist attached (§7 hard gate).
 *  3. It will not present an unquoted supplier price as a confirmed one. Every catalog
 *     line carries a `quoted` flag; anything false is badged on screen AND on paper,
 *     and the sheet is stamped INDICATIVE until the numbers come back from suppliers.
 *  4. It will not SEND a CUSTOM (above-ladder) quote whose price nobody set: with no
 *     explicit contract price the sheet falls back to its own total, which is cost-plus
 *     (§3). The corridor helper (benchmark ₱/kW × size × (1 − undercut)) computes the
 *     compliant price; margin is then checked against the founders' floor, and TRUE NET
 *     (margin − referral − warranty reserve − tax set-aside) is shown beside it.
 *
 * On pricing: the price ladder comes first and the sheet second. Cost-plus is banned
 * (§3) — materials pass through at supplier cost, our margin sits in the fabrication +
 * installation fee, and the TOTAL is checked against the ₱80–100k corridor packages
 * rather than derived from the BOM. When a configuration falls outside the ladder the
 * tool says so instead of quietly inventing a number.
 *
 * SPA note: init runs immediately (no DOMContentLoaded — see spa-router.js) and bails
 * early when its anchor element is absent.
 */
(function () {
  "use strict";

  var root = document.getElementById("qb-root");
  if (!root) return;

  /* ---------------------------------------------------------------- constants */

  /* --------------------------------------------------------------- the config
   * Every number the quote hangs off — the price ladder, the sizing assumptions,
   * the fee and delivery formulas — is DATA, loaded from /api/quote-settings and
   * editable by a master in "Packages & pricing". None of it is settled: the
   * packages are still moving, and a price that moves must not be a deploy.
   *
   * The block below is the offline fallback, not the source of truth. It has to
   * match the server's DEFAULT_CONFIG (functions/api/quote-settings.js) so a founder
   * on a dead connection still gets the quotes the team is used to rather than a
   * sheet full of NaN.
   */
  var CONFIG = {
    tiers: [
      { name: "FLAGSHIP", maxKwp: 2.4, maxKwh: 3, price: 99500, priceBattery: null,
        note: "Inside the ₱80–100k window — the fixed flagship price." },
      { name: "PLUS", maxKwp: 4.0, maxKwh: 5.2, price: 149500, priceBattery: 189500,
        note: "PLUS tier of the SC-06 ladder." },
    ],
    tariff: 12.9458,          // BILECO residential rate, SC-08. Still EST.
    yieldPerKwp: 4.0,         // kWh per kWp per day, Biliran. EST until a metered install.
    daysPerMonth: 30,
    coverageLiwanag: 70, coverageIlaw: 85, coverageSandigan: 75,
    selfConsumption: 85, selfConsumptionBattery: 100,
    panelsPerRow: 7, panelsPerString: 14,
    vatRate: 12,
    feeBase: 12000, feePerPanel: 3000,
    deliveryBase: 12000, deliveryPerPanel: 1500,
    benchPerKw: 70000, undercutPct: 5, floorPct: 20,
    referralPerKw: 1000, warrantyPct: 2, taxPct: 0,
  };
  var CONFIG_META = { updatedAt: null, updatedBy: null, canEdit: false, loaded: false };

  function loadSettings() {
    return fetch("/api/quote-settings", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : { ok: false }; })
      .then(function (d) {
        if (!d.ok || !d.config) return false;
        Object.keys(d.config).forEach(function (k) { CONFIG[k] = d.config[k]; });
        CONFIG_META = {
          updatedAt: d.updatedAt, updatedBy: d.updatedBy,
          canEdit: !!d.canEdit, loaded: true,
        };
        return true;
      })
      .catch(function () { return false; });   // offline: the fallback above still quotes
  }

  // Bill bands, as a homeowner actually answers the question. `mid` drives the sizing;
  // the founder can type an exact figure instead.
  var BILL_BANDS = [
    { id: "b1", label: "Under ₱2,000", mid: 1500 },
    { id: "b2", label: "₱2,000 – ₱3,500", mid: 2750 },
    { id: "b3", label: "₱3,500 – ₱5,000", mid: 4250 },
    { id: "b4", label: "₱5,000 – ₱8,000", mid: 6500 },
    { id: "b5", label: "₱8,000 – ₱12,000", mid: 10000 },
    { id: "b6", label: "₱12,000 – ₱20,000", mid: 16000 },
    { id: "b7", label: "Over ₱20,000", mid: 25000 }
  ];

  // What each package IS. The share of consumption we design to cover lives in the
  // config, not here: on-grid is sized for daytime self-consumption first (export is
  // credited below retail) and that ratio is a judgement call the founders adjust.
  var SYSTEM_TYPES = {
    liwanag: { label: "LIWANAG — on-grid", coverageKey: "coverageLiwanag", battery: false, gridTied: true },
    ilaw: { label: "ILAW — off-grid", coverageKey: "coverageIlaw", battery: true, gridTied: false },
    sandigan: { label: "SANDIGAN — hybrid", coverageKey: "coverageSandigan", battery: true, gridTied: true }
  };

  function coverageFor(type) {
    var pct = Number(CONFIG[(SYSTEM_TYPES[type] || SYSTEM_TYPES.liwanag).coverageKey]);
    return isFinite(pct) ? pct / 100 : 0.7;
  }

  /*
   * Catalog. `quoted: true` means a real price from a real source, dated below.
   * `quoted: false` means we have NOT confirmed it with a supplier — the number is a
   * placeholder so the sheet computes, and the UI shouts about it.
   *
   * Sources:
   *   [sheet]  Regional supplier quotation via Tacloban, 2026-07 — actual unit prices.
   *   [est]    Estimate only. Solis / Dyness / Pylontech dealer prices are still open
   *            questions — see docs/inverter-battery-brand-research.md §9 call list.
   */
  var INVERTERS = [
    { id: "solis-3k-og", label: "Solis 3kW on-grid string inverter", kw: 3, price: 28000, quoted: false, types: ["liwanag"] },
    { id: "solis-5k-og", label: "Solis 5kW on-grid string inverter", kw: 5, price: 42000, quoted: false, types: ["liwanag"] },
    { id: "solis-3k-hy", label: "Solis S6-EH1P 3kW hybrid", kw: 3, price: 38000, quoted: false, types: ["ilaw", "sandigan"] },
    { id: "solis-5k-hy", label: "Solis S6-EH1P 5kW hybrid", kw: 5, price: 52000, quoted: false, types: ["ilaw", "sandigan"] },
    { id: "solis-6k-hy", label: "Solis S6-EH1P 6kW hybrid", kw: 6, price: 60000, quoted: false, types: ["ilaw", "sandigan"] },
    { id: "deye-8k-hy", label: "DEYE 8kW hybrid", kw: 8, price: 62000, quoted: true, types: ["ilaw", "sandigan"] }
  ];

  var PANELS = [
    { id: "trina-615", label: "TRINA 615W bi-facial", watts: 615, price: 6400, quoted: true },
    { id: "mono-580", label: "580W mono PERC", watts: 580, price: 6000, quoted: false },
    { id: "mono-550", label: "550W mono PERC", watts: 550, price: 5600, quoted: false }
  ];

  var BATTERIES = [
    { id: "none", label: "No battery", kwh: 0, price: 0, quoted: true },
    { id: "dyness-b4850", label: "Dyness B4850 48V 50Ah (2.4 kWh)", kwh: 2.4, price: 45000, quoted: false },
    { id: "pylon-us2000c", label: "Pylontech US2000C (2.4 kWh)", kwh: 2.4, price: 48000, quoted: false },
    { id: "dyness-dl50c", label: "Dyness DL5.0C 51.2V 100Ah (5.12 kWh)", kwh: 5.12, price: 85000, quoted: false },
    { id: "pylon-us5000", label: "Pylontech US5000 (4.8 kWh)", kwh: 4.8, price: 92000, quoted: false },
    { id: "dyness-pbpro", label: "Dyness Powerbox Pro 51.2V 200Ah (10.24 kWh)", kwh: 10.24, price: 175000, quoted: false },
    { id: "sh-230ah", label: "Solar Homes 51.2V 230Ah (11.8 kWh)", kwh: 11.8, price: 125000, quoted: true }
  ];

  // Balance-of-system. `qty` is a function of the array geometry; every one of these
  // unit prices is from the regional supplier sheet, so they are all quoted:true.
  //
  // Geometry model: two rails per row; a mid clamp per rail at every interior joint;
  // two clamps per rail at each row end. Rails, end clamps, brackets, MC4 pairs and
  // cable length all reproduce the regional sheet exactly at 14 panels. Mid clamps are
  // the one deliberate departure — that sheet lists 20 where the two-rail geometry
  // needs 2 × (panels − rows) = 24. We carry the correct count; being four clamps
  // (₱200) light on a roof is not a saving worth having.
  var RAILING = [
    { label: "2.4m Railings", price: 700, qty: function (g) { return g.panels; } },
    { label: "Mid Clamp", price: 50, qty: function (g) { return Math.max(0, 2 * (g.panels - g.rows)); } },
    { label: "End Clamp", price: 50, qty: function (g) { return g.rows * 8; } },
    { label: "L Roof Bracket", price: 100, qty: function (g) { return g.panels * 2 + g.rows * 4; } },
    { label: "MC4-Pair", price: 60, qty: function (g) { return Math.ceil(g.panels / 3); } }
  ];

  var PROTECTION = [
    { label: "20 AT MCB DC", price: 700, qty: function (g) { return 2 * g.strings; } },
    { label: "63 AT MCB AC", price: 400, qty: function () { return 2; } },
    { label: "AC SPD 2P", price: 600, qty: function () { return 1; } },
    { label: "DC SPD 2P", price: 1000, qty: function (g) { return 2 * g.strings; } },
    { label: "BCD 225A", price: 4500, qty: function () { return 1; } },
    { label: "Metal Enclosure", price: 3000, qty: function () { return 1; } },
    { label: "AC-2P-ATS-12A", price: 2000, qty: function (g) { return g.hasBattery ? 1 : 0; } },
    { label: "DC SISO", price: 1200, qty: function () { return 1; } },
    { label: "Batt Cable 1M 35MM", price: 1200, qty: function (g) { return g.hasBattery ? g.batteryQty : 0; } },
    { label: "Metal Hose", price: 9500, qty: function () { return 1; } },
    { label: "Cable Tray 50x50", price: 400, qty: function (g) { return Math.max(2, Math.ceil(g.panels / 4)); } }
  ];

  var CABLES = [
    { label: "TWIN 6mm² Solar Cable (per metre)", price: 140, qty: function (g) { return Math.ceil(g.panels * 7 / 10) * 10; } }
  ];

  /* ------------------------------------------------------- the saved price list
   * The arrays above are the SHIPPED catalogue — the Tacloban sheet plus equipment
   * estimates. /api/price-items holds the founders' corrections on top, so a price
   * that comes back from a supplier call is a form submission, not a code change.
   *
   * The originals are snapshotted once so applying the overlay is idempotent: an
   * item whose override is later deleted has to fall back to what shipped, not to
   * whatever it was overridden to last time.
   */
  var BOS_GROUPS = [
    { name: "RAILING SETS", defs: RAILING },
    { name: "SURGE / BREAKER SET", defs: PROTECTION },
    { name: "CABLES", defs: CABLES },
  ];

  [INVERTERS, PANELS, BATTERIES].forEach(function (arr) {
    arr.forEach(function (it) {
      it.key = it.id;
      it._base = { price: it.price, quoted: it.quoted, label: it.label };
    });
  });
  BOS_GROUPS.forEach(function (g) {
    g.defs.forEach(function (d) {
      d.key = d.label;                       // stable: the shipped label, never re-keyed
      d._base = { price: d.price, quoted: true, label: d.label };
    });
  });

  var CATALOG = {};        // item_key → saved row
  var CUSTOM_LINES = [];   // founder-added balance-of-system lines

  // Founder-added equipment (another inverter/panel/battery brand) lives in the same
  // saved price list, kind-tagged, with `spec` carrying the rating the sizing math
  // needs — watts per panel, kW for an inverter, kWh for a battery.
  var EQUIPMENT_SLOTS = [
    { arr: INVERTERS, kind: "inverter" },
    { arr: PANELS, kind: "panel" },
    { arr: BATTERIES, kind: "battery" },
  ];

  function applyCatalog() {
    // Custom equipment is rebuilt from the saved list on every apply, so start clean.
    EQUIPMENT_SLOTS.forEach(function (slot) {
      for (var i = slot.arr.length - 1; i >= 0; i--) if (slot.arr[i].custom) slot.arr.splice(i, 1);
    });

    var all = [INVERTERS, PANELS, BATTERIES].concat(BOS_GROUPS.map(function (g) { return g.defs; }));
    all.forEach(function (arr) {
      arr.forEach(function (it) {
        var row = CATALOG[it.key];
        if (!row) {
          it.price = it._base.price; it.quoted = it._base.quoted;
          it.label = it._base.label; it.hidden = false;
          return;
        }
        it.price = row.price;
        it.quoted = row.confirmed === 1;
        it.label = row.label || it._base.label;
        it.hidden = row.active === 0;
      });
    });

    EQUIPMENT_SLOTS.forEach(function (slot) {
      Object.keys(CATALOG).forEach(function (key) {
        var row = CATALOG[key];
        if (row.custom !== 1 || row.kind !== slot.kind) return;
        var it = {
          id: row.item_key, key: row.item_key, custom: true,
          label: row.label, price: row.price,
          quoted: row.confirmed === 1, hidden: row.active === 0,
        };
        if (slot.kind === "inverter") { it.kw = row.spec || 0; it.types = ["liwanag", "ilaw", "sandigan"]; }
        if (slot.kind === "panel") it.watts = row.spec || 0;
        if (slot.kind === "battery") it.kwh = row.spec || 0;
        slot.arr.push(it);
      });
    });

    CUSTOM_LINES = Object.keys(CATALOG)
      .map(function (k) { return CATALOG[k]; })
      .filter(function (r) { return r.custom === 1 && r.kind === "bos" && r.active !== 0; });
  }

  function loadCatalog() {
    return fetch("/api/price-items", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : { ok: false }; })
      .then(function (d) {
        if (!d.ok) return false;
        CATALOG = {};
        (d.items || []).forEach(function (row) { CATALOG[row.item_key] = row; });
        applyCatalog();
        return true;
      })
      .catch(function () { return false; });   // offline: the shipped catalogue still works
  }

  // The price ladder. The corridor sets the price; the BOM never does (§3). Tiers
  // are matched smallest first — the server sorts them on save so a tier can never
  // be shadowed by a larger one above it.
  function packageFor(kwp, batteryKwh) {
    var tiers = CONFIG.tiers || [];
    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i];
      if (kwp <= t.maxKwp && batteryKwh <= t.maxKwh) {
        var price = batteryKwh > 0 && t.priceBattery ? t.priceBattery : t.price;
        return { tier: t.name, price: price, note: t.note || (t.name + " tier of the price ladder.") };
      }
    }
    return { tier: "CUSTOM", price: null, note: "Bigger than our published packages — the selling price is set from the market (what this customer already pays an installer, a genset, or BILECO), never from this cost sheet." };
  }

  /* ------------------------------------------------------- the customer's copy
   * Two documents come out of one model. The INTERNAL sheet is the itemised bill
   * of materials with unit prices — the crew's pick list and our cost record. The
   * CUSTOMER copy collapses that into scope: what lands on their roof, named by
   * brand and quantity where the brand is the warranty, and one fixed price.
   *
   * Why the customer copy is not the itemised one: a priced BOM invites the
   * Shopee-kit comparison — the homeowner prices our clamps against Lazada and
   * reads the fee line as padding. We sell a fixed-price installed package (§3),
   * so the document has to argue that, not hand over a shopping list. What it may
   * never do is hide the honesty blocks: the brownout truth (§1.6), the compliance
   * checklist and the INDICATIVE stamp (§7) print on the customer copy regardless
   * of anything set here.
   *
   * `auto` is what the model says. The founder can rename a line, rewrite its
   * detail, or switch it off entirely — every job has something the last one did
   * not. `needs` names the BOM group a line describes: no railings on the sheet,
   * no mounting line on the quote.
   */
  var SCOPE_DEFS = [
    {
      id: "panels", label: "Solar panels",
      auto: function (m) { return m.panels + " × " + m.panel.label + " · " + m.kwp.toFixed(2) + " kWp"; }
    },
    {
      id: "inverter", label: "Inverter",
      auto: function (m) { return m.inverter.label; }
    },
    {
      id: "battery", label: "Battery storage",
      auto: function (m) {
        return m.batteryKwh > 0
          ? m.batteryKwh.toFixed(1) + " kWh · " + m.battery.label
          : "Not included in this package";
      }
    },
    {
      id: "mounting", label: "Mounting", needs: "RAILING SETS",
      auto: function () { return "Typhoon-rated aluminium rail system, fabricated and fitted to your roof"; }
    },
    {
      id: "protection", label: "Protection", needs: "SURGE / BREAKER SET",
      auto: function () { return "DC and AC breakers, surge protection, weatherproof enclosure and safety isolator"; }
    },
    {
      id: "wiring", label: "Wiring", needs: "CABLES",
      auto: function () { return "Solar-rated cable, conduit, cable tray and connectors throughout"; }
    },
    {
      id: "extras", label: "Additional items", needs: "ADDITIONAL ITEMS",
      auto: function (m) {
        var g = groupNamed(m, "ADDITIONAL ITEMS");
        return g ? g.items.map(function (it) { return it.label; }).join(" · ") : "";
      }
    },
    {
      id: "labour", label: "Labour",
      auto: function () { return "Delivery, fabrication, installation, testing and commissioning"; }
    },
    {
      id: "paperwork", label: "Paperwork",
      auto: function (m) {
        return m.spec.gridTied
          ? "LGU electrical permit and BILECO net-metering application, filed and tracked by us"
          : "LGU electrical permit filed by us, plus commissioning and owner training";
      }
    }
  ];

  var SCOPE_KEY = "sc16-scope-prefs";
  var SCOPE_PREFS = {};        // id → { off, label, detail } — the founder's overrides

  function loadScopePrefs() {
    try { return JSON.parse(localStorage.getItem(SCOPE_KEY) || "{}") || {}; }
    catch (_) { return {}; }
  }
  function saveScopePrefs() {
    try { localStorage.setItem(SCOPE_KEY, JSON.stringify(SCOPE_PREFS)); } catch (_) { /* private mode */ }
  }

  function groupNamed(m, name) {
    for (var i = 0; i < m.groups.length; i++) if (m.groups[i].name === name) return m.groups[i];
    return null;
  }

  /**
   * The customer copy's scope list, overrides applied.
   *
   * A field is either FOLLOWING THE MODEL or OWNED BY THE FOUNDER, and the flag
   * that decides which is "has this field ever been edited", not "is it empty".
   * An untouched field tracks the configuration — change the panel count and the
   * panels line follows. A touched field prints exactly what is in it, INCLUDING
   * nothing: renaming a line to "Supply and installation of a 6 kW solar setup"
   * and clearing its detail has to give a heading with no sentence under it, not
   * the sentence that belonged to the heading you replaced.
   *
   * `on:false` lines stay in the list so the editor can still show them; the sheet
   * filters them out.
   */
  function clientScope(m) {
    return SCOPE_DEFS
      .filter(function (d) { return !d.needs || groupNamed(m, d.needs); })
      .map(function (d) {
        var pref = SCOPE_PREFS[d.id] || {};
        var autoLabel = d.label;
        var autoDetail = d.auto(m);
        return {
          id: d.id,
          autoLabel: autoLabel,
          autoDetail: autoDetail,
          label: pref.labelSet ? String(pref.label || "").trim() : autoLabel,
          detail: pref.detailSet ? String(pref.detail || "").trim() : autoDetail,
          custom: !!(pref.labelSet || pref.detailSet),
          on: pref.off !== true
        };
      });
  }

  /** A scope line reaches the paper if it is switched on and has something to say. */
  function scopePrinted(m) {
    return clientScope(m).filter(function (s) { return s.on && (s.label || s.detail); });
  }

  /* ------------------------------------------------------------------- helpers */

  function peso(n) {
    return "₱" + Math.round(n || 0).toLocaleString("en-PH");
  }
  function money(n) {
    return (Math.round((n || 0) * 100) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }
  function el(id) { return document.getElementById(id); }
  function val(id) { var n = el(id); return n ? n.value : ""; }
  function num(id, fallback) {
    var v = parseFloat(val(id));
    return isFinite(v) ? v : fallback;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(iso, days) {
    var d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /** Sequential quote number, per browser. Good enough for a paper trail of one crew. */
  function nextQuoteNo() {
    var key = "sc16-quote-seq";
    var stamp = todayISO().replace(/-/g, "");
    var n = 1;
    try {
      var saved = JSON.parse(localStorage.getItem(key) || "{}");
      n = saved.date === stamp ? (saved.n || 0) + 1 : 1;
      localStorage.setItem(key, JSON.stringify({ date: stamp, n: n }));
    } catch (_) { /* private mode — fall back to 1 */ }
    return "MACC-" + stamp + "-" + String(n).padStart(3, "0");
  }

  /* ------------------------------------------------------------------- the math */

  function compute() {
    var type = val("qb-type") || "liwanag";
    var spec = SYSTEM_TYPES[type];
    var tariff = num("qb-tariff", CONFIG.tariff);
    var yieldPerKwp = num("qb-yield", CONFIG.yieldPerKwp);
    var days = CONFIG.daysPerMonth || 30;

    // Bill: an exact figure wins over the band when the founder has the actual bill in
    // hand (they usually will — §2 says ask to see last month's bill).
    var exact = num("qb-bill-exact", 0);
    var band = null;
    for (var i = 0; i < BILL_BANDS.length; i++) if (BILL_BANDS[i].id === val("qb-bill-band")) band = BILL_BANDS[i];
    if (!band) band = BILL_BANDS[3];
    var bill = exact > 0 ? exact : band.mid;

    var monthlyKwh = tariff > 0 ? bill / tariff : 0;
    var coverage = num("qb-coverage", coverageFor(type) * 100) / 100;

    var panel = byId(PANELS, val("qb-panel"));
    var targetKwp = (monthlyKwh * coverage) / (yieldPerKwp * days);

    // Panel count: auto unless the founder has overridden it (roof survey usually wins).
    var override = parseInt(val("qb-panels-override"), 10);
    var panels = isFinite(override) && override > 0
      ? override
      : Math.max(2, Math.ceil((targetKwp * 1000) / panel.watts));

    var kwp = (panels * panel.watts) / 1000;
    // Whole panels rarely land exactly on the target, and the overshoot is what pushes a
    // job from FLAGSHIP into PLUS — so it is shown, not buried.
    var overshootPct = targetKwp > 0 ? ((kwp - targetKwp) / targetKwp) * 100 : 0;
    var rows = Math.max(1, Math.ceil(panels / (CONFIG.panelsPerRow || 7)));
    var strings = Math.max(1, Math.ceil(panels / (CONFIG.panelsPerString || 14)));

    var inverter = byId(INVERTERS, val("qb-inverter"));
    var battery = byId(BATTERIES, val("qb-battery"));
    var batteryQty = spec.battery ? Math.max(1, parseInt(val("qb-battery-qty"), 10) || 1) : 0;
    if (!spec.battery || battery.id === "none") { battery = BATTERIES[0]; batteryQty = 0; }
    var batteryKwh = battery.kwh * batteryQty;

    var geom = { panels: panels, rows: rows, strings: strings, hasBattery: batteryKwh > 0, batteryQty: batteryQty };

    /* ----- build the itemised BOM, mirroring the layout of a regional quote sheet */
    var groups = [];
    var unquoted = 0;

    function line(label, qty, price, quotedFlag) {
      if (!qty) return null;
      if (quotedFlag === false) unquoted++;
      return { label: label, qty: qty, price: price, total: qty * price, quoted: quotedFlag !== false };
    }

    var head = [];
    head.push(line(inverter.label, 1, inverter.price, inverter.quoted));
    head.push(line(panel.label, panels, panel.price, panel.quoted));
    groups.push({ name: null, items: head.filter(Boolean) });

    // A hidden line is one a founder switched off (the customer already has rails,
    // say). A line whose saved price is not supplier-confirmed counts toward the
    // INDICATIVE stamp exactly like an unconfirmed inverter — `line` handles that.
    function mapGroup(name, defs) {
      var items = defs
        .filter(function (d) { return !d.hidden; })
        .map(function (d) { return line(d.label, d.qty(geom), d.price, d.quoted !== false); })
        .filter(Boolean);
      CUSTOM_LINES
        .filter(function (r) { return (r.group_name || "") === name; })
        .forEach(function (r) {
          var it = line(r.label, r.qty_fixed, r.price, r.confirmed === 1);
          if (it) items.push(it);
        });
      if (items.length) groups.push({ name: name, items: items });
    }
    BOS_GROUPS.forEach(function (g) { mapGroup(g.name, g.defs); });

    if (batteryKwh > 0) {
      groups.push({ name: "BATTERY", items: [line(battery.label, batteryQty, battery.price, battery.quoted)].filter(Boolean) });
    }

    // Custom lines the founder did not file under one of the shipped groups. They
    // get their own heading rather than being dropped — a line that silently fails
    // to appear is money quietly absorbed into the fabrication fee.
    var known = BOS_GROUPS.map(function (g) { return g.name; });
    var loose = CUSTOM_LINES
      .filter(function (r) { return known.indexOf(r.group_name || "") === -1; })
      .map(function (r) { return line(r.label, r.qty_fixed, r.price, r.confirmed === 1); })
      .filter(Boolean);
    if (loose.length) groups.push({ name: "ADDITIONAL ITEMS", items: loose });

    var materials = 0;
    groups.forEach(function (g) { g.items.forEach(function (it) { materials += it.total; }); });

    var vatOn = el("qb-vat") ? el("qb-vat").checked : true;
    var vatRate = (CONFIG.vatRate == null ? 12 : CONFIG.vatRate) / 100;
    var vat = vatOn ? materials * vatRate : 0;

    // Where our margin lives. Materials pass through at supplier cost; this line carries
    // fabrication, delivery, crew, transport and the permit/net-metering work.
    var feeAuto = CONFIG.feeBase + panels * CONFIG.feePerPanel;
    var feeInput = num("qb-fee", -1);
    var fee = feeInput >= 0 ? feeInput : feeAuto;

    var total = materials + vat + fee;

    /* ----- price ladder and margin */
    var pack = packageFor(kwp, batteryKwh);
    var priceOverride = num("qb-price", -1);
    var customerPrice = priceOverride >= 0 ? priceOverride : (pack.price != null ? pack.price : total);

    // Our own delivery cost for the fee line — crew, transport, permits, fabrication
    // materials. Default from the SC-05 §4 cost stack; editable.
    var deliveryCost = num("qb-delivery-cost", -1);
    var deliveryAuto = CONFIG.deliveryBase + panels * CONFIG.deliveryPerPanel;
    if (deliveryCost < 0) deliveryCost = deliveryAuto;

    var ourCost = materials + vat + deliveryCost;
    var margin = customerPrice - ourCost;
    var marginPct = customerPrice > 0 ? (margin / customerPrice) * 100 : 0;

    /* ----- corridor helper, margin floor and true net (founder-only — never printed)
     * Above the ladder the price is an input FROM the market: benchmark ₱/kW × size ×
     * (1 − undercut), rounded to a clean hundred (§3 — corridor first, cost-plus banned).
     * True net is what actually lands after the deductions the gross margin ignores. */
    var bench = num("qb-bench", CONFIG.benchPerKw);
    var undercutPct = num("qb-undercut", CONFIG.undercutPct);
    var corridorPrice = bench > 0 && kwp > 0
      ? Math.round((kwp * bench * (1 - undercutPct / 100)) / 100) * 100
      : 0;

    var floorPct = num("qb-floor", CONFIG.floorPct);
    var referral = num("qb-referral", CONFIG.referralPerKw) * kwp;   // ₱/kW flat, meeting #7
    var warrantyReserve = customerPrice * num("qb-warranty", CONFIG.warrantyPct) / 100;
    var taxAside = customerPrice * num("qb-taxaside", CONFIG.taxPct) / 100;
    var trueNet = margin - referral - warrantyReserve - taxAside;
    var belowFloor = margin > 0 && marginPct < floorPct;

    /* ----- generation and savings (all EST) */
    var generation = kwp * yieldPerKwp * days;
    // On-grid without storage only banks what is consumed during daylight; export is
    // credited below retail, so we do not count it as a peso-for-peso saving. This
    // share is the biggest single lever on the saving the customer is promised, so it
    // is a setting a founder can see and change, never a constant buried in here.
    var usableShare = (batteryKwh > 0 ? CONFIG.selfConsumptionBattery : CONFIG.selfConsumption) / 100;
    var offsetKwh = Math.min(generation * usableShare, monthlyKwh);
    var savedPerMonth = offsetKwh * tariff;
    var paybackYears = savedPerMonth > 0 ? customerPrice / (savedPerMonth * 12) : 0;

    return {
      type: type, spec: spec, tariff: tariff, yieldPerKwp: yieldPerKwp,
      bill: bill, bandLabel: exact > 0 ? "Actual bill" : band.label, monthlyKwh: monthlyKwh,
      coverage: coverage, panel: panel, panels: panels, kwp: kwp, targetKwp: targetKwp,
      overshootPct: overshootPct, rows: rows, strings: strings,
      inverter: inverter, battery: battery, batteryQty: batteryQty, batteryKwh: batteryKwh,
      groups: groups, materials: materials, vat: vat, vatOn: vatOn, vatRate: vatRate,
      fee: fee, feeAuto: feeAuto, deliveryAuto: deliveryAuto,
      total: total, pack: pack, customerPrice: customerPrice, priceIsOverride: priceOverride >= 0,
      deliveryCost: deliveryCost, ourCost: ourCost, margin: margin, marginPct: marginPct,
      corridorPrice: corridorPrice, floorPct: floorPct, belowFloor: belowFloor,
      referral: referral, warrantyReserve: warrantyReserve, taxAside: taxAside, trueNet: trueNet,
      generation: generation, offsetKwh: offsetKwh, savedPerMonth: savedPerMonth,
      paybackYears: paybackYears, unquoted: unquoted
    };
  }

  /* ------------------------------------------------------------------ rendering */

  function renderReadout(m) {
    // Green means "clears the founders' floor", not merely "positive" — a margin that
    // is positive but under the floor renders neutral so it reads as a decision to make.
    var marginTone = m.margin <= 0 ? "bad" : (m.belowFloor ? "" : "good");
    el("qb-readout").innerHTML =
      '<div><span>System size</span><strong>' + m.kwp.toFixed(2) + ' kWp</strong></div>' +
      '<div><span>Target / rounding</span><strong>' + m.targetKwp.toFixed(2) + ' kWp · ' +
        (m.overshootPct >= 0 ? "+" : "") + m.overshootPct.toFixed(0) + '%</strong></div>' +
      '<div><span>Panels</span><strong>' + m.panels + ' × ' + m.panel.watts + 'W</strong></div>' +
      '<div><span>Est. consumption</span><strong>' + Math.round(m.monthlyKwh) + ' kWh/mo</strong></div>' +
      '<div><span>Est. offset</span><strong>' + Math.round(m.offsetKwh) + ' kWh/mo</strong></div>' +
      '<div><span>Est. saving</span><strong>' + peso(m.savedPerMonth) + '/mo</strong></div>' +
      '<div><span>Simple payback</span><strong>' + m.paybackYears.toFixed(1) + ' yrs</strong></div>' +
      '<div><span>Price tier</span><strong>' + m.pack.tier + '</strong></div>' +
      '<div><span>Quote total</span><strong>' + peso(m.total) + '</strong></div>' +
      '<div><span>Customer price</span><strong>' + peso(m.customerPrice) + '</strong></div>' +
      '<div><span>Our cost</span><strong>' + peso(m.ourCost) + '</strong></div>' +
      '<div class="' + marginTone + '"><span>Profit · minimum ' + m.floorPct.toFixed(0) + '%</span><strong>' + peso(m.margin) + ' · ' + m.marginPct.toFixed(0) + '%</strong></div>' +
      '<div class="' + (m.trueNet <= 0 ? "bad" : "") + '"><span>Take-home · after referral &amp; funds</span><strong>' + peso(m.trueNet) + '</strong></div>';
  }

  /** The advisory rail. Each flag names the rule it enforces so nobody has to guess. */
  function renderFlags(m) {
    var out = [];

    if (m.unquoted > 0) {
      out.push('<div class="qb-flag stop"><strong>' + m.unquoted + ' line item' + (m.unquoted === 1 ? "" : "s") +
        ' not supplier-confirmed.</strong>The sheet prints stamped <b>INDICATIVE</b> until every price is a real quote. ' +
        'Work the call list in <span class="mono">docs/inverter-battery-brand-research.md §9</span> before this goes to a customer.</div>');
    }

    if (m.pack.tier === "CUSTOM") {
      if (!m.priceIsOverride) {
        out.push('<div class="qb-flag stop"><strong>No selling price set — the sheet is showing our own cost total (§3).</strong>' +
          'For a system this size the price comes from the market, not from our costs. The helper in Money suggests <b>' + peso(m.corridorPrice) +
          '</b> from the competitor price and our discount — click “Use as contract price”, or type a price you can defend from what this customer already pays.</div>');
      }
      out.push('<div class="qb-flag"><strong>Bigger than our fixed packages (§3).</strong>' + esc(m.pack.note) +
        ' Then check the profit here — never work backwards from this sheet plus a markup.</div>');
    } else {
      out.push('<div class="qb-flag ok"><strong>' + m.pack.tier + ' — ' + peso(m.pack.price) + '.</strong>' + esc(m.pack.note) + '</div>');
    }

    if (m.priceIsOverride && m.pack.price != null && m.customerPrice < m.pack.price) {
      out.push('<div class="qb-flag stop"><strong>Front-end discount (§3).</strong>You are quoting below the ladder price. ' +
        'That needs an EVIDENCED back-end path in <span class="mono">ops/canvas.md</span> and a pre-registered experiment — ' +
        'or hold the price. Repeated stalls at the list price trigger a positioning review, not a discount.</div>');
    }

    // Rounding to whole panels can push a genuinely flagship-sized job into PLUS. Worth
    // saying out loud, because a smaller panel usually pulls it straight back.
    if (m.pack.tier !== "FLAGSHIP" && m.targetKwp <= 2.4 && m.batteryKwh <= 3 && m.overshootPct > 5) {
      out.push('<div class="qb-flag"><strong>Rounding pushed this out of the flagship.</strong>Target is ' +
        m.targetKwp.toFixed(2) + ' kWp but ' + m.panels + ' × ' + m.panel.watts + 'W lands at ' + m.kwp.toFixed(2) +
        ' kWp (+' + m.overshootPct.toFixed(0) + '%). A smaller panel would likely hold the ₱99,500 price.</div>');
    }

    if (m.margin <= 0) {
      out.push('<div class="qb-flag stop"><strong>This quote loses money.</strong>Cost ' + peso(m.ourCost) +
        ' against a price of ' + peso(m.customerPrice) + '. Re-spec before sending — the battery is almost always what broke it.</div>');
    } else if (m.belowFloor) {
      out.push('<div class="qb-flag"><strong>Profit ' + m.marginPct.toFixed(1) + '% is under our ' + m.floorPct.toFixed(0) + '% minimum.</strong>' +
        'Raise the price (stay below the competitor), trim cost, or accept it knowingly. The minimum is a placeholder until the founders agree a house number in <span class="mono">ops/status.md</span>.</div>');
    } else if (m.batteryKwh > 3 && m.pack.tier === "FLAGSHIP") {
      out.push('<div class="qb-flag"><strong>Battery above the flagship limit.</strong>SC-06 holds the base package at 2.5–3 kWh. ' +
        'A bigger battery is an upsell line, not a flagship inclusion.</div>');
    }

    if (m.spec.battery && m.batteryKwh === 0) {
      out.push('<div class="qb-flag stop"><strong>' + m.spec.label + ' with no battery.</strong>' +
        'This package is sold on backup, and with no storage it provides none. Either add a battery or quote LIWANAG ' +
        'and describe it honestly as bill reduction only (§1.6).</div>');
    }

    if (m.spec.gridTied && m.batteryKwh === 0) {
      out.push('<div class="qb-flag stop"><strong>Grid-tied, no storage: brownout truth is mandatory (§1.6).</strong>' +
        'This system shuts down in an outage — anti-islanding. The printed quote carries that statement and it cannot be removed. ' +
        'If the customer wants brownout cover, quote SANDIGAN with a battery.</div>');
    }

    out.push('<div class="qb-flag"><strong>Permit / electrician / net-metering checklist (§7).</strong>' +
      'Printed on every quote. A deposit cannot be accepted until all three are signed off.</div>');

    // Blanked and switched off amount to the same thing on paper, so they are
    // reported together and named by what the line IS, not by whatever heading
    // the founder left in the field.
    var hidden = clientScope(m).filter(function (s) { return !s.on || !(s.label || s.detail); });
    if (hidden.length) {
      out.push('<div class="qb-flag"><strong>' + hidden.length + ' line' + (hidden.length === 1 ? "" : "s") +
        ' will not appear on the customer copy.</strong>Left off: ' +
        esc(hidden.map(function (s) { return s.autoLabel; }).join(", ")) +
        '. The customer sees a fixed price for a scope that does not mention ' +
        (hidden.length === 1 ? "it" : "them") + ' — fine when it genuinely is not in the job, a dispute waiting to happen when it is.</div>');
    }

    el("qb-flags").innerHTML = out.join("");
  }

  /**
   * The customer-copy editor: one row per scope line — a switch, an editable
   * heading, editable detail, and a revert.
   *
   * Rows are rebuilt only when the SET of lines changes (a BOM group appearing or
   * disappearing). Every other refresh touches placeholders alone: rewriting an
   * input's value while a founder is typing in it would throw their caret to the
   * end of the field on every keystroke.
   *
   * The placeholder says what will happen if the field is left as it is — the
   * automatic text while the field is untouched, and an explicit "nothing prints"
   * once it has been edited and cleared. That is the whole difference between
   * "I haven't filled this in" and "I want this blank".
   */
  function renderScopeEditor(m) {
    var box = el("qb-scope");
    if (!box) return;
    var scope = clientScope(m);
    var sig = scope.map(function (s) { return s.id; }).join("|");

    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = scope.map(function (s) {
        var pref = SCOPE_PREFS[s.id] || {};
        return '<div class="qb-scope-row" data-scope="' + esc(s.id) + '">' +
          '<input type="checkbox" class="scope-on"' + (pref.off ? "" : " checked") +
            ' aria-label="Show ' + esc(s.autoLabel) + ' on the customer copy">' +
          '<input type="text" class="scope-label" maxlength="60" value="' + esc(pref.label || "") + '"' +
            (pref.labelSet ? ' data-set="1"' : "") + ' aria-label="Heading for ' + esc(s.autoLabel) + '">' +
          '<button type="button" class="scope-revert" title="Back to the automatic text"' +
            ' aria-label="Reset ' + esc(s.autoLabel) + ' to the automatic text">↺</button>' +
          '<input type="text" class="scope-detail" maxlength="180" value="' + esc(pref.detail || "") + '"' +
            (pref.detailSet ? ' data-set="1"' : "") + ' aria-label="Detail for ' + esc(s.autoLabel) + '">' +
        '</div>';
      }).join("");
    }

    scope.forEach(function (s) {
      var row = box.querySelector('[data-scope="' + s.id + '"]');
      if (!row) return;
      var labelField = row.querySelector(".scope-label");
      var detailField = row.querySelector(".scope-detail");
      row.classList.toggle("is-off", !s.on);
      row.classList.toggle("is-custom", s.custom);
      labelField.placeholder = labelField.dataset.set ? "(no heading)" : s.autoLabel;
      detailField.placeholder = detailField.dataset.set
        ? "(no detail — the heading fills the row)"
        : s.autoDetail;
      row.querySelector(".scope-revert").disabled = !s.custom;
    });
  }

  /** The editor inputs are the source of truth; this copies them into SCOPE_PREFS. */
  function readScopeEditor() {
    var box = el("qb-scope");
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll("[data-scope]"), function (row) {
      var labelField = row.querySelector(".scope-label");
      var detailField = row.querySelector(".scope-detail");
      SCOPE_PREFS[row.getAttribute("data-scope")] = {
        off: !row.querySelector(".scope-on").checked,
        label: labelField.value.trim(),
        detail: detailField.value.trim(),
        labelSet: !!labelField.dataset.set,
        detailSet: !!detailField.dataset.set
      };
    });
  }

  /** Hand one line back to the model — both fields, and their "edited" flags. */
  function revertScopeRow(row) {
    ["scope-label", "scope-detail"].forEach(function (cls) {
      var field = row.querySelector("." + cls);
      field.value = "";
      delete field.dataset.set;
    });
    readScopeEditor();
    saveScopePrefs();
    refresh();
  }

  function bomRowsHtml(m) {
    var html = "";
    m.groups.forEach(function (g) {
      if (g.name) {
        html += '<tr class="qs-group"><td>' + esc(g.name) + '</td><td></td><td></td><td class="num">-</td></tr>';
      }
      g.items.forEach(function (it) {
        html += '<tr>' +
          '<td' + (g.name ? ' class="qs-indent"' : '') + '>' + esc(it.label) +
          (it.quoted ? "" : ' <span class="qb-unquoted">· indicative</span>') + '</td>' +
          '<td class="qty">' + it.qty + '</td>' +
          '<td class="num">' + money(it.price) + '</td>' +
          '<td class="num">' + money(it.total) + '</td>' +
          '</tr>';
      });
    });
    return html;
  }

  /**
   * The customer copy's scope table. Switched-off lines never reach the paper, and
   * a line with only one half filled in spans the whole row rather than printing an
   * empty cell beside itself — "SUPPLY AND INSTALLATION OF A 6 KW SOLAR SETUP" is a
   * perfectly good scope line with nothing to add underneath it.
   */
  function scopeRowsHtml(m) {
    return scopePrinted(m)
      .map(function (s) {
        if (!s.detail) return '<tr><td class="qs-scope-k" colspan="2">' + esc(s.label) + '</td></tr>';
        if (!s.label) return '<tr><td colspan="2">' + esc(s.detail) + '</td></tr>';
        return '<tr><td class="qs-scope-k">' + esc(s.label) + '</td><td>' + esc(s.detail) + '</td></tr>';
      })
      .join("");
  }

  /**
   * The one-line reason the price is what it is (§3: every quote carries its
   * "reason why"). With the itemised build-up gone from the customer copy, this
   * sentence is the only explanation they get for a number below what established
   * installers charge — so it is required copy, not decoration. It claims nothing
   * about a competitor's price: we cannot hold theirs to §1.6.
   */
  function priceNote(m) {
    return "Fixed all-in price" + (m.vatOn ? ", VAT included" : "") + ". Everything listed above is part of the " +
      "package — no staged extras and no add-on charges on the day. We can hold this price because the package is " +
      "standardised, the parts list is fixed, and we carry no showroom.";
  }

  /**
   * Two documents, one model.
   *
   * Both are rendered on every refresh and both stay in the DOM — the inactive one
   * is hidden, not discarded. That is what lets the payload builder keep reading the
   * Founder-OS sentences off the customer copy (below) no matter which view the
   * founder happens to be looking at, and lets print output follow the view.
   */
  function renderSheet(m) {
    renderScopeEditor(m);
    el("qs-client").innerHTML = clientSheetHtml(m);
    el("qs-internal").innerHTML = internalSheetHtml(m);
  }

  /** What the homeowner receives: scope, one price, and every honesty block. */
  function clientSheetHtml(m) {
    var customer = val("qb-customer") || "—";
    var address = val("qb-address") || "—";
    var phone = val("qb-phone") || "";
    var prepared = val("qb-prepared") || "—";
    var quoteNo = val("qb-quote-no") || "—";
    var date = val("qb-date") || todayISO();
    var validity = parseInt(val("qb-validity"), 10) || 14;

    // Turns on the actual absence of storage, never on the package name: a SANDIGAN
    // quoted with no battery backs up nothing, and the customer must read that here.
    var brownout = m.spec.gridTied && m.batteryKwh === 0
      ? '<div class="qs-brownout"><strong>What happens during a brownout</strong>' +
        'This is a grid-tied system with no battery. Philippine safety rules require it to switch off automatically when ' +
        'BILECO power goes out (anti-islanding), so it does <b>not</b> provide backup power during a brownout. It lowers ' +
        'your monthly bill; it does not keep your lights on in an outage. If backup is what you need, ask us for a ' +
        'SANDIGAN hybrid quote with battery storage.</div>'
      : "";

    // Worded for a sheet with no price column: the per-line INDICATIVE badges live
    // on the internal copy, so this callout is the customer's ONLY warning that a
    // price is not yet firm (§7). It never disappears while `unquoted` is non-zero.
    var indicative = m.unquoted > 0
      ? '<div class="qs-brownout"><strong>Indicative quotation</strong>' + m.unquoted + ' item' + (m.unquoted === 1 ? " in this quotation is" : "s in this quotation are") +
        ' priced on current market estimates and not yet confirmed supplier quotations. ' +
        'Final pricing will be confirmed in writing before any deposit is accepted.</div>'
      : "";

    var batteryLine = m.batteryKwh > 0
      ? '<div><span>Battery storage</span><strong>' + m.batteryKwh.toFixed(1) + ' kWh</strong><small>' + esc(m.battery.label) + '</small></div>'
      : '<div><span>Battery storage</span><strong>None</strong><small>Daytime self-consumption</small></div>';

    return '' +
      '<div class="qs-head">' +
        // Logo plus the legal name as real text: the name must survive the image
        // failing to load, and a quotation should stay selectable and searchable.
        '<div class="qs-brand">' +
          '<img class="qs-logo" src="/assets/img/macc-logo.png" alt="MACC Systems &amp; Engineering Inc.">' +
          'MACC Systems &amp; Engineering Inc.' +
          '<small>Talustusan, Naval, Biliran, Philippines<br>0955 723 5093 · official@macc-inc.com<br>Solar supply, fabrication and installation</small>' +
        '</div>' +
        '<div class="qs-meta">' +
          '<b>QUOTATION</b><br>No. ' + esc(quoteNo) + '<br>Date: ' + esc(date) + '<br>Valid until: ' + esc(addDays(date, validity)) +
        '</div>' +
      '</div>' +

      '<div class="qs-title">SOLAR POWER SYSTEM — QUOTATION</div>' +

      '<div class="qs-party">' +
        '<div><span>Prepared for</span><p><b>' + esc(customer) + '</b><br>' + esc(address) + (phone ? '<br>' + esc(phone) : '') + '</p></div>' +
        '<div><span>Prepared by</span><p><b>' + esc(prepared) + '</b><br>MACC Systems &amp; Engineering Inc.<br>' + esc(SYSTEM_TYPES[m.type].label) + ' package</p></div>' +
      '</div>' +

      // Price and the outcome it buys, together. Never one without the other (§3).
      '<div class="qs-headline">' +
        '<div class="lead"><span>Total investment</span><strong>' + peso(m.customerPrice) + '</strong><small>All-in, installed</small></div>' +
        '<div><span>Est. monthly savings</span><strong>' + peso(m.savedPerMonth) + '</strong><small>≈ ' + Math.round(m.offsetKwh) + ' kWh/mo at ₱' + m.tariff.toFixed(2) + '/kWh</small></div>' +
        '<div><span>System size</span><strong>' + m.kwp.toFixed(2) + ' kWp</strong><small>' + m.panels + ' × ' + m.panel.watts + 'W panels</small></div>' +
        batteryLine +
      '</div>' +

      // Scope, not a shopping list. The customer reads what lands on their roof and
      // one price; the unit prices behind it are on the internal sheet.
      '<div class="qs-sectionhead">What&rsquo;s included in this price</div>' +
      '<table class="qs-scope"><tbody>' +
        scopeRowsHtml(m) +
        '<tr class="qs-total"><td>Contract price</td><td class="num">' + money(m.customerPrice) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="qs-why">' + esc(priceNote(m)) + '</p>' +

      brownout + indicative +

      // §7 hard gate — this block is why a quote is allowed to exist at all.
      '<div class="qs-gate">' +
        '<h3>Compliance checklist — completed before any deposit is accepted</h3>' +
        '<ul>' +
          '<li>LGU electrical permit filed, with plans signed by a licensed electrical practitioner (PEE / REE).</li>' +
          '<li>Licensed electrical practitioner sign-off on the final as-built installation.</li>' +
          (m.spec.gridTied
            ? '<li>BILECO net-metering application prepared, filed and tracked by us — not by the homeowner.</li>'
            : '<li>Off-grid commissioning, owner training and handover pack (no net-metering application required).</li>') +
          '<li>Philippine Electrical Code compliance throughout; typhoon-rated mounting; anti-islanding verified at commissioning.</li>' +
        '</ul>' +
      '</div>' +

      // The customer's own next action, and the milestones after it. Onboarding
      // "bumpers" (§6): the homeowner should never have to chase us to find out
      // what happens next.
      '<div class="qs-steps">' +
        '<h3>What happens next</h3>' +
        '<ol>' +
          '<li><b>You confirm the site survey date.</b> This is the only thing we need from you right now.</li>' +
          '<li><b>Free site survey.</b> We check the roof, orientation and your main panel, and confirm this design.</li>' +
          '<li><b>Final quotation and contract.</b> Fixed price, signed before any work or payment.</li>' +
          (m.spec.gridTied
            ? '<li><b>Permit and BILECO net-metering filed by us.</b> You do not queue for anything.</li>'
            : '<li><b>Permit filed by us,</b> with plans signed by a licensed electrical practitioner.</li>') +
          '<li><b>Installation.</b> Typically one to two days on site.</li>' +
          '<li><b>Testing, energising and walkthrough.</b> We show you the monitoring app and what to do on a fault.</li>' +
          '<li><b>Your first lower bill.</b> We check in to confirm the savings are real.</li>' +
        '</ol>' +
      '</div>' +

      '<div class="qs-legal">' +
        '<h3>Terms and conditions</h3>' +
        '<ul>' +
          '<li>This quotation is valid for ' + validity + ' days from the date above. Prices may change after that without prior notice.</li>' +
          '<li>Mode of payment: cash or bank transfer only. Payment schedule agreed in writing before works commence.</li>' +
          '<li>A site survey confirms roof condition, orientation and structural suitability. Findings may change the final specification.</li>' +
          '<li>Price covers supply, fabrication, delivery, installation, testing and the permit / net-metering paperwork described above.</li>' +
          '<li>Not included: roof repairs, structural reinforcement, electrical service upgrades, or works arising from pre-existing defects.</li>' +
        '</ul>' +

        '<h3>Warranties</h3>' +
        '<ul>' +
          '<li>Solar panels — manufacturer product warranty, plus performance warranty per the manufacturer\'s published terms.</li>' +
          '<li>Inverter — manufacturer warranty, serviced through the brand\'s Philippine service channel.</li>' +
          (m.batteryKwh > 0 ? '<li>Battery — manufacturer warranty per the published terms for the supplied model.</li>' : "") +
          '<li>Workmanship and our fabricated racking, harnesses and enclosures — warranted by MACC Systems &amp; Engineering Inc.</li>' +
          '<li>Exact warranty periods for the equipment supplied are stated on the signed contract, and are the manufacturer\'s own terms. ' +
            'We do not extend or restate them here.</li>' +
        '</ul>' +

        '<h3>Basis of the savings estimate</h3>' +
        '<p>Sized from a stated monthly bill of ' + peso(m.bill) + ' (' + esc(m.bandLabel) + ') at an assumed BILECO rate of ' +
        '₱' + m.tariff.toFixed(4) + '/kWh and ' + m.yieldPerKwp.toFixed(1) + ' kWh per kWp per day of sunlight. ' +
        'Savings shown are an <b>estimate</b>, not a guarantee: actual output varies with weather, shading, roof orientation, ' +
        'household usage and BILECO rate changes. Simple payback at these assumptions: about ' +
        m.paybackYears.toFixed(1) + ' years.</p>' +
      '</div>' +

      '<div class="qs-sign">' +
        '<div>Conforme — Customer signature over printed name / Date</div>' +
        '<div>For MACC Systems &amp; Engineering Inc. — ' + esc(prepared) + ' / Date</div>' +
      '</div>' +

      '<div class="qs-foot">This quotation is confidential and prepared solely for the named customer. Where this ' +
        'quotation is marked indicative, equipment prices are market estimates pending supplier confirmation.</div>';
  }

  /**
   * What we keep: the itemised build, the pick list, and the margin arithmetic.
   *
   * Everything the customer copy deliberately leaves out lives here — unit prices,
   * the VAT and fee build-up, our own delivery cost, profit against the floor, and
   * take-home after the referral fee and the two reserves. It is the crew's pick
   * list and the bookkeeping record in one, and it is never emailed: the send path
   * attaches the customer copy only.
   */
  function internalSheetHtml(m) {
    var quoteNo = val("qb-quote-no") || "—";
    var date = val("qb-date") || todayISO();
    var prepared = val("qb-prepared") || "—";
    var customer = val("qb-customer") || "—";
    var marginTone = m.margin <= 0 ? " class=\"qs-bad\"" : (m.belowFloor ? "" : " class=\"qs-ok\"");

    return '' +
      '<div class="qs-stripe">INTERNAL COST SHEET · NOT FOR CUSTOMER RELEASE</div>' +

      '<div class="qs-head">' +
        '<div class="qs-brand">MACC Systems &amp; Engineering Inc.' +
          '<small>Job cost sheet for quotation ' + esc(quoteNo) + '<br>Prepared by ' + esc(prepared) + '</small>' +
        '</div>' +
        '<div class="qs-meta">' +
          '<b>INTERNAL</b><br>No. ' + esc(quoteNo) + '<br>Date: ' + esc(date) + '<br>Customer: ' + esc(customer) +
        '</div>' +
      '</div>' +

      '<div class="qs-title">BILL OF MATERIALS &amp; COST SHEET</div>' +

      '<div class="qs-headline">' +
        '<div class="lead"><span>Contract price</span><strong>' + peso(m.customerPrice) + '</strong><small>' +
          esc(m.pack.tier) + (m.priceIsOverride ? " · set by hand" : " · from the ladder") + '</small></div>' +
        '<div><span>Our cost</span><strong>' + peso(m.ourCost) + '</strong><small>Materials + VAT + delivery</small></div>' +
        '<div><span>Profit · min ' + m.floorPct.toFixed(0) + '%</span><strong>' + peso(m.margin) + '</strong><small>' +
          m.marginPct.toFixed(1) + '% of the contract price</small></div>' +
        '<div><span>Take-home</span><strong>' + peso(m.trueNet) + '</strong><small>After referral &amp; reserves</small></div>' +
      '</div>' +

      '<table><thead><tr>' +
        '<th style="width:52%">Item</th><th style="width:10%">Qty</th><th class="num" style="width:19%">Price/Unit</th><th class="num" style="width:19%">Total Price</th>' +
      '</tr></thead><tbody>' +
        bomRowsHtml(m) +
        '<tr class="qs-sub"><td colspan="3">MATERIALS SUBTOTAL</td><td class="num">' + money(m.materials) + '</td></tr>' +
        (m.vatOn ? '<tr class="qs-group"><td>TAX</td><td></td><td></td><td class="num">-</td></tr>' +
          '<tr><td class="qs-indent">VAT ' + (m.vatRate * 100).toFixed(m.vatRate * 100 % 1 ? 1 : 0) + '%</td><td class="qty">1</td><td class="num">' + money(m.vat) + '</td><td class="num">' + money(m.vat) + '</td></tr>' : "") +
        '<tr class="qs-group"><td>OTHER COSTS</td><td></td><td></td><td class="num">-</td></tr>' +
        '<tr><td class="qs-indent">Fabrication, Delivery and Installation Fee</td><td class="qty">1</td><td class="num">' + money(m.fee) + '</td><td class="num">' + money(m.fee) + '</td></tr>' +
        '<tr class="qs-total"><td colspan="3">BUILT-UP TOTAL</td><td class="num">' + money(m.total) + '</td></tr>' +
        '<tr class="qs-total"><td colspan="3">CONTRACT PRICE (what the customer is quoted)</td><td class="num">' + money(m.customerPrice) + '</td></tr>' +
      '</tbody></table>' +

      // The build-up above is not the margin. Materials pass through at supplier
      // cost and our profit sits in the fee, so what we actually keep is only
      // visible once our own delivery cost replaces the fee line.
      '<div class="qs-sectionhead">Where the money actually goes</div>' +
      '<table class="qs-cost"><tbody>' +
        '<tr><td>Materials + VAT</td><td class="num">' + money(m.materials + m.vat) + '</td></tr>' +
        '<tr><td>Our delivery cost — crew, transport, permits, fabrication</td><td class="num">' + money(m.deliveryCost) + '</td></tr>' +
        '<tr class="qs-sub"><td>OUR COST</td><td class="num">' + money(m.ourCost) + '</td></tr>' +
        '<tr><td>Contract price</td><td class="num">' + money(m.customerPrice) + '</td></tr>' +
        '<tr' + marginTone + '><td>Profit · minimum ' + m.floorPct.toFixed(0) + '%</td><td class="num">' +
          money(m.margin) + '  ·  ' + m.marginPct.toFixed(1) + '%</td></tr>' +
        '<tr><td>Less referral fee (₱' + Math.round(m.referral / (m.kwp || 1)).toLocaleString("en-PH") + '/kW × ' +
          m.kwp.toFixed(2) + ' kWp)</td><td class="num">' + money(m.referral) + '</td></tr>' +
        '<tr><td>Less warranty fund</td><td class="num">' + money(m.warrantyReserve) + '</td></tr>' +
        '<tr><td>Less tax set-aside</td><td class="num">' + money(m.taxAside) + '</td></tr>' +
        '<tr class="qs-total"><td>TAKE-HOME</td><td class="num">' + money(m.trueNet) + '</td></tr>' +
      '</tbody></table>' +

      '<div class="qs-sectionhead">Checks before this goes out</div>' +
      '<table class="qs-cost"><tbody>' +
        '<tr><td>Market price helper — competitor rate × size, less our discount</td><td class="num">' + peso(m.corridorPrice) + '</td></tr>' +
        '<tr><td>Prices not yet supplier-confirmed</td><td class="num">' +
          (m.unquoted > 0 ? m.unquoted + " — quote prints INDICATIVE" : "none") + '</td></tr>' +
        '<tr><td>Array geometry for the crew</td><td class="num">' + m.panels + ' panels · ' + m.rows +
          ' row' + (m.rows === 1 ? "" : "s") + ' · ' + m.strings + ' string' + (m.strings === 1 ? "" : "s") + '</td></tr>' +
        '<tr><td>Scope lines left off the customer copy</td><td class="num">' +
          (function () {
            var off = clientScope(m).filter(function (s) { return !s.on || !(s.label || s.detail); });
            return off.length ? esc(off.map(function (s) { return s.autoLabel; }).join(", ")) : "none";
          })() + '</td></tr>' +
      '</tbody></table>' +

      '<div class="qs-foot">Internal document. Not to be sent to a customer, printed for a customer, or left on a ' +
        'site. The customer copy carries scope and one fixed price; this carries what it cost us and what we keep.</div>';
  }

  /*
   * The one next action for this quote.
   *
   * Ordered by what actually blocks the sale, hardest blocker first, so the founder
   * never has to read the whole flag rail to work out what to do. Every quote resolves
   * to exactly one action — "several things to consider" is how a lead goes cold (§2).
   */
  function nextAction(m) {
    if (!val("qb-customer").trim()) {
      return {
        state: "blocked",
        action: "Name the customer before anything else.",
        why: "An unnamed quote can't be sent, tracked, or followed up. Fill in the customer block."
      };
    }
    if (m.margin <= 0) {
      return {
        state: "blocked",
        action: "Re-spec this system — it loses " + peso(Math.abs(m.margin)) + ".",
        why: "Cost " + peso(m.ourCost) + " against a price of " + peso(m.customerPrice) +
          ". Drop the battery tier or move up the ladder. Do not send it and hope."
      };
    }
    if (m.pack.tier === "CUSTOM" && !m.priceIsOverride) {
      return {
        state: "blocked",
        action: "Set the selling price from the market — suggested " + peso(m.corridorPrice) + ".",
        why: "This system is bigger than our fixed packages and no price has been set, so the sheet is showing our own " +
          "cost total. Pricing from cost + a markup is banned (§3). Use the market price helper in Money, then check the profit."
      };
    }
    if (m.spec.battery && m.batteryKwh === 0) {
      return {
        state: "blocked",
        action: "Add a battery or switch this to LIWANAG.",
        why: m.spec.label + " is sold on backup and this configuration has no storage. Sending it as-is is the value gap (§1.6)."
      };
    }
    if (m.belowFloor) {
      return {
        state: "caution",
        action: "Profit " + m.marginPct.toFixed(1) + "% is under our " + m.floorPct.toFixed(0) + "% minimum — decide before sending.",
        why: "Raise the price (stay below the competitor), trim cost, or accept it and say why in Friday's T5T. " +
          "Send is not blocked: the minimum is a placeholder until the founders agree a house number."
      };
    }
    if (m.unquoted > 0) {
      return {
        state: "caution",
        action: "Send as an INDICATIVE quote, then get the " + m.unquoted + " open supplier price" +
          (m.unquoted === 1 ? "" : "s") + " confirmed.",
        why: "The sheet is already stamped indicative, so it is honest to send today — but no deposit is accepted " +
          "until the numbers are firm. Call list: docs/inverter-battery-brand-research.md §9."
      };
    }
    return {
      state: "go",
      action: "Send it, then book the site survey on a named date.",
      why: "This is a sales-mode interaction, so it ends with a commitment ask (§2): \"Can I come Saturday 9am " +
        "or is Sunday better?\" A quote that ends in \"I'll message you\" is a zombie lead."
    };
  }

  function renderNextAction(m) {
    var na = nextAction(m);
    var tone = na.state === "blocked" ? "stop" : (na.state === "go" ? "ok" : "");
    el("qb-next").innerHTML =
      '<div class="qb-next-head">Next action</div>' +
      '<div class="qb-flag ' + tone + '"><strong>' + esc(na.action) + '</strong>' + esc(na.why) + '</div>';
    return na;
  }

  /** Plain-text summary — the founder's Messenger follow-up, one click away. */
  function summaryText(m) {
    var lines = [
      "MACC Systems & Engineering Inc. — " + SYSTEM_TYPES[m.type].label,
      "Quote " + (val("qb-quote-no") || "—") + " · " + (val("qb-date") || todayISO()),
      "For: " + (val("qb-customer") || "—"),
      "",
      "System: " + m.kwp.toFixed(2) + " kWp (" + m.panels + " x " + m.panel.watts + "W) + " + m.inverter.label,
      m.batteryKwh > 0 ? "Battery: " + m.batteryKwh.toFixed(1) + " kWh (" + m.battery.label + ")" : "Battery: none (daytime self-consumption)",
      "",
      "Total investment: " + peso(m.customerPrice) + " all-in, installed",
      "Estimated savings: " + peso(m.savedPerMonth) + "/month (~" + Math.round(m.offsetKwh) + " kWh)",
      "Simple payback: about " + m.paybackYears.toFixed(1) + " years (estimate)",
      "",
      "Includes: supply, fabrication, delivery, installation, testing, LGU electrical permit with licensed-practitioner sign-off" +
        (m.spec.gridTied ? ", and the BILECO net-metering application handled by us." : ", plus commissioning and owner training."),
      "",
      "Next step: a free site survey so we can confirm the roof and lock the design. Which day works — Saturday or Sunday?"
    ];
    if (m.spec.gridTied && !m.spec.battery) {
      lines.push("", "Important: this is a grid-tied system. It switches off during a brownout (safety rule) — it lowers your bill, it is not backup power.");
    }
    if (m.unquoted > 0) {
      lines.push("", "Note: indicative pricing — final supplier quotations to be confirmed in writing before any deposit.");
    }
    return lines.join("\n");
  }

  /* ------------------------------------------------------------------- wiring */

  var current = null;

  function refresh() {
    // Keep the inverter list relevant to the chosen system type before computing.
    syncInverterOptions();
    syncBatteryVisibility();
    current = compute();
    renderReadout(current);
    renderNextAction(current);
    renderFlags(current);
    renderSheet(current);
    var feeField = el("qb-fee");
    if (feeField && feeField.value === "") feeField.placeholder = String(current.feeAuto);
    var priceField = el("qb-price");
    if (priceField && priceField.value === "") {
      priceField.placeholder = current.pack.price != null ? String(current.pack.price) : String(Math.round(current.total));
    }
    var corridorOut = el("qb-corridor-price");
    if (corridorOut) corridorOut.textContent = peso(current.corridorPrice);
  }

  function syncInverterOptions() {
    var type = val("qb-type") || "liwanag";
    var select = el("qb-inverter");
    if (!select || select.dataset.forType === type) return;
    var keep = select.value;
    var options = INVERTERS.filter(function (i) { return i.types.indexOf(type) !== -1 && !i.hidden; });
    if (!options.length) options = INVERTERS.filter(function (i) { return i.types.indexOf(type) !== -1; });
    select.innerHTML = options.map(function (i) {
      return '<option value="' + i.id + '">' + esc(i.label) + " · " + peso(i.price) + (i.quoted ? "" : " (est)") + "</option>";
    }).join("");
    var stillThere = options.some(function (i) { return i.id === keep; });
    select.value = stillThere ? keep : options[0].id;
    select.dataset.forType = type;
  }

  /** (Re)build the panel and battery pickers, and force the inverter picker to
   *  rebuild on the next refresh — called at start-up and whenever the saved
   *  price list changes, so a brand a founder just added is immediately choosable. */
  function populateEquipmentSelects() {
    function fill(id, list, format) {
      var select = el(id);
      if (!select) return;
      var keep = select.value;
      var options = list.filter(function (it) { return !it.hidden; });
      if (!options.length) options = list;
      select.innerHTML = options.map(format).join("");
      if (options.some(function (it) { return it.id === keep; })) select.value = keep;
    }
    fill("qb-panel", PANELS, function (p) {
      return '<option value="' + p.id + '">' + esc(p.label) + " · " + peso(p.price) + (p.quoted ? "" : " (est)") + "</option>";
    });
    fill("qb-battery", BATTERIES, function (b) {
      return '<option value="' + b.id + '">' + esc(b.label) + (b.price ? " · " + peso(b.price) : "") + (b.quoted ? "" : " (est)") + "</option>";
    });
    var inv = el("qb-inverter");
    if (inv) inv.dataset.forType = "";   // syncInverterOptions rebuilds on next refresh
  }

  /*
   * Fields whose starting value is a config number rather than a fixed one. Seeded
   * at start-up and again when the saved config arrives — but never over a value the
   * founder has typed. A slow fetch that overwrites someone mid-quote is worse than
   * a field that briefly shows the built-in default.
   */
  var CONFIG_SEEDED = [
    ["qb-tariff", "tariff"],
    ["qb-yield", "yieldPerKwp"],
    ["qb-bench", "benchPerKw"],
    ["qb-undercut", "undercutPct"],
    ["qb-floor", "floorPct"],
    ["qb-referral", "referralPerKw"],
    ["qb-warranty", "warrantyPct"],
    ["qb-taxaside", "taxPct"],
  ];

  function seedFieldsFromConfig() {
    CONFIG_SEEDED.forEach(function (pair) {
      var node = el(pair[0]);
      if (!node || node.dataset.touched) return;
      var v = CONFIG[pair[1]];
      node.value = v == null ? "" : v;
    });
    var cov = el("qb-coverage");
    if (cov && !cov.dataset.touched) cov.value = Math.round(coverageFor(val("qb-type") || "liwanag") * 100);
  }

  function syncBatteryVisibility() {
    var type = val("qb-type") || "liwanag";
    var spec = SYSTEM_TYPES[type];
    var wrap = el("qb-battery-wrap");
    var select = el("qb-battery");
    if (wrap) wrap.hidden = !spec.battery;

    // Seed the battery only when the package actually changes — after that the founder's
    // choice stands, including a deliberate "none", which the flag rail then challenges
    // rather than silently undoing.
    if (select && select.dataset.forType !== type) {
      if (!spec.battery) select.value = "none";
      else if (select.value === "none") select.value = "dyness-b4850";
      select.dataset.forType = type;
    }
    var cov = el("qb-coverage");
    // Follow the type's default coverage until the founder touches the field themselves.
    if (cov && !cov.dataset.touched) cov.value = Math.round(coverageFor(type) * 100);
  }

  root.addEventListener("input", function (e) {
    // Anything typed into is the founder's own from then on, so a config re-seed
    // (start-up, or a colleague's ladder edit arriving) leaves it alone.
    if (e.target && e.target.tagName === "INPUT") e.target.dataset.touched = "1";
    refresh();
  });
  root.addEventListener("change", refresh);

  el("qb-print").addEventListener("click", function () { window.print(); });

  /* -------------------------------------------- which document is on screen
   * Both sheets are always rendered; this only decides which one is visible —
   * and because @media print never overrides `hidden`, the visible one is also
   * the one that prints. The customer copy is the default deliberately: the
   * founder should be proof-reading what the customer will actually receive.
   */
  function setSheetView(view) {
    var internal = view === "internal";
    el("qs-client").hidden = internal;
    el("qs-internal").hidden = !internal;
    [["qb-view-client", !internal], ["qb-view-internal", internal]].forEach(function (pair) {
      var b = el(pair[0]);
      if (!b) return;
      b.classList.toggle("is-on", pair[1]);
      b.setAttribute("aria-pressed", pair[1] ? "true" : "false");
    });
  }
  el("qb-view-client").addEventListener("click", function () { setSheetView("client"); });
  el("qb-view-internal").addEventListener("click", function () { setSheetView("internal"); });

  /* ------------------------------------------------- the customer-copy editor
   * These listeners sit on the editor rather than on #qb-root so they run FIRST:
   * events bubble inward-out, so SCOPE_PREFS is up to date by the time the root
   * handler repaints the sheet. Saving happens on `change` (commit) rather than
   * `input` (keystroke) — the sheet follows every keystroke, localStorage does not.
   */
  var scopeBox = el("qb-scope");
  if (scopeBox) {
    // The keystroke that marks a field as the founder's own. It is set here rather
    // than derived from emptiness, because "cleared on purpose" and "never filled
    // in" have to mean different things on the paper.
    scopeBox.addEventListener("input", function (e) {
      var t = e.target;
      if (t && (t.classList.contains("scope-label") || t.classList.contains("scope-detail"))) {
        t.dataset.set = "1";
      }
      readScopeEditor();
    });
    scopeBox.addEventListener("change", function () { readScopeEditor(); saveScopePrefs(); });
    scopeBox.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".scope-revert") : null;
      if (btn) revertScopeRow(btn.closest(".qb-scope-row"));
    });
  }
  el("qb-scope-reset").addEventListener("click", function () {
    SCOPE_PREFS = {};
    saveScopePrefs();
    if (scopeBox) scopeBox.dataset.sig = "";      // force a rebuild: values must clear
    refresh();
  });

  // One click moves the corridor suggestion into the contract-price field. The price
  // stays an editable input after that — the helper suggests, the founder decides.
  el("qb-corridor-use").addEventListener("click", function () {
    var m = current || compute();
    el("qb-price").value = m.corridorPrice;
    refresh();
  });

  el("qb-new-no").addEventListener("click", function () {
    el("qb-quote-no").value = nextQuoteNo();
    refresh();
  });

  el("qb-copy").addEventListener("click", function () {
    var btn = el("qb-copy");
    var text = summaryText(current || compute());
    var done = function () {
      var was = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = was; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copy the summary:", text); });
    } else {
      window.prompt("Copy the summary:", text);
    }
  });

  /* --------------------------------------------------- send to the customer */

  /**
   * Build the payload for /api/quote.
   *
   * The NUMBERS come from the model. The WORDS are read back out of the sheet
   * that is already on screen — the brownout statement, the compliance
   * checklist, the milestones, the warranties and the terms are lifted from the
   * rendered DOM rather than written a second time here. That is deliberate:
   * these are the sentences the Founder OS requires on a quote, and a second
   * copy of them in a payload builder is a copy that will eventually disagree
   * with the one the founder proof-read on screen.
   */
  function quotePayload(m) {
    var sheet = el("qs-client");        // the customer copy — never the internal sheet
    var textOf = function (node) { return node ? node.innerText.replace(/\s+/g, " ").trim() : ""; };
    var listOf = function (sel) {
      return Array.prototype.map.call(sheet.querySelectorAll(sel), textOf).filter(Boolean);
    };
    // Both callouts share the .qs-brownout box style, so they are told apart by
    // their heading rather than by document order.
    var callout = function (heading) {
      var found = "";
      Array.prototype.forEach.call(sheet.querySelectorAll(".qs-brownout"), function (node) {
        var strong = node.querySelector("strong");
        if (!strong || strong.innerText.trim().toLowerCase().indexOf(heading) !== 0) return;
        var copy = node.cloneNode(true);
        var h = copy.querySelector("strong");
        if (h) h.remove();
        found = textOf(copy);
      });
      return found;
    };
    // A section of .qs-legal, located by its heading and read from what follows.
    var legal = function (heading) {
      var out = [];
      Array.prototype.forEach.call(sheet.querySelectorAll(".qs-legal h3"), function (h3) {
        if (h3.innerText.trim().toLowerCase().indexOf(heading) !== 0) return;
        var next = h3.nextElementSibling;
        if (!next) return;
        if (next.tagName === "UL" || next.tagName === "OL") {
          out = Array.prototype.map.call(next.querySelectorAll("li"), textOf);
        } else {
          out = [textOf(next)];
        }
      });
      return out;
    };

    // The scope table exactly as it stands on the customer copy — switched-off
    // lines already removed, founder edits already applied. The itemised bill of
    // materials is deliberately NOT sent: it belongs to the internal sheet, and
    // an endpoint that never receives it cannot accidentally print it.
    var scope = scopePrinted(m).map(function (s) { return { label: s.label, detail: s.detail }; });

    var validity = parseInt(val("qb-validity"), 10) || 14;
    var date = val("qb-date") || todayISO();

    return {
      customer: {
        name: val("qb-customer"),
        email: val("qb-email"),
        phone: val("qb-phone"),
        address: val("qb-address"),
      },
      quote: {
        quoteNo: val("qb-quote-no"),
        date: date,
        validUntil: addDays(date, validity),
        preparedBy: val("qb-prepared"),
        packageLabel: SYSTEM_TYPES[m.type].label,
        kwp: m.kwp,
        panelSummary: m.panels + " x " + m.panel.watts + "W panels",
        customerPrice: m.customerPrice,
        savedPerMonth: m.savedPerMonth,
        // The covering email states the saving as a share of THEIR bill, so it needs
        // the bill itself — a peso figure with nothing to compare it to means little.
        bill: m.bill,
        paybackYears: m.paybackYears,
        savingsBasis: "~" + Math.round(m.offsetKwh) + " kWh/mo at PHP " + m.tariff.toFixed(2) + "/kWh",
        batteryLabel: m.batteryKwh > 0 ? m.batteryKwh.toFixed(1) + " kWh" : "None",
        batteryNote: m.batteryKwh > 0 ? m.battery.label : "Daytime self-consumption",
        hasBattery: m.batteryKwh > 0,
        unquoted: m.unquoted,
        scope: scope,
        priceNote: textOf(sheet.querySelector(".qs-why")),
        brownout: callout("what happens during a brownout"),
        indicative: callout("indicative quotation"),
        checklist: listOf(".qs-gate li"),
        steps: listOf(".qs-steps li"),
        warranties: legal("warranties"),
        basis: (legal("basis of the savings estimate")[0] || ""),
        terms: legal("terms and conditions"),
      },
    };
  }

  /* ---------------------------------------------------------- price list editor */

  var PL_KINDS = [
    { kind: "inverter", title: "Inverters", arr: function () { return INVERTERS; } },
    { kind: "panel", title: "Panels", arr: function () { return PANELS; } },
    { kind: "battery", title: "Batteries", arr: function () { return BATTERIES; } },
  ];

  function plSay(kind, message) {
    var s = el("qb-pl-status");
    s.className = "qb-pl-status " + (kind || "");
    s.textContent = message || "";
  }

  /** Persist one line, then re-apply the overlay and repaint the sheet. */
  function plSave(row) {
    plSay("", "Saving…");
    return fetch("/api/price-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data.ok) {
          plSay("bad", (res.data && res.data.error) || "Could not save.");
          return false;
        }
        CATALOG[res.data.item.item_key] = res.data.item;
        applyCatalog();
        populateEquipmentSelects();
        refresh();
        plSay("good", "Saved.");
        return true;
      })
      .catch(function (err) { plSay("bad", String(err && err.message)); return false; });
  }

  function plRow(item, kind, groupName) {
    var saved = CATALOG[item.key] || null;
    var firm = item.quoted !== false;
    var wrap = document.createElement("div");
    wrap.className = "qb-pl-row" + (item.hidden ? " is-off" : "");

    var name = document.createElement("div");
    name.className = "name";
    var b = document.createElement("b");
    b.textContent = item.label;
    var small = document.createElement("small");
    small.textContent = saved && saved.confirmed === 1 && saved.source_note
      ? saved.source_note
      : (firm ? "Tacloban supplier sheet, 2026-07" : "Estimate — not yet supplier-confirmed");
    name.appendChild(b);
    name.appendChild(small);

    var price = document.createElement("input");
    price.type = "number";
    price.min = "0";
    price.step = "50";
    price.value = item.price;
    price.setAttribute("aria-label", "Unit price for " + item.label);

    var flag = document.createElement("button");
    flag.type = "button";
    flag.className = "qb-pl-flag" + (firm ? " is-firm" : "");
    flag.textContent = firm ? "Firm" : "Est.";
    flag.title = firm ? "Supplier-confirmed. Click to mark it an estimate again."
                      : "Estimate. Click to record a supplier confirmation.";

    var drop = document.createElement("button");
    drop.type = "button";
    drop.className = "drop";
    drop.textContent = item.hidden ? "↺" : "×";
    drop.title = item.hidden ? "Put this line back" : "Drop this line from new quotes";
    drop.setAttribute("aria-label", drop.title);

    var payload = function () {
      return {
        item_key: item.key, kind: kind, label: item.label,
        price: Number(price.value) || 0, group_name: groupName || null,
        custom: saved ? saved.custom : 0,
        qty_fixed: saved ? saved.qty_fixed : null,
        spec: saved ? saved.spec : null,   // keep a custom panel's watts (etc.) through price edits
        confirmed: firm ? 1 : 0,
        source_note: saved ? saved.source_note : "",
        active: item.hidden ? 0 : 1,
      };
    };

    price.addEventListener("change", function () { plSave(payload()); });

    // Everything that needs more input opens INSIDE the row. A native prompt on top
    // of a dialog loses the row you were looking at and cannot show what it is about.
    var inline = document.createElement("div");
    inline.className = "qb-pl-inline";
    inline.hidden = true;

    function closeInline() { inline.hidden = true; inline.innerHTML = ""; }

    flag.addEventListener("click", function () {
      if (firm) {
        // Doubting a number never needs paperwork.
        plSave(Object.assign(payload(), { confirmed: 0, source_note: "" })).then(paint);
        return;
      }
      if (!inline.hidden) { closeInline(); return; }
      // Turning an estimate into a firm price is the one edit here that changes what
      // a customer is told, so it has to name its source (§7).
      inline.hidden = false;
      inline.innerHTML =
        '<label class="qb-pl-inline-label">Who quoted this price, and when?</label>' +
        '<div class="qb-pl-inline-controls">' +
          '<input type="text" maxlength="200" placeholder="Photonergy · Ric Santos · 2026-07-28">' +
          '<button type="button" class="ok">Mark firm</button>' +
          '<button type="button" class="secondary cancel">Cancel</button>' +
        '</div>' +
        '<p class="qb-pl-inline-note">Kept for us, never printed on a customer quote. ' +
        'It is how anyone can tell later whether the number was ever real.</p>';
      var input = inline.querySelector("input");
      input.focus();
      var commit = function () {
        var note = input.value.trim();
        if (!note) { plSay("bad", "A confirmed price needs a source."); input.focus(); return; }
        plSave(Object.assign(payload(), { confirmed: 1, source_note: note })).then(paint);
      };
      inline.querySelector(".ok").addEventListener("click", commit);
      inline.querySelector(".cancel").addEventListener("click", closeInline);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); closeInline(); }
      });
    });

    drop.addEventListener("click", function () {
      plSave(Object.assign(payload(), { active: item.hidden ? 1 : 0 })).then(paint);
    });

    wrap.appendChild(name);
    wrap.appendChild(price);
    wrap.appendChild(flag);
    wrap.appendChild(drop);
    wrap.appendChild(inline);
    return wrap;
  }

  function paint() {
    var body = el("qb-pl-body");
    body.innerHTML = "";
    var estimates = 0;

    PL_KINDS.forEach(function (g) {
      var head = document.createElement("div");
      head.className = "qb-pl-group";
      head.textContent = g.title;
      body.appendChild(head);
      g.arr().forEach(function (it) {
        if (it.id === "none") return;               // "No battery" has no price to edit
        if (it.custom) return;                      // founder-added: rendered below with a real delete
        if (it.quoted === false) estimates++;
        body.appendChild(plRow(it, g.kind, null));
      });
      Object.keys(CATALOG).forEach(function (k) {
        var r = CATALOG[k];
        if (r.custom !== 1 || r.kind !== g.kind) return;
        if (r.confirmed !== 1) estimates++;
        body.appendChild(plCustomRow(r, g.kind));
      });
    });

    BOS_GROUPS.forEach(function (g) {
      var head = document.createElement("div");
      head.className = "qb-pl-group";
      head.textContent = g.name;
      body.appendChild(head);
      g.defs.forEach(function (d) {
        if (d.quoted === false) estimates++;
        body.appendChild(plRow(d, "bos", g.name));
      });
      CUSTOM_LINES.filter(function (r) { return (r.group_name || "") === g.name; })
        .forEach(function (r) { body.appendChild(plCustomRow(r)); });
    });

    var loose = CUSTOM_LINES.filter(function (r) {
      return BOS_GROUPS.map(function (g) { return g.name; }).indexOf(r.group_name || "") === -1;
    });
    if (loose.length) {
      var head = document.createElement("div");
      head.className = "qb-pl-group";
      head.textContent = "Additional items";
      body.appendChild(head);
      loose.forEach(function (r) { body.appendChild(plCustomRow(r)); });
    }

    el("qb-pl-count").textContent = estimates
      ? estimates + " price" + (estimates === 1 ? " is" : "s are") + " still an estimate."
      : "Every price is supplier-confirmed.";
  }

  /** A founder-added line — a BOS extra or another equipment brand. Editable like
   *  any row, and deletable for real (built-ins only deactivate). */
  function plCustomRow(row, kind) {
    kind = kind || "bos";
    var shim = {
      key: row.item_key, label: row.label, price: row.price,
      quoted: row.confirmed === 1, hidden: row.active === 0,
    };
    var node = plRow(shim, kind, row.group_name);
    var drop = node.querySelector(".drop");
    drop.textContent = "×";
    drop.title = "Delete this line";
    var clone = drop.cloneNode(true);          // drop the deactivate handler
    drop.parentNode.replaceChild(clone, drop);
    var inline = node.querySelector(".qb-pl-inline");
    clone.addEventListener("click", function () {
      if (!inline.hidden) { inline.hidden = true; inline.innerHTML = ""; return; }
      inline.hidden = false;
      inline.innerHTML =
        '<div class="qb-pl-inline-controls">' +
          '<span class="qb-pl-inline-label">Delete this line for good?</span>' +
          '<button type="button" class="danger ok">Delete</button>' +
          '<button type="button" class="secondary cancel">Keep it</button>' +
        '</div>';
      inline.querySelector(".cancel").addEventListener("click", function () {
        inline.hidden = true; inline.innerHTML = "";
      });
      inline.querySelector(".ok").addEventListener("click", function () {
        fetch("/api/price-items", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_key: row.item_key }),
        }).then(function () {
          delete CATALOG[row.item_key];
          applyCatalog();
          populateEquipmentSelects();
          refresh();
          paint();
          plSay("good", "Deleted.");
        });
      });
    });
    var detail = document.createElement("small");
    if (kind !== "bos") {
      var unit = { inverter: " kW", panel: " W", battery: " kWh" }[kind] || "";
      detail.textContent = "Added by a founder" + (row.spec ? " · " + row.spec + unit : "");
    } else {
      detail.textContent = "Custom line · qty " + row.qty_fixed;
    }
    node.querySelector(".name").appendChild(detail);
    return node;
  }

  el("qb-prices").addEventListener("click", function () {
    // Re-read before showing: another founder may have corrected a price since this
    // tab was opened, and the sheet behind the dialog has to agree with the list.
    loadCatalog().then(function () {
      refresh();
      paint();
      plSay("", "");
      el("qb-price-list").showModal();
    });
  });
  el("qb-pl-close").addEventListener("click", function () { el("qb-price-list").close(); });

  // One inline form rather than a chain of four native prompts: a founder adding a
  // line needs to see the label, quantity and price together to know the total is
  // what they meant, and needs to be able to go back a field without starting over.
  el("qb-pl-add").addEventListener("click", function () {
    var form = el("qb-pl-new");
    var open = form.hidden;
    form.hidden = !open;
    el("qb-pl-add").textContent = open ? "Cancel" : "Add a line";
    if (open) el("qb-pl-new-label").focus();
    else plNewReset();
  });

  /** "Section" doubles as the what-is-this picker: a BOS group name, or `kind:x`
   *  when the founder is adding another equipment brand (inverter/panel/battery). */
  function plNewKind() {
    var v = el("qb-pl-new-group").value;
    return v.indexOf("kind:") === 0 ? v.slice(5) : "bos";
  }

  var SPEC_LABELS = {
    inverter: { label: "kW rating", hint: "6" },
    panel: { label: "Watts each", hint: "615" },
    battery: { label: "kWh each", hint: "5.12" },
  };

  function plNewSyncFields() {
    var kind = plNewKind();
    var isEquipment = kind !== "bos";
    el("qb-pl-new-qty-wrap").hidden = isEquipment;
    el("qb-pl-new-spec-wrap").hidden = !isEquipment;
    if (isEquipment) {
      el("qb-pl-new-spec-label").textContent = SPEC_LABELS[kind].label;
      el("qb-pl-new-spec").placeholder = SPEC_LABELS[kind].hint;
    }
  }
  el("qb-pl-new-group").addEventListener("change", plNewSyncFields);

  function plNewReset() {
    el("qb-pl-new-label").value = "";
    el("qb-pl-new-qty").value = "1";
    el("qb-pl-new-spec").value = "";
    el("qb-pl-new-price").value = "";
    el("qb-pl-new-group").selectedIndex = 0;
    plNewSyncFields();
  }

  function plNewSubmit() {
    var label = el("qb-pl-new-label").value.trim();
    var price = Number(el("qb-pl-new-price").value);
    var kind = plNewKind();
    if (!label) { plSay("bad", "Give the line a name."); el("qb-pl-new-label").focus(); return; }
    if (!(price >= 0)) { plSay("bad", "Enter a unit price."); el("qb-pl-new-price").focus(); return; }

    var row = {
      item_key: "custom-" + Date.now().toString(36),
      kind: kind, label: label, price: price,
      qty_fixed: null, group_name: null,
      custom: 1, confirmed: 0, source_note: "", active: 1,
    };

    if (kind === "bos") {
      var qty = Number(el("qb-pl-new-qty").value);
      if (!(qty > 0)) { plSay("bad", "Quantity has to be more than zero."); el("qb-pl-new-qty").focus(); return; }
      row.qty_fixed = qty;
      row.group_name = el("qb-pl-new-group").value || null;
    } else {
      var spec = Number(el("qb-pl-new-spec").value);
      if ((kind === "panel" || kind === "battery") && !(spec > 0)) {
        plSay("bad", kind === "panel"
          ? "Enter the watts per panel (e.g. 615) — the sizing math needs it."
          : "Enter the battery's kWh (e.g. 5.12) — the sizing math needs it.");
        el("qb-pl-new-spec").focus();
        return;
      }
      row.spec = isFinite(spec) && spec > 0 ? spec : null;
    }

    plSave(row).then(function (ok) {
      if (!ok) return;
      plNewReset();
      el("qb-pl-new").hidden = true;
      el("qb-pl-add").textContent = "Add a line";
      paint();
    });
  }

  el("qb-pl-new-save").addEventListener("click", plNewSubmit);
  el("qb-pl-new").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); plNewSubmit(); }
    if (e.key === "Escape") {
      e.preventDefault();
      el("qb-pl-new").hidden = true;
      el("qb-pl-add").textContent = "Add a line";
      plNewReset();
    }
  });

  // A new line's running total, so a wrong quantity is visible before it is saved.
  ["qb-pl-new-qty", "qb-pl-new-price"].forEach(function (id) {
    el(id).addEventListener("input", function () {
      var q = Number(el("qb-pl-new-qty").value) || 0;
      var p = Number(el("qb-pl-new-price").value) || 0;
      el("qb-pl-new-total").textContent = q && p ? "= ₱" + (q * p).toLocaleString("en-PH") : "";
    });
  });

  /* ------------------------------------------------ packages & pricing editor
   * The ladder and the assumptions, as a form. Everything here used to be a
   * JavaScript constant; none of it is settled, so all of it is data now.
   */

  var SETTING_FIELDS = {
    sizing: [
      ["tariff", "BILECO rate (₱/kWh)", "0.0001"],
      ["yieldPerKwp", "Yield (kWh/kWp/day)", "0.1"],
      ["daysPerMonth", "Days per month", "1"],
      ["selfConsumption", "Self-consumption, no battery (%)", "1"],
      ["selfConsumptionBattery", "Self-consumption, with battery (%)", "1"],
      ["coverageLiwanag", "LIWANAG coverage (%)", "5"],
      ["coverageIlaw", "ILAW coverage (%)", "5"],
      ["coverageSandigan", "SANDIGAN coverage (%)", "5"],
      ["panelsPerRow", "Panels per roof row", "1"],
      ["panelsPerString", "Panels per string", "1"],
    ],
    money: [
      ["vatRate", "VAT (%)", "0.5"],
      ["feeBase", "Fee — base (₱)", "500"],
      ["feePerPanel", "Fee — per panel (₱)", "500"],
      ["deliveryBase", "Our delivery cost — base (₱)", "500"],
      ["deliveryPerPanel", "Our delivery cost — per panel (₱)", "500"],
      ["benchPerKw", "Competitor price (₱ per kW)", "500"],
      ["undercutPct", "Our discount vs them (%)", "0.5"],
      ["floorPct", "Minimum profit (%)", "1"],
      ["referralPerKw", "Referral fee (₱ per kW)", "100"],
      ["warrantyPct", "Warranty fund (%)", "0.5"],
      ["taxPct", "Tax set-aside (%)", "0.5"],
    ],
  };

  var settingTiers = [];        // working copy — the dialog edits this, not CONFIG

  function setSay(kind, message) {
    var s = el("qb-set-status");
    if (!s) return;
    s.className = "qb-pl-status " + (kind || "");
    s.textContent = message || "";
  }

  function settingsNumberHtml(field) {
    return '<label>' + esc(field[1]) +
      '<input type="number" step="' + field[2] + '" data-cfg="' + field[0] + '"></label>';
  }

  /** One ladder tier. The note is the sentence the flag rail shows for this tier. */
  function settingsTierHtml(tier, i) {
    return '<div class="qb-set-tier" data-tier="' + i + '">' +
      '<label>Name<input type="text" maxlength="40" class="t-name" value="' + esc(tier.name || "") + '"></label>' +
      '<label>Max kWp<input type="number" step="0.1" min="0" class="t-kwp" value="' + esc(tier.maxKwp) + '"></label>' +
      '<label>Max kWh<input type="number" step="0.1" min="0" class="t-kwh" value="' + esc(tier.maxKwh) + '"></label>' +
      '<label>Price (₱)<input type="number" step="500" min="0" class="t-price" value="' + esc(tier.price) + '"></label>' +
      '<label>With battery (₱)<input type="number" step="500" min="0" class="t-priceb" placeholder="same" value="' +
        esc(tier.priceBattery == null ? "" : tier.priceBattery) + '"></label>' +
      '<button type="button" class="t-drop" title="Remove this tier" aria-label="Remove tier ' + esc(tier.name || "") + '">×</button>' +
      '<label class="note">What the flag rail says about this tier' +
        '<input type="text" maxlength="200" class="t-note" value="' + esc(tier.note || "") + '"></label>' +
    '</div>';
  }

  function settingsPaint() {
    settingTiers = (CONFIG.tiers || []).map(function (t) { return Object.assign({}, t); });

    el("qb-set-tiers").innerHTML = settingTiers.map(settingsTierHtml).join("");
    el("qb-set-sizing").innerHTML = SETTING_FIELDS.sizing.map(settingsNumberHtml).join("");
    el("qb-set-money").innerHTML = SETTING_FIELDS.money.map(settingsNumberHtml).join("");

    Array.prototype.forEach.call(el("qb-settings").querySelectorAll("[data-cfg]"), function (node) {
      var v = CONFIG[node.getAttribute("data-cfg")];
      node.value = v == null ? "" : v;
    });

    el("qb-set-who").textContent = CONFIG_META.updatedAt
      ? "Last changed by " + (CONFIG_META.updatedBy || "someone") + " on " + CONFIG_META.updatedAt.slice(0, 10) + "."
      : "Never changed — these are the values SC-16 shipped with.";

    // Every founder can move the ladder, so this normally stays unlocked; the form
    // follows the server's own answer rather than assuming one, and a locked form
    // with the reason on it beats a Save button that 403s when pressed.
    var locked = CONFIG_META.loaded && !CONFIG_META.canEdit;
    Array.prototype.forEach.call(
      el("qb-settings").querySelectorAll("input, #qb-set-save, #qb-set-add, .t-drop"),
      function (node) { node.disabled = locked; }
    );
    if (locked) setSay("", "Read-only for this account.");
  }

  function settingsCollect() {
    var out = {};
    Array.prototype.forEach.call(el("qb-settings").querySelectorAll("[data-cfg]"), function (node) {
      out[node.getAttribute("data-cfg")] = node.value === "" ? null : Number(node.value);
    });
    out.tiers = Array.prototype.map.call(el("qb-set-tiers").querySelectorAll("[data-tier]"), function (row) {
      var v = function (cls) { return row.querySelector("." + cls).value; };
      return {
        name: v("t-name"),
        maxKwp: Number(v("t-kwp")),
        maxKwh: Number(v("t-kwh")),
        price: Number(v("t-price")),
        priceBattery: v("t-priceb") === "" ? null : Number(v("t-priceb")),
        note: v("t-note"),
      };
    });
    return out;
  }

  el("qb-settings-open").addEventListener("click", function () {
    // Re-read first: another founder may have moved the ladder since this tab opened,
    // and the sheet behind the dialog has to agree with what the form shows.
    loadSettings().then(function () {
      seedFieldsFromConfig();
      refresh();
      settingsPaint();
      setSay("", CONFIG_META.loaded ? "" : "Offline — showing the built-in defaults. Saving will not work.");
      el("qb-settings").showModal();
    });
  });
  el("qb-set-close").addEventListener("click", function () { el("qb-settings").close(); });

  el("qb-set-add").addEventListener("click", function () {
    settingTiers = settingsCollect().tiers;
    settingTiers.push({ name: "", maxKwp: 0, maxKwh: 0, price: 0, priceBattery: null, note: "" });
    el("qb-set-tiers").innerHTML = settingTiers.map(settingsTierHtml).join("");
    var last = el("qb-set-tiers").lastElementChild;
    if (last) last.querySelector(".t-name").focus();
  });

  el("qb-set-tiers").addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".t-drop") : null;
    if (!btn) return;
    var rows = el("qb-set-tiers").querySelectorAll("[data-tier]");
    if (rows.length <= 1) { setSay("bad", "The ladder needs at least one tier."); return; }
    settingTiers = settingsCollect().tiers;
    settingTiers.splice(Number(btn.closest("[data-tier]").getAttribute("data-tier")), 1);
    el("qb-set-tiers").innerHTML = settingTiers.map(settingsTierHtml).join("");
    setSay("", "");
  });

  el("qb-set-save").addEventListener("click", function () {
    var btn = el("qb-set-save");
    btn.disabled = true;
    setSay("", "Saving…");
    fetch("/api/quote-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: settingsCollect() }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data.ok) {
          setSay("bad", (res.data && res.data.error) || "Could not save.");
          return;
        }
        Object.keys(res.data.config).forEach(function (k) { CONFIG[k] = res.data.config[k]; });
        CONFIG_META.updatedAt = res.data.updatedAt;
        CONFIG_META.updatedBy = res.data.updatedBy;
        seedFieldsFromConfig();
        refresh();
        settingsPaint();
        setSay("good", "Saved. Every new quote uses these numbers.");
      })
      .catch(function (err) { setSay("bad", String(err && err.message)); })
      .then(function () { btn.disabled = false; });
  });

  /**
   * Confirm the send, showing the three things a founder would actually regret
   * getting wrong: the recipient, the price on the document, and whether that
   * price is firm. Resolves true only on the Send button.
   *
   * Focus opens on Cancel, not Send. This is an irreversible outward action and
   * a stray Enter should not put a price in a customer's inbox.
   */
  function confirmSend(payload, m) {
    var dlg = el("qb-confirm");

    el("qbc-to").textContent = payload.customer.email;
    el("qbc-no").textContent = payload.quote.quoteNo;
    el("qbc-price").textContent = "₱" + Math.round(m.customerPrice).toLocaleString("en-PH");

    var flag = el("qbc-flag");
    var warnings = [];
    if (payload.quote.indicative) {
      warnings.push("<b>Stamped INDICATIVE.</b> " + m.unquoted + " line item" +
        (m.unquoted === 1 ? " is" : "s are") + " still on a market estimate, so the sheet says so " +
        "and no deposit can be taken until the numbers are firm.");
    }
    if (m.belowFloor) {
      warnings.push("<b>Below our minimum profit.</b> Profit " + m.marginPct.toFixed(1) +
        "% is under the " + m.floorPct.toFixed(0) + "% minimum. Sending anyway is a decision — own it in Friday's T5T.");
    }
    flag.innerHTML = warnings.join("<br><br>");
    flag.hidden = warnings.length === 0;

    // Browsers without <dialog> fall back to the native prompt rather than sending
    // unconfirmed — a missing dialog must never become a silent send.
    if (!dlg || typeof dlg.showModal !== "function") {
      return Promise.resolve(window.confirm(
        "Email quote " + payload.quote.quoteNo + " to " + payload.customer.email + "?"
      ));
    }

    return new Promise(function (resolve) {
      function onClose() {
        dlg.removeEventListener("close", onClose);
        resolve(dlg.returnValue === "send");
      }
      dlg.returnValue = "cancel";      // Escape and backdrop both leave this untouched
      dlg.addEventListener("close", onClose);
      dlg.showModal();
      el("qbc-cancel").focus();
    });
  }

  el("qb-send").addEventListener("click", function () {
    var btn = el("qb-send");
    var status = el("qb-send-status");
    var m = current || compute();
    var payload = quotePayload(m);

    var say = function (kind, message) {
      status.hidden = false;
      status.className = "qb-send-status " + kind;
      status.textContent = message;
    };

    if (!payload.customer.name) return say("bad", "Add the customer's name first — the quote is addressed to them.");
    if (!payload.customer.email) return say("bad", "Add the customer's email address — that is where the quote goes.");
    if (!payload.customer.phone) return say("bad", "Add a phone number — it is how an existing contact is matched.");
    if (!payload.quote.preparedBy) return say("bad", "Put your name in “Prepared by” — a quote goes out attributable to a person.");
    if (!payload.quote.scope.length) {
      return say("bad", "Every line in Customer copy is switched off — the quotation would carry a price with nothing " +
        "attached to it. Switch at least one line back on.");
    }
    if (m.pack.tier === "CUSTOM" && !m.priceIsOverride) {
      return say("bad", "Set the selling price first — this system is bigger than our fixed packages, and with no price set " +
        "our own cost total (cost + markup, banned §3) would be quoted. The market price helper suggests " + peso(m.corridorPrice) + ".");
    }

    // Sending is not undoable from the customer's side, so it is confirmed once.
    confirmSend(payload, m).then(function (ok) { if (ok) send(); });

    function send() {
    btn.disabled = true;
    var was = btn.textContent;
    btn.textContent = "Sending…";
    say("busy", "Rendering the PDF and sending…");

    fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data.ok) {
          say("bad", res.data && res.data.error ? res.data.error : "The quote could not be sent.");
          return;
        }
        say("good",
          "Sent to " + res.data.sentTo + " · " +
          (res.data.createdContact ? "new contact created" : "existing contact updated") +
          " · moved to Quote Sent · " + Math.round(res.data.bytes / 1024) + " KB PDF.");
      })
      .catch(function (err) { say("bad", "Network error: " + String(err && err.message)); })
      .then(function () {
        btn.disabled = false;
        btn.textContent = was;
      });
    }
  });

  el("qb-reset-fee").addEventListener("click", function () {
    el("qb-fee").value = "";
    el("qb-price").value = "";
    el("qb-delivery-cost").value = "";
    el("qb-panels-override").value = "";
    refresh();
  });

  /* ------------------------------------------------------------ initial paint */

  el("qb-bill-band").innerHTML = BILL_BANDS.map(function (b) {
    return '<option value="' + b.id + '"' + (b.id === "b4" ? " selected" : "") + ">" + esc(b.label) + "</option>";
  }).join("");
  populateEquipmentSelects();

  SCOPE_PREFS = loadScopePrefs();     // the founder's own defaults, from last time

  seedFieldsFromConfig();
  el("qb-date").value = todayISO();
  el("qb-quote-no").value = nextQuoteNo();

  refresh();

  // Paint immediately from the built-in catalogue and config, then again once the
  // saved ones arrive. A slow or failed fetch leaves a working quote on screen
  // rather than an empty one — the shipped prices are still real prices, and the
  // fallback ladder is the one the team has been quoting from.
  Promise.all([loadCatalog(), loadSettings()]).then(function (loaded) {
    if (loaded[0]) populateEquipmentSelects();
    if (loaded[1]) seedFieldsFromConfig();
    if (loaded[0] || loaded[1]) refresh();
  });
})();
