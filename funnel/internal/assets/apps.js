/**
 * /internal/apps.html — greet the signed-in founder, hide the tiles their account may not
 * open, and put a live number on the four tiles that have one.
 *
 * Runs its init immediately rather than on DOMContentLoaded, and returns early when its
 * anchor is absent: the SPA router re-creates and re-executes page scripts on every swap,
 * and DOMContentLoaded only fires once (see spa-router.js).
 */
(function () {
  "use strict";

  var grid = document.getElementById("apps-grid");
  if (!grid) return;

  function num(v) { return Number(v) || 0; }
  function peso(cents) { return "₱" + Math.round(num(cents) / 100).toLocaleString("en-PH"); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

  function get(url) {
    return fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.ok ? d : null; })
      .catch(function () { return null; });
  }

  function stat(name) { return grid.querySelector('[data-stat="' + name + '"]'); }
  function setStat(name, text, warn) {
    var el = stat(name);
    if (!el) return;              // the tile was hidden for this account
    el.textContent = text;
    if (warn) el.classList.add("warn");
  }

  /* --- who is signed in, and which tiles they may see ---------------------------- */

  // One session lookup for both jobs, shared with the shell via section-visibility.js.
  if (window.scSectionVisibility) {
    window.scSectionVisibility.apply(grid, {
      groups: [[".apps-group", ".app"]]      // a group emptied by hiding shouldn't linger
    }).then(function (session) {
      var head = document.getElementById("apps-greeting");
      if (!head || !session || !session.user) return;

      // The shared team password signs in as one ordinary account whose name is a label,
      // not a person — greeting it by its first word produced "Good afternoon, Shared".
      // Address the team instead, and never split a name that isn't one.
      var hour = new Date().getHours();
      var part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
      var who = session.shared ? "team" : String(session.user.name || "").trim().split(/\s+/)[0];
      head.textContent = who ? part + ", " + who : "Apps";
    });
  }

  /* --- live counts on the tiles that have a real source -------------------------- */

  var ENERGIZED = ["energized", "handover", "warranty"];
  var SOLD = ["approved", "deposit_paid", "design", "permits", "procurement", "scheduled", "installing", "testing"];
  var OPEN_LEAD = ["lead", "contacted", "demoed", "quote_sent", "proposal"];

  Promise.all([
    stat("jobs") ? get("/api/jobs") : null,
    stat("leads") ? get("/api/leads") : null,
    stat("finance") ? get("/api/finance") : null,
    stat("mail") ? get("/api/mail?box=in") : null
  ]).then(function (r) {
    var jobsData = r[0], leadsData = r[1], finData = r[2], mailData = r[3];

    if (jobsData) {
      var jobs = jobsData.jobs || [];
      var live = jobs.filter(function (j) {
        return ENERGIZED.indexOf(j.stage) < 0 && j.stage !== "cancelled";
      }).length;
      var blocked = jobs.filter(function (j) {
        return SOLD.indexOf(j.stage) >= 0 && (j.missing_gates || []).length;
      }).length;
      setStat("jobs", blocked
        ? plural(live, "job") + " · " + blocked + " blocked by gates"
        : plural(live, "job") + " in flight", !!blocked);
    }

    if (leadsData) {
      var leads = leadsData.leads || [];
      var open = leads.filter(function (l) { return OPEN_LEAD.indexOf(l.stage) >= 0; }).length;
      var stalled = leads.filter(function (l) {
        return OPEN_LEAD.indexOf(l.stage) >= 0 && !String(l.next_action || "").trim();
      }).length;
      setStat("leads", stalled
        ? plural(open, "open contact") + " · " + stalled + " with no next action"
        : plural(open, "open contact"), !!stalled);
    }

    if (finData && finData.summary) {
      var s = finData.summary;
      setStat("finance", peso(num(s.paid_inflows) - num(s.paid_outflows) - num(s.committed_outflows)) + " available");
    }

    if (mailData) {
      var unread = num(mailData.unread);
      setStat("mail", unread ? plural(unread, "unread thread") : "Inbox clear", !!unread);
    }
  });
})();
