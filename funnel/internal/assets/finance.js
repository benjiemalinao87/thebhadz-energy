(function () {
  "use strict";

  var apiUrl = "/api/finance";
  var receiptUrl = "/api/finance-receipt";
  // Kinds whose cash direction is unambiguous; refund/other/opening_balance stay manual.
  var DIRECTION_BY_KIND = { founder_contribution: "inflow", customer_payment: "inflow", expense: "outflow", installer_payment: "outflow" };
  var state = { transactions: [], summary: {}, settings: {}, projects: [] };
  var form = document.getElementById("fin-form");
  var dialog = document.getElementById("fin-dialog");
  if (!form || !dialog) return;

  var kind = form.elements.kind;
  kind.addEventListener("change", toggleFounderFields);
  form.addEventListener("submit", saveTransaction);
  document.getElementById("fin-add").addEventListener("click", openCreate);
  document.getElementById("fin-cancel").addEventListener("click", closeDialog);
  document.getElementById("fin-dialog-close").addEventListener("click", closeDialog);
  dialog.addEventListener("cancel", function () { resetForm(); });
  // Drawer parity with Jobs and Install ops: a click on the dimmed page (::backdrop
  // clicks land on the <dialog> with coordinates outside its box) dismisses it.
  dialog.addEventListener("click", function (e) {
    if (e.target !== dialog) return;
    var r = dialog.getBoundingClientRect();
    var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside && dialog.open) closeDialog();
  });
  document.getElementById("fin-filter").addEventListener("change", renderLedger);
  document.getElementById("fin-export").addEventListener("click", exportCsv);
  document.getElementById("fin-save-settings").addEventListener("click", saveSettings);
  document.getElementById("fin-ledger").addEventListener("click", ledgerAction);
  document.querySelectorAll("[data-tab]").forEach(function (button) {
    button.addEventListener("click", function () { selectTab(button.getAttribute("data-tab")); });
  });
  form.elements.txn_date.value = today();
  load();

  async function load() {
    try {
      var responses = await Promise.all([
        fetch(apiUrl, { credentials: "same-origin", headers: { Accept: "application/json" } }),
        fetch("/api/install-ops", { credentials: "same-origin", headers: { Accept: "application/json" } })
      ]);
      if (responses[0].status === 401) return redirectLogin();
      var finance = await responses[0].json();
      if (!responses[0].ok || !finance.ok) throw new Error(finance.error || "Could not load finance ledger.");
      state.transactions = finance.transactions || [];
      state.summary = finance.summary || {};
      state.settings = finance.settings || {};
      if (responses[1].ok) {
        var operations = await responses[1].json();
        if (operations.ok) state.projects = operations.projects || [];
      }
      document.getElementById("fin-install-cash").value = fromCents(state.settings.cash_required_per_install || 0) || "";
      render();
      status("Shared D1 ledger · " + state.transactions.length + " transaction" + (state.transactions.length === 1 ? "" : "s"));
    } catch (error) { status(error.message, true); }
  }

  function render() {
    renderMetrics(); renderProjects(); renderLedger(); renderFunding();
    document.getElementById("fin-onboarding").hidden = state.transactions.length > 0;
  }

  function renderMetrics() {
    var s = state.summary;
    var cash = num(s.paid_inflows) - num(s.paid_outflows);
    var committed = num(s.committed_outflows);
    var available = cash - committed;
    var burn = num(s.burn_30d);
    text("fin-cash", money(cash)); text("fin-committed", money(committed)); text("fin-available", money(available)); text("fin-burn", money(burn));
    text("fin-runway", burn > 0 ? Math.max(0, available / burn).toFixed(1) + " mo" : "Not enough data");
    var required = num(state.settings.cash_required_per_install);
    text("fin-installs", required > 0 ? Math.max(0, Math.floor(available / required)) + " installs" : "Set cost");
  }

  function renderProjects() {
    var select = document.getElementById("fin-project");
    var current = select.value;
    select.innerHTML = '<option value="">Not linked to a project</option>' + state.projects.map(function (project) {
      return '<option value="' + esc(project.id) + '">' + html(project.customer_name + " · " + project.package) + "</option>";
    }).join("");
    select.value = current;
  }

  function renderLedger() {
    var filter = document.getElementById("fin-filter").value;
    var rows = state.transactions.filter(function (transaction) {
      return filter === "all" || transaction.status === filter || transaction.direction === filter;
    });
    var target = document.getElementById("fin-ledger");
    if (!rows.length) { target.innerHTML = '<div class="ops-empty">No matching transactions yet.</div>'; return; }
    target.innerHTML = '<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Date</th><th>Type</th><th>Category / counterparty</th><th>Status</th><th>Project</th><th>Receipt</th><th class="num">Money in</th><th class="num">Money out</th><th></th></tr></thead><tbody>' +
      rows.map(function (t) {
        var project = state.projects.find(function (item) { return item.id === t.project_id; });
        return '<tr><td>' + html(t.txn_date) + '</td><td>' + html(label(t.kind)) + (t.founder ? '<div class="muted">' + html(t.founder + " · " + label(t.contribution_type)) + '</div>' : '') +
          '</td><td><strong>' + html(t.category) + '</strong><div class="muted">' + html(t.counterparty || t.reference || "—") + '</div></td>' +
          '<td><span class="ops-pill ' + esc(t.status) + '">' + html(t.status) + '</span></td><td>' + html(project ? project.customer_name : (t.project_id || "—")) + '</td>' +
          '<td>' + (t.receipt_key ? '<a href="' + receiptUrl + '?key=' + encodeURIComponent(t.receipt_key) + '" target="_blank" rel="noopener">View</a>' : '—') + '</td>' +
          '<td class="amount">' + (t.direction === "inflow" ? money(t.amount_cents) : "—") + '</td><td class="amount">' + (t.direction === "outflow" ? money(t.amount_cents) : "—") + '</td>' +
          '<td>' + (t.managed_by_install_ops ? '<span class="muted">Managed in SC-10</span>' : '<div class="row-actions"><button type="button" class="secondary" data-edit="' + esc(t.id) + '">Edit</button><button type="button" class="danger" data-delete="' + esc(t.id) + '">Delete</button></div>') + '</td></tr>';
      }).join("") + '</tbody></table></div>';
  }

  function renderFunding() {
    var founders = ["Benjie", "Jundhel", "Jethro", "Denver"];
    var funding = state.transactions.filter(function (t) { return t.kind === "founder_contribution" && t.status === "paid"; });
    document.getElementById("fin-funding").innerHTML = '<div class="ops-metrics" style="grid-template-columns:repeat(4,1fr)">' + founders.map(function (founder) {
      var rows = funding.filter(function (t) { return t.founder === founder; });
      var total = rows.reduce(function (sum, t) { return sum + num(t.amount_cents); }, 0);
      var classes = ["capital", "founder_loan", "reimbursable"].map(function (type) {
        var amount = rows.filter(function (t) { return t.contribution_type === type; }).reduce(function (sum, t) { return sum + num(t.amount_cents); }, 0);
        return '<small>' + html(label(type)) + ': ' + money(amount) + '</small>';
      }).join("");
      return '<div class="ops-metric"><span>' + html(founder) + '</span><strong>' + money(total) + '</strong>' + classes + '</div>';
    }).join("") + '</div>';
  }

  async function saveTransaction(event) {
    event.preventDefault();
    var data = new FormData(form);
    var receiptKey = form.dataset.receiptKey || "";
    var file = data.get("receipt");
    try {
      if (file && file.size) {
        document.getElementById("fin-receipt-note").textContent = "Uploading…";
        var upload = new FormData(); upload.append("file", file);
        var uploadResponse = await fetch(receiptUrl, { method: "POST", credentials: "same-origin", body: upload });
        var uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.ok) throw new Error(uploadData.error || "Receipt upload failed.");
        receiptKey = uploadData.key;
      }
      // A disabled select is excluded from FormData, so a locked direction comes from the map.
      var body = {
        id: data.get("id") || undefined, txn_date: data.get("txn_date"),
        direction: DIRECTION_BY_KIND[data.get("kind")] || data.get("direction"),
        kind: data.get("kind"), status: data.get("status"), amount_cents: toCents(data.get("amount")),
        category: data.get("category"), account: data.get("account"), counterparty: data.get("counterparty"),
        founder: data.get("founder"), contribution_type: data.get("contribution_type"),
        project_id: data.get("project_id"), reference: data.get("reference"), receipt_key: receiptKey,
        notes: data.get("notes")
      };
      var method = body.id ? "PATCH" : "POST";
      await request(method, body);
      closeDialog(); await load();
    } catch (error) { alert(error.message || "Could not save transaction."); }
    document.getElementById("fin-receipt-note").textContent = "Optional · max 10 MB";
  }

  async function saveSettings() {
    var amount = toCents(document.getElementById("fin-install-cash").value || 0);
    await request("PATCH", { resource: "settings", cash_required_per_install_cents: amount });
    await load();
  }

  async function ledgerAction(event) {
    var edit = event.target.closest("[data-edit]");
    var remove = event.target.closest("[data-delete]");
    if (edit) return editTransaction(edit.getAttribute("data-edit"));
    if (!remove) return;
    if (!confirm("Delete this ledger entry? This cannot be undone.")) return;
    try { await request("DELETE", { id: remove.getAttribute("data-delete") }); await load(); }
    catch (error) { alert(error.message); }
  }

  function openCreate() {
    resetForm();
    document.getElementById("fin-dialog-title").textContent = "Add a transaction";
    if (!dialog.open) dialog.showModal();
  }

  function editTransaction(id) {
    var t = state.transactions.find(function (item) { return item.id === id; });
    if (!t) return;
    Object.keys(t).forEach(function (key) { if (form.elements[key]) form.elements[key].value = t[key] == null ? "" : t[key]; });
    form.elements.amount.value = fromCents(t.amount_cents);
    form.dataset.receiptKey = t.receipt_key || "";
    document.getElementById("fin-submit").textContent = "Update transaction";
    document.getElementById("fin-dialog-title").textContent = "Edit transaction";
    toggleFounderFields();
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
    resetForm();
  }

  function resetForm() {
    form.reset(); form.elements.txn_date.value = today(); form.dataset.receiptKey = "";
    document.getElementById("fin-submit").textContent = "Save transaction";
    document.getElementById("fin-dialog-title").textContent = "Add a transaction";
    toggleFounderFields();
  }

  function toggleFounderFields() {
    var show = kind.value === "founder_contribution";
    document.querySelectorAll("[data-founder-field]").forEach(function (node) { node.hidden = !show; });
    var forced = DIRECTION_BY_KIND[kind.value];
    if (forced) form.elements.direction.value = forced;
    form.elements.direction.disabled = Boolean(forced);
  }

  function selectTab(name) {
    document.querySelectorAll("[data-tab]").forEach(function (button) { button.setAttribute("aria-selected", String(button.getAttribute("data-tab") === name)); });
    document.querySelectorAll("[data-panel]").forEach(function (panel) { panel.hidden = panel.getAttribute("data-panel") !== name; });
  }

  async function request(method, body) {
    var response = await fetch(apiUrl, { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    if (response.status === 401) return redirectLogin();
    var data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Finance request failed.");
    return data;
  }

  function exportCsv() {
    var headers = ["Date", "Direction", "Status", "Type", "Category", "Account", "Amount PHP", "Counterparty", "Founder", "Contribution classification", "Project ID", "Reference", "Receipt key", "Notes"];
    var rows = state.transactions.map(function (t) { return [t.txn_date, t.direction, t.status, t.kind, t.category, t.account, fromCents(t.amount_cents), t.counterparty, t.founder, t.contribution_type, t.project_id, t.reference, t.receipt_key, t.notes]; });
    var csv = [headers].concat(rows).map(function (row) { return row.map(csvCell).join(","); }).join("\r\n");
    var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "macc-finance-ledger-" + today() + ".csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  function redirectLogin() { location.href = "/login.html?next=" + encodeURIComponent(location.pathname); }
  function status(message, bad) { var node = document.getElementById("fin-status"); node.textContent = message; node.style.color = bad ? "#b42318" : ""; }
  function text(id, value) { document.getElementById(id).textContent = value; }
  // Manila, not UTC — before 08:00 PHT those are different days. See ph-date.js.
  function today() { return window.phToday(); }
  function num(value) { return Number(value) || 0; }
  function toCents(value) { return Math.round((Number(value) || 0) * 100); }
  function fromCents(value) { return (num(value) / 100).toFixed(2); }
  function money(cents) { var sign = num(cents) < 0 ? "−" : ""; return sign + "₱" + (Math.abs(num(cents)) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function label(value) { return String(value || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function html(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function esc(value) { return html(value).replace(/`/g, "&#96;"); }
  function csvCell(value) { return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"'; }
})();
