(function () {
  "use strict";

  var storageKey = "solar-city-founder-strategy-v1";
  var apiUrl = "/api/founder-lab";
  var usingApi = false;
  var saveTimer = null;
  var state = defaultState();

  var ids = [
    "offer-name", "sale-price", "target-margin", "monthly-volume", "quote-date",
    "pos-customer", "pos-job", "pos-alternatives", "pos-reason", "pos-proof",
    "errc-eliminate", "errc-reduce", "errc-raise", "errc-create",
    "ev-interviews", "ev-supplier-quotes", "ev-quotes-issued", "ev-surveys", "ev-deposits", "ev-proof",
    "gate-permits", "gate-delivery", "gate-slices", "gate-claims", "gate-liwanag"
  ];

  var costRows = document.getElementById("cost-rows");
  if (!costRows) return;

  document.querySelectorAll("[data-tab]").forEach(function (button) {
    button.addEventListener("click", function () { selectTab(button.getAttribute("data-tab")); });
  });
  document.getElementById("add-cost").addEventListener("click", addCostRow);
  document.getElementById("lab-save").addEventListener("click", function () { save(true); });
  document.getElementById("lab-export").addEventListener("click", exportState);
  document.getElementById("lab-import").addEventListener("change", importState);

  ids.forEach(function (id) {
    var element = document.getElementById(id);
    if (!element) return;
    element.addEventListener("input", onInput);
    element.addEventListener("change", onInput);
  });
  costRows.addEventListener("input", onCostInput);
  costRows.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-remove]");
    if (!button) return;
    state.costs.splice(Number(button.getAttribute("data-remove")), 1);
    renderCosts();
    calculate();
    queueSave();
  });

  init();

  async function init() {
    if (location.protocol !== "file:") usingApi = await loadApi();
    if (!usingApi) state = loadLocal();
    hydrate();
    render();
    setStorageStatus();
  }

  function defaultState() {
    return {
      offer: "LIWANAG",
      price: 99500,
      targetMargin: 30,
      monthlyVolume: 1,
      quoteDate: "",
      costs: [
        cost("Panels", 23000, 25500, 28000),
        cost("Inverter", 16000, 20000, 24000),
        cost("Racking, boxes and harness", 10000, 12000, 14000),
        cost("Labor and transport", 7000, 8500, 10000),
        cost("Engineering, permits and net metering", 6000, 8000, 10000),
        cost("Warranty and rework reserve", 0, 0, 0),
        cost("Payment, sales and acquisition cost", 0, 0, 0)
      ],
      positioning: {
        customer: "Homeowners in [named launch area] with a stable grid and an ₱8,000–₱15,000 monthly bill",
        job: "Reduce the monthly electricity bill without navigating confusing solar quotations",
        alternatives: "Keep paying the bill; genset or UPS; established installer; DIY marketplace kit",
        reason: "A fixed package, standardized BOM, direct purchasing and no showroom",
        proof: "",
        eliminate: "Confusing brand and system menus\nHidden mandatory extras\nUnverified savings promises",
        reduce: "Custom engineering before qualification\nInventory before a paid commitment\nGeographic coverage at launch",
        raise: "Price and scope transparency\nInstallation documentation\nLocal after-sales accountability",
        create: "Same-day bill and roof assessment\nFixed-scope standard package\nMilestone updates through energization"
      },
      evidence: { interviews: 0, supplierQuotes: 0, quotesIssued: 0, surveys: 0, deposits: 0, proof: 0 },
      gates: { permits: false, delivery: false, slices: false, claims: false, liwanag: false }
    };
  }

  function cost(label, low, expected, high) {
    return { label: label, low: low, expected: expected, high: high, evidence: "" };
  }

  function hydrate() {
    setValue("offer-name", state.offer);
    setValue("sale-price", state.price);
    setValue("target-margin", state.targetMargin);
    setValue("monthly-volume", state.monthlyVolume);
    setValue("quote-date", state.quoteDate);
    setValue("pos-customer", state.positioning.customer);
    setValue("pos-job", state.positioning.job);
    setValue("pos-alternatives", state.positioning.alternatives);
    setValue("pos-reason", state.positioning.reason);
    setValue("pos-proof", state.positioning.proof);
    setValue("errc-eliminate", state.positioning.eliminate);
    setValue("errc-reduce", state.positioning.reduce);
    setValue("errc-raise", state.positioning.raise);
    setValue("errc-create", state.positioning.create);
    setValue("ev-interviews", state.evidence.interviews);
    setValue("ev-supplier-quotes", state.evidence.supplierQuotes);
    setValue("ev-quotes-issued", state.evidence.quotesIssued);
    setValue("ev-surveys", state.evidence.surveys);
    setValue("ev-deposits", state.evidence.deposits);
    setValue("ev-proof", state.evidence.proof);
    setChecked("gate-permits", state.gates.permits);
    setChecked("gate-delivery", state.gates.delivery);
    setChecked("gate-slices", state.gates.slices);
    setChecked("gate-claims", state.gates.claims);
    setChecked("gate-liwanag", state.gates.liwanag);
  }

  function onInput() {
    state.offer = value("offer-name");
    state.price = number("sale-price");
    state.targetMargin = number("target-margin");
    state.monthlyVolume = number("monthly-volume");
    state.quoteDate = value("quote-date");
    state.positioning = {
      customer: value("pos-customer"), job: value("pos-job"), alternatives: value("pos-alternatives"),
      reason: value("pos-reason"), proof: value("pos-proof"), eliminate: value("errc-eliminate"),
      reduce: value("errc-reduce"), raise: value("errc-raise"), create: value("errc-create")
    };
    state.evidence = {
      interviews: number("ev-interviews"), supplierQuotes: number("ev-supplier-quotes"),
      quotesIssued: number("ev-quotes-issued"), surveys: number("ev-surveys"),
      deposits: number("ev-deposits"), proof: number("ev-proof")
    };
    state.gates = {
      permits: checked("gate-permits"), delivery: checked("gate-delivery"), slices: checked("gate-slices"),
      claims: checked("gate-claims"), liwanag: checked("gate-liwanag")
    };
    calculate();
    renderPositioning();
    renderEvidence();
    queueSave();
  }

  function onCostInput(event) {
    var input = event.target.closest("input[data-field]");
    if (!input) return;
    var row = state.costs[Number(input.getAttribute("data-index"))];
    var field = input.getAttribute("data-field");
    row[field] = ["low", "expected", "high"].indexOf(field) >= 0 ? Math.max(0, Number(input.value) || 0) : input.value;
    calculate();
    queueSave();
  }

  function render() { renderCosts(); calculate(); renderPositioning(); renderEvidence(); }

  function renderCosts() {
    costRows.innerHTML = state.costs.map(function (row, index) {
      return "<tr>" +
        cellInput(index, "label", row.label, "text") +
        cellInput(index, "low", row.low, "number") +
        cellInput(index, "expected", row.expected, "number") +
        cellInput(index, "high", row.high, "number") +
        cellInput(index, "evidence", row.evidence, "text", "Supplier + quote date") +
        '<td><button type="button" data-remove="' + index + '" aria-label="Remove ' + escapeHtml(row.label) + '">Remove</button></td></tr>';
    }).join("");
  }

  function cellInput(index, field, inputValue, type, placeholder) {
    return '<td><input type="' + type + '" min="0" step="500" data-index="' + index + '" data-field="' + field +
      '" value="' + escapeAttr(inputValue) + '" placeholder="' + escapeAttr(placeholder || "") + '"></td>';
  }

  function addCostRow() {
    state.costs.push(cost("New cost line", 0, 0, 0));
    renderCosts(); calculate(); queueSave();
  }

  function calculate() {
    var totals = state.costs.reduce(function (sum, row) {
      sum.low += Number(row.low) || 0; sum.expected += Number(row.expected) || 0; sum.high += Number(row.high) || 0; return sum;
    }, { low: 0, expected: 0, high: 0 });
    var price = Math.max(0, state.price || 0);
    var targetCost = price * (1 - Math.min(100, Math.max(0, state.targetMargin || 0)) / 100);
    var margin = price ? (price - totals.expected) / price * 100 : 0;
    var headroom = targetCost - totals.expected;
    text("metric-price", money(price)); text("metric-cost", money(totals.expected)); text("metric-margin", margin.toFixed(1) + "%");
    text("metric-headroom", signedMoney(headroom)); text("cost-low", money(totals.low)); text("cost-expected", money(totals.expected)); text("cost-high", money(totals.high));
    tone("metric-margin", margin >= state.targetMargin); tone("metric-headroom", headroom >= 0);

    var max = Math.max(1, price * 1.12, totals.high * 1.12);
    text("range-max", money(max));
    place("range-cost-band", totals.low / max * 100, Math.max(1, (totals.high - totals.low) / max * 100), true);
    place("range-target", targetCost / max * 100); place("range-price", price / max * 100);
  }

  function renderPositioning() {
    var p = state.positioning;
    var statement = p.customer && p.job && p.alternatives && p.reason
      ? "For " + p.customer + " who need to " + lowerFirst(p.job) + ", " + state.offer +
        " is a standardized Solar City offer. Unlike " + p.alternatives + ", we deliver it through " + lowerFirst(p.reason) + "."
      : "Complete the four positioning fields above.";
    text("positioning-statement", statement);
  }

  function renderEvidence() {
    var e = state.evidence;
    var missing = [];
    if (e.interviews < 10) missing.push((10 - e.interviews) + " more past-specific homeowner interviews");
    if (e.supplierQuotes < 3) missing.push((3 - e.supplierQuotes) + " more current major-supplier quote sets");
    if (e.quotesIssued < 5) missing.push((5 - e.quotesIssued) + " more real customer quotations at the tested price");
    if (e.surveys < 2) missing.push((2 - e.surveys) + " more booked site surveys");
    if (e.deposits < 1) missing.push("at least 1 paid deposit before treating the offer as proven");
    if (!state.gates.permits) missing.push("permit and licensed-practitioner checklist");
    if (!state.gates.delivery) missing.push("end-to-end lead delivery and attribution test");
    if (!state.gates.slices) missing.push("three named launch slices and their exact groups");
    if (!state.gates.claims) missing.push("public-copy proof and claims audit");
    if (state.offer === "LIWANAG" && !state.gates.liwanag) missing.push("explicit no-brownout-power disclosure for LIWANAG");
    if (e.proof < 1) missing.push("at least one permissioned proof item or honest founder R&D artifact");

    var decision = document.getElementById("evidence-decision");
    decision.classList.toggle("is-ready", missing.length === 0);
    decision.innerHTML = missing.length
      ? "<strong>NOT READY FOR PAID TRAFFIC OR SCALE</strong><span>Next required evidence:</span><ul>" + missing.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + "</ul>"
      : "<strong>READY FOR A SMALL, PRE-REGISTERED LIVE TEST</strong><span>The evidence gates are complete. This does not authorize scaling beyond the first test budget or skipping the paid-deposit gate.</span>";

    var headline = document.getElementById("lab-gate-message");
    headline.className = "callout " + (missing.length ? "warn" : "qc");
    headline.innerHTML = '<span class="label">Current decision</span>' + (missing.length
      ? missing.length + " launch gate" + (missing.length === 1 ? " is" : "s are") + " still unmet. Keep the offer in validation."
      : "The offer can enter one small live test. Record the test threshold and end date before launch.");
  }

  function queueSave() {
    saveLocal();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { if (usingApi) save(false); }, 900);
  }

  async function save(showMessage) {
    saveLocal();
    if (!usingApi) { setUpdated("Saved in this browser"); return; }
    try {
      var response = await fetch(apiUrl, {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ state: state })
      });
      if (response.status === 401) { location.href = "/login.html?next=" + encodeURIComponent(location.pathname); return; }
      var data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Save failed");
      setUpdated("Shared save " + formatTime(data.updated_at));
    } catch (error) {
      usingApi = false; setStorageStatus(); setUpdated("D1 save failed; browser copy retained");
      if (showMessage) alert(error.message || "Could not save the shared strategy.");
    }
  }

  async function loadApi() {
    try {
      var response = await fetch(apiUrl, { credentials: "same-origin", headers: { "Accept": "application/json" } });
      if (response.status === 401) { location.href = "/login.html?next=" + encodeURIComponent(location.pathname); return false; }
      if (!response.ok) return false;
      var data = await response.json();
      if (!data.ok) return false;
      if (data.state) state = normalize(data.state);
      setUpdated(data.updated_at ? "Shared save " + formatTime(data.updated_at) : "No shared save yet");
      return true;
    } catch { return false; }
  }

  function normalize(input) {
    var base = defaultState();
    if (!input || typeof input !== "object") return base;
    return {
      offer: String(input.offer || base.offer), price: finite(input.price, base.price),
      targetMargin: finite(input.targetMargin, base.targetMargin), monthlyVolume: finite(input.monthlyVolume, 1),
      quoteDate: String(input.quoteDate || ""),
      costs: Array.isArray(input.costs) ? input.costs.slice(0, 40).map(function (row) {
        return { label: String(row.label || "Cost line").slice(0, 80), low: finite(row.low, 0), expected: finite(row.expected, 0), high: finite(row.high, 0), evidence: String(row.evidence || "").slice(0, 160) };
      }) : base.costs,
      positioning: Object.assign({}, base.positioning, input.positioning || {}),
      evidence: Object.assign({}, base.evidence, input.evidence || {}),
      gates: Object.assign({}, base.gates, input.gates || {})
    };
  }

  function loadLocal() {
    try { return normalize(JSON.parse(localStorage.getItem(storageKey))); } catch { return defaultState(); }
  }
  function saveLocal() { localStorage.setItem(storageKey, JSON.stringify(state)); }
  function setStorageStatus() { text("lab-storage", usingApi ? "Storage: shared D1" : "Storage: this browser"); }
  function setUpdated(message) { text("lab-updated", message); }

  function exportState() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "solar-city-founder-strategy.json"; link.click(); URL.revokeObjectURL(link.href);
  }
  function importState(event) {
    var file = event.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try { state = normalize(JSON.parse(String(reader.result || ""))); hydrate(); render(); save(true); }
      catch { alert("That file is not a valid founder strategy export."); }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  function selectTab(name) {
    document.querySelectorAll("[data-tab]").forEach(function (button) { button.setAttribute("aria-selected", String(button.getAttribute("data-tab") === name)); });
    document.querySelectorAll("[data-panel]").forEach(function (panel) { panel.hidden = panel.getAttribute("data-panel") !== name; });
  }
  function setValue(id, inputValue) { document.getElementById(id).value = inputValue == null ? "" : inputValue; }
  function setChecked(id, inputValue) { document.getElementById(id).checked = Boolean(inputValue); }
  function value(id) { return document.getElementById(id).value.trim(); }
  function number(id) { return Math.max(0, Number(document.getElementById(id).value) || 0); }
  function checked(id) { return document.getElementById(id).checked; }
  function text(id, inputValue) { document.getElementById(id).textContent = inputValue; }
  function tone(id, good) { var el = document.getElementById(id); el.classList.toggle("is-good", good); el.classList.toggle("is-bad", !good); }
  function place(id, left, width, isBand) { var el = document.getElementById(id); el.style.left = Math.max(0, Math.min(100, left)) + "%"; if (isBand) el.style.width = Math.max(0, Math.min(100 - left, width)) + "%"; }
  function money(inputValue) { return "₱" + Math.round(inputValue || 0).toLocaleString("en-PH"); }
  function signedMoney(inputValue) { return (inputValue >= 0 ? "+" : "−") + money(Math.abs(inputValue)); }
  function finite(inputValue, fallback) { var parsed = Number(inputValue); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; }
  function lowerFirst(inputValue) { return inputValue ? inputValue.charAt(0).toLowerCase() + inputValue.slice(1) : ""; }
  function formatTime(inputValue) { try { return new Date(inputValue).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }); } catch { return inputValue; } }
  function escapeHtml(inputValue) { return String(inputValue || "").replace(/[&<>"']/g, function (char) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]; }); }
  function escapeAttr(inputValue) { return escapeHtml(inputValue).replace(/`/g, "&#96;"); }
})();
