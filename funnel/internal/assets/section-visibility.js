/**
 * Per-account section visibility, applied to whatever markup asks for it.
 *
 * `users.hidden_pages` is a deny-list of section keys; functions/_pages.js maps each
 * section to its page slugs. Removing a link here is presentation only — both middlewares
 * refuse the page and its API server-side, so a typed URL still 403s. This exists so a
 * bookkeeper isn't shown doors that will slam.
 *
 * Two callers need it and they run at different times: the Command Center shell filters
 * its own chrome once at load, and /internal/apps.html filters its tiles every time the
 * SPA router swaps it in. So the session lookup is fetched once and memoized, and the
 * filter can be re-run against any root element as often as needed.
 */
(function () {
  "use strict";

  var pending = null;

  function loadSession() {
    if (!pending) {
      pending = fetch("/api/session", { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return d && d.ok ? d : null; })
        .catch(function () { return null; });
    }
    return pending;
  }

  /**
   * Hide every /internal/ link inside `root` that belongs to a section this account may
   * not see, then drop any group heading left with nothing under it.
   *
   * Resolves to the session payload so callers that also want the user (name, role) do not
   * need a second request.
   */
  function apply(root, options) {
    var scope = root || document;
    var opts = options || {};
    return loadSession().then(function (session) {
      if (!session || !session.user) return session;

      var hidden = session.user.hidden_pages || [];
      if (!hidden.length || !session.sections) return session;

      // slug → section key, straight from the server's registry rather than a copy.
      var slugToKey = {};
      session.sections.forEach(function (section) {
        (section.pages || []).forEach(function (slug) { slugToKey[slug] = section.key; });
      });

      function keyFor(el) {
        var href = el.getAttribute("href") || "";
        var match = /^\/internal\/([a-z0-9-]+)(?:\.html)?$/i.exec(
          href.charAt(0) === "/" ? href : new URL(href, location.href).pathname
        );
        return match ? slugToKey[match[1].toLowerCase()] || null : null;
      }

      var selector = opts.selector || 'a[href^="/internal/"]';
      Array.prototype.forEach.call(scope.querySelectorAll(selector), function (el) {
        var key = keyFor(el);
        if (key && hidden.indexOf(key) !== -1) el.remove();
      });

      // Also drop anything tagged with its section directly (metric tiles, panels).
      Array.prototype.forEach.call(scope.querySelectorAll("[data-section]"), function (el) {
        var key = el.getAttribute("data-section");
        if (key && hidden.indexOf(key) !== -1) el.remove();
      });

      // A heading whose every entry just disappeared should not be left floating.
      (opts.groups || []).forEach(function (pair) {
        Array.prototype.forEach.call(scope.querySelectorAll(pair[0]), function (group) {
          if (!group.querySelector(pair[1])) group.remove();
        });
      });

      return session;
    });
  }

  window.scSectionVisibility = { apply: apply, session: loadSession };
})();
