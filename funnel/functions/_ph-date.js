/**
 * The one place the server decides what day it is.
 *
 * Workers run in UTC and the whole company runs in Manila, so `new Date().toISOString()`
 * is the wrong calendar day for the first eight hours of every PH working morning:
 * at 06:00 in Naval it is still yesterday in UTC. That silently mis-dated overdue
 * flags, "this week" windows and default due dates.
 *
 * Fixed +08:00, no DST: the Philippines has not observed daylight saving since 1978, so
 * a plain offset is exact and needs no ICU data. Shifting the instant and then reading
 * the UTC calendar fields off it gives the Manila calendar date.
 */

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Manila calendar date (YYYY-MM-DD) for an instant — defaults to now. */
export function phDate(when = Date.now()) {
  const ms = when instanceof Date ? when.getTime() : Number(when);
  return new Date(ms + PH_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today in Manila (YYYY-MM-DD). */
export function phToday() {
  return phDate();
}

/** Manila date `days` from today — negative counts back. */
export function phDaysFromToday(days) {
  return phDate(Date.now() + days * 86400000);
}
