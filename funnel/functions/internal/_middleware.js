/**
 * Gate for everything under /internal/*.
 *
 * Runs before the static internal docs are served. Two checks:
 *
 *   1. Is there a valid, unexpired session for an ACTIVE account? No → 302 to
 *      /login.html?next=<path>, so doc and board files are never served to a visitor.
 *   2. Is this page in a section hidden from that account (functions/_pages.js)? Yes →
 *      403. Removing the sidebar link is cosmetic; this is what actually stops an
 *      installer from opening /internal/finance by typing it.
 *
 * Failing closed is deliberate: no AUTH_SECRET or no reachable database means redirect
 * to login, never serve.
 */
import { resolveSession } from "../_auth.js";
import { isSectionHidden, sectionForPage } from "../_pages.js";

/** `/internal/finance.html` and `/internal/finance` both → `finance`. Assets → null. */
function slugFor(pathname) {
  const match = /^\/internal\/([a-z0-9-]+)(?:\.html)?$/i.exec(pathname || "");
  return match ? match[1].toLowerCase() : null;
}

/**
 * The refusal page. It carries a <main class="content"> so it reads correctly both on
 * its own and when the Command Center's SPA router fetches it and lifts out the main
 * element (assets/spa-router.js).
 */
function forbidden(section) {
  const label = section ? section.label : "This section";
  const body = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not available on this account</title>
<link rel="stylesheet" href="/internal/assets/style.css">
<main class="content">
  <p class="doc-eyebrow">ACCESS</p>
  <h1>Not available on this account.</h1>
  <p class="lede">${label} has been hidden from your login. Nothing is wrong — a founder
  set which sections this account can see.</p>
  <p>If you need it, ask a founder to tick it under <strong>Team &amp; access → Sections</strong>.
  <a href="/internal/">← Back to the command center</a></p>
</main>
</html>`;
  return new Response(body, {
    status: 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  let session = null;
  try {
    session = await resolveSession(request, env);
  } catch {
    session = null; // misconfiguration or database trouble — treat as signed out
  }

  if (!session) {
    const nextParam = encodeURIComponent(url.pathname + url.search);
    return Response.redirect(`${url.origin}/login.html?next=${nextParam}`, 302);
  }

  // The dashboard itself and shared assets (styles, vendor, downloads) have no slug and
  // stay available to every signed-in account.
  const section = sectionForPage(slugFor(url.pathname));
  if (section && isSectionHidden(session.user, section.key)) {
    return forbidden(section);
  }

  // Authenticated — serve the requested internal asset, but keep it out of
  // caches/indexes.
  const res = await next();
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(res.body, { status: res.status, headers });
}
