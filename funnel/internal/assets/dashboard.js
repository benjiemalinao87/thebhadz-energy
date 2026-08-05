/**
 * SC-00 Command Center dashboard — the page a founder lands on after signing in.
 *
 * Everything here is derived from data that already exists in D1. Nothing is a stored
 * string and nothing is invented: if a fact has no source (a homeowner interview lives in
 * ops/tree.md, a channel test in ops/channel-tests.md — neither is in the database), it is
 * absent rather than shown as a guess.
 *
 * Sources, each optional: a section hidden from this account 403s, and the panels it feeds
 * simply do not render.
 *   /api/jobs         jobs with gates, task counts, crew, money per job; installers
 *   /api/goals        countable founder goals with live progress and urgency
 *   /api/leads        contacts, their stage and their next action
 *   /api/finance      cash summary and 30-day burn
 *   /api/install-ops  payments, for what actually landed this week
 *   /api/mail         unread count
 *
 * Loaded at shell level, so the SPA router never removes it. Returning to the dashboard
 * re-runs window.ccRefreshDashboardMetrics (spa-router.js calls it on every home swap).
 */
(function () {
  "use strict";

  var ENERGIZED = ["energized", "handover", "warranty"];
  var SOLD = ["approved", "deposit_paid", "design", "permits", "procurement", "scheduled", "installing", "testing"];
  var ON_SITE = ["installing", "testing"];
  /* The stage sequence, so the funnel can ask "has this job reached at least X?" rather
     than "is it exactly X?". Counting exact stages made a funnel that went up as well as
     down — a job sold without a recorded survey_date showed Sold above Surveyed, which
     reads as a bug even though both numbers were individually true. */
  var STAGE_ORDER = ["survey", "quoted", "approved", "deposit_paid", "design", "permits",
    "procurement", "scheduled", "installing", "testing", "energized", "handover", "warranty"];
  function reached(job, stage) {
    if (job.stage === "cancelled") return false;
    var at = STAGE_ORDER.indexOf(job.stage);
    var want = STAGE_ORDER.indexOf(stage);
    return at >= 0 && want >= 0 && at >= want;
  }
  var OPEN_LEAD = ["lead", "contacted", "demoed", "quote_sent", "proposal"];

  var GATE_LABEL = {
    permit_checklist: "LGU permit",
    licensed_electrician_check: "electrician sign-off",
    net_metering_check: "net metering"
  };

  /* ------------------------------------------------------------------ utils --- */

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v) { return Number(v) || 0; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function daysBetween(a, b) {
    if (!a || !b) return null;
    return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
  }
  function peso(cents) { return "₱" + Math.round(num(cents) / 100).toLocaleString("en-PH"); }
  function pesoShort(cents) {
    var n = num(cents) / 100;
    if (Math.abs(n) >= 1000000) return "₱" + (n / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
    if (Math.abs(n) >= 1000) return "₱" + Math.round(n / 1000) + "k";
    return "₱" + Math.round(n);
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00Z");
    return isNaN(d) ? "—" : MONTHS[d.getUTCMonth()] + " " + d.getUTCDate();
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function firstName(name) { return String(name || "").trim().split(/\s+/)[0] || "—"; }

  function get(url) {
    return fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.ok ? d : null; })
      .catch(function () { return null; });
  }

  var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  function openGates(job) {
    return (job.missing_gates || []).map(function (k) { return GATE_LABEL[k] || k; });
  }
  function forecastCost(job) {
    return num(job.cost_forecast_cents) || num(job.target_cost_cents);
  }

  /* ------------------------------------------------------------------ queue --- */

  /**
   * Rank by consequence, which is the whole reason this panel replaced five equal cards:
   * safety and legal gates, then money at risk, then decay, then what is merely on track.
   */
  function buildQueue(data) {
    var jobs = (data.jobs && data.jobs.jobs) || [];
    var goals = (data.goals && data.goals.goals) || [];
    var leads = (data.leads && data.leads.leads) || [];
    var installers = (data.jobs && data.jobs.installers) || [];
    var now = today();
    var rows = [];

    // 1 · A sold job with an open compliance gate cannot go on site. Hard stop.
    jobs.forEach(function (j) {
      if (SOLD.indexOf(j.stage) < 0) return;
      var missing = openGates(j);
      if (!missing.length) return;
      var away = j.install_date ? daysBetween(now, j.install_date) : null;
      rows.push({
        sev: "stop", rank: 10, kind: "Safety gate",
        title: (j.job_code || "A job") + " cannot go on site",
        why: "Outstanding: " + missing.join(", ") + ". The stage move is refused server-side until they clear.",
        sub: [j.owner || "unowned", j.install_date ? "installs " + fmtDate(j.install_date) : "no install date"].join(" · "),
        href: "/internal/projects.html",
        urgent: away !== null && away <= 21
      });
    });

    // 2 · Overdue work on a live job.
    jobs.forEach(function (j) {
      var late = num(j.task_overdue);
      if (!late || j.stage === "cancelled") return;
      rows.push({
        sev: late >= 3 ? "stop" : "soon", rank: 20,
        kind: plural(late, "task") + " late",
        title: (j.job_code || "A job") + " has overdue checklist work",
        why: plural(late, "task") + " past due on " + esc(j.customer_name) + ". Re-date the install or reassign — the plan hangs off the install date.",
        sub: j.owner || "unowned",
        href: "/internal/projects.html"
      });
    });

    // 3 · A licence that expires before the install it is booked on. Legal, and invisible
    //     until the day it bites.
    var licensed = installers.filter(function (i) { return i.license_number && i.license_expiry; });
    jobs.forEach(function (j) {
      if (!j.install_date || ENERGIZED.indexOf(j.stage) >= 0) return;
      (j.crew || []).forEach(function (c) {
        var who = licensed.filter(function (i) { return i.id === c.id; })[0];
        if (!who || who.license_expiry >= j.install_date) return;
        rows.push({
          sev: "stop", rank: 15, kind: "Licence expired",
          title: firstName(who.name) + "'s licence expires before " + (j.job_code || "the install"),
          why: who.license_number + " expires " + fmtDate(who.license_expiry) + ", but the install is " +
            fmtDate(j.install_date) + ". Renew it or roster a different electrician.",
          sub: j.owner || "unowned",
          href: "/internal/install-ops.html"
        });
      });
    });

    // 4 · An install date with nobody rostered.
    jobs.forEach(function (j) {
      if (!j.install_date || (j.crew || []).length) return;
      var away = daysBetween(now, j.install_date);
      if (away === null || away < 0 || away > 21) return;
      rows.push({
        sev: away <= 7 ? "stop" : "soon", rank: 25, kind: "No crew",
        title: (j.job_code || "A job") + " has no crew rostered",
        why: "Installs " + fmtDate(j.install_date) + " (" + plural(away, "day") +
          " away) with nobody assigned. Confirm a lead installer and an electrician before the date is promised.",
        sub: j.owner || "unowned",
        href: "/internal/install-ops.html"
      });
    });

    // 5 · Goals that are overdue or at risk of missing the target.
    goals.forEach(function (g) {
      if (g.status === "Done" || g.status === "Missed") return;
      if (g.urgency !== "miss" && g.urgency !== "risk") return;
      var late = g.urgency === "miss";
      rows.push({
        sev: late ? "stop" : "soon", rank: late ? 30 : 40,
        kind: late ? "Goal missed pace" : "Goal at risk",
        title: g.title,
        why: (g.current || 0) + " of " + (g.target || 1) + " · ends " + fmtDate(g.end_date) +
          (g.days_left !== null && g.days_left < 0
            ? " (" + plural(Math.abs(g.days_left), "day") + " overdue)."
            : g.days_left !== null ? " (" + plural(g.days_left, "day") + " left)." : "."),
        sub: [g.assignee_name || g.owner_name || "unowned", g.metric].filter(Boolean).join(" · "),
        href: "/internal/goals.html"
      });
    });

    // 6 · A contact with no scheduled next step is a zombie, not a pipeline.
    var stalled = leads.filter(function (l) {
      return OPEN_LEAD.indexOf(l.stage) >= 0 && !String(l.next_action || "").trim();
    });
    if (stalled.length) {
      rows.push({
        sev: "soon", rank: 50, kind: "Decay",
        title: plural(stalled.length, "contact") + " with no next action",
        why: stalled.slice(0, 3).map(function (l) { return l.name; }).join(", ") +
          (stalled.length > 3 ? " and others" : "") +
          " have nothing scheduled. A lead with no next step will not advance itself.",
        sub: "Contacts",
        href: "/internal/leads.html"
      });
    }

    // 7 · A next action that has already come and gone.
    leads.forEach(function (l) {
      if (!l.next_action_due || l.next_action_due >= now) return;
      if (OPEN_LEAD.indexOf(l.stage) < 0) return;
      rows.push({
        sev: "stop", rank: 35,
        kind: plural(Math.abs(daysBetween(now, l.next_action_due)), "day") + " late",
        title: l.name + " — next action overdue",
        why: (l.next_action || "The scheduled step") + " was due " + fmtDate(l.next_action_due) + ".",
        sub: l.next_action_owner || "unowned",
        href: "/internal/leads.html"
      });
    });

    rows.sort(function (a, b) {
      var order = { stop: 0, soon: 1, ok: 2 };
      if (order[a.sev] !== order[b.sev]) return order[a.sev] - order[b.sev];
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      return a.rank - b.rank;
    });

    // 8 · One reassuring row, only when there is genuinely nothing wrong with it.
    var healthy = jobs.filter(function (j) {
      return j.install_date && !openGates(j).length && !num(j.task_overdue) &&
        ENERGIZED.indexOf(j.stage) < 0 && j.stage !== "cancelled" && (j.crew || []).length;
    }).sort(function (a, b) { return String(a.install_date).localeCompare(String(b.install_date)); })[0];
    if (healthy) {
      var margin = num(healthy.contract_price_cents) && forecastCost(healthy)
        ? Math.round((num(healthy.contract_price_cents) - forecastCost(healthy)) / num(healthy.contract_price_cents) * 100)
        : null;
      rows.push({
        sev: "ok", rank: 90, kind: "On track",
        title: healthy.customer_name + " installs " + fmtDate(healthy.install_date),
        why: "Gates signed, " + plural((healthy.crew || []).length, "crew member") + " rostered, " +
          num(healthy.task_done) + " of " + num(healthy.task_total) + " tasks done" +
          (margin === null ? "" : ", forecast margin " + margin + "%") + ". Nothing needed today.",
        sub: healthy.owner || "unowned",
        href: "/internal/projects.html"
      });
    }

    return rows.slice(0, 8);
  }

  /* ----------------------------------------------------------------- render --- */

  function renderQueue(rows) {
    if (!rows.length) {
      return '<p class="db-quiet">Nothing is blocking. Book an interview or advance an install.</p>';
    }
    return rows.map(function (r) {
      return '<a class="db-row" href="' + esc(r.href) + '" data-sev="' + r.sev + '">' +
        "<span>" +
          '<span class="t">' + esc(r.title) + "</span>" +
          '<span class="w">' + esc(r.why) + "</span>" +
        "</span>" +
        '<span class="meta">' +
          '<span class="kind">' + esc(r.kind) + "</span>" +
          '<span class="sub">' + esc(r.sub) + "</span>" +
        "</span>" +
        '<span class="chev">' + CHEV + "</span>" +
      "</a>";
    }).join("");
  }

  function renderMission(data) {
    var jobs = (data.jobs && data.jobs.jobs) || [];
    var goals = (data.goals && data.goals.goals) || [];
    var leads = (data.leads && data.leads.leads) || [];
    var fin = (data.finance && data.finance.summary) || {};

    // Cushion in installs, which is the wording the Founder OS mandates: how many installs'
    // worth of margin sits between us and stopping. Average margin comes from real jobs, so
    // with no costed job yet the figure is withheld rather than guessed.
    // Only jobs with actual cost lines. target_cost_cents is a plan, not a measurement, and
    // averaging it in makes the cushion look bigger than anything we have really earned.
    var costed = jobs.filter(function (j) {
      return num(j.contract_price_cents) && num(j.cost_forecast_cents);
    });
    var avgMargin = costed.length
      ? costed.reduce(function (s, j) { return s + (num(j.contract_price_cents) - num(j.cost_forecast_cents)); }, 0) / costed.length
      : 0;
    var available = num(fin.paid_inflows) - num(fin.paid_outflows) - num(fin.committed_outflows);
    var burn = num(fin.burn_30d);
    var cushion = avgMargin > 0 ? available / avgMargin : null;
    var months = burn > 0 ? available / burn : null;

    var activeGoals = goals.filter(function (g) { return g.status !== "Done" && g.status !== "Missed"; });
    var onTrack = activeGoals.filter(function (g) { return g.urgency === "ok" || g.urgency === "hit"; }).length;
    var pct = data.goals ? (activeGoals.length ? Math.round(onTrack / activeGoals.length * 100) : 100) : null;

    var cash = num(fin.customer_cash) || jobs.reduce(function (s, j) { return s + num(j.paid_cents); }, 0);
    var contracted = jobs.reduce(function (s, j) {
      return s + (j.stage === "cancelled" ? 0 : num(j.contract_price_cents));
    }, 0);

    var now = today();
    var weekAgo = new Date(now + "T00:00:00Z");
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    var since = weekAgo.toISOString().slice(0, 10);
    var totalLeads = data.leads ? leads.length : null;
    var newLeads = data.leads
      ? leads.filter(function (l) {
          var created = String(l.created_at || "").slice(0, 10);
          return created && created >= since;
        }).length
      : null;

    var cells = [];

    cells.push(
      '<div class="db-mc"><span class="db-eyebrow">Leads</span>' +
      '<span class="fig"><b class="n">' + (totalLeads === null ? "—" : totalLeads) + '</b><span>total</span></span>' +
      '<span class="db-bar"><i class="' + (newLeads ? "green" : "amber") + '" style="width:' +
        (totalLeads === null || !totalLeads
          ? 0
          : Math.max(2, Math.round((newLeads || 0) / totalLeads * 100))) + '%"></i></span>' +
      "<p>" + (totalLeads === null
        ? "Contacts not visible on this account."
        : "<b>" + plural(totalLeads, "lead") + "</b> · " +
          (newLeads ? "<b>" + plural(newLeads, "new lead") + "</b> in last 7 days." : "none new in last 7 days.")) +
      "</p></div>"
    );

    cells.push(
      '<div class="db-mc' + (cushion !== null && cushion < 3 ? " alarm" : "") + '">' +
      '<span class="db-eyebrow">Death clock</span>' +
      '<span class="fig"><b class="n">' + (cushion === null ? "—" : cushion.toFixed(1)) + "</b><span>installs</span></span>" +
      '<span class="db-bar"><i class="rust" style="width:' +
        (cushion === null ? 0 : Math.min(100, Math.round(cushion / 6 * 100))) + '%"></i></span>' +
      "<p>" + (cushion === null
        ? "No job has real cost lines yet, so there is no measured margin to size the cushion against."
        : "From being unable to continue. " + peso(available) + " available ÷ " + peso(avgMargin) +
          " measured margin on " + plural(costed.length, "costed install") + (months === null ? "" : " · about " + months.toFixed(1) + " months at " + peso(burn) + " burn")) +
      ".</p></div>"
    );

    cells.push(
      '<div class="db-mc"><span class="db-eyebrow">Goals on track</span>' +
      '<span class="fig"><b class="n">' + (pct === null ? "—" : pct) + "</b><span>%</span></span>" +
      '<span class="db-bar mark"><i class="' + (pct !== null && pct < 50 ? "rust" : "green") + '" style="width:' +
        (pct === null ? 0 : pct) + '%"></i></span>' +
      "<p>" + (pct === null
        ? "Goals not visible on this account."
        : !activeGoals.length
          ? 'No active goals. <a href="/internal/goals.html">Set one →</a>'
          : onTrack + " of " + activeGoals.length + " active goals on pace. " +
            (pct < 50 ? "<b>Behind — open Goals and reassign or re-scope.</b>" : "<b>On pace.</b>")) +
      "</p></div>"
    );

    cells.push(
      '<div class="db-mc"><span class="db-eyebrow">Customer cash received</span>' +
      '<span class="fig"><b class="n">' + peso(cash) + "</b></span>" +
      '<span class="db-bar"><i class="green" style="width:' +
        (contracted ? Math.min(100, Math.round(cash / contracted * 100)) : 0) + '%"></i></span>' +
      "<p>Deposits and progress payments" + (contracted ? ", against " + peso(contracted) + " contracted" : "") + ".</p></div>"
    );

    return cells.join("");
  }

  function renderGoals(data) {
    if (!data.goals) return "";
    var goals = data.goals.goals || [];
    var active = goals.filter(function (g) { return g.status !== "Done" && g.status !== "Missed"; });
    if (!active.length && !goals.length) {
      return '<section class="db-panel"><div class="db-ph"><h2>Goals</h2>' +
        '<span class="r"><a class="lnk" href="/internal/goals.html">Open →</a></span></div>' +
        '<div class="db-pb"><p style="margin:0;color:var(--ops-muted);font-size:13px">No goals yet. Set a countable outcome — leads, deposits, surveys — with a timeline.</p></div></section>';
    }
    var show = (active.length ? active : goals).slice(0, 4);
    return '<section class="db-panel"><div class="db-ph"><h2>Goals</h2>' +
      '<span class="r"><a class="lnk" href="/internal/goals.html">All goals →</a></span></div>' +
      '<div class="db-pb">' + show.map(function (g) {
        var tone = g.urgency === "hit" ? "green" : g.urgency === "risk" ? "amber" : g.urgency === "miss" ? "rust" : "";
        return '<div class="db-mrow"><span class="k">' + esc(g.title) + "</span>" +
          '<span class="v n">' + (g.current || 0) + "/" + (g.target || 1) + "</span></div>" +
          '<span class="db-bar" style="margin:2px 0 10px"><i class="' + tone + '" style="width:' +
          (g.pct || 0) + '%"></i></span>';
      }).join("") + "</div></section>";
  }

  function renderMoney(data) {
    var fin = data.finance && data.finance.summary;
    if (!fin) return "";
    var available = num(fin.paid_inflows) - num(fin.paid_outflows) - num(fin.committed_outflows);
    return '<section class="db-panel"><div class="db-ph"><h2>Money</h2>' +
      '<span class="r"><a class="lnk" href="/internal/finance.html">Ledger →</a></span></div>' +
      '<div class="db-pb">' +
      '<div class="db-mrow"><span class="k">Cash in</span><span class="v n">' + peso(fin.paid_inflows) + "</span></div>" +
      '<div class="db-mrow"><span class="k">Cash out</span><span class="v out n">−' + peso(fin.paid_outflows) + "</span></div>" +
      '<div class="db-mrow"><span class="k">Committed out</span><span class="v out n">−' + peso(fin.committed_outflows) + "</span></div>" +
      '<div class="db-mrow total"><span class="k">Available</span><span class="v n">' + peso(available) + "</span></div>" +
      "</div></section>";
  }

  function renderPipeline(data) {
    var jobs = (data.jobs && data.jobs.jobs) || [];
    if (!jobs.length) return "";

    // Jobs only, and each row counts jobs that have reached AT LEAST that stage, so the
    // funnel can only narrow. The contact count lives in the Workspaces strip, where it
    // isn't a funnel stage — a job can exist without a linked contact, and mixing the two
    // populations made this read as broken.
    var open = jobs.filter(function (j) { return j.stage !== "cancelled"; });
    var steps = [
      { l: "Jobs", v: open.length, tone: "" },
      { l: "Surveyed", v: open.filter(function (j) { return j.survey_date || reached(j, "quoted"); }).length, tone: "" },
      { l: "Sold", v: open.filter(function (j) { return reached(j, "approved"); }).length, tone: "green" },
      { l: "On site", v: open.filter(function (j) { return reached(j, "installing"); }).length, tone: "green" },
      { l: "Energized", v: open.filter(function (j) { return reached(j, "energized"); }).length, tone: "green" }
    ];
    var top = Math.max.apply(null, steps.map(function (s) { return s.v; })) || 1;

    return '<section class="db-panel"><div class="db-ph"><h2>Pipeline</h2></div><div class="db-pb">' +
      '<div class="db-fun">' + steps.map(function (s) {
        return '<span class="db-fstep"><span class="l">' + esc(s.l) + "</span>" +
          '<span class="db-bar"><i class="' + s.tone + '" style="width:' +
          Math.max(1.5, Math.round(s.v / top * 100)) + '%"></i></span>' +
          '<span class="v n">' + s.v + "</span></span>";
      }).join("") + "</div>" +
      '<p class="db-note">The gap between <b>sold</b> and <b>energized</b> is the Mission. ' +
      "Nothing counts until it closes.</p>" +
      "</div></section>";
  }

  /**
   * What actually landed or lands this week, in outcomes rather than outputs. Only rows
   * with a real source appear: homeowner interviews and channel-test scores live in
   * markdown, not D1, so they are not faked into a status here.
   */
  function renderWeek(data) {
    var jobs = (data.jobs && data.jobs.jobs) || [];
    var payments = (data.ops && data.ops.payments) || [];
    var now = today();
    var weekAgo = new Date(now + "T00:00:00Z");
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    var since = weekAgo.toISOString().slice(0, 10);
    var weekEnd = new Date(now + "T00:00:00Z");
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    var until = weekEnd.toISOString().slice(0, 10);

    function within(date, a, b) { return date && date >= a && date <= b; }

    var installs = jobs.filter(function (j) { return within(j.install_date, now, until); });
    var surveys = jobs.filter(function (j) { return within(j.survey_date, now, until); });
    var deposits = payments.filter(function (p) {
      return p.status === "received" && p.kind === "deposit" && within(p.payment_date, since, now);
    });

    var rows = [
      ["Install on site", installs.length
        ? { s: "yes", t: installs.map(function (j) { return firstName(j.customer_name); }).join(", ") }
        : { s: "none", t: "None booked" }],
      ["Survey booked", surveys.length
        ? { s: "yes", t: surveys.map(function (j) { return firstName(j.customer_name); }).join(", ") }
        : { s: "none", t: "None booked" }],
      ["Deposit banked", deposits.length
        ? { s: "yes", t: deposits.length + " · " + peso(deposits.reduce(function (n, p) { return n + num(p.amount_cents); }, 0)) }
        : { s: "no", t: "None in 7 days" }]
    ];

    return '<section class="db-panel"><div class="db-ph"><h2>This week</h2></div><div class="db-pb">' +
      rows.map(function (r) {
        return '<div class="db-wrow"><span class="k">' + esc(r[0]) + "</span>" +
          '<span class="s ' + r[1].s + '">' + esc(r[1].t) + "</span></div>";
      }).join("") + "</div></section>";
  }

  function renderWorkspaces(data) {
    var jobs = (data.jobs && data.jobs.jobs) || [];
    var leads = (data.leads && data.leads.leads) || [];
    var fin = (data.finance && data.finance.summary) || null;

    var blocked = jobs.filter(function (j) {
      return SOLD.indexOf(j.stage) >= 0 && openGates(j).length;
    }).length;
    var live = jobs.filter(function (j) { return ENERGIZED.indexOf(j.stage) < 0 && j.stage !== "cancelled"; }).length;
    var openLeads = leads.filter(function (l) { return OPEN_LEAD.indexOf(l.stage) >= 0; }).length;
    var available = fin ? num(fin.paid_inflows) - num(fin.paid_outflows) - num(fin.committed_outflows) : null;

    var ICONS = {
      jobs: '<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M10 21v-6h4v6"/>',
      contacts: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
      finance: '<path d="M3 3v18h18"/><path d="m7 16 4-5 3 3 5-7"/>',
      mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
      docs: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
      quote: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>'
    };

    var cards = [];
    if (data.jobs) cards.push({ k: "jobs", section: "projects", name: "Jobs", href: "/internal/projects.html", stat: blocked ? live + " · " + blocked + " blocked" : live + " active" });
    if (data.leads) cards.push({ k: "contacts", section: "leads", name: "Contacts", href: "/internal/leads.html", stat: openLeads + " open" });
    if (fin) cards.push({ k: "finance", section: "finance", name: "Finance", href: "/internal/finance.html", stat: pesoShort(available) });
    cards.push({ k: "mail", section: "mail", name: "Mailbox", href: "/internal/mail.html", stat: (data.unread === null ? "—" : data.unread + " unread") });
    cards.push({ k: "docs", section: "documents", name: "Documents", href: "/internal/docs.html", stat: "permits" });
    cards.push({ k: "quote", section: "quotes", name: "Quotes", href: "/internal/quote-builder.html", stat: "pricing" });

    return '<section class="db-panel"><div class="db-ph"><h2>Workspaces</h2>' +
      '<span class="r"><a class="lnk" href="/internal/apps.html">All apps →</a></span></div>' +
      '<div class="db-ws">' + cards.map(function (c) {
        return '<a class="db-wcard" href="' + esc(c.href) + '" data-section="' + esc(c.section) + '">' +
          '<span class="db-wtop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' + ICONS[c.k] + "</svg>" +
          "<b>" + esc(c.name) + "</b></span>" +
          '<span class="stat">' + esc(c.stat) + "</span></a>";
      }).join("") + "</div></section>";
  }

  /**
   * A temporary password means somebody else knows it, so anything done with this account
   * is not yet attributable. Login no longer forces a detour to change it, which is why
   * this sits at the top of the dashboard until it is resolved — it is not dismissible.
   */
  function renderPasswordNotice(session) {
    if (!session || !session.user || !session.user.must_change) return "";
    return '<div class="db-notice"><span class="ic" aria-hidden="true">!</span><span>' +
      "<b>Set your own password.</b>" +
      "You are signed in with a temporary password someone else created. Until you replace it, " +
      "they can sign in as you and the activity log will read as if you did it. " +
      '<a href="/internal/team.html?password=change">Change it now →</a>' +
      "</span></div>";
  }

  /* ------------------------------------------------------------------- init --- */

  function render() {
    var root = document.getElementById("db-root");
    if (!root) return Promise.resolve();   // not on the dashboard view

    return Promise.all([
      window.scSectionVisibility ? window.scSectionVisibility.session() : null,
      get("/api/jobs"),
      get("/api/goals"),
      get("/api/leads"),
      get("/api/finance"),
      get("/api/install-ops"),
      // The mailbox reports its own unread count; ?box=in is what the endpoint expects.
      get("/api/mail?box=in")
    ]).then(function (r) {
      var session = r[0];
      var data = {
        jobs: r[1], goals: r[2], leads: r[3], finance: r[4], ops: r[5],
        unread: r[6] ? num(r[6].unread) : null
      };

      // Everything hidden or unreachable: say so plainly instead of drawing empty panels.
      if (!data.jobs && !data.goals && !data.leads && !data.finance) {
        root.innerHTML = '<div class="db-err"><span aria-hidden="true">!</span><span>' +
          "<b>No dashboard data available</b>Either this account cannot see these sections, " +
          "or the database is unreachable. Open Apps to go somewhere directly.</span></div>";
        return;
      }

      var queue = buildQueue(data);
      var blocking = queue.filter(function (q) { return q.sev === "stop"; }).length;

      root.innerHTML =
        renderPasswordNotice(session) +
        '<section class="db-mission" aria-label="Key metrics">' + renderMission(data) + "</section>" +
        '<div class="db-cols">' +
          '<div class="db-stack">' +
            '<section class="db-panel"><div class="db-ph"><h2>Needs you today</h2>' +
              '<span class="db-count' + (blocking ? "" : " clear") + '">' +
                (blocking ? blocking + " blocking" : "clear") + "</span>" +
              '<span class="r"><a class="lnk" href="/internal/next-actions.html">All next actions →</a></span>' +
            "</div>" + renderQueue(queue) + "</section>" +
            renderWorkspaces(data) +
          "</div>" +
          '<div class="db-stack">' + renderGoals(data) + renderMoney(data) + renderPipeline(data) + renderWeek(data) + "</div>" +
        "</div>";

      // Drop anything this account may not open (the API would 403 anyway).
      if (window.scSectionVisibility) window.scSectionVisibility.apply(root);
    }).catch(function (err) {
      root.innerHTML = '<div class="db-err"><span aria-hidden="true">!</span><span>' +
        "<b>Could not load the dashboard</b>" + esc(err && err.message ? err.message : "Unknown error") +
        "</span></div>";
    });
  }

  // spa-router.js calls this on every swap back to the home view; index.html calls it once
  // at load. Same function either way, so the dashboard is never stale after navigation.
  window.ccRefreshDashboardMetrics = render;
  render();
})();
