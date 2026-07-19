/**
 * Command Center SPA router.
 *
 * The sidebar (this document's <aside class="cc-sidebar">) is permanent. Clicking any
 * /internal/*.html nav link fetches that page, pulls out its <main>, linked/inline styles,
 * and scripts, and swaps them into this document's #cc-view slot —
 * instead of a full page reload. The URL bar and back/forward still work via pushState.
 *
 * Every /internal/*.html page keeps working as a normal standalone document too (direct
 * load, a shared link, no-JS, or founder-auth's redirect to /login.html all hit the real
 * file) — this router is a progressive enhancement on top of that, not a replacement.
 *
 * Script re-execution: a <script> element that's already run does NOT re-run just because
 * you navigate again, even if left in the DOM (browsers only execute a script element once,
 * at insertion time). So every navigation removes the previous view's injected <style>/
 * <script> elements and creates fresh ones. Page scripts must not depend on
 * "DOMContentLoaded" (it only fires once, at the SPA shell's initial load) — they must run
 * their init immediately, guarded by an early return if their anchor element isn't present
 * (the pattern already used by finance.js/founder-lab.js/install-ops.js/projects.js).
 */
(function () {
  "use strict";

  var VIEW_ID = "cc-view";
  var view = document.getElementById(VIEW_ID);
  if (!view) return; // Not the SPA shell (e.g. a page loaded standalone) — do nothing.

  var injected = []; // Per-view styles/scripts to remove before the next swap.
  var currentPath = location.pathname;
  var routeStatus = document.getElementById("cc-route-status");
  var OPERATION_PATHS = [
    "/internal/leads.html",
    "/internal/meetings.html",
    "/internal/notes.html",
    "/internal/projects.html",
    "/internal/finance.html"
  ];

  function isInternalPageLink(a) {
    if (!a || !a.getAttribute) return false;
    var href = a.getAttribute("href");
    if (!href) return false;
    if (href.charAt(0) === "#") return false; // in-page anchor (dashboard sections)
    if (a.target && a.target !== "" && a.target !== "_self") return false; // e.g. target="_blank"
    var url;
    try {
      url = new URL(href, location.href);
    } catch (_) {
      return false;
    }
    if (url.origin !== location.origin) return false;
    if (!/^\/internal\/[a-z0-9-]+\.html$/i.test(url.pathname)) return false;
    return true;
  }

  function setActiveNav(pathname) {
    var items = document.querySelectorAll(".cc-sb-item[href]");
    var matched = false;
    for (var i = 0; i < items.length; i++) {
      var href = items[i].getAttribute("href");
      var samePage = false;
      try {
        if (href.charAt(0) === "#") {
          items[i].classList.remove("active");
          continue;
        }
        samePage = !matched && new URL(href, location.href).pathname === pathname;
      } catch (_) {}
      if (samePage) matched = true;
      items[i].classList.toggle("active", samePage);
    }
  }

  function clearInjected() {
    injected.forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    injected = [];
  }

  // Re-create style/script nodes fresh so the browser applies or executes them. Relative
  // URLs must resolve against the fetched page, not whichever SPA route is in the address bar.
  function activateNode(sourceEl, target, baseUrl) {
    var clone = document.createElement(sourceEl.tagName);
    for (var i = 0; i < sourceEl.attributes.length; i++) {
      var attr = sourceEl.attributes[i];
      var value = attr.value;
      if ((attr.name === "href" || attr.name === "src") && value) {
        value = new URL(value, baseUrl).href;
      }
      clone.setAttribute(attr.name, value);
    }
    if (!sourceEl.src) clone.textContent = sourceEl.textContent;
    target.appendChild(clone);
    injected.push(clone);
    return clone;
  }

  function loadStyles(styleEls, target, baseUrl, done) {
    var remaining = styleEls.length;
    if (!remaining) return done();

    function settled() {
      remaining--;
      if (!remaining) done();
    }

    styleEls.forEach(function (source) {
      if (source.tagName === "LINK") {
        var absoluteHref = new URL(source.getAttribute("href"), baseUrl).href;
        var alreadyPresent = Array.prototype.some.call(
          document.querySelectorAll('link[rel~="stylesheet"]'),
          function (link) { return link.href === absoluteHref; }
        );
        if (alreadyPresent) return settled();
      }
      var clone = activateNode(source, target, baseUrl);
      if (clone.tagName === "LINK") {
        var finished = false;
        var finishLink = function () {
          if (finished) return;
          finished = true;
          settled();
        };
        clone.addEventListener("load", finishLink, { once: true });
        clone.addEventListener("error", finishLink, { once: true });
        // A cached stylesheet can be available before listeners are attached.
        if (clone.sheet) setTimeout(finishLink, 0);
      } else {
        settled();
      }
    });
  }

  function loadScriptsInOrder(scriptEls, target, baseUrl, done) {
    // Preserve document order (map.html depends on d3 -> biliran-geo.js -> inline script,
    // in that order) instead of firing them in parallel.
    var i = 0;
    function next() {
      if (i >= scriptEls.length) {
        if (typeof done === "function") done();
        return;
      }
      var src = scriptEls[i];
      var clone = activateNode(src, target, baseUrl);
      i++;
      if (clone.src) {
        clone.addEventListener("load", next);
        clone.addEventListener("error", next);
      } else {
        next();
      }
    }
    next();
  }

  // A few older standalone pages (leads/notes/projects/principles) predate the shared
  // sidebar and carry their own "<- Command Center" top bar (a `.bar` div containing a
  // `.back` link). The persistent shell's sidebar already provides that navigation, so
  // strip it from the fetched document before extracting content. Left untouched, these
  // pages still render their own top bar fine when loaded standalone (outside the SPA).
  function stripOwnTopBar(root) {
    var bars = root.querySelectorAll(".bar");
    for (var i = 0; i < bars.length; i++) {
      if (bars[i].querySelector(".back")) bars[i].parentNode.removeChild(bars[i]);
    }
  }

  var DASHBOARD_PATHS = ["/internal/", "/internal/index.html"];

  function swap(html, pathname, baseUrl) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var isDashboard = DASHBOARD_PATHS.indexOf(pathname) !== -1;

    // The dashboard (index.html) IS this shell — its "content" is .cc-main-inner, not a
    // <main> of its own (the shell's own <main id="cc-view"> is the one and only <main> in
    // that document). Pages with their own <main class="content|ops-content"> supply that.
    // A few older standalone pages (leads/notes/projects/principles) have NO <main> at all,
    // and their functional markup isn't reliably confined to one wrapper div — leads.html's
    // #scrim/#drawer/#loading/#toast and projects.html's #toast all sit as siblings of
    // .wrap, not inside it. So the reliable extraction for those is "every element in
    // <body>", not any single selector.
    var hasMain = !!doc.querySelector("main");
    var root = isDashboard ? doc.querySelector(".cc-main-inner") : doc.querySelector("main");
    var wrapInMain = !isDashboard && !hasMain;

    if (wrapInMain) {
      stripOwnTopBar(doc.body);
    } else {
      stripOwnTopBar(root);
    }

    // The dashboard's own inline scripts (nav-sync + window.ccRefreshDashboardMetrics) live
    // outside .cc-main-inner in index.html, at shell level — they already ran once when
    // this document first loaded and (being shell-level) never get removed, so there is
    // nothing of the dashboard's own to re-inject here; ccRefreshDashboardMetrics is called
    // directly below instead. Every other page's scripts/styles live inside <head> or
    // <main>, which the generic selectors reach normally.
    var pageStyles = Array.prototype.slice.call(doc.querySelectorAll('head link[rel~="stylesheet"], head style'));
    var pageScripts = isDashboard ? [] : Array.prototype.slice.call(doc.querySelectorAll("script"));
    var titleEl = doc.querySelector("title");

    clearInjected();

    // Inject the fetched page's own content element wholesale (not just innerHTML) so its
    // own wrapper class (content / ops-content / cc-main-inner) keeps supplying its own
    // padding/max-width/typography rules unchanged. Pages with no <main> at all (leads/
    // notes/projects/principles) get ALL of <body>'s children moved into a synthetic
    // <main class="content"> — not just their .wrap div — so drawer/scrim/toast/loading
    // elements living as .wrap's siblings come along too.
    view.setAttribute("aria-busy", "true");
    view.style.visibility = "hidden";
    view.innerHTML = "";
    var incomingMain;
    if (wrapInMain) {
      var synthetic = document.createElement("main");
      var slug = pathname.split("/").pop().replace(/\.html$/, "");
      synthetic.className = "content ops-page ops-" + slug + " " + (doc.body.className || "");
      while (doc.body.firstChild) synthetic.appendChild(doc.body.firstChild);
      view.appendChild(synthetic);
      incomingMain = synthetic;
    } else {
      view.appendChild(root);
      incomingMain = root;
    }
    incomingMain.id = "cc-main";
    incomingMain.tabIndex = -1;
    if (titleEl) document.title = titleEl.textContent;

    var head = document.head;
    loadStyles(pageStyles, head, baseUrl, function () {
      view.style.visibility = "";
      loadScriptsInOrder(pageScripts, view, baseUrl, function () {
        if (isDashboard && typeof window.ccRefreshDashboardMetrics === "function") {
          window.ccRefreshDashboardMetrics();
        }
        view.setAttribute("aria-busy", "false");
        var heading = incomingMain.querySelector("h1, h2");
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        } else {
          incomingMain.focus({ preventScroll: true });
        }
        if (routeStatus) routeStatus.textContent = (titleEl ? titleEl.textContent : "Page") + " loaded";
      });
    });
    setActiveNav(pathname);
    document.body.classList.toggle("cc-operation-view", OPERATION_PATHS.indexOf(pathname) !== -1);
    if (typeof window.ccCloseNavigation === "function") window.ccCloseNavigation();
    else document.body.classList.remove("nav-open");
    window.scrollTo(0, 0);
  }

  function navigate(pathname, pushHistory) {
    if (pathname === currentPath && pushHistory) return; // already here, no-op on click
    var requestUrl = pathname;

    view.setAttribute("aria-busy", "true");
    if (routeStatus) routeStatus.textContent = "Loading page";
    var resolvedUrl = new URL(requestUrl, location.href).href;

    fetch(requestUrl, { credentials: "same-origin" })
      .then(function (response) {
        // Two different things can make `response.redirected` true here, and only one of
        // them means "give up and do a real navigation":
        //   1. Wrangler's own extensionless-URL canonicalization (/internal/leads.html ->
        //      /internal/leads) — harmless, still the page we asked for, safe to swap in.
        //   2. The founder-auth gate's 302 to /login.html on an expired/missing session —
        //      injecting THAT html into the view would show a broken/empty login form
        //      instead of actually taking the user to log in.
        // Distinguish by checking whether the final URL is still under /internal/.
        var finalPath = new URL(response.url, location.href).pathname;
        var leftInternal = finalPath.indexOf("/internal/") !== 0 && finalPath !== "/internal";
        if (leftInternal) {
          location.href = response.url;
          return null;
        }
        if (!response.ok) {
          location.href = requestUrl; // fall back to a real navigation on any error
          return null;
        }
        resolvedUrl = response.url || resolvedUrl;
        return response.text();
      })
      .then(function (html) {
        if (html == null) return;
        currentPath = pathname;
        if (pushHistory) history.pushState({ scPath: pathname }, "", pathname);
        swap(html, pathname, resolvedUrl);
      })
      .catch(function () {
        location.href = requestUrl; // network/parse failure -> real navigation, never stuck
      });
  }

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var a = event.target.closest ? event.target.closest("a") : null;
    if (!isInternalPageLink(a)) return;
    event.preventDefault();
    navigate(new URL(a.getAttribute("href"), location.href).pathname, true);
  });

  window.addEventListener("popstate", function (event) {
    var pathname = (event.state && event.state.scPath) || location.pathname;
    navigate(pathname, false);
  });

  // The shell's own initial content (the dashboard) is already server-rendered — record
  // it as the current view so a click away and a click "back" doesn't re-fetch it needlessly.
  history.replaceState({ scPath: location.pathname }, "", location.pathname);
})();
