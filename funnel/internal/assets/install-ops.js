(function () {
  "use strict";

  var apiUrl = "/api/install-ops";
  var state = { projects: [], costs: [], payments: [], installers: [], assignments: [], leads: [] };
  var stageLabels = {
    survey: "Site survey", quoted: "Quote issued", approved: "Quote approved", deposit_paid: "Deposit paid",
    design: "Design approved", permits: "Permits / net metering", procurement: "Procurement",
    scheduled: "Install scheduled", installing: "Installing", testing: "Testing / inspection",
    energized: "Energized", handover: "Customer handover", warranty: "Warranty support", cancelled: "Cancelled"
  };
  var checkLabels = {
    permit_checklist: "Permit checklist reviewed", licensed_electrician_check: "Licensed electrical practitioner confirmed",
    net_metering_check: "Net-metering requirement reviewed", safety_briefing_check: "Safety briefing and PPE",
    testing_check: "Testing / inspection complete", handover_check: "Customer handover complete"
  };

  ["project-form", "cost-form", "payment-form", "installer-form", "assignment-form"].forEach(function (id) {
    var form = document.getElementById(id); if (form) form.addEventListener("submit", submitForm);
  });
  document.getElementById("project-lead").addEventListener("change", useLead);
  document.getElementById("ops-projects").addEventListener("change", projectChange);
  document.getElementById("ops-costs").addEventListener("click", costAction);
  document.getElementById("ops-payments").addEventListener("click", paymentAction);
  document.getElementById("ops-assignments").addEventListener("change", assignmentChange);
  document.getElementById("ops-assignments").addEventListener("click", assignmentAction);
  document.querySelectorAll("[data-tab]").forEach(function (button) {
    button.addEventListener("click", function () { selectTab(button.getAttribute("data-tab")); });
  });
  document.querySelector('#payment-form [name="payment_date"]').value = today();
  document.querySelector('#assignment-form [name="work_date"]').value = today();
  load();

  async function load() {
    try {
      var response = await fetch(apiUrl, { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (response.status === 401) return redirectLogin();
      var data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load installation records.");
      Object.keys(state).forEach(function (key) { state[key] = data[key] || []; });
      render(); status("Shared D1 operations · " + state.projects.length + " installation project" + (state.projects.length === 1 ? "" : "s"));
    } catch (error) { status(error.message, true); }
  }

  function render() {
    renderMetrics(); renderLeads(); renderProjectSelects(); renderInstallerSelect();
    renderProjects(); renderCosts(); renderPayments(); renderInstallers(); renderAssignments();
  }

  function renderMetrics() {
    var active = state.projects.filter(function (p) { return p.stage !== "cancelled" && p.stage !== "handover" && p.stage !== "warranty"; });
    var scheduled = active.filter(function (p) { return p.install_date || p.stage === "scheduled"; }).length;
    var contracts = state.projects.filter(function (p) { return p.stage !== "cancelled"; }).reduce(function (sum, p) { return sum + num(p.contract_price_cents); }, 0);
    var customerCash = state.payments.filter(function (p) { return p.status === "received" && p.kind !== "refund"; }).reduce(function (sum, p) { return sum + num(p.amount_cents); }, 0) - state.payments.filter(function (p) { return p.status === "received" && p.kind === "refund"; }).reduce(function (sum, p) { return sum + num(p.amount_cents); }, 0);
    var forecast = state.costs.reduce(function (sum, c) { return sum + forecastCost(c); }, 0);
    text("ops-active", active.length); text("ops-scheduled", scheduled); text("ops-cash", money(customerCash)); text("ops-contracts", money(contracts)); text("ops-cost", money(forecast));
    text("ops-margin", contracts ? money(contracts - forecast) + " · " + ((contracts - forecast) / contracts * 100).toFixed(1) + "%" : "—");
  }

  function renderLeads() {
    var select = document.getElementById("project-lead");
    select.innerHTML = '<option value="">Manual customer</option>' + state.leads.map(function (lead) {
      return '<option value="' + esc(lead.id) + '">' + html(lead.name + " · " + (lead.package || "No package") + " · " + lead.stage) + '</option>';
    }).join("");
  }

  function useLead() {
    var lead = state.leads.find(function (item) { return String(item.id) === document.getElementById("project-lead").value; });
    if (!lead) return;
    var form = document.getElementById("project-form"); form.elements.customer_name.value = lead.name || "";
    form.elements.phone.value = lead.phone || ""; form.elements.package.value = lead.package || "Custom";
  }

  function renderProjectSelects() {
    document.querySelectorAll("[data-project-select]").forEach(function (select) {
      var current = select.value;
      select.innerHTML = '<option value="">Choose project</option>' + state.projects.filter(function (p) { return p.stage !== "cancelled"; }).map(function (p) {
        return '<option value="' + esc(p.id) + '">' + html(p.customer_name + " · " + p.package) + '</option>';
      }).join(""); select.value = current;
    });
  }

  function renderInstallerSelect() {
    var select = document.getElementById("assignment-installer"); var current = select.value;
    select.innerHTML = '<option value="">Choose installer</option>' + state.installers.filter(function (i) { return i.active; }).map(function (i) { return '<option value="' + esc(i.id) + '">' + html(i.name + " · " + i.role) + '</option>'; }).join("");
    select.value = current;
  }

  function renderProjects() {
    var target = document.getElementById("ops-projects");
    if (!state.projects.length) { target.innerHTML = '<div class="ops-empty">No installation projects yet. Create the first one above when a real customer reaches survey/quote stage.</div>'; return; }
    target.innerHTML = state.projects.map(function (p) {
      var costs = state.costs.filter(function (c) { return c.project_id === p.id; });
      var payments = state.payments.filter(function (pay) { return pay.project_id === p.id && pay.status === "received"; });
      var cost = costs.reduce(function (sum, c) { return sum + forecastCost(c); }, 0);
      var paid = payments.reduce(function (sum, pay) { return sum + (pay.kind === "refund" ? -num(pay.amount_cents) : num(pay.amount_cents)); }, 0);
      var margin = num(p.contract_price_cents) - cost;
      var completedChecks = Object.keys(checkLabels).filter(function (key) { return p[key]; }).length;
      return '<article class="ops-card" data-project="' + esc(p.id) + '"><div class="ops-card-head"><div><h3>' + html(p.customer_name) + '</h3><p class="meta">' + html(p.package + " · " + (p.site_address || "Site address pending") + " · Owner: " + (p.owner || "Unassigned")) + '</p></div><span class="ops-pill ' + esc(p.stage) + '">' + html(stageLabels[p.stage] || p.stage) + '</span></div>' +
        '<div class="ops-card-grid"><div><span>Contract</span><strong>' + money(p.contract_price_cents) + '</strong></div><div><span>Forecast cost</span><strong>' + money(cost) + '</strong></div><div><span>Forecast margin</span><strong>' + money(margin) + '</strong></div><div><span>Customer cash</span><strong>' + money(paid) + '</strong></div></div>' +
        '<div class="ops-progress" title="' + completedChecks + ' of 6 controls complete"><span style="width:' + (completedChecks / 6 * 100) + '%"></span></div>' +
        '<div class="ops-checks">' + Object.keys(checkLabels).map(function (key) { return '<label><input type="checkbox" data-project-field="' + esc(key) + '" ' + (p[key] ? "checked" : "") + '><span>' + html(checkLabels[key]) + '</span></label>'; }).join("") + '</div>' +
        '<div class="ops-card-actions"><label>Project stage<select data-project-field="stage">' + Object.keys(stageLabels).map(function (key) { return '<option value="' + esc(key) + '" ' + (p.stage === key ? "selected" : "") + '>' + html(stageLabels[key]) + '</option>'; }).join("") + '</select></label>' +
        '<label>Install date<input type="date" data-project-field="install_date" value="' + esc(p.install_date || "") + '"></label>' +
        '<label>Survey date<input type="date" data-project-field="survey_date" value="' + esc(p.survey_date || "") + '"></label>' +
        '<button type="button" class="secondary" data-open-costing="' + esc(p.id) + '">Open costing</button></div></article>';
    }).join("");
    target.querySelectorAll("[data-open-costing]").forEach(function (button) { button.addEventListener("click", function () { chooseProject(button.getAttribute("data-open-costing")); selectTab("costing"); }); });
  }

  async function projectChange(event) {
    var field = event.target.getAttribute("data-project-field"); if (!field) return;
    var card = event.target.closest("[data-project]"); var project = state.projects.find(function (p) { return p.id === card.getAttribute("data-project"); });
    if (!project) return;
    var value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    try { await request("PATCH", { resource: "project", id: project.id, [field]: value }); await load(); }
    catch (error) { alert(error.message); renderProjects(); }
  }

  function renderCosts() {
    var target = document.getElementById("ops-costs");
    if (!state.costs.length) { target.innerHTML = '<div class="ops-empty">No project costs recorded.</div>'; return; }
    target.innerHTML = '<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Project</th><th>Cost</th><th>Vendor</th><th>Status</th><th class="num">Budget</th><th class="num">Committed</th><th class="num">Actual</th><th></th></tr></thead><tbody>' + state.costs.map(function (c) {
      var project = findProject(c.project_id);
      return '<tr><td>' + html(project ? project.customer_name : c.project_id) + '</td><td><strong>' + html(c.description) + '</strong><div class="muted">' + html(c.category) + '</div></td><td>' + html(c.vendor || "—") + '</td><td><span class="ops-pill ' + esc(c.status) + '">' + html(c.status) + '</span></td><td class="amount">' + money(c.budget_cents) + '</td><td class="amount">' + money(c.committed_cents) + '</td><td class="amount">' + money(c.actual_cents) + '</td><td><div class="row-actions">' + (c.status !== "paid" ? '<button type="button" data-cost-paid="' + esc(c.id) + '">Mark paid</button>' : '') + '<button type="button" class="danger" data-cost-delete="' + esc(c.id) + '">Delete</button></div></td></tr>';
    }).join("") + '</tbody></table></div>';
  }

  async function costAction(event) {
    var paid = event.target.closest("[data-cost-paid]"); var remove = event.target.closest("[data-cost-delete]");
    try {
      if (paid) {
        var cost = state.costs.find(function (c) { return c.id === paid.getAttribute("data-cost-paid"); });
        var suggested = fromCents(cost.actual_cents || cost.committed_cents || cost.budget_cents);
        var amount = prompt("Actual amount paid (PHP)", suggested); if (amount == null) return;
        await request("PATCH", { resource: "cost", id: cost.id, status: "paid", actual_cents: toCents(amount) });
      }
      if (remove) { if (!confirm("Delete this cost and its linked finance entry?")) return; await request("DELETE", { resource: "cost", id: remove.getAttribute("data-cost-delete") }); }
      await load();
    } catch (error) { alert(error.message); }
  }

  function renderPayments() {
    var target = document.getElementById("ops-payments");
    if (!state.payments.length) { target.innerHTML = '<div class="ops-empty">No customer payments recorded.</div>'; return; }
    target.innerHTML = '<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Date</th><th>Project</th><th>Type</th><th>Status</th><th>Reference</th><th class="num">Amount</th><th></th></tr></thead><tbody>' + state.payments.map(function (p) {
      var project = findProject(p.project_id);
      return '<tr><td>' + html(p.payment_date) + '</td><td>' + html(project ? project.customer_name : p.project_id) + '</td><td>' + html(label(p.kind)) + '</td><td><span class="ops-pill ' + esc(p.status) + '">' + html(p.status) + '</span></td><td>' + html(p.reference || "—") + '</td><td class="amount">' + money(p.amount_cents) + '</td><td><div class="row-actions">' + (p.status !== "received" ? '<button type="button" data-payment-received="' + esc(p.id) + '">Mark received</button>' : '') + '<button type="button" class="danger" data-payment-delete="' + esc(p.id) + '">Delete</button></div></td></tr>';
    }).join("") + '</tbody></table></div>';
  }

  async function paymentAction(event) {
    var received = event.target.closest("[data-payment-received]"); var remove = event.target.closest("[data-payment-delete]");
    try {
      if (received) await request("PATCH", { resource: "payment", id: received.getAttribute("data-payment-received"), status: "received" });
      if (remove) { if (!confirm("Delete this payment and its linked finance entry?")) return; await request("DELETE", { resource: "payment", id: remove.getAttribute("data-payment-delete") }); }
      await load();
    } catch (error) { alert(error.message); }
  }

  function renderInstallers() {
    var target = document.getElementById("ops-installers");
    if (!state.installers.length) { target.innerHTML = '<div class="ops-empty">No installers added yet.</div>'; return; }
    target.innerHTML = '<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Rate</th><th>Licence / expiry</th><th>Status</th></tr></thead><tbody>' + state.installers.map(function (i) {
      var expiry = i.license_expiry ? i.license_expiry : "No expiry recorded";
      return '<tr><td><strong>' + html(i.name) + '</strong></td><td>' + html(i.role) + '</td><td>' + html(i.phone || "—") + '</td><td class="amount">' + money(i.rate_cents) + ' / ' + html(i.rate_type) + '</td><td>' + html(i.license_number || "Not recorded") + '<div class="muted">' + html(expiry) + '</div></td><td><span class="ops-pill ' + (i.active ? "paid" : "cancelled") + '">' + (i.active ? "Active" : "Inactive") + '</span></td></tr>';
    }).join("") + '</tbody></table></div>';
  }

  function renderAssignments() {
    var target = document.getElementById("ops-assignments");
    if (!state.assignments.length) { target.innerHTML = '<div class="ops-empty">No crew assignments yet.</div>'; return; }
    target.innerHTML = state.assignments.map(function (a) {
      return '<article class="ops-list-item" data-assignment="' + esc(a.id) + '"><strong>' + html(a.installer_name + " · " + a.customer_name) + '</strong><small>' + html(a.work_date + " · " + (a.hours || 0) + " hours · " + (a.days || 0) + " days") + '</small>' +
        '<div class="line"><span>Agreed payout</span><b>' + money(a.agreed_cents) + '</b></div><div class="ops-card-actions"><label>Status<select data-assignment-field="status">' + ["scheduled", "completed", "approved", "paid"].map(function (s) { return '<option value="' + s + '" ' + (a.status === s ? "selected" : "") + '>' + label(s) + '</option>'; }).join("") + '</select></label>' +
        '<label>QC<select data-assignment-field="qc_status">' + ["pending", "passed", "rework"].map(function (s) { return '<option value="' + s + '" ' + (a.qc_status === s ? "selected" : "") + '>' + label(s) + '</option>'; }).join("") + '</select></label>' +
        '<label style="display:flex;flex-direction:row;align-items:center;gap:7px"><input type="checkbox" data-assignment-field="safety_checked" style="width:auto" ' + (a.safety_checked ? "checked" : "") + '> Safety/PPE</label><button type="button" class="danger" data-assignment-delete="' + esc(a.id) + '">Delete</button></div></article>';
    }).join("");
  }

  async function assignmentChange(event) {
    var field = event.target.getAttribute("data-assignment-field"); if (!field) return;
    var card = event.target.closest("[data-assignment]"); var value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    try { await request("PATCH", { resource: "assignment", id: card.getAttribute("data-assignment"), [field]: value }); await load(); }
    catch (error) { alert(error.message); await load(); }
  }

  async function assignmentAction(event) {
    var remove = event.target.closest("[data-assignment-delete]"); if (!remove) return;
    if (!confirm("Delete this field assignment and any linked payout?")) return;
    try { await request("DELETE", { resource: "assignment", id: remove.getAttribute("data-assignment-delete") }); await load(); }
    catch (error) { alert(error.message); }
  }

  async function submitForm(event) {
    event.preventDefault(); var form = event.currentTarget; var data = new FormData(form); var body;
    if (form.id === "project-form") body = { resource: "project", lead_id: data.get("lead_id"), customer_name: data.get("customer_name"), phone: data.get("phone"), package: data.get("package"), contract_price_cents: toCents(data.get("contract_price")), target_cost_cents: toCents(data.get("target_cost")), owner: data.get("owner"), survey_date: data.get("survey_date"), site_address: data.get("site_address"), notes: data.get("notes"), stage: "survey" };
    if (form.id === "cost-form") body = { resource: "cost", project_id: data.get("project_id"), category: data.get("category"), description: data.get("description"), vendor: data.get("vendor"), status: data.get("status"), budget_cents: toCents(data.get("budget")), committed_cents: toCents(data.get("committed")), actual_cents: toCents(data.get("actual")) };
    if (form.id === "payment-form") body = { resource: "payment", project_id: data.get("project_id"), payment_date: data.get("payment_date"), kind: data.get("kind"), amount_cents: toCents(data.get("amount")), status: data.get("status"), reference: data.get("reference") };
    if (form.id === "installer-form") body = { resource: "installer", name: data.get("name"), role: data.get("role"), phone: data.get("phone"), rate_type: data.get("rate_type"), rate_cents: toCents(data.get("rate")), license_number: data.get("license_number"), license_expiry: data.get("license_expiry"), notes: data.get("notes") };
    if (form.id === "assignment-form") body = { resource: "assignment", project_id: data.get("project_id"), installer_id: data.get("installer_id"), work_date: data.get("work_date"), status: data.get("status"), hours: data.get("hours"), days: data.get("days"), agreed_cents: toCents(data.get("agreed")), qc_status: data.get("qc_status"), safety_checked: data.get("safety_checked") === "on", notes: data.get("notes") };
    try {
      await request("POST", body); var selectedProject = data.get("project_id"); form.reset();
      if (form.id === "payment-form" || form.id === "assignment-form") form.elements[form.id === "payment-form" ? "payment_date" : "work_date"].value = today();
      await load(); if (selectedProject) chooseProject(selectedProject);
    } catch (error) { alert(error.message); }
  }

  function chooseProject(id) { document.querySelectorAll("[data-project-select]").forEach(function (select) { select.value = id; }); }
  function findProject(id) { return state.projects.find(function (p) { return p.id === id; }); }
  function forecastCost(cost) { return num(cost.actual_cents) || num(cost.committed_cents) || num(cost.budget_cents); }
  function selectTab(name) { document.querySelectorAll("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === name)); }); document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function request(method, body) { var response = await fetch(apiUrl, { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }); if (response.status === 401) return redirectLogin(); var data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || "Install Operations request failed."); return data; }
  function redirectLogin() { location.href = "/login.html?next=" + encodeURIComponent(location.pathname); }
  function status(message, bad) { var node = document.getElementById("ops-status"); node.textContent = message; node.style.color = bad ? "#b42318" : ""; }
  function text(id, value) { document.getElementById(id).textContent = value; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function num(value) { return Number(value) || 0; }
  function toCents(value) { return Math.round((Number(value) || 0) * 100); }
  function fromCents(value) { return (num(value) / 100).toFixed(2); }
  function money(cents) { var sign = num(cents) < 0 ? "−" : ""; return sign + "₱" + (Math.abs(num(cents)) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function label(value) { return String(value || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function html(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function esc(value) { return html(value).replace(/`/g, "&#96;"); }
})();
