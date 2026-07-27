/**
 * SC-17 Next actions — one ranked list of what to do next, across the whole business.
 *
 * Reads three existing APIs and derives a single next action per item:
 *   /api/leads        the founder-set next action on each lead (SC-CRM), plus leads in
 *                     a selling stage with nothing set at all — those are the dangerous
 *                     ones, so they are surfaced rather than left quiet.
 *   /api/install-ops  derived from the project's stage, with the compliance gate
 *                     outranking everything else when it is incomplete.
 *   /api/projects     board tasks that are live (This week / Doing / Blocked).
 *
 * Nothing is stored here. This page is a lens over data other tools own, so there is no
 * new schema, nothing to keep in sync, and no way for it to disagree with the source.
 *
 * Section visibility (functions/_pages.js) can hide any of those APIs from an account.
 * A 401/403 is therefore an expected outcome, not an error: that source is skipped and
 * the page says so, instead of failing whole.
 *
 * SPA note: init runs immediately (no DOMContentLoaded) and bails if its anchor is gone.
 */
(function () {
  "use strict";

  var root = document.getElementById("na-root");
  if (!root) return;

  /* ---------------------------------------------------------------- helpers */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function todayYMD() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  /** Whole days from today; negative = overdue. Date-only, so no timezone drift. */
  function daysUntil(ymd) {
    if (!ymd) return null;
    var a = new Date(String(ymd).slice(0, 10) + "T00:00:00");
    var b = new Date(todayYMD() + "T00:00:00");
    if (isNaN(a)) return null;
    return Math.round((a - b) / 86400000);
  }
  function daysSince(iso) {
    if (!iso) return null;
    var a = new Date(iso);
    if (isNaN(a)) return null;
    return Math.floor((Date.now() - a.getTime()) / 86400000);
  }
  function fmtDue(ymd) {
    var d = daysUntil(ymd);
    if (d === null) return "";
    if (d < 0) return Math.abs(d) + "d overdue";
    if (d === 0) return "today";
    if (d === 1) return "tomorrow";
    return "in " + d + "d";
  }

  /*
   * Urgency buckets, in the order they are shown. `rank` sorts within the whole list.
   *   gate      a hard compliance/safety block — nothing else matters until it clears
   *   overdue   past its due date
   *   today     due today
   *   soon      due within 3 days
   *   adrift    live work with NO next step at all (the silent killer)
   *   later     scheduled further out
   */
  var BUCKETS = {
    gate: { label: "Blocked by a hard gate", rank: 0, tone: "stop" },
    overdue: { label: "Overdue", rank: 1, tone: "stop" },
    today: { label: "Due today", rank: 2, tone: "warn" },
    soon: { label: "Next 3 days", rank: 3, tone: "warn" },
    adrift: { label: "No next step set", rank: 4, tone: "stop" },
    later: { label: "Scheduled", rank: 5, tone: "" }
  };

  function bucketFor(due) {
    var d = daysUntil(due);
    if (d === null) return "later";
    if (d < 0) return "overdue";
    if (d === 0) return "today";
    if (d <= 3) return "soon";
    return "later";
  }

  /* ------------------------------------------------------------ derivations */

  var SELLING_STAGES = ["lead", "contacted", "demoed", "proposal"];

  function fromLeads(leads) {
    var out = [];
    (leads || []).forEach(function (l) {
      var live = SELLING_STAGES.indexOf(l.stage) !== -1;
      if (l.next_action && String(l.next_action).trim()) {
        out.push({
          source: "LEAD", who: l.name || "Unnamed lead",
          action: l.next_action, owner: l.next_action_owner || "",
          due: l.next_action_due || "", bucket: bucketFor(l.next_action_due),
          href: "/internal/leads.html", context: "Stage: " + (l.stage || "—")
        });
        return;
      }
      if (!live) return;
      // A lead being actively sold to, with no next step, is how "keep me posted"
      // becomes a dead pipeline. Age is the argument, so it is shown.
      var age = daysSince(l.updated_at || l.created_at);
      out.push({
        source: "LEAD", who: l.name || "Unnamed lead",
        action: "Set a next step — or mark this lost.",
        owner: "", due: "", bucket: "adrift",
        href: "/internal/leads.html",
        context: "Stage: " + (l.stage || "—") + (age != null ? " · untouched " + age + "d" : "")
      });
    });
    return out;
  }

  // What advances an install project, per stage. Kept in the same order as the
  // install_projects stage CHECK constraint so a new stage is obvious if one is added.
  var INSTALL_NEXT = {
    survey: "Run the site survey and confirm the design.",
    quoted: "Chase the quote — ask for a decision date.",
    approved: "Collect the deposit.",
    deposit_paid: "Start the design package.",
    design: "File the LGU electrical permit.",
    permits: "Procure equipment for this job.",
    procurement: "Schedule the install and confirm the crew.",
    scheduled: "Confirm materials and crew for install day.",
    installing: "Complete installation and run the tests.",
    testing: "Energise and book the walkthrough.",
    energized: "Deliver the handover pack, then ask for the referral.",
    handover: "Check the first lower bill with the customer.",
    warranty: "",
    cancelled: ""
  };

  function fromInstalls(projects) {
    var out = [];
    (projects || []).forEach(function (p) {
      if (p.stage === "cancelled" || p.stage === "warranty") return;

      // The §7 hard gate outranks the stage's own next step: no project may advance
      // past a deposit without permit, licensed-practitioner and net-metering sign-off.
      var gated = ["deposit_paid", "design", "permits", "procurement", "scheduled", "installing"];
      var missing = [];
      if (!Number(p.permit_checklist)) missing.push("permit");
      if (!Number(p.licensed_electrician_check)) missing.push("licensed practitioner");
      if (!Number(p.net_metering_check)) missing.push("net metering");
      if (missing.length && gated.indexOf(p.stage) !== -1) {
        out.push({
          source: "INSTALL", who: p.customer_name || "Install project",
          action: "Compliance gate incomplete — close " + missing.join(", ") + ".",
          owner: p.owner || "", due: p.install_date || "", bucket: "gate",
          href: "/internal/install-ops.html", context: "Stage: " + p.stage
        });
        return;
      }

      var action = INSTALL_NEXT[p.stage];
      if (!action) return;
      var due = p.stage === "survey" ? (p.survey_date || "") : (p.install_date || "");
      out.push({
        source: "INSTALL", who: p.customer_name || "Install project",
        action: action, owner: p.owner || "", due: due,
        bucket: bucketFor(due), href: "/internal/install-ops.html",
        context: "Stage: " + p.stage
      });
    });
    return out;
  }

  function fromTasks(tasks) {
    var live = { "This week": 1, "Doing": 1, "Blocked": 1 };
    return (tasks || []).filter(function (t) { return live[t.status]; }).map(function (t) {
      var title = t.title || "Untitled task";
      return {
        source: "TASK",
        // For a board task the title IS the action, so it leads. Prefixing a blocked
        // one keeps the reason visible without demoting what the work actually is.
        action: t.status === "Blocked" ? "Unblock: " + title : title,
        who: "Project board", owner: t.owner || "", due: t.due || "",
        bucket: t.status === "Blocked" && !t.due ? "adrift" : bucketFor(t.due),
        href: "/internal/projects.html",
        context: t.type + " · " + t.status
      };
    });
  }

  /* -------------------------------------------------------------- rendering */

  function sortItems(items) {
    return items.slice().sort(function (a, b) {
      var ra = BUCKETS[a.bucket].rank, rb = BUCKETS[b.bucket].rank;
      if (ra !== rb) return ra - rb;
      var da = daysUntil(a.due), db = daysUntil(b.due);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  }

  function render(items, skipped) {
    var counts = { gate: 0, overdue: 0, today: 0, soon: 0, adrift: 0, later: 0 };
    items.forEach(function (i) { counts[i.bucket]++; });

    document.getElementById("na-metrics").innerHTML =
      '<div class="ops-metric' + (counts.gate ? " warn" : "") + '"><span>Hard gates</span><strong>' + counts.gate + '</strong><small>Compliance blocked</small></div>' +
      '<div class="ops-metric' + (counts.overdue ? " warn" : "") + '"><span>Overdue</span><strong>' + counts.overdue + '</strong><small>Past due date</small></div>' +
      '<div class="ops-metric"><span>Due today</span><strong>' + counts.today + '</strong><small>Do these now</small></div>' +
      '<div class="ops-metric"><span>Next 3 days</span><strong>' + counts.soon + '</strong><small>Coming up</small></div>' +
      '<div class="ops-metric' + (counts.adrift ? " warn" : "") + '"><span>No next step</span><strong>' + counts.adrift + '</strong><small>Live work, adrift</small></div>' +
      '<div class="ops-metric good"><span>Total open</span><strong>' + items.length + '</strong><small>Across all sources</small></div>';

    var host = document.getElementById("na-list");
    if (!items.length) {
      host.innerHTML = '<div class="ops-empty">Nothing open. Either everything is genuinely done, or work is not being tracked — check the leads pipeline before believing this.</div>';
    } else {
      var order = ["gate", "overdue", "today", "soon", "adrift", "later"];
      var html = "";
      order.forEach(function (key) {
        var group = items.filter(function (i) { return i.bucket === key; });
        if (!group.length) return;
        html += '<div class="na-group"><h3 class="na-group-head ' + BUCKETS[key].tone + '">' +
          esc(BUCKETS[key].label) + ' <span>' + group.length + '</span></h3>';
        group.forEach(function (i) {
          html += '<a class="na-item ' + BUCKETS[i.bucket].tone + '" href="' + i.href + '">' +
            '<span class="na-src src-' + i.source.toLowerCase() + '">' + i.source + '</span>' +
            '<span class="na-body"><strong>' + esc(i.action) + '</strong>' +
              '<small>' + esc(i.who) + ' · ' + esc(i.context) + (i.owner ? ' · ' + esc(i.owner) : '') + '</small></span>' +
            '<span class="na-due">' + esc(fmtDue(i.due) || "no date") + '</span>' +
          '</a>';
        });
        html += '</div>';
      });
      host.innerHTML = html;
    }

    document.getElementById("na-status").textContent =
      items.length + " open action" + (items.length === 1 ? "" : "s") + " · refreshed " +
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    var note = document.getElementById("na-skipped");
    if (skipped.length) {
      note.innerHTML = '<div class="ops-alert"><strong>Some sources were not readable.</strong>' +
        esc(skipped.join(", ")) + ' — either your account does not have that section, or the request failed. ' +
        'This list is incomplete.</div>';
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  }

  /* ------------------------------------------------------------------ load */

  /** Fetch one source; a hidden section or a failure yields null rather than throwing. */
  function grab(url) {
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.ok ? d : null; })
      .catch(function () { return null; });
  }

  function load() {
    document.getElementById("na-status").textContent = "Loading…";
    Promise.all([
      grab("/api/leads"),
      grab("/api/install-ops"),
      grab("/api/projects")
    ]).then(function (res) {
      var skipped = [];
      var items = [];
      if (res[0]) items = items.concat(fromLeads(res[0].leads)); else skipped.push("Contacts / leads");
      if (res[1]) items = items.concat(fromInstalls(res[1].projects)); else skipped.push("Install operations");
      if (res[2]) items = items.concat(fromTasks(res[2].tasks)); else skipped.push("Project board");
      render(sortItems(items), skipped);
    });
  }

  document.getElementById("na-refresh").addEventListener("click", load);
  load();
})();
