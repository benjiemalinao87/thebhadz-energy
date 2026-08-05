/**
 * /internal/activity.html — the Log.
 *
 * Reads /api/activity and renders it as a feed of sentences ("Rea added a contact ·
 * Marites Ocampo") rather than the raw audit table on /internal/team.html. Same rows,
 * same server-side scope: a master sees the whole team, everyone else sees themselves.
 *
 * The translation from row to sentence lives here, not in the database. Audit rows are
 * written once and never migrated, so the phrasing has to be derived at read time from
 * `action`, `entity` and the small `detail` string the API middleware sniffs off each
 * request body — a schema change would only affect rows written after it.
 *
 * Runs its init immediately rather than on DOMContentLoaded, and returns early when its
 * anchor is absent: the SPA router re-creates and re-executes page scripts on every swap,
 * and DOMContentLoaded only fires once (see spa-router.js).
 */
(function () {
  "use strict";

  var root = document.getElementById("log-root");
  if (!root) return;

  var PAGE = 60;

  var els = {
    feed: document.getElementById("log-feed"),
    scope: document.getElementById("log-scope"),
    more: document.getElementById("log-more"),
    refresh: document.getElementById("log-refresh"),
    q: document.getElementById("log-q"),
    user: document.getElementById("log-user"),
    area: document.getElementById("log-area"),
    days: document.getElementById("log-days"),
    kinds: root.querySelectorAll(".log-kinds button"),
    mTotal: document.getElementById("log-m-total"),
    mTotalNote: document.getElementById("log-m-total-note"),
    m24: document.getElementById("log-m-24"),
    mPeople: document.getElementById("log-m-people"),
    mFailed: document.getElementById("log-m-failed"),
    mFailedTile: document.getElementById("log-m-failed-tile"),
  };

  var state = { entries: [], oldestId: null, hasMore: false, kind: "writes", scope: "own", actorsFilled: false };

  /* ── the vocabulary ──────────────────────────────────────────────────────
     Every resource the founder tools write to, mapped to how it should read.
     `noun` is singular and article-less; article() picks "a" or "an". */

  var ICON = {
    user:   '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    home:   '<path d="M4 21V9l8-6 8 6v12"/><path d="M10 21v-6h4v6"/>',
    check:  '<path d="M4 12.5 9 17.5 20 6.5"/>',
    wrench: '<path d="M15.5 3.5a5 5 0 0 0-6.6 6.2L3 15.6V21h5.4l5.9-5.9a5 5 0 0 0 6.2-6.6l-3.2 3.2-2.6-2.6z"/>',
    doc:    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    tag:    '<path d="M20.5 12.5 12 21l-9-9V3h9z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
    peso:   '<path d="M7 20V4h5.5a4 4 0 0 1 0 8H7"/><path d="M5 9h9"/><path d="M5 12.5h9"/>',
    mail:   '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
    note:   '<path d="M5 3h14v13l-5 5H5z"/><path d="M19 16h-5v5"/>',
    mic:    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
    camera: '<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
    beaker: '<path d="M9 3v6L4 20h16L15 9V3"/><path d="M8 3h8"/>',
    key:    '<circle cx="8" cy="12" r="4"/><path d="M12 12h9"/><path d="M17 12v4"/>',
    dot:    '<circle cx="12" cy="12" r="4"/>',
  };

  var AREAS = {
    leads:             { label: "Contacts",         tone: "blue",   href: "/internal/leads.html",           noun: "contact",           icon: ICON.user },
    jobs:              { label: "Jobs",             tone: "petrol", href: "/internal/projects.html",        noun: "job",               icon: ICON.home },
    projects:          { label: "Company tasks",    tone: "petrol", href: "/internal/projects.html",        noun: "company task",      icon: ICON.check },
    goals:             { label: "Goals",            tone: "blue",   href: "/internal/goals.html",           noun: "goal",              icon: ICON.check },
    "install-ops":     { label: "Install ops",      tone: "petrol", href: "/internal/install-ops.html",     noun: "install-ops entry", icon: ICON.wrench },
    quote:             { label: "Quotes",           tone: "amber",  href: "/internal/quote-builder.html",   noun: "quote",             icon: ICON.doc },
    // `whole` marks a singleton the tools save in one shot: a PUT replaces the entire
    // list, so "replaced a price item" would be wrong about what happened.
    "quote-settings":  { label: "Quote settings",   tone: "amber",  href: "/internal/quote-builder.html",   noun: "quote setting",     icon: ICON.tag, whole: "quote settings" },
    "price-items":     { label: "Price list",       tone: "amber",  href: "/internal/quote-builder.html",   noun: "price item",        icon: ICON.tag, whole: "price list" },
    finance:           { label: "Finance",          tone: "green",  href: "/internal/finance.html",         noun: "money entry",       icon: ICON.peso },
    "finance-receipt": { label: "Finance",          tone: "green",  href: "/internal/finance.html",         noun: "receipt",           icon: ICON.peso },
    mail:              { label: "Email",            tone: "blue",   href: "/internal/mail.html",            noun: "email",             icon: ICON.mail },
    notes:             { label: "Notes",            tone: "petrol", href: "/internal/notes.html",           noun: "note",              icon: ICON.note },
    "note-image":      { label: "Notes",            tone: "petrol", href: "/internal/notes.html",           noun: "note attachment",   icon: ICON.note },
    documents:         { label: "Documents",        tone: "petrol", href: "/internal/docs.html",            noun: "document",          icon: ICON.doc },
    "document-file":   { label: "Documents",        tone: "petrol", href: "/internal/docs.html",            noun: "document file",     icon: ICON.doc },
    recordings:        { label: "Recordings",       tone: "petrol", href: "/internal/meetings.html",        noun: "recording",         icon: ICON.mic },
    captures:          { label: "Product captures", tone: "petrol", href: "/internal/captures.html",        noun: "product capture",   icon: ICON.camera },
    checklist:         { label: "Legal checklist",  tone: "petrol", href: "/internal/sec-registration.html", noun: "checklist item",   icon: ICON.check },
    "founder-lab":     { label: "Strategy lab",     tone: "blue",   href: "/internal/founder-lab.html",     noun: "strategy lab entry", icon: ICON.beaker },
    users:             { label: "Accounts",         tone: "rust",   href: "/internal/team.html",            noun: "account",           icon: ICON.key },
    auth:              { label: "Access",           tone: "rust",   href: "/internal/team.html",            noun: "session",           icon: ICON.key },
  };

  var FALLBACK_AREA = { label: "Command Center", tone: "petrol", href: null, noun: "record", icon: ICON.dot };

  var VERBS = { create: "added", update: "updated", replace: "replaced", delete: "deleted" };

  // Rows whose `detail` is already a written sentence (the auth and account endpoints
  // compose their own). These get a fixed opening phrase and the detail underneath,
  // instead of the resource.verb machinery below.
  var PHRASES = {
    login: "signed in",
    logout: "signed out",
    login_failed: "failed to sign in",
    login_blocked: "was blocked from signing in",
    password_changed: "changed their own password",
    password_change_failed: "failed a password change",
    profile_updated: "updated their own profile",
    "users.create": "created an account",
    "users.update": "edited an account",
    "users.delete": "deleted an account",
    "users.denied": "was refused account admin",
  };

  /* ── loading ─────────────────────────────────────────────────────────── */

  function query(append) {
    var params = new URLSearchParams();
    params.set("limit", String(PAGE));
    params.set("summary", "1");
    if (state.kind) params.set("kind", state.kind);
    if (append && state.oldestId) params.set("before", String(state.oldestId));
    if (els.user.value) params.set("user", els.user.value);
    if (els.area.value) params.set("action", els.area.value);
    if (els.days.value) params.set("days", els.days.value);
    if (els.q.value.trim()) params.set("q", els.q.value.trim());
    return params.toString();
  }

  function load(append) {
    root.setAttribute("data-busy", "true");
    els.feed.setAttribute("aria-busy", "true");

    return fetch("/api/activity?" + query(append), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data || !res.data.ok) throw new Error((res.data && res.data.error) || "Could not load the log.");
        var data = res.data;

        state.entries = append ? state.entries.concat(data.entries || []) : (data.entries || []);
        state.hasMore = !!data.has_more;
        state.scope = data.scope;
        state.oldestId = state.entries.length ? state.entries[state.entries.length - 1].id : null;

        if (data.scope === "all" && !state.actorsFilled) fillActors(data.actors || []);
        renderScope();
        renderSummary(data.summary);
        render();
      })
      .catch(function (error) {
        els.scope.textContent = error.message;
        if (!append) {
          els.feed.innerHTML = '<div class="log-empty"><strong>The log could not be loaded.</strong>' +
            escape(error.message) + "</div>";
          els.more.hidden = true;
        }
      })
      .then(function () {
        root.setAttribute("data-busy", "false");
        els.feed.setAttribute("aria-busy", "false");
      });
  }

  function fillActors(actors) {
    if (!actors.length) return;
    els.user.hidden = false;
    els.user.innerHTML = '<option value="">Everyone</option>' + actors.map(function (a) {
      return '<option value="' + escape(a.id) + '">' + escape(a.name || a.email) + "</option>";
    }).join("");
    state.actorsFilled = true;
  }

  /* ── rendering ───────────────────────────────────────────────────────── */

  function renderScope() {
    els.scope.textContent = state.scope === "all"
      ? "Every account · live"
      : "Your own activity · live";
  }

  function renderSummary(summary) {
    if (!summary) {
      [els.mTotal, els.m24, els.mPeople, els.mFailed].forEach(function (el) { el.textContent = "—"; });
      return;
    }
    els.mTotal.textContent = number(summary.total);
    els.m24.textContent = number(summary.last24h);
    els.mPeople.textContent = number(summary.people);
    els.mFailed.textContent = number(summary.failed_logins);
    els.mFailedTile.classList.toggle("warn", summary.failed_logins > 0);
    els.mTotalNote.textContent = state.kind === "writes"
      ? "Changes matching the current filter"
      : state.kind === "access" ? "Sign-ins matching the current filter" : "Matching the current filter";
    // "People" is a headcount, which the shared login makes ambiguous and a single-person
    // view makes pointless — say so rather than showing a lonely 1.
    els.mPeople.parentNode.hidden = state.scope !== "all";
  }

  function render() {
    if (!state.entries.length) {
      els.feed.innerHTML = '<div class="log-empty"><strong>Nothing recorded for this filter.</strong>' +
        "Widen the period, or switch to Everything to include sign-ins.</div>";
      els.more.hidden = true;
      return;
    }

    var html = "";
    var openGroup = false;
    var lastDay = null;

    state.entries.forEach(function (entry) {
      var day = dayKey(entry.created_at);
      if (day !== lastDay) {
        if (openGroup) html += "</div>";
        html += '<h2 class="log-day">' + escape(dayLabel(entry.created_at)) + "</h2>";
        html += '<div class="log-group">';
        openGroup = true;
        lastDay = day;
      }
      html += item(entry);
    });
    if (openGroup) html += "</div>";

    els.feed.innerHTML = html;
    els.more.hidden = !state.hasMore;
  }

  function item(entry) {
    var read = describe(entry);
    var who = entry.actor_name || entry.actor_email || "Unknown";
    var failed = Number(entry.status) >= 400;

    var area = read.area.href
      ? '<a class="log-area" href="' + read.area.href + '">' + svg(read.area.icon) + escape(read.area.label) + "</a>"
      : '<span class="log-area">' + svg(read.area.icon) + escape(read.area.label) + "</span>";

    // Each separator is bundled with the item it precedes so a wrap never strands a
    // lone "·" at the end of a line.
    var meta = [area];
    if (read.note) meta.push('<span><span class="log-sep">· </span>' + escape(read.note) + "</span>");
    if (failed) meta.push('<span class="log-failed">failed ' + escape(entry.status) + "</span>");
    if (entry.method && entry.path) {
      meta.push('<span><span class="log-sep">· </span><code>' + escape(entry.method + " " + entry.path) + "</code></span>");
    }

    return '<article class="log-item" data-tone="' + (failed ? "rust" : read.area.tone) + '">' +
      '<span class="log-avatar" style="background:' + avatarColor(who) + '" aria-hidden="true">' + escape(initials(who)) + "</span>" +
      '<div><p class="log-line"><b>' + escape(who) + "</b> " + read.sentence + "</p>" +
      '<p class="log-meta">' + meta.join("") + "</p></div>" +
      '<span class="log-when">' + escape(clock(entry.created_at)) + "</span>" +
      "</article>";
  }

  /**
   * Row → { sentence (HTML), note, area }.
   *
   * `sentence` is everything after the actor's name. The object it acted on is wrapped in
   * .log-obj so a scan down the feed reads as "who / did what / to which record".
   */
  function describe(entry) {
    var action = String(entry.action || "");
    var parsed = parseDetail(entry.detail);
    var fields = parsed.fields;
    var subject = fields.title || fields.name || fields.customer_name || fields.subject ||
      fields.label || fields.file || fields.to || "";

    // A section an account may not open, refused server-side. Its entity is the section
    // key rather than a resource, so it is read before the AREAS lookup.
    if (action === "section.denied") {
      // The detail already names the section in full ("Finance & runway (money) is hidden
      // from this account"), so repeating the raw key in the sentence says it twice.
      return { sentence: "was refused a hidden section", note: entry.detail || "", area: AREAS.auth };
    }

    var resource = String(entry.entity || action.split(".")[0] || "");
    var area = AREAS[resource] || FALLBACK_AREA;

    // Endpoints that write their own prose: keep it, don't re-derive it.
    if (PHRASES[action]) {
      return { sentence: PHRASES[action], note: entry.detail || "", area: area };
    }

    var verb = action.split(".")[1] || "";

    if (action === "quote.sent" || action === "quote.failed") {
      return {
        sentence: (action === "quote.sent" ? "sent a quote " : "could not send a quote ") +
          obj(entry.entity_id || parsed.loose[0] || ""),
        note: entry.detail || "", area: AREAS.quote,
      };
    }
    if (resource === "mail" && verb === "create") {
      return {
        sentence: "sent an email" + (fields.subject ? " " + obj(fields.subject) : "") +
          (fields.to ? " to " + escape(fields.to) : ""),
        note: "", area: area,
      };
    }
    // Multipart POSTs (receipts, note images, recording parts) — describe() in the API
    // middleware can only record the size, so say what it can honestly say.
    if (parsed.upload) {
      return {
        sentence: "uploaded " + article(area.noun) + " " + escape(area.noun) + (parsed.upload === true ? "" : " (" + escape(parsed.upload) + ")"),
        note: "", area: area,
      };
    }
    // The recordings endpoint multiplexes on a body field rather than the HTTP verb.
    if (resource === "recordings" && fields.action) {
      var steps = { create: "started a recording upload", complete: "uploaded a recording", rename: "renamed a recording", abort: "cancelled a recording upload" };
      return { sentence: (steps[fields.action] || "changed a recording") + (subject ? " " + obj(subject) : ""), note: "", area: area };
    }
    // A saved-in-one-shot list. Whichever HTTP verb the tool used, the change is "these
    // are the prices now".
    if (area.whole && (verb === "replace" || verb === "update")) {
      return { sentence: "updated the " + escape(area.whole), note: "", area: area };
    }
    // Several endpoints are one door onto many record types and say which in the body
    // ("resource=cost", "resource=task"). Trust it over the area's generic noun — the
    // area tag beside the line already supplies the context that makes it readable.
    var noun = fields.resource ? String(fields.resource).replace(/[_-]/g, " ") : area.noun;

    // A DELETE carries no JSON body, so the only handle on the record is the id the
    // middleware kept off the query string — better than an anonymous "deleted a note".
    var id = entry.entity_id || fields.id || "";
    var which = subject ? " " + obj(subject) : (id ? " " + obj("#" + shortId(id)) : "");

    // A stage move is the single most-read line in this log — say where it went.
    if (fields.stage && verb !== "create") {
      return { sentence: "moved " + article(noun) + " " + escape(noun) + which + " to " + obj(fields.stage), note: "", area: area };
    }

    var word = VERBS[verb] || (verb ? verb : "changed");
    var sentence = word + " " + article(noun) + " " + escape(noun) + which;

    // Anything sniffed but not already said (status, category, kind) trails as context.
    var extras = [];
    ["status", "category", "kind"].forEach(function (key) {
      if (fields[key]) extras.push(key + " " + fields[key]);
    });

    return { sentence: sentence, note: extras.join(" · "), area: area };
  }

  /**
   * The audit `detail` column is a " · "-joined mix of `field=value` pairs and, when the
   * request carried one, a raw query string. Both are unpacked here; anything unparseable
   * is kept as a loose bit so nothing is silently dropped.
   */
  function parseDetail(detail) {
    var out = { fields: {}, loose: [], upload: false };
    String(detail || "").split(" · ").forEach(function (raw) {
      var bit = raw.trim();
      if (!bit) return;
      if (bit === "upload") { out.upload = true; return; }
      if (out.upload === true && /^(\d+ KB|unknown size)$/.test(bit)) { out.upload = bit; return; }
      var pair = /^([a-z_]+)=([\s\S]*)$/i.exec(bit);
      if (!pair) { out.loose.push(bit); return; }
      if (bit.indexOf("&") >= 0) {
        // A query string, e.g. "id=12&stage=surveyed".
        new URLSearchParams(bit).forEach(function (value, key) { out.fields[key.toLowerCase()] = value; });
        return;
      }
      out.fields[pair[1].toLowerCase()] = pair[2];
    });
    return out;
  }

  /* ── small helpers ───────────────────────────────────────────────────── */

  function obj(value) { return '<span class="log-obj">' + escape(String(value)) + "</span>"; }
  function article(noun) { return /^[aeiou]/i.test(noun) ? "an" : "a"; }
  function svg(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }
  function number(n) { return Number(n || 0).toLocaleString("en-PH"); }

  // Most record ids are UUIDs. The full string tells a reader nothing a prefix doesn't,
  // and it wraps the sentence onto a second line; readable slugs are left alone.
  function shortId(id) {
    var text = String(id);
    return /^[0-9a-f]{8}-[0-9a-f-]+$/i.test(text) ? text.slice(0, 8) : text;
  }

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Stable per-person colour: the same founder is the same swatch on every visit, so a
  // day's worth of rows can be scanned by colour before it is read.
  var SWATCHES = ["#0091ae", "#ff7a59", "#00a38c", "#6a78d1", "#b3452a", "#425b76"];
  function avatarColor(name) {
    var hash = 0;
    var text = String(name || "");
    for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 100000;
    return SWATCHES[hash % SWATCHES.length];
  }

  function dayKey(iso) {
    var date = new Date(iso);
    return isNaN(date) ? "?" : date.toDateString();
  }

  function dayLabel(iso) {
    var date = new Date(iso);
    if (isNaN(date)) return "Undated";
    var today = new Date();
    if (date.toDateString() === today.toDateString()) return "Today";
    var yesterday = new Date(today.getTime() - 86400000);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-PH", { weekday: "long", day: "numeric", month: "long", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  }

  function clock(iso) {
    var date = new Date(iso);
    return isNaN(date) ? "" : date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  }

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  /* ── wiring ──────────────────────────────────────────────────────────── */

  function reload() {
    state.oldestId = null;
    load(false);
  }

  Array.prototype.forEach.call(els.kinds, function (button) {
    button.addEventListener("click", function () {
      state.kind = button.getAttribute("data-kind");
      Array.prototype.forEach.call(els.kinds, function (other) {
        other.setAttribute("aria-pressed", String(other === button));
      });
      reload();
    });
  });

  [els.user, els.area, els.days].forEach(function (select) {
    select.addEventListener("change", reload);
  });
  els.refresh.addEventListener("click", reload);
  els.more.addEventListener("click", function () { load(true); });

  var typing = null;
  els.q.addEventListener("input", function () {
    clearTimeout(typing);
    typing = setTimeout(reload, 280);
  });

  load(false);
})();
