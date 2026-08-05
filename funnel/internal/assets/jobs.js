/**
 * SC-07 Jobs workspace — funnel/internal/projects.html
 *
 * Two halves of one page:
 *   Jobs      — one record per installation, read/written through /api/jobs. Board, list,
 *               schedule and crew are four views of the same loaded rows, so switching
 *               never costs a round trip. Clicking a job opens a drawer that fetches its
 *               detail bundle (tasks, costs, payments, crew, stage history, audit trail).
 *   Company   — the Founder OS Traction/Product/Ops board, still on /api/projects, which
 *               now serves only tasks with no job_id. Job checklists are deliberately
 *               excluded from the traction gauge: ~30 rows per job would let it read
 *               near-100% while nobody is selling.
 *
 * Runs its init immediately rather than on DOMContentLoaded, and returns early when its
 * anchor element is absent — the Command Center SPA router re-creates and re-executes this
 * script on every view swap, and DOMContentLoaded only ever fires once (see spa-router.js).
 */
(function () {
  "use strict";

  var root = document.getElementById("jb-app");
  if (!root) return;

  var JOBS_API = "/api/jobs";
  var COMPANY_API = "/api/projects";

  /* ------------------------------------------------------------ vocabulary ---- */

  // Mirrors PHASES in functions/api/jobs.js. The server sends its own copy with every
  // list response and that copy wins, so the grouping can never drift between the two.
  var PHASES = [
    { key: "intake", label: "Survey & quote", stages: ["survey", "quoted"] },
    { key: "won", label: "Won", stages: ["approved", "deposit_paid"] },
    { key: "prep", label: "Design & permits", stages: ["design", "permits", "procurement"] },
    { key: "scheduled", label: "Scheduled", stages: ["scheduled"] },
    { key: "site", label: "On site", stages: ["installing", "testing"], gated: true },
    { key: "live", label: "Energized", stages: ["energized", "handover", "warranty"], gated: true }
  ];

  var STAGE_LABEL = {
    survey: "Survey", quoted: "Quoted", approved: "Approved", deposit_paid: "Deposit paid",
    design: "Design", permits: "Permits", procurement: "Procurement", scheduled: "Scheduled",
    installing: "Installing", testing: "Testing", energized: "Energized",
    handover: "Handover", warranty: "Warranty", cancelled: "Cancelled"
  };

  var GATES = [
    {
      key: "permit_checklist",
      label: "LGU / barangay permit filed",
      why: "Building or electrical permit lodged, with the receipt filed on this job."
    },
    {
      key: "licensed_electrician_check",
      label: "Licensed electrician sign-off",
      why: "A PEE or REE signed the single-line diagram and will supervise energizing."
    },
    {
      key: "net_metering_check",
      naKey: "net_metering_na",
      label: "Net-metering application",
      why: "Application lodged with the utility. Off-grid packages record this as N/A."
    }
  ];

  var ROLES = ["Tech", "Sales", "Admin", "PEE", "Ops", "Procurement"];
  var VIEWS = ["board", "list", "schedule", "crew", "company"];

  // Contact stages, as SC-14 names them. Shown against each name in the new-job picker so
  // an early-stage contact reads as "that person, not yet sold" rather than as a mystery.
  var LEAD_STAGE = {
    lead: "New lead", contacted: "Contacted", demoed: "Demoed",
    quote_sent: "Quote sent", proposal: "Proposal", sold: "Sold", lost: "Lost"
  };
  var LEAD_SELLING = ["sold", "proposal", "quote_sent", "demoed"];

  var state = {
    jobs: [], installers: [], leads: [], company: [], phases: PHASES, templateSize: 0,
    view: "board", query: "", loaded: false,
    openId: null, tab: "overview", detail: null, detailLoading: false,
    composing: false, pickedName: "", lastFocus: null
  };

  /* --------------------------------------------------------------- helpers ---- */

  function el(id) { return document.getElementById(id); }
  function num(value) { return Number(value) || 0; }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function shiftDate(iso, days) {
    var d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(from, to) {
    if (!from || !to) return 0;
    return Math.round((new Date(to + "T00:00:00Z") - new Date(from + "T00:00:00Z")) / 86400000);
  }

  function peso(cents) {
    var n = num(cents) / 100;
    return "₱" + n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
  }

  function pesoShort(cents) {
    var n = num(cents) / 100;
    if (n >= 1000000) return "₱" + (n / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
    if (n >= 1000) return "₱" + Math.round(n / 1000) + "k";
    return "₱" + Math.round(n);
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00Z");
    if (isNaN(d)) return "—";
    return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate();
  }
  function fmtStamp(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 10);
    return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function phaseOf(stage) {
    for (var i = 0; i < state.phases.length; i++) {
      if (state.phases[i].stages.indexOf(stage) >= 0) return state.phases[i];
    }
    return state.phases[0];
  }
  function findPhase(key) {
    return state.phases.filter(function (p) { return p.key === key; })[0] || null;
  }
  function findJob(id) {
    return state.jobs.filter(function (j) { return j.id === id; })[0] || null;
  }

  // "pass" | "na" | "fail" for one gate on one job.
  function gateState(job, gate) {
    if (gate.naKey && num(job[gate.naKey]) === 1) return "na";
    return num(job[gate.key]) === 1 ? "pass" : "fail";
  }
  function openGates(job) {
    return GATES.filter(function (g) { return gateState(job, g) === "fail"; });
  }
  function gatesClear(job) { return openGates(job).length === 0; }

  function isClosed(job) {
    return ["energized", "handover", "warranty", "cancelled"].indexOf(job.stage) >= 0;
  }

  function forecastCost(job) {
    // What the job is now expected to cost: real cost lines if any exist, else the target
    // cost the price was built against. Never a guess dressed as an actual.
    return num(job.cost_forecast_cents) || num(job.target_cost_cents);
  }
  function marginPct(job) {
    var contract = num(job.contract_price_cents);
    if (!contract) return null;
    var cost = forecastCost(job);
    if (!cost) return null;
    return Math.round((contract - cost) / contract * 100);
  }

  /**
   * Card colour from the job's real state. Deliberately no blanket green for energized
   * jobs: post-handover follow-through — the meter swap, the first-bill check-in — is
   * exactly the work that quietly rots, and a hardcoded green would disagree with the
   * overdue count in the strip above it.
   */
  function health(job) {
    if (job.stage === "cancelled") return "amber";
    var overdue = num(job.task_overdue);
    var toInstall = job.install_date ? daysBetween(today(), job.install_date) : null;
    if (toInstall !== null && toInstall >= 0 && toInstall <= 21 && !gatesClear(job)) return "rust";
    if (overdue >= 3) return "rust";
    var m = marginPct(job);
    if (overdue >= 1 || (m !== null && m < 22)) return "amber";
    return "green";
  }

  /* ------------------------------------------------------------------- api ---- */

  function redirectLogin() {
    location.href = "/login.html?next=" + encodeURIComponent(location.pathname);
  }

  function get(url) {
    return fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) {
        if (r.status === 401) { redirectLogin(); return null; }
        return r.json().then(function (d) {
          if (!r.ok || !d.ok) throw new Error(d.error || "Request failed.");
          return d;
        });
      });
  }

  /**
   * Writes resolve to the parsed body and reject with an Error carrying the response
   * status and any structured payload — the gate refusal (409) needs its `missing` list,
   * not just a message.
   */
  function send(method, body, url) {
    return fetch(url || JOBS_API, {
      method: method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (r.status === 401) { redirectLogin(); return null; }
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.ok) {
          var err = new Error(d.error || "Request failed.");
          err.status = r.status;
          err.payload = d;
          throw err;
        }
        return d;
      });
    });
  }

  /* ----------------------------------------------------------------- toasts --- */

  function toast(kind, head, body) {
    var host = el("jb-toasts");
    if (!host) return;
    var node = document.createElement("div");
    node.className = "jb-toast" + (kind === "bad" ? " bad" : "");
    node.innerHTML = '<span aria-hidden="true">' + (kind === "bad" ? "⛔" : "✓") + "</span>" +
      "<span><b>" + esc(head) + "</b>" + (body ? "<small>" + esc(body) + "</small>" : "") + "</span>";
    host.appendChild(node);
    setTimeout(function () {
      node.style.transition = "opacity .3s, transform .3s";
      node.style.opacity = "0";
      node.style.transform = "translateY(8px)";
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 320);
    }, 4600);
  }

  /* ------------------------------------------------------------------- load --- */

  function load() {
    return Promise.all([
      get(JOBS_API),
      // The company board is a separate section's data; if it is hidden for this account
      // the jobs half must still render, so a failure here is not fatal.
      get(COMPANY_API).catch(function () { return null; })
    ]).then(function (res) {
      var jobs = res[0];
      if (!jobs) return;
      state.jobs = jobs.jobs || [];
      state.installers = jobs.installers || [];
      state.leads = jobs.leads || [];
      state.phases = (jobs.phases && jobs.phases.length) ? jobs.phases : PHASES;
      state.templateSize = num(jobs.template_size);
      state.company = res[1] ? (res[1].tasks || []) : [];
      state.loaded = true;
      render();
    }).catch(function (err) {
      state.loaded = true;
      el("jb-views-host").hidden = true;
      root.innerHTML = '<div class="jb-empty"><h3>Could not load jobs</h3><p>' + esc(err.message) +
        "</p><button type=\"button\" class=\"jb-btn primary\" data-act=\"reload\">Try again</button></div>";
    });
  }

  function reloadJobs() {
    return get(JOBS_API).then(function (d) {
      if (!d) return;
      state.jobs = d.jobs || [];
      state.installers = d.installers || [];
      state.leads = d.leads || [];
      render();
    });
  }

  function reloadCompany() {
    return get(COMPANY_API).then(function (d) {
      if (!d) return;
      state.company = d.tasks || [];
      render();
    });
  }

  function deleteCompanyTask(id) {
    var task = state.company.filter(function (t) { return t.id === id; })[0];
    if (!task) return;
    if (!confirm('Delete company task "' + task.title + '"?\n\nThis cannot be undone.')) return;
    send("DELETE", { id: id }, COMPANY_API).then(function (d) {
      if (!d) return;
      toast("ok", "Company task deleted", task.title);
      return reloadCompany();
    }).catch(function (err) {
      toast("bad", "Could not delete the task", err.message);
    });
  }

  /* ------------------------------------------------------------------ views --- */

  function visibleJobs() {
    var q = state.query;
    if (!q) return state.jobs;
    return state.jobs.filter(function (j) {
      return [j.job_code, j.customer_name, j.site_address, j.package, j.owner, STAGE_LABEL[j.stage]]
        .join(" ").toLowerCase().indexOf(q) >= 0;
    });
  }

  function render() {
    renderMission();
    renderKpis();
    renderToolbar();
    if (!state.jobs.length && state.view !== "company") {
      root.innerHTML = emptyState();
      return;
    }
    if (state.view === "board") root.innerHTML = viewBoard();
    else if (state.view === "list") root.innerHTML = viewList();
    else if (state.view === "schedule") root.innerHTML = viewSchedule();
    else if (state.view === "crew") root.innerHTML = viewCrew();
    else root.innerHTML = viewCompany();
  }

  function emptyState() {
    return '<div class="jb-empty">' +
      "<h3>No jobs yet</h3>" +
      "<p>A job is one installation, from survey through warranty. Create one from a contact and it arrives with the standard " +
      (state.templateSize ? state.templateSize + "-task" : "install") +
      " checklist already dated off the install date.</p>" +
      '<button type="button" class="jb-btn primary" data-act="new-job">New job from contact</button>' +
      "</div>";
  }

  function renderKpis() {
    var host = el("jb-kpis");
    if (!host) return;
    var jobs = state.jobs;
    var live = jobs.filter(function (j) { return !isClosed(j); });
    var week = jobs.filter(function (j) {
      if (!j.install_date) return false;
      var d = daysBetween(today(), j.install_date);
      return d >= 0 && d <= 7;
    });
    // Only jobs that have actually been sold can be "blocked" — an unsold survey has no
    // gates to fail yet, and counting it would cry wolf on every new lead.
    var blocked = jobs.filter(function (j) {
      return !gatesClear(j) && ["survey", "quoted", "cancelled"].indexOf(j.stage) < 0;
    });
    // A cancelled job's unfinished tasks are moot, so they are not chased.
    var chased = jobs.filter(function (j) { return j.stage !== "cancelled"; });
    var overdue = chased.reduce(function (n, j) { return n + num(j.task_overdue); }, 0);
    var overdueJobs = chased.filter(function (j) { return num(j.task_overdue) > 0; }).length;
    var contract = jobs.reduce(function (n, j) {
      return n + (j.stage === "cancelled" ? 0 : num(j.contract_price_cents));
    }, 0);
    var cash = jobs.reduce(function (n, j) { return n + num(j.paid_cents); }, 0);

    var tiles = [
      { tone: "petrol", k: "Jobs in flight", v: live.length, s: "Not yet handed over" },
      {
        tone: "blue", k: "Installing this week", v: week.length,
        s: week.length ? week.map(function (j) { return firstName(j.customer_name); }).join(", ") : "Nothing on the calendar"
      },
      {
        tone: blocked.length ? "rust" : "green", k: "Gates blocking", v: blocked.length,
        s: blocked.length
          ? blocked.map(function (j) { return shortCode(j); }).join(", ") + " cannot go on site"
          : "All sold jobs cleared"
      },
      {
        tone: overdue ? "rust" : "green", k: "Overdue tasks", v: overdue,
        s: overdue ? "Across " + overdueJobs + (overdueJobs === 1 ? " job" : " jobs") : "Nothing overdue"
      },
      { tone: "amber", k: "Contract value", v: pesoShort(contract), s: "Signed and in pipeline" },
      { tone: "green", k: "Cash received", v: pesoShort(cash), s: "Deposits and progress payments" }
    ];

    host.innerHTML = tiles.map(function (t) {
      return '<div class="jb-kpi" data-tone="' + t.tone + '"><span>' + esc(t.k) + "</span>" +
        "<strong>" + esc(String(t.v)) + "</strong><small>" + esc(t.s) + "</small></div>";
    }).join("");
  }

  /**
   * The Mission counter: 5 paid installs energized by 2026-10-09 (Founder OS §0). Counted
   * from job rows, never typed in — an energized job is one that reached energized or
   * beyond, and a banked deposit is a received deposit payment. A job that is sold but not
   * yet energized shows as a part-filled dot, so the number can never read better than
   * the ledger does.
   */
  var MISSION_TARGET = 5;
  var MISSION_DATE = "2026-10-09";

  function renderMission() {
    var numNode = el("jb-mission-num");
    if (!numNode) return;
    var energized = state.jobs.filter(function (j) {
      return ["energized", "handover", "warranty"].indexOf(j.stage) >= 0;
    }).length;
    var banked = state.jobs.filter(function (j) {
      return num(j.deposit_cents) > 0 && ["energized", "handover", "warranty"].indexOf(j.stage) < 0;
    }).length;

    numNode.innerHTML = energized + ' <i>of ' + MISSION_TARGET + "</i>";
    var left = daysBetween(today(), MISSION_DATE);
    el("jb-mission-sub").textContent = "energized · " + banked + " deposit" + (banked === 1 ? "" : "s") +
      " banked · " + (left >= 0 ? left + " days left" : Math.abs(left) + " days past");

    var dots = [];
    for (var i = 0; i < MISSION_TARGET; i++) {
      dots.push(i < energized ? '<span class="on"></span>'
        : i < energized + banked ? '<span class="part"></span>'
        : "<span></span>");
    }
    el("jb-mission-dots").innerHTML = dots.join("");
  }

  function firstName(name) { return String(name || "").trim().split(/\s+/)[0] || "—"; }
  function shortCode(job) {
    var code = String(job.job_code || "");
    return code ? code.slice(code.lastIndexOf("-") + 1) : firstName(job.customer_name);
  }

  function renderToolbar() {
    var host = el("jb-views-host");
    if (!host) return;
    host.hidden = false;
    var counts = { board: visibleJobs().length, company: state.company.filter(function (t) { return t.status !== "Done"; }).length };
    Array.prototype.forEach.call(host.querySelectorAll("button[data-view]"), function (b) {
      var v = b.getAttribute("data-view");
      b.setAttribute("aria-selected", v === state.view ? "true" : "false");
      var badge = b.querySelector(".jb-count");
      if (badge && counts[v] !== undefined) badge.textContent = counts[v];
    });
  }

  /* ------------------------------------------------------------------ board --- */

  function gateDots(job) {
    return '<span class="jb-gates" title="Permit · Electrician · Net metering">' +
      GATES.map(function (g) { return '<i class="' + gateState(job, g) + '"></i>'; }).join("") + "</span>";
  }

  function crewChips(job) {
    var crew = job.crew || [];
    if (!crew.length) return '<span class="jb-crew"><span class="none" title="No crew assigned">+</span></span>';
    return '<span class="jb-crew">' + crew.slice(0, 4).map(function (c) {
      var pee = /electric|pee|ree/i.test(c.role || "");
      return '<span class="' + (pee ? "pee" : "") + '" title="' + esc(c.name + " · " + (c.role || "")) + '">' +
        esc(initials(c.name)) + "</span>";
    }).join("") + "</span>";
  }

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function jobCard(job) {
    var total = num(job.task_total);
    var done = num(job.task_done);
    var pct = total ? Math.round(done / total * 100) : 0;
    var late = job.install_date && job.install_date < today() && !isClosed(job);
    return '<button type="button" class="jb-card" data-job="' + esc(job.id) + '" draggable="true" data-health="' + health(job) + '">' +
      '<span class="jb-card-top">' +
        '<span class="jb-code">' + esc(job.job_code || "JOB —") + "</span>" +
        pkgChip(job.package) +
      "</span>" +
      "<span><h4>" + esc(job.customer_name) + "</h4>" +
      (job.site_address ? '<span class="jb-where">' + esc(job.site_address) + "</span>" : "") + "</span>" +
      '<span class="jb-card-meta">' +
        '<span class="jb-chip stage">' + esc(STAGE_LABEL[job.stage] || job.stage) + "</span>" +
        gateDots(job) + crewChips(job) +
      "</span>" +
      (total
        ? '<span class="jb-prog"><span class="track"><i style="width:' + pct + '%"></i></span><small>' + done + "/" + total + "</small></span>"
        : "") +
      '<span class="jb-card-foot">' +
        '<span class="jb-money">' + peso(job.contract_price_cents) + "</span>" +
        '<span class="jb-date' + (late ? " late" : "") + '">' +
          (job.install_date ? "install " + fmtDate(job.install_date) + (late ? " ⚑" : "") : "no install date") +
        "</span>" +
      "</span>" +
      "</button>";
  }

  function pkgChip(pkg) {
    var name = String(pkg || "Custom");
    var key = name.toLowerCase().split(/\s+/)[0];
    var known = ["liwanag", "ilaw", "sandigan"].indexOf(key) >= 0;
    return '<span class="jb-chip ' + (known ? "pkg-" + key : "stage") + '">' + esc(name) + "</span>";
  }

  function viewBoard() {
    var jobs = visibleJobs();
    return '<div class="jb-board" id="jb-board">' + state.phases.map(function (p) {
      // Cancelled is not a board column — phaseOf falls back to intake, which would
      // wrongly park cancelled jobs under Survey & quote.
      var mine = jobs.filter(function (j) {
        return j.stage !== "cancelled" && phaseOf(j.stage).key === p.key;
      });
      var sum = mine.reduce(function (n, j) { return n + num(j.contract_price_cents); }, 0);
      return '<section class="jb-col" data-phase="' + esc(p.key) + '">' +
        '<header class="jb-col-head"><h3>' + esc(p.label) + "</h3>" +
        (sum ? '<span class="jb-sum">' + pesoShort(sum) + "</span>" : "") +
        '<span class="jb-count">' + mine.length + "</span></header>" +
        '<div class="jb-col-body">' +
        (mine.length ? mine.map(jobCard).join("") : '<div class="jb-col-empty">Drop a job here</div>') +
        "</div></section>";
    }).join("") + "</div>";
  }

  /* ------------------------------------------------------------------- list --- */

  function viewList() {
    var rows = visibleJobs().map(function (j) {
      var m = marginPct(j);
      var overdue = num(j.task_overdue);
      return '<tr data-job="' + esc(j.id) + '">' +
        '<td><span class="jb-code">' + esc(j.job_code || "—") + "</span></td>" +
        "<td><b>" + esc(j.customer_name) + "</b>" +
          (j.site_address ? '<div class="sub">' + esc(j.site_address) + "</div>" : "") + "</td>" +
        "<td>" + pkgChip(j.package) + "</td>" +
        '<td><span class="jb-chip stage">' + esc(STAGE_LABEL[j.stage] || j.stage) + "</span></td>" +
        "<td>" + gateDots(j) + "</td>" +
        '<td class="num">' + (j.install_date ? fmtDate(j.install_date) : "—") + "</td>" +
        '<td class="num jb-peso">' + peso(j.contract_price_cents) + "</td>" +
        '<td class="num jb-peso">' + (forecastCost(j) ? peso(forecastCost(j)) : "—") + "</td>" +
        "<td>" + (m === null
          ? '<span class="sub">not costed</span>'
          : '<span class="jb-margin' + (m < 22 ? " thin" : "") + '"><span class="track"><i style="width:' +
            Math.max(4, Math.min(100, m * 2.6)) + '%"></i></span><b>' + m + "%</b></span>") + "</td>" +
        '<td class="num">' + (num(j.task_total) ? num(j.task_done) + "/" + num(j.task_total) : "—") +
          (overdue ? ' <span class="jb-chip bad">' + overdue + " late</span>" : "") + "</td>" +
        "<td>" + esc(j.owner || "—") + "</td>" +
        "</tr>";
    }).join("");

    return '<div class="jb-tablewrap"><table class="jb-table">' +
      "<thead><tr><th>Job</th><th>Customer &amp; site</th><th>Package</th><th>Stage</th><th>Gates</th>" +
      '<th class="num">Install</th><th class="num">Contract</th><th class="num">Forecast cost</th>' +
      '<th>Margin</th><th class="num">Tasks</th><th>Owner</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  /* --------------------------------------------------------------- schedule --- */

  var WEEKS = 8;

  function viewSchedule() {
    // Anchor the window to the Monday two weeks back, so work already under way stays
    // visible next to what is coming.
    var start = mondayOf(shiftDate(today(), -14));
    var span = WEEKS * 7;
    var jobs = visibleJobs().filter(function (j) { return j.install_date || j.survey_date; });

    var head = '<div class="jb-grow head"><div class="jb-gname"><span class="jb-lbl">Job</span></div>' +
      '<div class="jb-gtrack" style="grid-template-columns:repeat(' + WEEKS + ',1fr)">' +
      range(WEEKS).map(function (i) {
        return '<div class="jb-gcell">' + fmtDate(shiftDate(start, i * 7)) + "</div>";
      }).join("") + "</div></div>";

    var rows = jobs.map(function (j) {
      var bars = [];
      function bar(cls, from, to, label) {
        if (!from || !to) return;
        var a = daysBetween(start, from) / span * 100;
        var b = daysBetween(start, to) / span * 100;
        if (b <= 0 || a >= 100) return;
        a = Math.max(0, a);
        b = Math.min(100, b);
        bars.push('<button type="button" class="jb-gbar ' + cls + '" data-job="' + esc(j.id) +
          '" style="left:' + a + "%;width:" + Math.max(3, b - a) + '%">' + esc(label) + "</button>");
      }
      if (j.install_date) {
        var blocked = !gatesClear(j) && !isClosed(j);
        bar(blocked ? "risk" : "prep", j.survey_date || shiftDate(j.install_date, -30),
          shiftDate(j.install_date, -1), blocked ? "prep · gates open" : "prep");
        bar("site", j.install_date, shiftDate(j.install_date, 2), "install");
        if (["energized", "handover", "warranty"].indexOf(j.stage) >= 0) {
          bar("live", shiftDate(j.install_date, 2), shiftDate(j.install_date, 8), "live");
        }
      } else if (j.survey_date) {
        bar("prep", j.survey_date, shiftDate(j.survey_date, 6), "survey");
      }
      return '<div class="jb-grow"><div class="jb-gname">' +
        '<span class="jb-code">' + esc(j.job_code || "—") + "</span><b>" + esc(j.customer_name) + "</b></div>" +
        '<div class="jb-gtrack" style="grid-template-columns:repeat(' + WEEKS + ',1fr)">' +
        range(WEEKS).map(function () { return '<div class="jb-gcell"></div>'; }).join("") +
        bars.join("") + "</div></div>";
    }).join("");

    var todayPct = daysBetween(start, today()) / span;

    return '<div class="jb-gantt"><div class="jb-gantt-scroll"><div class="jb-gantt-grid">' + head +
      '<div style="position:relative">' + (rows || '<div class="jb-grow"><div class="jb-gname sub">No dated jobs</div><div class="jb-gtrack"></div></div>') +
      (rows ? '<div class="jb-today" style="left:calc(226px + (100% - 226px) * ' + todayPct + ')"></div>' : "") +
      "</div></div></div></div>" +
      '<div class="jb-note-bar"><span><b>Dates come from named constraints.</b> ' +
      "Prep starts at the survey, install sits on its confirmed date, and a prep bar turns red " +
      "while a compliance gate is still open inside the permit window — the schedule shows the " +
      "risk before the date is promised to a homeowner.</span></div>";
  }

  function mondayOf(iso) {
    var d = new Date(iso + "T00:00:00Z");
    var shift = (d.getUTCDay() + 6) % 7;
    return shiftDate(iso, -shift);
  }
  function range(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(i);
    return out;
  }

  /* ------------------------------------------------------------------- crew --- */

  function viewCrew() {
    var days = 12;
    var installers = state.installers.filter(function (p) { return num(p.active) === 1; });
    if (!installers.length) {
      return '<div class="jb-empty"><h3>No active crew</h3><p>Add installers in Install Operations ' +
        "(SC-10) and their scheduled work appears here against every job.</p></div>";
    }

    // Which installers are on which job, by date, from the assignments already recorded.
    var head = '<div class="jb-grow head"><div class="jb-gname"><span class="jb-lbl">Crew</span></div>' +
      '<div class="jb-gtrack" style="grid-template-columns:repeat(' + days + ',1fr)">' +
      range(days).map(function (i) {
        return '<div class="jb-gcell">' + fmtDate(shiftDate(today(), i)) + "</div>";
      }).join("") + "</div></div>";

    var rows = installers.map(function (p) {
      var cells = range(days).map(function (d) {
        var date = shiftDate(today(), d);
        // A job counts as this installer's day when they are on its crew and the date is
        // the install date or the day after — the two-day shape of a standard install.
        var on = state.jobs.filter(function (j) {
          if (!j.install_date) return false;
          var mine = (j.crew || []).some(function (c) { return c.id === p.id; });
          return mine && (date === j.install_date || date === shiftDate(j.install_date, 1));
        })[0];
        return '<div class="jb-gcell" style="min-height:44px;padding:6px">' +
          (on ? '<button type="button" class="jb-gbar site inline" data-job="' + esc(on.id) + '">' +
            esc(shortCode(on)) + "</button>" : "") + "</div>";
      }).join("");

      var expiring = p.license_expiry && daysBetween(today(), p.license_expiry) < 150;
      var expired = p.license_expiry && p.license_expiry < today();
      return '<div class="jb-grow"><div class="jb-gname"><b>' + esc(p.name) + "</b>" +
        '<span class="sub">' + esc(p.role || "") + "</span>" +
        (p.license_number
          ? '<span class="jb-chip ' + (expired ? "bad" : expiring ? "warn" : "good") +
            '" style="align-self:flex-start;margin-top:4px">' + esc(p.license_number) +
            (p.license_expiry ? " · " + (expired ? "expired " : "exp ") + fmtDate(p.license_expiry) : "") + "</span>"
          : "") +
        '</div><div class="jb-gtrack" style="grid-template-columns:repeat(' + days + ',1fr)">' + cells + "</div></div>";
    }).join("");

    var licensed = installers.filter(function (p) { return p.license_number; }).length;

    return '<div class="jb-gantt"><div class="jb-gantt-scroll"><div class="jb-gantt-grid" style="min-width:820px">' +
      head + rows + "</div></div></div>" +
      '<div class="jb-note-bar"><span><b>' +
      (licensed === 0
        ? "No licensed electrician on the roster."
        : licensed === 1 ? "One licensed electrician is the real capacity ceiling."
        : licensed + " licensed electricians on the roster.") +
      "</b> Every job needs one to sign off and supervise energizing, so a licence expiring " +
      "inside the booking window is flagged here before a date is promised, not after.</span></div>";
  }

  /* ---------------------------------------------------------------- company --- */

  function viewCompany() {
    var lanes = ["Backlog", "This week", "Doing", "Blocked", "Done"];
    var active = state.company.filter(function (t) { return t.status !== "Done"; });
    var traction = active.filter(function (t) { return t.type === "Traction"; }).length;
    var pct = active.length ? Math.round(traction / active.length * 100) : 0;

    var cols = lanes.map(function (lane) {
      var items = state.company.filter(function (t) { return t.status === lane; });
      return '<section class="jb-col"><header class="jb-col-head"><h3>' + esc(lane) + "</h3>" +
        '<span class="jb-count">' + items.length + "</span></header>" +
        '<div class="jb-col-body">' +
        (items.length ? items.map(function (t) {
          var late = t.due && t.due < today() && t.status !== "Done";
          var tone = t.type === "Traction" ? "good" : t.type === "Product" ? "warn" : "stage";
          return '<div class="jb-mini" data-company-task="' + esc(t.id) + '">' +
            '<div class="row"><span class="jb-chip ' + tone + '">' + esc(t.type) + "</span>" +
            (t.due ? '<span class="jb-date' + (late ? " late" : "") + '">' + fmtDate(t.due) + "</span>" : "") +
            '<button type="button" class="kill" data-kill-company="' + esc(t.id) +
              '" aria-label="Delete company task">✕</button>' +
            "</div><h4>" + esc(t.title) + "</h4>" +
            (t.owner ? '<div class="row"><span class="jb-who"><i>' + esc(initials(t.owner)) + "</i>" + esc(t.owner) + "</span></div>" : "") +
            (t.notes ? '<div class="row"><span class="sub" style="font-size:12px;color:var(--ops-muted)">' + esc(t.notes) + "</span></div>" : "") +
            "</div>";
        }).join("") : '<div class="jb-col-empty">Nothing here</div>') +
        "</div></section>";
    }).join("");

    return '<div class="jb-note-bar first"><span><b>Traction share ' + pct + "%</b> of " + active.length +
      " active company tasks" + (pct < 50 && active.length ? " — below the 50% floor" : "") + ". " +
      "Job checklists are excluded on purpose: counting ~" + (state.templateSize || 30) +
      " rows per install would let this read near-100% while nobody is selling. " +
      "Company work is what the floor measures.</span></div>" +
      '<div class="jb-board">' + cols + "</div>";
  }

  /* ----------------------------------------------------------- stage moves --- */

  function canEnter(job, phaseKey) {
    var phase = findPhase(phaseKey);
    if (!phase || !phase.gated) return true;
    return gatesClear(job);
  }

  /**
   * Move a job to the first stage of a phase. The client check only colours the drop
   * target; the server is the authority and answers 409 with the outstanding gates, which
   * is what the refusal message quotes.
   */
  function moveJob(id, phaseKey) {
    var job = findJob(id);
    if (!job) return Promise.resolve();
    var phase = findPhase(phaseKey);
    if (!phase || phaseOf(job.stage).key === phaseKey) return Promise.resolve();

    var nextStage = phase.stages[0];
    var previous = job.stage;
    job.stage = nextStage;      // optimistic, reverted below if the server refuses
    render();

    return send("PATCH", { id: id, stage: nextStage }).then(function (d) {
      if (!d) return;
      toast("ok", (job.job_code || "Job") + " → " + (STAGE_LABEL[nextStage] || nextStage),
        "Stage recorded with its own history row. " + phase.label + " tasks are now the crew's open work.");
      return refreshAfterWrite(id);
    }).catch(function (err) {
      job.stage = previous;
      render();
      var missing = (err.payload && err.payload.missing) || [];
      if (err.status === 409 && missing.length) {
        toast("bad", "Refused — " + (job.job_code || "this job") + " cannot go on site",
          missing.map(function (m) { return m.label; }).join(" · ") +
          " still outstanding. The refusal came from the server, so it holds however the move is attempted.");
      } else {
        toast("bad", "Could not move the job", err.message);
      }
    });
  }

  // After any write, re-read the list so counts and derived flags come from the database
  // rather than from what the browser hoped happened; refresh the open drawer too.
  function refreshAfterWrite(openId) {
    return reloadJobs().then(function () {
      if (openId && state.openId === openId) return loadDetail(openId);
    });
  }

  function deleteJob(job) {
    if (!job) return;
    if (hasReceivedPayment(job)) {
      toast("bad", "Cannot delete — money is on the ledger",
        "Cancel the job instead so the payment trail stays readable.");
      return;
    }
    var label = (job.job_code || "this job") + (job.customer_name ? " (" + job.customer_name + ")" : "");
    if (!confirm("Delete " + label + "?\n\nChecklist, stage history and unpaid money rows go with it. This cannot be undone.")) {
      return;
    }
    send("DELETE", { id: job.id }).then(function (d) {
      if (!d) return;
      toast("ok", (job.job_code || "Job") + " deleted", "Removed from the board.");
      closeJob();
      return reloadJobs();
    }).catch(function (err) {
      if (err.status === 409) {
        toast("bad", "Cannot delete — money is on the ledger", err.message);
        return;
      }
      toast("bad", "Could not delete the job", err.message);
    });
  }

  function cancelJob(job) {
    if (!job || job.stage === "cancelled") return;
    var label = job.job_code || "this job";
    if (!confirm("Cancel " + label + "?\n\nThe record stays for the ledger. The board stops chasing its open tasks.")) {
      return;
    }
    send("PATCH", { id: job.id, stage: "cancelled" }).then(function (d) {
      if (!d) return;
      toast("ok", label + " cancelled", "Costs and payments stay on the ledger.");
      return refreshAfterWrite(job.id);
    }).catch(function (err) {
      toast("bad", "Could not cancel the job", err.message);
    });
  }

  /* ---------------------------------------------------------------- drawer --- */

  function openJob(id) {
    var job = findJob(id);
    if (!job) return;
    state.lastFocus = document.activeElement;
    state.openId = id;
    state.tab = "overview";
    state.detail = null;
    drawHead(job);
    el("jb-dbody").innerHTML = '<div class="jb-note-bar first"><span>Loading this job…</span></div>';
    el("jb-scrim").classList.add("open");
    el("jb-drawer").classList.add("open");
    el("jb-drawer").focus();
    loadDetail(id);
  }

  function closeJob() {
    state.openId = null;
    state.detail = null;
    el("jb-scrim").classList.remove("open");
    el("jb-drawer").classList.remove("open");
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  function loadDetail(id) {
    state.detailLoading = true;
    return get(JOBS_API + "?id=" + encodeURIComponent(id)).then(function (d) {
      state.detailLoading = false;
      if (!d || state.openId !== id) return;
      state.detail = d;
      drawHead(d.job);
      drawBody();
    }).catch(function (err) {
      state.detailLoading = false;
      if (state.openId !== id) return;
      el("jb-dbody").innerHTML = '<div class="jb-alert"><span class="ic">!</span><span><b>Could not load this job</b>' +
        esc(err.message) + "</span></div>";
    });
  }

  function currentJob() {
    return (state.detail && state.detail.job) || findJob(state.openId);
  }

  function drawHead(job) {
    if (!job) return;
    el("jb-dcode").textContent = job.job_code || "JOB —";
    el("jb-dname").textContent = job.customer_name;
    el("jb-dsub").textContent = [job.site_address, job.owner ? "owner " + job.owner : ""]
      .filter(Boolean).join(" · ") || "No site address on file";

    var m = marginPct(job);
    var h = health(job);
    var total = num(job.task_total);
    el("jb-dmeta").innerHTML =
      pkgChip(job.package) +
      '<span class="jb-chip ' + (h === "green" ? "good" : h === "amber" ? "warn" : "bad") + '">' +
        (h === "green" ? "On track" : h === "amber" ? "Watch" : "At risk") + "</span>" +
      '<span class="jb-chip stage">' + peso(job.contract_price_cents) + " contract</span>" +
      (m === null ? "" : '<span class="jb-chip ' + (m < 22 ? "bad" : "good") + '">' + m + "% forecast margin</span>") +
      (total ? '<span class="jb-chip stage">' + num(job.task_done) + "/" + total + " tasks</span>" : "") +
      (job.lead_id ? '<span class="jb-chip stage">Contact #' + esc(job.lead_id) + "</span>" : "");

    var cur = phaseOf(job.stage).key;
    var idx = state.phases.map(function (p) { return p.key; }).indexOf(cur);
    el("jb-drail").innerHTML = state.phases.map(function (p, i) {
      var cls = i < idx ? "done" : i === idx ? "now" : canEnter(job, p.key) ? "" : "locked";
      return '<button type="button" data-phase="' + esc(p.key) + '" class="' + cls + '" title="' +
        (cls === "locked" ? "Blocked by open compliance gates" : "Move to " + esc(p.label)) + '">' +
        esc(p.label) + "</button>";
    }).join("");

    Array.prototype.forEach.call(el("jb-dtabs").children, function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-tab") === state.tab ? "true" : "false");
    });
  }

  function drawBody() {
    var body = el("jb-dbody");
    var job = currentJob();
    if (!job || !state.detail) return;
    if (state.tab === "overview") body.innerHTML = tabOverview(job);
    else if (state.tab === "tasks") body.innerHTML = tabTasks(job);
    else if (state.tab === "crew") body.innerHTML = tabCrew(job);
    else if (state.tab === "money") body.innerHTML = tabMoney(job);
    else if (state.tab === "files") body.innerHTML = tabFiles(job);
    else body.innerHTML = tabHistory(job);
  }

  function riskLine(job) {
    var overdue = num(job.task_overdue) || (state.detail ? state.detail.tasks.filter(function (t) {
      return t.status !== "Done" && t.due && t.due < today();
    }).length : 0);
    var open = openGates(job);

    if (job.stage === "cancelled") {
      return { tone: "bad", head: "Cancelled", body: "This job is closed. Its costs and payments stay on the ledger for the record." };
    }
    if (open.length && job.install_date && daysBetween(today(), job.install_date) <= 21) {
      return {
        tone: "bad",
        head: "Blocked from going on site — " + daysBetween(today(), job.install_date) + " days to the install date",
        body: "Outstanding: " + open.map(function (g) { return g.label; }).join("; ") +
          ". The stage rail will refuse On site until these clear."
      };
    }
    if (overdue) {
      return {
        tone: "bad",
        head: overdue + " overdue " + (overdue === 1 ? "task" : "tasks"),
        body: "Open the Tasks tab to reassign or re-date. Re-dating the install re-dates the whole plan."
      };
    }
    var m = marginPct(job);
    if (m !== null && m < 22) {
      return {
        tone: "bad", head: "Margin below the 30% target",
        body: "Forecast margin " + m + "%. Review committed cost before ordering anything else — the price is fixed by the package corridor."
      };
    }
    // Only once nothing is actually outstanding does a finished job get to say so.
    if (["energized", "handover", "warranty"].indexOf(job.stage) >= 0) {
      return {
        tone: "ok", head: "Energized and monitored",
        body: "Handover follow-through is complete — meter swap, first-bill check-in and the referral ask are all closed out."
      };
    }
    return {
      tone: "ok", head: "On track",
      body: "No overdue tasks, gates clear for the current stage" + (m === null ? "." : ", forecast margin " + m + "%.")
    };
  }

  function tabOverview(job) {
    var risk = riskLine(job);
    var cost = forecastCost(job);
    var contract = num(job.contract_price_cents);
    var m = marginPct(job);
    var costPct = contract && cost ? Math.min(100, Math.round(cost / contract * 100)) : 0;
    var lead = job.lead_id;

    var dates = [
      ["Survey", job.survey_date],
      ["Install", job.install_date],
      ["Stage entered", (job.stage_entered_at || "").slice(0, 10)]
    ];

    return '<div class="jb-alert' + (risk.tone === "ok" ? " ok" : "") + '">' +
      '<span class="ic" aria-hidden="true">' + (risk.tone === "ok" ? "✓" : "!") + "</span>" +
      "<span><b>" + esc(risk.head) + "</b>" + esc(risk.body) + "</span></div>" +

      '<div class="jb-panel" style="margin-top:14px"><div class="jb-panel-head"><h3>Site &amp; contact</h3>' +
      (lead ? '<span class="right"><a class="jb-btn" href="/internal/leads.html">Open in Contacts</a></span>' : "") +
      '</div><div class="jb-panel-body"><dl class="jb-dl">' +
      "<dt>Customer</dt><dd>" + esc(job.customer_name) + (job.phone ? " · " + esc(job.phone) : "") + "</dd>" +
      "<dt>Site</dt><dd>" + (job.site_address ? esc(job.site_address) : '<b class="warn">no site address — a survey cannot be booked without one</b>') + "</dd>" +
      "<dt>Package</dt><dd>" + esc(job.package || "Custom") + " · " + peso(contract) + "</dd>" +
      "<dt>Owner</dt><dd>" + (job.owner ? esc(job.owner) : '<b class="warn">unowned — no name means it is not being done</b>') + "</dd>" +
      (job.notes ? "<dt>Notes</dt><dd>" + esc(job.notes) + "</dd>" : "") +
      "</dl></div></div>" +

      '<div class="jb-grid2">' +
      '<div class="jb-panel"><div class="jb-panel-head"><h3>Key dates</h3></div><div class="jb-panel-body">' +
      '<div class="jb-feed">' + dates.map(function (row) {
        var has = !!row[1];
        return '<div class="jb-fitem"><span class="mark' + (has ? " stage" : "") + '"></span>' +
          '<span class="txt"><b>' + esc(row[0]) + "</b><small>" + (has ? fmtDate(row[1]) + " · " + esc(row[1]) : "not set") + "</small></span></div>";
      }).join("") + "</div></div></div>" +

      '<div class="jb-panel"><div class="jb-panel-head"><h3>Forecast margin</h3>' +
      '<span class="right jb-chip ' + (m !== null && m < 22 ? "bad" : "good") + '">target 30%</span></div>' +
      '<div class="jb-panel-body"><div class="jb-meter">' +
      (cost && contract
        ? '<div class="jb-meter-bar"><i class="cost" style="width:' + costPct + '%"></i>' +
          '<i class="marg' + (m < 22 ? " thin" : "") + '" style="width:' + Math.max(0, 100 - costPct) + '%"></i></div>' +
          '<div class="jb-meter-key">' +
          '<span><i style="background:var(--ops-blue)"></i>Cost ' + peso(cost) + "</span>" +
          '<span><i style="background:' + (m < 22 ? "var(--ops-rust)" : "var(--ops-green)") + '"></i>Margin ' +
          peso(contract - cost) + " (" + m + "%)</span></div>"
        : '<p style="margin:0">No cost lines or target cost on this job yet, so there is nothing to check the price against. Add them in the Money tab.</p>') +
      "<p>Price is fixed by the package corridor; this is the target-cost check, not a cost-plus calculation.</p>" +
      "</div></div></div></div>" +

      '<div class="jb-panel"><div class="jb-panel-head"><h3>Safety &amp; compliance gates</h3>' +
      '<span class="right jb-chip ' + (gatesClear(job) ? "good" : "bad") + '">' +
      (gatesClear(job) ? "Cleared for site" : "Blocking") + "</span></div>" +
      '<div class="jb-panel-body">' + GATES.map(function (g) {
        var s = gateState(job, g);
        return '<div class="jb-gate"><button type="button" class="box ' +
          (s === "pass" ? "on" : s === "na" ? "na" : "") + '" data-gate="' + esc(g.key) +
          '" aria-pressed="' + (s === "pass") + '" aria-label="' + esc(g.label) + '">' +
          (s === "na" ? "N/A" : "✓") + "</button>" +
          '<span class="txt"><b>' + esc(g.label) + "</b><small>" + esc(g.why) + "</small></span>" +
          '<span class="jb-chip ' + (s === "pass" ? "good" : s === "na" ? "stage" : "bad") + '">' +
          (s === "pass" ? "Signed off" : s === "na" ? "Not applicable" : "Outstanding") + "</span></div>";
      }).join("") +
      "<p style=\"margin:14px 0 0;color:var(--ops-muted);font-size:12.5px\">These three cannot be skipped. " +
      "Toggling one settles its checklist task too, and the same rule runs server-side on every stage move.</p>" +
      "</div></div>" +

      dangerZone(job);
  }

  /** True once any payment on this job has status received — delete is then refused. */
  function hasReceivedPayment(job) {
    if (num(job.paid_cents) > 0) return true;
    var payments = (state.detail && state.detail.payments) || [];
    return payments.some(function (p) { return p.status === "received"; });
  }

  function dangerZone(job) {
    if (job.stage === "cancelled") {
      return '<div class="jb-panel jb-danger" style="margin-top:14px">' +
        '<div class="jb-panel-head"><h3>This job is cancelled</h3></div>' +
        '<div class="jb-panel-body"><p style="margin:0 0 12px">Costs and payments stay on the ledger. ' +
        "Delete is not offered after cancel — the accounting trail has to remain readable.</p></div></div>";
    }
    if (hasReceivedPayment(job)) {
      return '<div class="jb-panel jb-danger" style="margin-top:14px">' +
        '<div class="jb-panel-head"><h3>Close this job</h3></div>' +
        '<div class="jb-panel-body"><p style="margin:0 0 12px">Received payments are on the ledger, so this job cannot be deleted. ' +
        "Cancel it instead — the record stays, the board stops chasing it.</p>" +
        '<button type="button" class="jb-btn danger" data-act="cancel-job">Cancel job</button></div></div>';
    }
    return '<div class="jb-panel jb-danger" style="margin-top:14px">' +
      '<div class="jb-panel-head"><h3>Delete this job</h3></div>' +
      '<div class="jb-panel-body"><p style="margin:0 0 12px">Removes the job, its checklist, stage history, draft costs and unpaid payment rows. ' +
      "This cannot be undone. Prefer Cancel if the customer relationship should stay on file.</p>" +
      '<button type="button" class="jb-btn danger" data-act="delete-job">Delete job</button>' +
      ' <button type="button" class="jb-btn" data-act="cancel-job">Cancel instead</button></div></div>';
  }

  function ring(pct) {
    var r = 19;
    var c = 2 * Math.PI * r;
    return '<span class="jb-ring"><svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">' +
      '<circle cx="23" cy="23" r="' + r + '" fill="none" stroke="var(--jb-surface-3)" stroke-width="5"/>' +
      '<circle cx="23" cy="23" r="' + r + '" fill="none" stroke="var(--ops-petrol)" stroke-width="5" ' +
      'stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - pct / 100)) + '"/>' +
      "</svg><b>" + pct + "</b></span>";
  }

  function tabTasks(job) {
    var tasks = state.detail.tasks || [];
    var done = tasks.filter(function (t) { return t.status === "Done"; }).length;
    var pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    var cur = phaseOf(job.stage).key;

    var groups = state.phases.map(function (p) {
      var mine = tasks.filter(function (t) { return t.phase === p.key; });
      if (!mine.length) return "";
      var d = mine.filter(function (t) { return t.status === "Done"; }).length;
      return '<div class="jb-tgroup-head"><h4>' + esc(p.label) + "</h4>" +
        (p.key === cur ? '<span class="jb-chip good">current stage</span>' : "") +
        '<span class="jb-count">' + d + "/" + mine.length + "</span></div>" +
        mine.map(taskRow).join("");
    }).join("");

    var loose = tasks.filter(function (t) {
      return !state.phases.some(function (p) { return p.key === t.phase; });
    });
    if (loose.length) {
      groups += '<div class="jb-tgroup-head"><h4>Unphased</h4><span class="jb-count">' + loose.length + "</span></div>" +
        loose.map(taskRow).join("");
    }

    return '<div class="jb-panel"><div class="jb-panel-head">' + ring(pct) +
      "<div><h3>Install checklist</h3>" +
      '<span class="sub">' + done + " of " + tasks.length + " done" +
      (job.install_date ? " · dated off " + fmtDate(job.install_date) : " · undated until an install date is set") +
      "</span></div></div>" +
      (tasks.length ? groups : '<div class="jb-panel-body"><p style="margin:0;color:var(--ops-muted)">' +
        "This job has no checklist. It was created before templates existed, or its tasks were deleted." +
        "</p></div>") +
      '<div class="jb-addtask">' +
      '<input id="jb-newtask" placeholder="Add a task to this job…" maxlength="96" aria-label="New task title">' +
      '<select id="jb-newtask-role" aria-label="Owner role">' +
      ROLES.map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("") + "</select>" +
      '<select id="jb-newtask-phase" aria-label="Phase">' +
      state.phases.map(function (p) {
        return '<option value="' + esc(p.key) + '"' + (p.key === cur ? " selected" : "") + ">" + esc(p.label) + "</option>";
      }).join("") + "</select>" +
      '<button type="button" class="jb-btn petrol" data-act="add-task">Add</button>' +
      "</div></div>" +
      '<div class="jb-note-bar"><span><b>Gate tasks and the compliance gates are one fact.</b> ' +
      "Ticking the permit or PEE task signs off its gate on the Overview tab, so the field and " +
      "the office can never disagree about whether a stage is unlocked.</span></div>";
  }

  function taskRow(t) {
    var isDone = t.status === "Done";
    var late = !isDone && t.due && t.due < today();
    return '<div class="jb-task' + (isDone ? " done" : "") + '">' +
      '<button type="button" class="box' + (isDone ? " on" : "") + '" data-task="' + esc(t.id) +
      '" aria-pressed="' + isDone + '" aria-label="' + esc(t.title) + '">✓</button>' +
      '<span class="body"><span class="ttl">' + esc(t.title) + "</span>" +
      '<span class="row">' +
      (t.role ? '<span class="jb-who"><i>' + esc(String(t.role).slice(0, 2).toUpperCase()) + "</i>" + esc(t.role) + "</span>" : "") +
      (t.due
        ? '<span class="due' + (late ? " late" : "") + '">' +
          (late ? "due " + fmtDate(t.due) + " · " + Math.abs(daysBetween(today(), t.due)) + "d late" : "due " + fmtDate(t.due)) +
          "</span>"
        : '<span class="due">no date</span>') +
      (num(t.is_gate) ? '<span class="jb-chip bad">gate</span>' : "") +
      (num(t.is_gate) ? "" : '<button type="button" class="kill" data-kill-task="' + esc(t.id) + '" aria-label="Delete task">✕</button>') +
      "</span></span></div>";
  }

  function tabCrew(job) {
    var rows = state.detail.assignments || [];
    if (!rows.length) {
      return '<div class="jb-alert"><span class="ic" aria-hidden="true">!</span><span><b>No crew assigned</b>' +
        (job.install_date
          ? "This job is dated " + fmtDate(job.install_date) + " with nobody rostered. Assign a lead installer and a licensed electrician before the date is confirmed with the homeowner."
          : "Nobody is rostered and there is no install date yet.") +
        "</span></div>" +
        '<div class="jb-panel" style="margin-top:14px"><div class="jb-panel-head"><h3>Roster</h3>' +
        '<span class="right"><a class="jb-btn" href="/internal/install-ops.html">Assign crew in SC-10</a></span></div>' +
        '<div class="jb-panel-body"><p style="margin:0;color:var(--ops-muted);font-size:13px">' +
        "Crew assignments carry rates, safety sign-off and QC status, and post to the SC-09 ledger when approved — " +
        "so they are still created in Install Operations, and appear here as soon as they exist.</p></div></div>";
    }

    var body = rows.map(function (a) {
      var expired = a.license_expiry && a.license_expiry < today();
      return "<tr><td><b>" + esc(a.installer_name) + "</b>" +
        '<div class="sub">' + esc(a.installer_role || "") + "</div></td>" +
        '<td class="num">' + fmtDate(a.work_date) + "</td>" +
        '<td class="num">' + (num(a.days) ? num(a.days) + " d" : num(a.hours) ? num(a.hours) + " h" : "project") + "</td>" +
        '<td class="num jb-peso">' + peso(a.agreed_cents) + "</td>" +
        '<td><span class="jb-chip ' + (a.status === "paid" ? "good" : a.status === "approved" ? "good" : "stage") + '">' +
          esc(a.status) + "</span></td>" +
        '<td><span class="jb-chip ' + (num(a.safety_checked) ? "good" : "warn") + '">' +
          (num(a.safety_checked) ? "Safety ✓" : "Briefing due") + "</span></td>" +
        '<td><span class="jb-chip ' + (a.qc_status === "passed" ? "good" : a.qc_status === "rework" ? "bad" : "stage") + '">' +
          esc(a.qc_status) + "</span></td>" +
        (expired ? '<td><span class="jb-chip bad">licence expired</span></td>' : "<td></td>") +
        "</tr>";
    }).join("");

    return '<div class="jb-panel"><div class="jb-panel-head"><h3>Roster</h3>' +
      '<span class="right"><a class="jb-btn" href="/internal/install-ops.html">Manage in SC-10</a></span></div>' +
      '<div class="jb-tablewrap"><table class="jb-table">' +
      '<thead><tr><th>Installer</th><th class="num">Work date</th><th class="num">Time</th>' +
      '<th class="num">Agreed</th><th>Status</th><th>Safety</th><th>QC</th><th></th></tr></thead>' +
      "<tbody>" + body + "</tbody></table></div></div>" +
      '<div class="jb-note-bar"><span><b>Crew cost lands in this job\'s margin.</b> ' +
      "Approving an assignment posts it to the job's costs and the SC-09 ledger in one step, " +
      "so labour never sits outside the job's profitability.</span></div>";
  }

  function tabMoney(job) {
    var payments = state.detail.payments || [];
    var costs = state.detail.costs || [];
    var contract = num(job.contract_price_cents);
    var received = payments.filter(function (p) { return p.status === "received" && p.kind !== "refund"; })
      .reduce(function (n, p) { return n + num(p.amount_cents); }, 0);
    var cost = forecastCost(job);
    var m = marginPct(job);

    var payRows = payments.length ? payments.map(function (p) {
      return "<tr><td><b>" + esc(label(p.kind)) + "</b>" +
        '<div class="sub">' + fmtDate(p.payment_date) + (p.reference ? " · " + esc(p.reference) : "") + "</div></td>" +
        '<td class="num jb-peso"><b>' + peso(p.amount_cents) + "</b></td>" +
        '<td><span class="jb-chip ' + (p.status === "received" ? "good" : "stage") + '">' + esc(p.status) + "</span></td></tr>";
    }).join("") : '<tr><td colspan="3" style="color:var(--ops-muted)">No payment schedule yet.</td></tr>';

    var costRows = costs.length ? costs.map(function (c) {
      var line = num(c.actual_cents) || num(c.committed_cents) || num(c.budget_cents);
      return "<tr><td><b>" + esc(c.description) + "</b>" +
        '<div class="sub">' + esc(c.category) + (c.vendor ? " · " + esc(c.vendor) : "") + "</div></td>" +
        '<td class="num jb-peso">' + peso(line) + "</td>" +
        '<td><span class="jb-chip ' + (c.status === "paid" ? "good" : c.status === "committed" ? "warn" : "stage") + '">' +
        esc(c.status) + "</span></td></tr>";
    }).join("") : '<tr><td colspan="3" style="color:var(--ops-muted)">No cost lines yet.</td></tr>';

    return '<div class="jb-grid2" style="margin-top:0">' +
      '<div class="jb-panel"><div class="jb-panel-head"><h3>Customer payments</h3>' +
      '<span class="right jb-chip ' + (received >= contract && contract ? "good" : "warn") + '">' +
      peso(received) + " of " + peso(contract) + "</span></div>" +
      '<div class="jb-tablewrap"><table class="jb-table"><tbody>' + payRows + "</tbody></table></div></div>" +

      '<div class="jb-panel"><div class="jb-panel-head"><h3>Job cost</h3>' +
      (m === null ? "" : '<span class="right jb-chip ' + (m < 22 ? "bad" : "good") + '">' + m + "% margin</span>") +
      "</div>" +
      '<div class="jb-tablewrap"><table class="jb-table"><tbody>' + costRows +
      (cost ? '<tr><td><b>Forecast total</b></td><td class="num jb-peso"><b>' + peso(cost) + "</b></td><td></td></tr>" : "") +
      "</tbody></table></div></div></div>" +

      '<div class="jb-panel"><div class="jb-panel-head"><h3>Ledger</h3>' +
      '<span class="right"><a class="jb-btn" href="/internal/finance.html">Open SC-09</a>' +
      '<a class="jb-btn" href="/internal/install-ops.html">Add cost or payment</a></span></div>' +
      '<div class="jb-panel-body"><p style="margin:0;color:var(--ops-muted);font-size:13px">' +
      "Every row here is an existing cost or payment record that already syncs to Finance &amp; Runway. " +
      "Nothing extra is stored on the job — this is the first place one install's money is visible " +
      "without opening two pages.</p></div></div>";
  }

  function label(value) {
    return String(value || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /**
   * Compliance paperwork, derived from the gates that are actually signed off. Photo and
   * document upload is deliberately absent rather than mocked: nothing here claims a file
   * exists that nobody has attached.
   */
  function tabFiles(job) {
    var docs = [
      {
        icon: "📐", name: "Single-line diagram", state: num(job.licensed_electrician_check) ? "PEE signed off" : "awaiting PEE sign-off",
        have: !!num(job.licensed_electrician_check)
      },
      {
        icon: "🏛", name: "LGU / barangay permit", state: num(job.permit_checklist) ? "filed" : "not filed",
        have: !!num(job.permit_checklist)
      },
      {
        icon: "⚡", name: "Net-metering application",
        state: num(job.net_metering_na) ? "N/A — off grid" : num(job.net_metering_check) ? "lodged" : "not lodged",
        have: !!(num(job.net_metering_na) || num(job.net_metering_check))
      },
      {
        icon: "🛡", name: "Safety briefing", state: num(job.safety_briefing_check) ? "signed by crew" : "due before site work",
        have: !!num(job.safety_briefing_check)
      },
      {
        icon: "🔌", name: "Testing and commissioning", state: num(job.testing_check) ? "complete" : "pending",
        have: !!num(job.testing_check)
      },
      {
        icon: "🤝", name: "Customer handover", state: num(job.handover_check) ? "complete" : "pending",
        have: !!num(job.handover_check)
      }
    ];

    return '<div class="jb-panel"><div class="jb-panel-head"><h3>Compliance record</h3>' +
      '<span class="right jb-chip stage">' + docs.filter(function (d) { return d.have; }).length + " of " + docs.length + "</span></div>" +
      '<div class="jb-panel-body"><div class="jb-files">' +
      docs.map(function (d) {
        return '<div class="jb-file' + (d.have ? "" : " missing") + '">' +
          '<div class="thumb" aria-hidden="true">' + d.icon + "</div>" +
          '<div class="cap"><b>' + esc(d.name) + "</b><small>" + esc(d.state) + "</small></div></div>";
      }).join("") +
      '<div class="jb-drop">Document and site-photo upload lands here with the field view. ' +
      "Until then this tab reports only what the job record actually knows — it never implies a file that nobody attached.</div>" +
      "</div></div></div>" +
      '<div class="jb-note-bar"><span><b>The finished-array photo is the marketing asset.</b> ' +
      "A handover photo with written consent is what turns a visible rooftop into a referral, " +
      "so consent belongs on the job next to the photo — not in somebody's phone.</span></div>";
  }

  function tabHistory(job) {
    var events = state.detail.events || [];
    var activity = state.detail.activity || [];

    var items = events.map(function (e) {
      var refused = num(e.refused) === 1;
      return {
        mark: refused ? "warn" : "stage",
        when: e.created_at,
        html: refused
          ? "<b>Stage change refused</b> — " + esc(STAGE_LABEL[e.to_stage] || e.to_stage) +
            (e.reason ? "<br>" + esc(e.reason) : "")
          : "<b>" + esc(STAGE_LABEL[e.to_stage] || e.to_stage) + "</b>" +
            (e.from_stage ? " — from " + esc(STAGE_LABEL[e.from_stage] || e.from_stage) : "") +
            (e.reason ? "<br>" + esc(e.reason) : ""),
        who: e.actor || ""
      };
    }).concat(activity.map(function (a) {
      return {
        mark: "", when: a.created_at,
        html: "<b>" + esc(label(a.action)) + "</b>" + (a.detail ? " — " + esc(String(a.detail).slice(0, 140)) : ""),
        who: a.user_name || ""
      };
    }));

    items.sort(function (a, b) { return String(b.when).localeCompare(String(a.when)); });

    // Time in each stage, from consecutive non-refused moves — the cycle time the old
    // board could never answer.
    var moves = events.filter(function (e) { return num(e.refused) !== 1; })
      .slice().sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); });
    var cycles = [];
    for (var i = 0; i < moves.length - 1; i++) {
      var d = Math.round((new Date(moves[i + 1].created_at) - new Date(moves[i].created_at)) / 86400000);
      cycles.push({ stage: STAGE_LABEL[moves[i].to_stage] || moves[i].to_stage, days: d });
    }

    return '<div class="jb-panel"><div class="jb-panel-head"><h3>Job history</h3>' +
      '<span class="right jb-chip stage">stage events + audit log</span></div>' +
      '<div class="jb-panel-body">' +
      (items.length
        ? '<div class="jb-feed">' + items.slice(0, 40).map(function (i) {
            return '<div class="jb-fitem"><span class="mark ' + i.mark + '"></span>' +
              '<span class="txt">' + i.html + "<small>" + esc(fmtStamp(i.when)) +
              (i.who ? " · " + esc(i.who) : "") + "</small></span></div>";
          }).join("") + "</div>"
        : '<p style="margin:0;color:var(--ops-muted)">Nothing recorded yet. Stage moves and every mutating API call land here from now on.</p>') +
      "</div></div>" +
      (cycles.length
        ? '<div class="jb-panel"><div class="jb-panel-head"><h3>Time in stage</h3></div>' +
          '<div class="jb-tablewrap"><table class="jb-table"><tbody>' +
          cycles.map(function (c) {
            return "<tr><td><b>" + esc(c.stage) + "</b></td>" +
              '<td class="num">' + c.days + (c.days === 1 ? " day" : " days") + "</td></tr>";
          }).join("") + "</tbody></table></div></div>"
        : "") +
      '<div class="jb-note-bar"><span><b>This costs one query, not a new subsystem.</b> ' +
      "The API middleware already writes an audit row for every mutating call with the " +
      "signed-in founder attached; the stage table adds the moves. Together they answer " +
      "who changed what, when, and how long each stage really took.</span></div>";
  }

  /* ------------------------------------------------------------ new job UI --- */

  function leadOption(lead) {
    return '<option value="' + esc(lead.id) + '">' + esc(lead.name) +
      (lead.phone ? " · " + esc(lead.phone) : "") +
      (lead.address ? " · " + esc(lead.address) : "") + "</option>";
  }

  // One <optgroup> per bucket so a long contact list stays readable and the ones already
  // turned into a job are visibly out of the way instead of inviting a duplicate.
  function leadGroups() {
    var leads = state.leads || [];
    var buckets = [
      { label: "Ready to convert", of: function (l) { return !num(l.has_job) && LEAD_SELLING.indexOf(l.stage) >= 0; } },
      { label: "Earlier in the pipeline", of: function (l) { return !num(l.has_job) && LEAD_SELLING.indexOf(l.stage) < 0 && l.stage !== "lost"; } },
      { label: "Marked lost", of: function (l) { return !num(l.has_job) && l.stage === "lost"; } },
      { label: "Already has a job", of: function (l) { return !!num(l.has_job); } }
    ];
    return buckets.map(function (b) {
      var rows = leads.filter(b.of);
      if (!rows.length) return "";
      return '<optgroup label="' + esc(b.label) + '">' + rows.map(leadOption).join("") + "</optgroup>";
    }).join("");
  }

  function pickSummary(lead) {
    if (!lead) return "Nothing selected — type a customer name below and the job stands on its own.";
    return (num(lead.has_job)
      ? '<b class="warn">This contact already has a job.</b> Creating another makes a second one for the same customer.<br>'
      : "") +
      "<b>" + esc(lead.name) + "</b> · " + esc(LEAD_STAGE[lead.stage] || lead.stage || "—") + "<br>" +
      esc(lead.phone || "no phone on file") + " · " + esc(lead.address || "no address on file") +
      (lead.package ? " · " + esc(lead.package) : "");
  }

  function composeHtml() {
    var leads = state.leads || [];
    var groups = leadGroups();
    return '<div class="jb-panel"><div class="jb-panel-head"><h3>Customer</h3>' +
      '<span class="right jb-chip stage">' + leads.length +
      (leads.length === 1 ? " contact" : " contacts") + "</span></div>" +
      '<div class="jb-panel-body">' +
      '<label><span class="jb-lbl">From contact</span><br>' +
      '<select id="jb-new-lead" class="jb-search" style="max-width:none;width:100%">' +
      '<option value="">— not from a contact —</option>' + groups + "</select></label>" +
      '<div class="jb-note-bar" id="jb-new-pick" style="margin-top:10px"><span>' +
      (groups
        ? pickSummary(null)
        : 'No contacts yet. <a href="/internal/leads.html">Add one in Contacts</a> and it appears here — ' +
          "or type a customer name below.") +
      "</span></div>" +
      '<label style="display:block;margin-top:12px"><span class="jb-lbl">Customer name</span><br>' +
      '<input id="jb-new-name" class="jb-search" style="max-width:none;width:100%" maxlength="120" placeholder="Required if no contact is chosen"></label>' +
      "</div></div>" +

      '<div class="jb-panel"><div class="jb-panel-head"><h3>The deal</h3></div>' +
      '<div class="jb-panel-body">' +
      '<label style="display:block"><span class="jb-lbl">Package</span><br>' +
      '<input id="jb-new-pkg" class="jb-search" style="max-width:none;width:100%" maxlength="60" placeholder="LIWANAG / ILAW / SANDIGAN"></label>' +
      '<label style="display:block;margin-top:12px"><span class="jb-lbl">Contract price (₱)</span><br>' +
      // No example figure here on purpose: the package ladder is not final and lives in
      // /api/quote-settings, so a placeholder number would quietly become a second source
      // of truth for the price.
      '<input id="jb-new-price" class="jb-search" style="max-width:none;width:100%" type="number" min="0" step="500" placeholder="from the accepted quote"></label>' +
      '<label style="display:block;margin-top:12px"><span class="jb-lbl">Install date (optional — dates the whole checklist)</span><br>' +
      '<input id="jb-new-install" class="jb-search" style="max-width:none;width:100%" type="date"></label>' +
      "</div></div>" +

      '<div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap">' +
      '<button type="button" class="jb-btn primary" data-act="create-job">Create job' +
      (state.templateSize ? " + " + state.templateSize + " tasks" : "") + "</button>" +
      '<button type="button" class="jb-btn" data-act="cancel-new">Cancel</button>' +
      "</div>" +
      '<p style="margin:12px 0 0;color:var(--ops-muted);font-size:12.5px">' +
      "Choosing a contact copies its name, phone, address and package, so the same install is never typed twice. " +
      "An off-grid package records net metering as N/A rather than leaving a gate open forever.</p>";
  }

  function openCompose() {
    state.composing = true;
    state.lastFocus = document.activeElement;
    var body = el("jb-nbody");
    body.innerHTML = composeHtml();
    el("jb-scrim").classList.add("open");
    el("jb-new").classList.add("open");

    var pick = el("jb-new-lead");
    var name = el("jb-new-name");
    if (pick) {
      pick.addEventListener("change", function () {
        var lead = state.leads.filter(function (l) { return String(l.id) === pick.value; })[0];
        el("jb-new-pick").innerHTML = "<span>" + pickSummary(lead) + "</span>";
        // Prefill rather than blank the name: the field is what actually gets sent, so
        // showing the contact's name is the difference between "it copied the contact"
        // and a form that looks like it ignored the pick.
        if (lead) {
          name.value = lead.name || "";
          if (lead.package) el("jb-new-pkg").value = lead.package;
        } else if (state.pickedName && name.value === state.pickedName) {
          name.value = "";
        }
        state.pickedName = lead ? lead.name || "" : "";
      });
      pick.focus();
    } else if (name) {
      name.focus();
    }
  }

  function closeCompose() {
    state.composing = false;
    state.pickedName = "";
    el("jb-new").classList.remove("open");
    if (!state.openId) el("jb-scrim").classList.remove("open");
    el("jb-nbody").innerHTML = "";
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  function createJob() {
    var leadId = el("jb-new-lead").value;
    var name = el("jb-new-name").value.trim();
    var lead = state.leads.filter(function (l) { return String(l.id) === leadId; })[0];
    if (!leadId && !name) {
      toast("bad", "A customer is required", "Choose a contact or type a customer name.");
      el("jb-new-name").focus();
      return;
    }
    var pesos = Number(el("jb-new-price").value);
    var body = {
      lead_id: leadId || undefined,
      customer_name: name || (lead ? lead.name : ""),
      package: el("jb-new-pkg").value.trim() || (lead && lead.package) || "Custom",
      contract_price_cents: Number.isFinite(pesos) && pesos > 0 ? Math.round(pesos * 100) : 0,
      install_date: el("jb-new-install").value || "",
      survey_date: ""
    };

    var btn = document.querySelector('#jb-nbody [data-act="create-job"]');
    if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }

    send("POST", body).then(function (d) {
      if (!d) return;
      closeCompose();
      toast("ok", d.job_code + " created",
        d.tasks_seeded + " template tasks seeded" + (body.install_date ? " and dated off the install date." : ", undated until an install date is set."));
      return reloadJobs().then(function () { openJob(d.id); });
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = "Create job"; }
      toast("bad", "Could not create the job", err.message);
    });
  }

  /* ----------------------------------------------------------------- events --- */

  // Board drag and drop. The drop target's colour is a client-side courtesy; the refusal
  // that matters comes from the server on the PATCH.
  var dragId = null;

  root.addEventListener("dragstart", function (e) {
    var card = e.target.closest && e.target.closest(".jb-card");
    if (!card) return;
    dragId = card.getAttribute("data-job");
    card.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", dragId); } catch (_) {}
    }
  });

  root.addEventListener("dragend", function () {
    dragId = null;
    Array.prototype.forEach.call(root.querySelectorAll(".jb-card.dragging"), function (c) {
      c.classList.remove("dragging");
    });
    clearDropStyles();
  });

  root.addEventListener("dragover", function (e) {
    var col = e.target.closest && e.target.closest(".jb-col[data-phase]");
    if (!col || !dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    clearDropStyles();
    var job = findJob(dragId);
    col.classList.add(job && canEnter(job, col.getAttribute("data-phase")) ? "drop" : "nope");
  });

  root.addEventListener("dragleave", function (e) {
    var col = e.target.closest && e.target.closest(".jb-col");
    if (col && !col.contains(e.relatedTarget)) {
      col.classList.remove("drop");
      col.classList.remove("nope");
    }
  });

  root.addEventListener("drop", function (e) {
    var col = e.target.closest && e.target.closest(".jb-col[data-phase]");
    if (!col || !dragId) return;
    e.preventDefault();
    var id = dragId;
    dragId = null;
    clearDropStyles();
    moveJob(id, col.getAttribute("data-phase"));
  });

  function clearDropStyles() {
    Array.prototype.forEach.call(root.querySelectorAll(".jb-col.drop, .jb-col.nope"), function (c) {
      c.classList.remove("drop");
      c.classList.remove("nope");
    });
  }

  root.addEventListener("click", function (e) {
    var killCo = e.target.closest && e.target.closest("[data-kill-company]");
    if (killCo) {
      deleteCompanyTask(killCo.getAttribute("data-kill-company"));
      return;
    }
    var act = e.target.closest && e.target.closest("[data-act]");
    if (act) {
      var name = act.getAttribute("data-act");
      if (name === "reload") { location.reload(); return; }
      if (name === "new-job") { openCompose(); return; }
      return;
    }
    var bar = e.target.closest && e.target.closest(".jb-gbar[data-job]");
    if (bar) { openJob(bar.getAttribute("data-job")); return; }
    var card = e.target.closest && e.target.closest(".jb-card[data-job]");
    if (card) { openJob(card.getAttribute("data-job")); return; }
    var row = e.target.closest && e.target.closest("tr[data-job]");
    if (row) { openJob(row.getAttribute("data-job")); return; }
  });

  // The new-job drawer lives outside #jb-app so a re-render of the views cannot wipe a
  // half-filled form underneath the user.
  el("jb-nbody").addEventListener("click", function (e) {
    var act = e.target.closest && e.target.closest("[data-act]");
    if (!act) return;
    var name = act.getAttribute("data-act");
    if (name === "cancel-new") closeCompose();
    if (name === "create-job") createJob();
  });

  el("jb-nclose").addEventListener("click", closeCompose);

  el("jb-views-host").addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("button[data-view]");
    if (btn) {
      var v = btn.getAttribute("data-view");
      if (VIEWS.indexOf(v) < 0) return;
      state.view = v;
      render();
      return;
    }
    var act = e.target.closest && e.target.closest("[data-act]");
    if (act && act.getAttribute("data-act") === "new-job") openCompose();
  });

  el("jb-search").addEventListener("input", function (e) {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });

  /* -------------------------------------------------------- drawer events --- */

  el("jb-dclose").addEventListener("click", closeJob);

  // One scrim serves both drawers. The new-job form sits on top when both are open — a
  // job created from the drawer opens its detail behind it — so it dismisses first.
  function closeTopDrawer() {
    if (state.composing) closeCompose();
    else if (state.openId) closeJob();
  }

  el("jb-scrim").addEventListener("click", closeTopDrawer);

  // Escape has to work wherever focus sits, so the listener belongs on the document — but
  // the SPA router re-executes this script on every visit to the page, and a document
  // listener is never torn down with the view. Registering one permanent listener that
  // calls through a hook each load overwrites keeps exactly one, always pointing at the
  // current closure instead of stacking stale ones. (Same idea as theme.js's ready flag.)
  window.__jbCloseDrawer = function () { closeTopDrawer(); };
  if (!document.documentElement.dataset.jbKeysReady) {
    document.documentElement.dataset.jbKeysReady = "true";
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && typeof window.__jbCloseDrawer === "function") window.__jbCloseDrawer();
    });
  }

  el("jb-dtabs").addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("button[data-tab]");
    if (!btn) return;
    state.tab = btn.getAttribute("data-tab");
    drawHead(currentJob());
    drawBody();
  });

  el("jb-drail").addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("button[data-phase]");
    if (!btn || !state.openId) return;
    moveJob(state.openId, btn.getAttribute("data-phase"));
  });

  el("jb-dbody").addEventListener("click", function (e) {
    var job = currentJob();
    if (!job) return;

    var gate = e.target.closest && e.target.closest("[data-gate]");
    if (gate) {
      var key = gate.getAttribute("data-gate");
      var def = GATES.filter(function (g) { return g.key === key; })[0];
      if (def && gateState(job, def) === "na") {
        toast("ok", "Not applicable on this package",
          "Off-grid has no utility interconnection, so net metering is recorded N/A rather than faked as a pass.");
        return;
      }
      var next = num(job[key]) ? 0 : 1;
      var patch = { id: job.id };
      patch[key] = next;
      send("PATCH", patch).then(function (d) {
        if (!d) return;
        toast(next ? "ok" : "bad",
          (next ? "Gate signed off" : "Gate reopened") + (def ? " — " + def.label : ""),
          next ? "Its checklist task is settled too."
               : (job.job_code || "This job") + " is now blocked from On site and the stage rail has locked.");
        return refreshAfterWrite(job.id);
      }).catch(function (err) { toast("bad", "Could not update the gate", err.message); });
      return;
    }

    var kill = e.target.closest && e.target.closest("[data-kill-task]");
    if (kill) {
      send("DELETE", { resource: "task", id: kill.getAttribute("data-kill-task") })
        .then(function (d) { if (d) return refreshAfterWrite(job.id); })
        .catch(function (err) { toast("bad", "Could not delete the task", err.message); });
      return;
    }

    var task = e.target.closest && e.target.closest("[data-task]");
    if (task) {
      var id = task.getAttribute("data-task");
      var row = (state.detail.tasks || []).filter(function (t) { return t.id === id; })[0];
      if (!row) return;
      var done = row.status === "Done" ? 0 : 1;
      // Optimistic: the checkbox is the most-used control on the page and must feel instant.
      row.status = done ? "Done" : "Backlog";
      drawBody();
      send("PATCH", { resource: "task", id: id, done: done }).then(function (d) {
        if (!d) return;
        if (d.gate) {
          toast(done ? "ok" : "bad", "Compliance gate " + (done ? "signed off" : "reopened"),
            "Ticking a gate task updates the job's gate — one source of truth.");
        }
        return refreshAfterWrite(job.id);
      }).catch(function (err) {
        row.status = done ? "Backlog" : "Done";
        drawBody();
        toast("bad", "Could not update the task", err.message);
      });
      return;
    }

    var add = e.target.closest && e.target.closest('[data-act="add-task"]');
    if (add) {
      var input = el("jb-newtask");
      var title = input ? input.value.trim() : "";
      if (!title) { if (input) input.focus(); return; }
      send("POST", {
        resource: "task", job_id: job.id, title: title,
        role: el("jb-newtask-role").value, phase: el("jb-newtask-phase").value
      }).then(function (d) {
        if (!d) return;
        return refreshAfterWrite(job.id);
      }).catch(function (err) { toast("bad", "Could not add the task", err.message); });
      return;
    }

    var del = e.target.closest && e.target.closest('[data-act="delete-job"]');
    if (del) { deleteJob(job); return; }

    var cancel = e.target.closest && e.target.closest('[data-act="cancel-job"]');
    if (cancel) { cancelJob(job); }
  });

  el("jb-dbody").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    if (e.target && e.target.id === "jb-newtask") {
      e.preventDefault();
      var add = el("jb-dbody").querySelector('[data-act="add-task"]');
      if (add) add.click();
    }
  });

  /* ------------------------------------------------------------------- init --- */

  root.innerHTML = '<div class="jb-note-bar first"><span>Loading jobs…</span></div>';
  load();
})();
