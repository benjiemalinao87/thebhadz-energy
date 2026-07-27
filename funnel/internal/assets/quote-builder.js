/**
 * SC-16 Quote builder.
 *
 * Founder enters a customer's BILECO bill range; the tool sizes a system, builds an
 * itemised bill of materials, prices it, and renders a printable quote sheet.
 *
 * Three things this file deliberately refuses to do, because the Founder Operating
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

  // BILECO residential rate, from SC-08 competitors research. Marked EST there and
  // still EST here — it is the single number every savings figure hangs off, so it
  // stays editable and stays labelled.
  var DEFAULT_TARIFF = 12.9458;

  // Specific yield for Biliran, kWh per kWp per day. EST — replace with metered output
  // from the first reference install.
  var DEFAULT_YIELD = 4.0;

  var VAT_RATE = 0.12;

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

  // coverage = the share of the customer's consumption we design to cover. On-grid is
  // sized for daytime self-consumption first (export is credited below retail), so it
  // is deliberately not 100%.
  var SYSTEM_TYPES = {
    liwanag: { label: "LIWANAG — on-grid", coverage: 0.70, battery: false, gridTied: true },
    ilaw: { label: "ILAW — off-grid", coverage: 0.85, battery: true, gridTied: false },
    sandigan: { label: "SANDIGAN — hybrid", coverage: 0.75, battery: true, gridTied: true }
  };

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

  // The price ladder from SC-06 §3. The corridor sets the price; the BOM never does.
  function packageFor(kwp, batteryKwh) {
    if (kwp <= 2.4 && batteryKwh <= 3) {
      return { tier: "FLAGSHIP", price: 99500, note: "Inside the ₱80–100k corridor — the fixed flagship price." };
    }
    if (kwp <= 4.0 && batteryKwh <= 5.2) {
      return {
        tier: "PLUS",
        price: batteryKwh > 0 ? 189500 : 149500,
        note: "PLUS tier of the SC-06 ladder."
      };
    }
    return { tier: "CUSTOM", price: null, note: "Outside the published ladder — price must be justified from the corridor (what the customer already pays for gensets, UPS and BILECO), never from this sheet." };
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
    var tariff = num("qb-tariff", DEFAULT_TARIFF);
    var yieldPerKwp = num("qb-yield", DEFAULT_YIELD);

    // Bill: an exact figure wins over the band when the founder has the actual bill in
    // hand (they usually will — §2 says ask to see last month's bill).
    var exact = num("qb-bill-exact", 0);
    var band = null;
    for (var i = 0; i < BILL_BANDS.length; i++) if (BILL_BANDS[i].id === val("qb-bill-band")) band = BILL_BANDS[i];
    if (!band) band = BILL_BANDS[3];
    var bill = exact > 0 ? exact : band.mid;

    var monthlyKwh = tariff > 0 ? bill / tariff : 0;
    var coverage = num("qb-coverage", spec.coverage * 100) / 100;

    var panel = byId(PANELS, val("qb-panel"));
    var targetKwp = (monthlyKwh * coverage) / (yieldPerKwp * 30);

    // Panel count: auto unless the founder has overridden it (roof survey usually wins).
    var override = parseInt(val("qb-panels-override"), 10);
    var panels = isFinite(override) && override > 0
      ? override
      : Math.max(2, Math.ceil((targetKwp * 1000) / panel.watts));

    var kwp = (panels * panel.watts) / 1000;
    // Whole panels rarely land exactly on the target, and the overshoot is what pushes a
    // job from FLAGSHIP into PLUS — so it is shown, not buried.
    var overshootPct = targetKwp > 0 ? ((kwp - targetKwp) / targetKwp) * 100 : 0;
    var rows = Math.max(1, Math.ceil(panels / 7));
    var strings = Math.max(1, Math.ceil(panels / 14));

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

    function mapGroup(name, defs) {
      var items = defs.map(function (d) { return line(d.label, d.qty(geom), d.price, true); }).filter(Boolean);
      if (items.length) groups.push({ name: name, items: items });
    }
    mapGroup("RAILING SETS", RAILING);
    mapGroup("SURGE / BREAKER SET", PROTECTION);
    mapGroup("CABLES", CABLES);

    if (batteryKwh > 0) {
      groups.push({ name: "BATTERY", items: [line(battery.label, batteryQty, battery.price, battery.quoted)].filter(Boolean) });
    }

    var materials = 0;
    groups.forEach(function (g) { g.items.forEach(function (it) { materials += it.total; }); });

    var vatOn = el("qb-vat") ? el("qb-vat").checked : true;
    var vat = vatOn ? materials * VAT_RATE : 0;

    // Where our margin lives. Materials pass through at supplier cost; this line carries
    // fabrication, delivery, crew, transport and the permit/net-metering work.
    var feeAuto = 12000 + panels * 3000;
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
    if (deliveryCost < 0) deliveryCost = 12000 + panels * 1500;

    var ourCost = materials + vat + deliveryCost;
    var margin = customerPrice - ourCost;
    var marginPct = customerPrice > 0 ? (margin / customerPrice) * 100 : 0;

    /* ----- generation and savings (all EST) */
    var generation = kwp * yieldPerKwp * 30;
    // On-grid without storage only banks what is consumed during daylight; export is
    // credited below retail, so we do not count it as a peso-for-peso saving.
    var usableShare = batteryKwh > 0 ? 1.0 : 0.85;
    var offsetKwh = Math.min(generation * usableShare, monthlyKwh);
    var savedPerMonth = offsetKwh * tariff;
    var paybackYears = savedPerMonth > 0 ? customerPrice / (savedPerMonth * 12) : 0;

    return {
      type: type, spec: spec, tariff: tariff, yieldPerKwp: yieldPerKwp,
      bill: bill, bandLabel: exact > 0 ? "Actual bill" : band.label, monthlyKwh: monthlyKwh,
      coverage: coverage, panel: panel, panels: panels, kwp: kwp, targetKwp: targetKwp,
      overshootPct: overshootPct, rows: rows, strings: strings,
      inverter: inverter, battery: battery, batteryQty: batteryQty, batteryKwh: batteryKwh,
      groups: groups, materials: materials, vat: vat, vatOn: vatOn, fee: fee, feeAuto: feeAuto,
      total: total, pack: pack, customerPrice: customerPrice, priceIsOverride: priceOverride >= 0,
      deliveryCost: deliveryCost, ourCost: ourCost, margin: margin, marginPct: marginPct,
      generation: generation, offsetKwh: offsetKwh, savedPerMonth: savedPerMonth,
      paybackYears: paybackYears, unquoted: unquoted
    };
  }

  /* ------------------------------------------------------------------ rendering */

  function renderReadout(m) {
    var marginTone = m.margin <= 0 ? "bad" : (m.marginPct < 12 ? "" : "good");
    el("qb-readout").innerHTML =
      '<div><span>System size</span><strong>' + m.kwp.toFixed(2) + ' kWp</strong></div>' +
      '<div><span>Target / rounding</span><strong>' + m.targetKwp.toFixed(2) + ' kWp · ' +
        (m.overshootPct >= 0 ? "+" : "") + m.overshootPct.toFixed(0) + '%</strong></div>' +
      '<div><span>Panels</span><strong>' + m.panels + ' × ' + m.panel.watts + 'W</strong></div>' +
      '<div><span>Est. consumption</span><strong>' + Math.round(m.monthlyKwh) + ' kWh/mo</strong></div>' +
      '<div><span>Est. offset</span><strong>' + Math.round(m.offsetKwh) + ' kWh/mo</strong></div>' +
      '<div><span>Est. saving</span><strong>' + peso(m.savedPerMonth) + '/mo</strong></div>' +
      '<div><span>Simple payback</span><strong>' + m.paybackYears.toFixed(1) + ' yrs</strong></div>' +
      '<div><span>Ladder tier</span><strong>' + m.pack.tier + '</strong></div>' +
      '<div><span>Quote total</span><strong>' + peso(m.total) + '</strong></div>' +
      '<div><span>Customer price</span><strong>' + peso(m.customerPrice) + '</strong></div>' +
      '<div><span>Our cost</span><strong>' + peso(m.ourCost) + '</strong></div>' +
      '<div class="' + marginTone + '"><span>Gross margin</span><strong>' + peso(m.margin) + ' · ' + m.marginPct.toFixed(0) + '%</strong></div>';
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
      out.push('<div class="qb-flag"><strong>Outside the ₱80–100k corridor (§3).</strong>' + esc(m.pack.note) +
        ' Cost-plus pricing off this sheet is banned — set the price from what this household already pays for BILECO, a genset and a UPS, then check the margin here.</div>');
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

    el("qb-flags").innerHTML = out.join("");
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

  function renderSheet(m) {
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

    var indicative = m.unquoted > 0
      ? '<div class="qs-brownout"><strong>Indicative quotation</strong>' + m.unquoted + ' item' + (m.unquoted === 1 ? " on this sheet is" : "s on this sheet are") +
        ' priced on current market estimates and not yet confirmed supplier quotations. ' +
        'Final pricing will be confirmed in writing before any deposit is accepted.</div>'
      : "";

    var batteryLine = m.batteryKwh > 0
      ? '<div><span>Battery storage</span><strong>' + m.batteryKwh.toFixed(1) + ' kWh</strong><small>' + esc(m.battery.label) + '</small></div>'
      : '<div><span>Battery storage</span><strong>None</strong><small>Daytime self-consumption</small></div>';

    el("qb-sheet").innerHTML =
      '<div class="qs-head">' +
        // Logo plus the legal name as real text: the name must survive the image
        // failing to load, and a quotation should stay selectable and searchable.
        '<div class="qs-brand">' +
          '<img class="qs-logo" src="/assets/img/macc-logo.png" alt="MACC Systems &amp; Engineering Inc.">' +
          'MACC Systems &amp; Engineering Inc.' +
          '<small>Biliran Province, Philippines<br>Solar supply, fabrication and installation</small>' +
        '</div>' +
        '<div class="qs-meta">' +
          '<b>QUOTATION</b><br>No. ' + esc(quoteNo) + '<br>Date: ' + esc(date) + '<br>Valid until: ' + esc(addDays(date, validity)) +
        '</div>' +
      '</div>' +

      '<div class="qs-title">SOLAR POWER SYSTEM — QUOTATION &amp; BILL OF MATERIALS</div>' +

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

      '<table><thead><tr>' +
        '<th style="width:52%">Item</th><th style="width:10%">Qty</th><th class="num" style="width:19%">Price/Unit</th><th class="num" style="width:19%">Total Price</th>' +
      '</tr></thead><tbody>' +
        bomRowsHtml(m) +
        '<tr class="qs-sub"><td colspan="3">MATERIALS SUBTOTAL</td><td class="num">' + money(m.materials) + '</td></tr>' +
        (m.vatOn ? '<tr class="qs-group"><td>TAX</td><td></td><td></td><td class="num">-</td></tr>' +
          '<tr><td class="qs-indent">VAT 12%</td><td class="qty">1</td><td class="num">' + money(m.vat) + '</td><td class="num">' + money(m.vat) + '</td></tr>' : "") +
        '<tr class="qs-group"><td>OTHER COSTS</td><td></td><td></td><td class="num">-</td></tr>' +
        '<tr><td class="qs-indent">Fabrication, Delivery and Installation Fee</td><td class="qty">1</td><td class="num">' + money(m.fee) + '</td><td class="num">' + money(m.fee) + '</td></tr>' +
        '<tr class="qs-total"><td colspan="3">TOTAL</td><td class="num">' + money(m.total) + '</td></tr>' +
        (Math.round(m.customerPrice) !== Math.round(m.total)
          ? '<tr class="qs-total"><td colspan="3">CONTRACT PRICE (fixed package)</td><td class="num">' + money(m.customerPrice) + '</td></tr>'
          : "") +
      '</tbody></table>' +

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

      '<div class="qs-foot">This quotation is confidential and prepared solely for the named customer. Equipment prices marked ' +
        '"indicative" are market estimates pending supplier confirmation.</div>';
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
    if (m.spec.battery && m.batteryKwh === 0) {
      return {
        state: "blocked",
        action: "Add a battery or switch this to LIWANAG.",
        why: m.spec.label + " is sold on backup and this configuration has no storage. Sending it as-is is the value gap (§1.6)."
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
  }

  function syncInverterOptions() {
    var type = val("qb-type") || "liwanag";
    var select = el("qb-inverter");
    if (!select || select.dataset.forType === type) return;
    var keep = select.value;
    var options = INVERTERS.filter(function (i) { return i.types.indexOf(type) !== -1; });
    select.innerHTML = options.map(function (i) {
      return '<option value="' + i.id + '">' + esc(i.label) + " · " + peso(i.price) + (i.quoted ? "" : " (est)") + "</option>";
    }).join("");
    var stillThere = options.some(function (i) { return i.id === keep; });
    select.value = stillThere ? keep : options[0].id;
    select.dataset.forType = type;
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
    if (cov && !cov.dataset.touched) cov.value = Math.round(spec.coverage * 100);
  }

  root.addEventListener("input", function (e) {
    if (e.target && e.target.id === "qb-coverage") e.target.dataset.touched = "1";
    refresh();
  });
  root.addEventListener("change", refresh);

  el("qb-print").addEventListener("click", function () { window.print(); });

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
    var sheet = el("qb-sheet");
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

    // The bill of materials, flattened to the rows the PDF draws. Same order and
    // the same figures as bomRowsHtml — this is a shape change, not a recount.
    var rows = [];
    m.groups.forEach(function (g) {
      if (g.name) rows.push({ kind: "group", label: g.name });
      g.items.forEach(function (it) {
        rows.push({
          kind: "item", indent: !!g.name, label: it.label,
          qty: it.qty, price: it.price, total: it.total, quoted: it.quoted,
        });
      });
    });
    rows.push({ kind: "subtotal", label: "MATERIALS SUBTOTAL", total: m.materials });
    if (m.vatOn) {
      rows.push({ kind: "group", label: "TAX" });
      rows.push({ kind: "item", indent: true, label: "VAT 12%", qty: 1, price: m.vat, total: m.vat });
    }
    rows.push({ kind: "group", label: "OTHER COSTS" });
    rows.push({ kind: "item", indent: true, label: "Fabrication, Delivery and Installation Fee", qty: 1, price: m.fee, total: m.fee });
    rows.push({ kind: "total", label: "TOTAL", total: m.total });

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
        savingsBasis: "~" + Math.round(m.offsetKwh) + " kWh/mo at PHP " + m.tariff.toFixed(2) + "/kWh",
        batteryLabel: m.batteryKwh > 0 ? m.batteryKwh.toFixed(1) + " kWh" : "None",
        batteryNote: m.batteryKwh > 0 ? m.battery.label : "Daytime self-consumption",
        hasBattery: m.batteryKwh > 0,
        unquoted: m.unquoted,
        rows: rows,
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

    // Sending is not undoable from the customer's side, so it is confirmed once,
    // with the two things that actually matter restated.
    var confirmed = window.confirm(
      "Email quote " + payload.quote.quoteNo + " to " + payload.customer.email + "?\n\n" +
      "Contract price: PHP " + Math.round(m.customerPrice).toLocaleString("en-PH") +
      (payload.quote.indicative ? "\nThis quote is stamped INDICATIVE." : "") +
      "\n\nThey move to Quote Sent, with a follow-up due in 2 days."
    );
    if (!confirmed) return;

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
  el("qb-panel").innerHTML = PANELS.map(function (p) {
    return '<option value="' + p.id + '">' + esc(p.label) + " · " + peso(p.price) + (p.quoted ? "" : " (est)") + "</option>";
  }).join("");
  el("qb-battery").innerHTML = BATTERIES.map(function (b) {
    return '<option value="' + b.id + '">' + esc(b.label) + (b.price ? " · " + peso(b.price) : "") + (b.quoted ? "" : " (est)") + "</option>";
  }).join("");

  el("qb-tariff").value = DEFAULT_TARIFF;
  el("qb-yield").value = DEFAULT_YIELD;
  el("qb-date").value = todayISO();
  el("qb-quote-no").value = nextQuoteNo();

  refresh();
})();
