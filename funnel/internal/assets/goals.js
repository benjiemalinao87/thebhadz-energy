/**
 * Goals — countable founder outcomes (leads / deposits / surveys / sold / manual).
 * SPA-safe: init immediately, bail if #gl-app is missing.
 */
(function () {
  "use strict";

  var root = document.getElementById("gl-app");
  var form = document.getElementById("gl-form");
  var dialog = document.getElementById("gl-dialog");
  if (!root || !form || !dialog) return;

  var API = "/api/goals";
  var LANES = ["Backlog", "This week", "Doing", "Done", "Missed"];
  var METRIC_LABEL = {
    leads: "New leads", sold: "Sold leads", deposits: "Deposits",
    surveys: "Surveys", manual: "Manual"
  };

  var state = { goals: [], people: [], view: "board", editing: null };

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Manila, not UTC — before 08:00 PHT those are different days. See ph-date.js.
  function today() { return window.phToday(); }
  function fmt(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00Z");
    if (isNaN(d)) return "—";
    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()] + " " + d.getUTCDate();
  }

  function toast(kind, msg) {
    var host = document.getElementById("gl-toasts");
    if (!host) return;
    var node = document.createElement("div");
    node.className = "gl-toast" + (kind === "bad" ? " bad" : "");
    node.textContent = msg;
    host.appendChild(node);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 4200);
  }

  function send(method, body) {
    return fetch(API, {
      method: method, credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401) { location.href = "/login.html"; return null; }
        if (!r.ok || !d.ok) throw new Error(d.error || "Request failed.");
        return d;
      });
    });
  }

  function fillPeople(selected) {
    var sel = form.elements.assignee_user_id;
    var html = '<option value="">— unassigned —</option>';
    state.people.forEach(function (p) {
      html += '<option value="' + esc(p.id) + '"' +
        (String(selected) === String(p.id) ? " selected" : "") + ">" +
        esc(p.name || p.email) + "</option>";
    });
    sel.innerHTML = html;
  }

  function toggleManual() {
    var manual = form.elements.metric.value === "manual";
    form.querySelector(".gl-manual").hidden = !manual;
  }

  function openDialog(goal) {
    state.editing = goal || null;
    form.reset();
    form.elements.id.value = goal ? goal.id : "";
    document.getElementById("gl-dialog-title").textContent = goal ? "Edit goal" : "New goal";
    document.getElementById("gl-delete").hidden = !goal;
    if (goal) {
      form.elements.title.value = goal.title || "";
      form.elements.metric.value = goal.metric || "leads";
      form.elements.target.value = goal.target || 1;
      form.elements.start_date.value = goal.start_date || "";
      form.elements.end_date.value = goal.end_date || "";
      form.elements.status.value = goal.status || "Backlog";
      form.elements.current_manual.value = goal.current_manual || 0;
      form.elements.notes.value = goal.notes || "";
      fillPeople(goal.assignee_user_id);
    } else {
      var t = today();
      form.elements.metric.value = "leads";
      form.elements.target.value = 2;
      form.elements.start_date.value = t;
      form.elements.end_date.value = t;
      form.elements.status.value = "This week";
      fillPeople("");
    }
    toggleManual();
    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
    state.editing = null;
  }

  function cardHtml(g) {
    var urg = g.urgency || "ok";
    var left = g.days_left;
    var due = left === null ? ""
      : left < 0 ? Math.abs(left) + "d overdue"
      : left === 0 ? "due today"
      : left + "d left";
    return '<button type="button" class="gl-card ' + urg + '" data-id="' + esc(g.id) + '">' +
      '<div class="gl-meta"><span class="gl-chip metric">' + esc(METRIC_LABEL[g.metric] || g.metric) + "</span>" +
      (due ? '<span>' + esc(due) + "</span>" : "") + "</div>" +
      "<h4>" + esc(g.title) + "</h4>" +
      '<div class="gl-bar"><i class="' + urg + '" style="width:' + (g.pct || 0) + '%"></i></div>' +
      '<div class="gl-meta"><span class="gl-prog">' + (g.current || 0) + " / " + (g.target || 1) +
      " · " + (g.pct || 0) + "%</span>" +
      (g.assignee_name ? "<span>" + esc(g.assignee_name) + "</span>" : "<span>Unassigned</span>") +
      "</div></button>";
  }

  function renderKpis() {
    var active = state.goals.filter(function (g) { return g.status !== "Done" && g.status !== "Missed"; });
    var hit = state.goals.filter(function (g) { return g.urgency === "hit" || g.status === "Done"; }).length;
    var risk = active.filter(function (g) { return g.urgency === "risk"; }).length;
    var miss = state.goals.filter(function (g) { return g.urgency === "miss" || g.status === "Missed"; }).length;
    var onTrack = active.length
      ? Math.round(active.filter(function (g) { return g.urgency === "ok" || g.urgency === "hit"; }).length / active.length * 100)
      : 0;
    document.getElementById("gl-kpis").innerHTML =
      '<div class="gl-kpi"><span>Active</span><b>' + active.length + "</b><small>Open goals</small></div>" +
      '<div class="gl-kpi hit"><span>Hit</span><b>' + hit + "</b><small>Target reached or Done</small></div>" +
      '<div class="gl-kpi risk"><span>At risk</span><b>' + risk + "</b><small>Behind pace / near end</small></div>" +
      '<div class="gl-kpi' + (miss ? " miss" : "") + '"><span>On track</span><b>' + onTrack +
      "%</b><small>" + miss + " missed</small></div>";
  }

  function renderBoard() {
    return '<div class="gl-board">' + LANES.map(function (lane) {
      var items = state.goals.filter(function (g) { return g.status === lane; });
      return '<section class="gl-col"><header class="gl-col-head"><h3>' + esc(lane) +
        '</h3><span class="n">' + items.length + "</span></header>" +
        '<div class="gl-col-body">' +
        (items.length ? items.map(cardHtml).join("") : '<div class="gl-empty">Nothing here</div>') +
        "</div></section>";
    }).join("") + "</div>";
  }

  function renderTimeline() {
    if (!state.goals.length) {
      return '<div class="gl-blank"><h3>No goals yet</h3><p>Set a countable outcome with a start and end date.</p></div>';
    }
    var starts = state.goals.map(function (g) { return g.start_date; }).sort();
    var ends = state.goals.map(function (g) { return g.end_date; }).sort();
    var min = starts[0];
    var max = ends[ends.length - 1];
    var span = Math.max(1, (new Date(max + "T00:00:00Z") - new Date(min + "T00:00:00Z")) / 86400000);

    function leftPct(iso) {
      var d = (new Date(iso + "T00:00:00Z") - new Date(min + "T00:00:00Z")) / 86400000;
      return Math.max(0, Math.min(100, (d / span) * 100));
    }
    function widthPct(g) {
      var d = (new Date(g.end_date + "T00:00:00Z") - new Date(g.start_date + "T00:00:00Z")) / 86400000;
      return Math.max(4, Math.min(100 - leftPct(g.start_date), (Math.max(1, d) / span) * 100));
    }

    return '<div class="gl-tl">' + state.goals.map(function (g) {
      return '<div class="gl-tl-row">' +
        '<div class="gl-tl-label" data-id="' + esc(g.id) + '"><b>' + esc(g.title) + "</b>" +
        "<span>" + esc(METRIC_LABEL[g.metric] || g.metric) + " · " + (g.current || 0) + "/" + (g.target || 1) + "</span></div>" +
        '<div class="gl-tl-track"><div class="gl-tl-bar ' + (g.urgency || "ok") + '" data-id="' + esc(g.id) +
        '" style="left:' + leftPct(g.start_date) + "%;width:" + widthPct(g) + '%">' +
        esc(fmt(g.start_date)) + " → " + esc(fmt(g.end_date)) + "</div></div></div>";
    }).join("") + "</div>";
  }

  function render() {
    renderKpis();
    Array.prototype.forEach.call(document.querySelectorAll(".gl-views [data-view]"), function (btn) {
      btn.setAttribute("aria-selected", btn.getAttribute("data-view") === state.view ? "true" : "false");
    });
    if (!state.goals.length) {
      root.innerHTML = '<div class="gl-blank"><h3>No goals yet</h3>' +
        "<p>Set something countable — e.g. generate 2 leads or bank 2 deposits — with a timeline and an owner.</p>" +
        '<button type="button" class="gl-btn primary" data-act="new">New goal</button></div>';
      return;
    }
    root.innerHTML = state.view === "timeline" ? renderTimeline() : renderBoard();
  }

  function load() {
    return fetch(API, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) {
        if (r.status === 401) { location.href = "/login.html"; return null; }
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || "Could not load goals.");
        state.goals = d.goals || [];
        state.people = d.people || [];
        render();
      })
      .catch(function (err) {
        root.innerHTML = '<div class="gl-blank"><h3>Could not load goals</h3><p>' +
          esc(err.message) + "</p></div>";
      });
  }

  document.getElementById("gl-new").addEventListener("click", function () { openDialog(null); });
  document.getElementById("gl-dialog-close").addEventListener("click", closeDialog);
  form.elements.metric.addEventListener("change", toggleManual);

  document.querySelector(".gl-views").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-view]");
    if (!btn) return;
    state.view = btn.getAttribute("data-view");
    render();
  });

  root.addEventListener("click", function (e) {
    if (e.target.closest("[data-act='new']")) { openDialog(null); return; }
    var card = e.target.closest("[data-id]");
    if (!card) return;
    var g = state.goals.filter(function (x) { return x.id === card.getAttribute("data-id"); })[0];
    if (g) openDialog(g);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = form.elements.id.value;
    var body = {
      title: form.elements.title.value.trim(),
      metric: form.elements.metric.value,
      target: Number(form.elements.target.value) || 1,
      start_date: form.elements.start_date.value,
      end_date: form.elements.end_date.value,
      status: form.elements.status.value,
      current_manual: Number(form.elements.current_manual.value) || 0,
      notes: form.elements.notes.value.trim(),
      assignee_user_id: form.elements.assignee_user_id.value
        ? Number(form.elements.assignee_user_id.value) : null
    };
    var req = id
      ? send("PATCH", Object.assign({ id: id }, body))
      : send("POST", body);
    req.then(function (d) {
      if (!d) return;
      toast("ok", id ? "Goal updated" : "Goal created");
      closeDialog();
      return load();
    }).catch(function (err) { toast("bad", err.message); });
  });

  document.getElementById("gl-delete").addEventListener("click", function () {
    var id = form.elements.id.value;
    if (!id) return;
    if (!confirm("Delete this goal? This cannot be undone.")) return;
    send("DELETE", { id: id }).then(function (d) {
      if (!d) return;
      toast("ok", "Goal deleted");
      closeDialog();
      return load();
    }).catch(function (err) { toast("bad", err.message); });
  });

  load();
})();
