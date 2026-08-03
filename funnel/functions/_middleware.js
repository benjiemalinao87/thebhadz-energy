/**
 * Host-level routing for the one Pages project that serves two audiences.
 *
 * The public site (`macc-inc.com`, `www.macc-inc.com`) and the founders' Command Center
 * (`founders.macc-inc.com`) are the same deployment, so `/` resolved to the customer
 * landing page on both — a founder typing the founders hostname got the marketing funnel
 * instead of a way in.
 *
 * This sends the founders hostname's root to the sign-in page and leaves every other host
 * and path exactly as it was. `_redirects` cannot express it: Cloudflare Pages matches that
 * file on paths only, with no hostname condition.
 *
 * Cost note — a root `_middleware.js` runs on every request to this project, including
 * static assets, so the hot path here is deliberately two string comparisons and an early
 * `next()`. Nothing else in the chain changes: `functions/api/_middleware.js` and
 * `functions/internal/_middleware.js` still run for their own routes.
 */

/**
 * Hosts whose root should open the Command Center rather than the funnel.
 *
 * `FOUNDERS_HOST` overrides this if the hostname ever changes; the default also accepts any
 * host whose first label is `founders`, so a preview deployment on
 * `founders.<branch>.pages.dev` behaves the same way as production.
 */
function isFoundersHost(hostname, env) {
  const host = String(hostname || "").toLowerCase();
  const configured = String((env && env.FOUNDERS_HOST) || "").toLowerCase().trim();
  if (configured) return host === configured;
  return host === "founders.macc-inc.com" || host.startsWith("founders.");
}

// Only the site root. A founder deep-linking to /calc.html or any other public page on this
// host still gets that page — this is about the bare hostname having no useful landing.
const ROOTS = new Set(["/", "/index.html", "/index"]);

export async function onRequest(context) {
  const { request, env, next } = context;

  const url = new URL(request.url);
  if (!ROOTS.has(url.pathname) || !isFoundersHost(url.hostname, env)) return next();

  // Somebody who already has a session should land on the dashboard, not a sign-in form.
  // Presence of the cookie is enough to route on: functions/internal/_middleware.js
  // validates it and bounces a stale one back to /login, so there is no need to pay for a
  // database lookup here.
  const hasSession = /(?:^|;\s*)sc_founder=/.test(request.headers.get("Cookie") || "");
  const target = new URL(hasSession ? "/internal/" : "/login", url);
  target.search = url.search;   // keep ?next=… and any campaign parameters intact

  return Response.redirect(target.toString(), 302);
}
