/**
 * The one place the Command Center decides what day it is. Browser twin of
 * functions/_ph-date.js — see that file for why (Workers run UTC, the company runs
 * Manila, and `toISOString().slice(0,10)` is yesterday until 08:00 PHT).
 *
 * Deliberately NOT the browser's local timezone: a founder checking the board from a
 * flight must see the same "today" the server used to mark a task overdue. Loaded from
 * every tool page's <head>, right after theme.js, so page scripts can call it on sight.
 *
 * Fixed +08:00, no DST — the Philippines has not observed daylight saving since 1978.
 */
(function () {
  var PH_OFFSET_MS = 8 * 60 * 60 * 1000;

  /** Manila calendar date (YYYY-MM-DD) for an instant, a Date, or an ISO string. */
  function phDate(when) {
    var ms;
    if (when == null) ms = Date.now();
    else if (when instanceof Date) ms = when.getTime();
    else if (typeof when === "number") ms = when;
    else ms = new Date(when).getTime();
    if (!isFinite(ms)) return "";
    return new Date(ms + PH_OFFSET_MS).toISOString().slice(0, 10);
  }

  window.phDate = phDate;
  /** Today in Manila (YYYY-MM-DD). */
  window.phToday = function () { return phDate(); };
  /** Manila date `days` from today — negative counts back. */
  window.phDaysFromToday = function (days) { return phDate(Date.now() + days * 86400000); };
})();
