/**
 * SC-15 Team & access (/internal/team.html).
 *
 * Three panels driven by three endpoints:
 *   /api/session   — who am I; change my own password / display name.
 *   /api/users     — master only: create, edit, disable, reset, delete accounts.
 *   /api/activity  — the audit trail (all founders for the master, own rows otherwise).
 *
 * Everything master-only is hidden here for clarity, and refused server-side for
 * real — the API checks the role on every call, so hiding a button is cosmetic.
 *
 * Runs its init immediately (no DOMContentLoaded) and returns early when its anchor
 * element is absent, as the SPA router requires — see assets/spa-router.js.
 */
(function () {
  "use strict";

  var root = document.querySelector(".ops-team");
  if (!root) return;

  var state = {
    me: null,
    sharedEmail: "",
    sharedEnabled: false,
    onSharedLogin: false,
    users: [],
    sections: [],
    editingId: null, // account whose section visibility is open in the editor
    entries: [],
    hasMore: false,
    oldestId: null,
  };

  // Starting points for the common non-founder logins. Values are the sections that
  // stay VISIBLE; everything else is hidden. They only prefill the tick boxes — whoever
  // is setting up the account still reviews and saves.
  var PRESETS = {
    installer: ["install-ops", "engineering", "notes"],
    intern: ["notes", "projects", "field"],
    bookkeeper: ["finance", "legal"],
  };

  var els = {
    status: document.getElementById("team-status"),
    refresh: document.getElementById("team-refresh"),
    mustChange: document.getElementById("team-must-change"),
    sharedSession: document.getElementById("team-shared-session"),
    sharedStatus: document.getElementById("team-shared-status"),
    sharedState: document.getElementById("team-shared-state"),
    sharedNote: document.getElementById("team-shared-note"),
    metrics: document.getElementById("team-metrics"),
    accountsLocked: document.getElementById("team-accounts-locked"),
    accountsAdmin: document.getElementById("team-accounts-admin"),
    userList: document.getElementById("team-user-list"),
    createForm: document.getElementById("team-create-form"),
    suggest: document.getElementById("team-suggest"),
    activityList: document.getElementById("team-activity-list"),
    activityMore: document.getElementById("team-activity-more"),
    activityScope: document.getElementById("team-activity-scope"),
    filterUser: document.getElementById("team-filter-user"),
    filterAction: document.getElementById("team-filter-action"),
    filterDays: document.getElementById("team-filter-days"),
    filterQ: document.getElementById("team-filter-q"),
    meName: document.getElementById("team-me-name"),
    meMeta: document.getElementById("team-me-meta"),
    passwordForm: document.getElementById("team-password-form"),
    nameForm: document.getElementById("team-name-form"),
    sections: document.getElementById("team-sections"),
    sectionsWho: document.getElementById("team-sections-who"),
    sectionsList: document.getElementById("team-sections-list"),
    sectionsSave: document.getElementById("team-sections-save"),
    sectionsCancel: document.getElementById("team-sections-cancel"),
    sectionsNote: document.getElementById("team-sections-note"),
    lede: document.getElementById("team-lede"),
  };

  document.querySelectorAll("[data-tab]").forEach(function (button) {
    button.addEventListener("click", function () { selectTab(button.getAttribute("data-tab")); });
  });
  els.refresh.addEventListener("click", function () { load(); });
  els.createForm.addEventListener("submit", createUser);
  els.suggest.addEventListener("click", suggestPassword);
  els.userList.addEventListener("click", userAction);
  els.passwordForm.addEventListener("submit", changePassword);
  els.nameForm.addEventListener("submit", changeName);
  els.activityMore.addEventListener("click", function () { loadActivity(true); });
  els.sectionsSave.addEventListener("click", saveSections);
  els.sectionsCancel.addEventListener("click", closeSections);
  els.sections.addEventListener("click", function (event) {
    var preset = event.target.closest("[data-preset]");
    if (preset) applyPreset(preset.getAttribute("data-preset"));
  });
  [els.filterUser, els.filterAction, els.filterDays].forEach(function (control) {
    control.addEventListener("change", function () { loadActivity(false); });
  });
  els.filterQ.addEventListener("input", debounce(function () { loadActivity(false); }, 350));

  // Login sends people here with ?password=change when they are on a temporary password.
  if (/(^|[?&])password=change/.test(location.search)) selectTab("me");

  load();

  /* ── loading ───────────────────────────────────────────────────────────── */

  async function load() {
    try {
      var session = await api("/api/session");
      state.me = session.user;
      state.onSharedLogin = !!session.shared;
      renderMe();

      if (isMaster()) {
        var data = await api("/api/users");
        state.users = data.users || [];
        state.sections = data.sections || [];
        state.sharedEmail = data.shared_email || "";
        state.sharedEnabled = !!data.shared_enabled;
        renderUsers();
        if (state.editingId) openSections(state.editingId); // keep the editor in sync after a save
        renderSharedStatus();
        await renderFailedSignIns();
        els.accountsAdmin.hidden = false;
        els.accountsLocked.hidden = true;
        els.metrics.hidden = false;
      } else {
        els.accountsAdmin.hidden = true;
        els.accountsLocked.hidden = false;
        els.metrics.hidden = true;
        els.sharedStatus.hidden = true;
        els.accountsLocked.innerHTML = state.onSharedLogin
          ? 'Only the master account can manage founder logins — and the shared team login has no personal ' +
            'account of its own. Sign in with your own email to get one.'
          : 'Only the master account can manage founder logins. Your own password is under <strong>My login</strong>.';
      }

      await loadActivity(false);
      status(isMaster()
        ? state.users.length + " account" + (state.users.length === 1 ? "" : "s") + " · master view: all founder activity"
        : (state.onSharedLogin ? "Shared team login" : "Signed in as " + state.me.name) + " · showing your own activity");
    } catch (error) {
      status(error.message, true);
    }
  }

  async function loadActivity(append) {
    var params = new URLSearchParams();
    params.set("limit", "80");
    if (append && state.oldestId) params.set("before", String(state.oldestId));
    if (isMaster() && els.filterUser.value) params.set("user", els.filterUser.value);
    if (els.filterAction.value) params.set("action", els.filterAction.value);
    if (els.filterDays.value) params.set("days", els.filterDays.value);
    if (els.filterQ.value.trim()) params.set("q", els.filterQ.value.trim());

    try {
      var data = await api("/api/activity?" + params.toString());
      state.entries = append ? state.entries.concat(data.entries || []) : (data.entries || []);
      state.hasMore = !!data.has_more;
      if (state.entries.length) state.oldestId = state.entries[state.entries.length - 1].id;
      if (!append && data.actors && data.actors.length) fillActorFilter(data.actors);
      els.activityScope.textContent = data.scope === "all"
        ? "Every sign-in and every change made through the founder tools, newest first."
        : "Your own sign-ins and changes. Only the master account can see the whole team's activity.";
      renderActivity();
      renderActivityMetric();
    } catch (error) {
      status(error.message, true);
    }
  }

  /* ── rendering ─────────────────────────────────────────────────────────── */

  function renderMe() {
    var me = state.me;
    els.meName.textContent = me.name;
    els.meMeta.textContent = me.email + " · " + roleLabel(me.role) +
      (me.mailbox ? " · mailbox " + me.mailbox : "") +
      " · last sign-in " + (me.last_login_at ? when(me.last_login_at) : "just now") +
      (me.must_change ? " · temporary password in use" : "");
    els.mustChange.hidden = !me.must_change || state.onSharedLogin;
    els.sharedSession.hidden = !state.onSharedLogin;
    els.nameForm.elements.name.value = me.name;

    // The page belongs to whoever is reading it: a limited account shouldn't be told
    // about powers it doesn't have.
    if (els.lede && !isMaster()) {
      els.lede.textContent =
        "Your login and your own activity. A founder decides which sections this account can " +
        "see; ask one if you need something that isn't in your sidebar.";
    }

    // On the shared login there is no personal account to edit — the API refuses it,
    // so don't offer forms that can only fail.
    if (state.onSharedLogin) {
      els.passwordForm.hidden = true;
      els.nameForm.hidden = true;
      els.meMeta.textContent =
        "Shared team password · its password is the FOUNDER_PASSWORD secret in Cloudflare · " +
        "sign in with your own email to manage a personal login";
    } else {
      els.passwordForm.hidden = false;
      els.nameForm.hidden = false;
    }

    if (me.must_change && !state.onSharedLogin) selectTab("me");

    // Keep the shell's sidebar chip honest when a name or password changes under it
    // (this page usually runs inside the Command Center shell, which set that chip
    // once on load and would otherwise keep saying "set your password").
    var chip = document.getElementById("cc-who-label");
    if (chip) {
      chip.textContent = state.onSharedLogin
        ? "Shared team login · not you"
        : me.name + (me.must_change ? " · set your password" : " · " + roleLabel(me.role).toLowerCase());
    }
    var chipLink = document.getElementById("cc-who");
    if (chipLink) chipLink.style.borderColor = me.must_change || state.onSharedLogin ? "var(--yellow)" : "";
  }

  function renderUsers() {
    var users = state.users;
    text("team-count", users.length);
    text("team-active", users.filter(function (u) { return u.active; }).length);
    text("team-disabled", users.filter(function (u) { return !u.active; }).length);
    text("team-sessions", users.reduce(function (sum, u) { return sum + (u.open_sessions || 0); }, 0));

    if (!users.length) {
      els.userList.innerHTML = '<div class="ops-empty">No accounts yet.</div>';
      return;
    }

    els.userList.innerHTML = '<div class="ops-table-wrap"><table class="ops-table"><thead><tr>' +
      '<th>Founder</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Devices</th><th>Created</th><th>Actions</th>' +
      '</tr></thead><tbody>' + users.map(userRow).join("") + '</tbody></table></div>';
  }

  function userRow(u) {
    var badges = [
      '<span class="ops-pill ' + (u.active ? "paid" : "cancelled") + '">' + (u.active ? "Active" : "Disabled") + '</span>',
      u.must_change && !u.is_shared_login ? '<span class="ops-pill pending">Temp password</span>' : "",
      u.is_shared_login && u.active && !state.sharedEnabled
        ? '<span class="ops-pill pending">No password set</span>' : "",
    ].filter(Boolean).join(" ");

    // Row actions stay secondary-styled: nothing in a table row should shout louder
    // than "Create account", and Delete is the only one that earns the danger colour.
    // The shared login only accepts the two the API will honour: rename and disable.
    var hiddenCount = (u.hidden_pages || []).length;
    var actions = [
      button("rename", u.id, "Rename"),
      button("sections", u.id, hiddenCount ? "Sections · " + hiddenCount + " hidden" : "Sections"),
    ];
    if (!u.is_shared_login) actions.push(button("mailbox", u.id, u.mailbox ? "Mailbox" : "Set mailbox"));
    if (u.is_shared_login) {
      actions.push(button("toggle", u.id, u.active ? "Switch off shared access" : "Switch shared access on"));
    } else {
      actions.push(button("reset", u.id, "Reset password"));
      actions.push(button("role", u.id, u.role === "master" ? "Make limited" : "Make founder"));
      if (!u.is_self) {
        actions.push(button("toggle", u.id, u.active ? "Disable" : "Enable"));
        actions.push(button("delete", u.id, "Delete", "danger"));
      }
    }

    var access = hiddenCount
      ? '<div class="muted">' + hiddenCount + " section" + (hiddenCount === 1 ? "" : "s") + " hidden</div>"
      : "";
    var roleNote = u.is_shared_login
      ? '<div class="muted">Shared password · everyone</div>'
      : u.role === "master"
        ? '<div class="muted">Full access</div>'
        : '<div class="muted">No account admin</div>';

    return '<tr><td><strong>' + html(u.name) + '</strong>' +
      (u.is_self ? ' <span class="ops-pill">You</span>' : "") +
      (u.is_shared_login ? ' <span class="ops-pill pending">Shared</span>' : "") +
      '<div class="muted">' + html(u.email) + '</div>' +
      (u.mailbox ? '<div class="muted">✉ ' + html(u.mailbox) + '</div>' : "") + '</td>' +
      '<td>' + html(u.is_shared_login ? "Shared login" : roleLabel(u.role)) + roleNote + access + '</td>' +
      '<td>' + badges + (u.failed_count ? '<div class="muted">' + u.failed_count + ' failed attempt(s)</div>' : "") + '</td>' +
      '<td>' + html(u.last_login_at ? when(u.last_login_at) : "Never") + '</td>' +
      '<td class="amount">' + (u.open_sessions || 0) + '</td>' +
      '<td>' + html(when(u.created_at)) + '<div class="muted">by ' + html(u.created_by || "—") + '</div></td>' +
      '<td><div class="row-actions">' + actions.join("") + '</div></td></tr>';
  }

  /* ── section visibility editor ─────────────────────────────────────────── */

  function openSections(id) {
    var user = state.users.filter(function (u) { return u.id === id; })[0];
    if (!user) return closeSections();

    state.editingId = id;
    els.sectionsWho.textContent = user.name + " (" + user.email + ")";
    els.sections.hidden = false;

    var hidden = user.hidden_pages || [];
    var groups = [];
    state.sections.forEach(function (section) {
      var group = groups.filter(function (g) { return g.name === section.group; })[0];
      if (!group) { group = { name: section.group, items: [] }; groups.push(group); }
      group.items.push(section);
    });

    els.sectionsList.innerHTML = groups.map(function (group) {
      return '<div class="team-section-group"><h4>' + html(group.name) + '</h4><div class="ops-checks">' +
        group.items.map(function (section) {
          var visible = hidden.indexOf(section.key) === -1;
          // Team & access stays on for everyone: it is where you change your own
          // password, and where a temporary one sends you at first sign-in.
          var locked = !!section.always_on;
          return '<label' + (locked ? ' title="Everyone needs this to change their own password"' : "") + '>' +
            '<input type="checkbox" data-section="' + esc(section.key) + '"' +
            (visible || locked ? " checked" : "") + (locked ? " disabled" : "") + '> <span>' +
            html(section.label) + (locked ? ' <em class="muted">(always on)</em>' : "") +
            '</span></label>';
        }).join("") + '</div></div>';
    }).join("");

    els.sectionsNote.textContent = user.role === "master"
      ? "This account is a founder (full access). Hiding sections from a founder is unusual — they can unhide themselves."
      : "Limited account: it also has no account admin and sees only its own activity.";
    els.sections.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeSections() {
    state.editingId = null;
    els.sections.hidden = true;
    els.sectionsList.innerHTML = "";
  }

  function applyPreset(name) {
    var visible = PRESETS[name] || null; // null = "all"
    els.sectionsList.querySelectorAll("[data-section]").forEach(function (box) {
      if (box.disabled) return;
      box.checked = !visible || visible.indexOf(box.getAttribute("data-section")) !== -1;
    });
  }

  async function saveSections() {
    if (!state.editingId) return;
    var hidden = [];
    els.sectionsList.querySelectorAll("[data-section]").forEach(function (box) {
      if (!box.checked && !box.disabled) hidden.push(box.getAttribute("data-section"));
    });

    var user = state.users.filter(function (u) { return u.id === state.editingId; })[0];
    if (user && user.is_self && hidden.length) {
      if (!confirm("Hide " + hidden.length + " section(s) from your own account?\n\n" +
        "You will stop seeing them yourself until you turn them back on here.")) return;
    }

    try {
      await api("/api/users", "PATCH", { id: state.editingId, hidden_pages: hidden });
      await load();
      status(hidden.length
        ? hidden.length + " section" + (hidden.length === 1 ? "" : "s") + " now hidden from " + (user ? user.name : "that account")
        : "All sections visible to " + (user ? user.name : "that account"));
    } catch (error) {
      alert(error.message);
    }
  }

  /** One line telling the master whether shared access is currently a way in. */
  function renderSharedStatus() {
    var row = state.users.filter(function (u) { return u.is_shared_login; })[0];
    var disabledHere = row && !row.active;
    var on = state.sharedEnabled && !disabledHere;

    els.sharedStatus.hidden = false;
    els.sharedState.textContent = on ? "on" : "off";
    els.sharedNote.textContent = on
      ? "Anyone with the password signs in as “" + (row ? row.name : "Shared team login") +
        "”, so their actions can't be traced to a person. Switch it off in the table below, " +
        "or rotate it by changing the FOUNDER_PASSWORD secret in Cloudflare."
      : disabledHere
        ? "Switched off from this page. The password is still set in Cloudflare — re-enable the shared login below to allow it again."
        : "No FOUNDER_PASSWORD secret is set in Cloudflare, so the shared password cannot be used at all.";
  }

  function button(act, id, label, variant) {
    return '<button type="button" class="' + (variant || "secondary") + '" data-act="' + act +
      '" data-id="' + esc(id) + '">' + html(label) + '</button>';
  }

  function renderActivity() {
    if (!state.entries.length) {
      els.activityList.innerHTML = '<div class="ops-empty">No activity recorded for this filter.</div>';
      els.activityMore.hidden = true;
      return;
    }
    els.activityList.innerHTML = '<div class="ops-table-wrap"><table class="ops-table"><thead><tr>' +
      '<th>When</th><th>Who</th><th>Action</th><th>What</th><th>Result</th>' +
      '</tr></thead><tbody>' + state.entries.map(function (e) {
        var failed = e.status && Number(e.status) >= 400;
        return '<tr><td>' + html(when(e.created_at)) + '<div class="muted">' + html(clock(e.created_at)) + '</div></td>' +
          '<td>' + html(e.actor_name || e.actor_email || "Unknown") + '<div class="muted">' + html(e.actor_email || "") + '</div></td>' +
          '<td><strong>' + html(actionLabel(e.action)) + '</strong>' +
          (e.entity ? '<div class="muted">' + html(e.entity) + (e.entity_id ? " · " + html(e.entity_id) : "") + '</div>' : "") + '</td>' +
          '<td>' + html(e.detail || e.path || "—") + '</td>' +
          '<td><span class="ops-pill ' + (failed ? "rework" : "paid") + '">' + (e.status || "—") + '</span>' +
          (e.method ? '<div class="muted">' + html(e.method) + '</div>' : "") + '</td></tr>';
      }).join("") + '</tbody></table></div>';
    els.activityMore.hidden = !state.hasMore;
  }

  // Own query rather than a count over the visible page: the activity table is
  // filtered and paginated, so counting what happens to be on screen would
  // under-report exactly when it matters.
  async function renderFailedSignIns() {
    try {
      var data = await api("/api/activity?action=login_failed&days=7&limit=100");
      var failed = (data.entries || []).length;
      text("team-failed", failed + (data.has_more ? "+" : ""));
    } catch (_) {
      text("team-failed", "—");
    }
  }

  function renderActivityMetric() {
    if (!isMaster()) return;
    var cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    var recent = state.entries.filter(function (e) { return Date.parse(e.created_at) >= cutoff; }).length;
    text("team-actions", recent + (state.hasMore ? "+" : ""));
  }

  function fillActorFilter(actors) {
    var current = els.filterUser.value;
    els.filterUser.innerHTML = '<option value="">Everyone</option>' + actors.map(function (a) {
      return '<option value="' + esc(a.id) + '">' + html(a.name + " · " + a.email) + '</option>';
    }).join("");
    els.filterUser.value = current;
  }

  /* ── account admin ─────────────────────────────────────────────────────── */

  async function createUser(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var data = new FormData(form);
    var payload = {
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      password: String(data.get("password") || ""),
      role: String(data.get("role") || "founder"),
    };
    try {
      var result = await api("/api/users", "POST", payload);
      alert("Account created for " + payload.name + ".\n\nSend them this temporary password over a channel you trust:\n\n" +
        payload.password + "\n\nThey must change it on first sign-in.");
      form.reset();
      // A limited account exists to see a slice, so go straight to choosing that slice.
      if (payload.role !== "master" && result.user) state.editingId = result.user.id;
      await load();
    } catch (error) {
      alert(error.message);
    }
  }

  async function userAction(event) {
    var button = event.target.closest("[data-act]");
    if (!button) return;
    var id = button.getAttribute("data-id");
    var user = state.users.find(function (u) { return u.id === id; });
    if (!user) return;
    var act = button.getAttribute("data-act");

    if (act === "sections") return openSections(id);

    try {
      if (act === "rename") {
        var name = prompt("Display name for " + user.email, user.name);
        if (name === null || !name.trim()) return;
        await api("/api/users", "PATCH", { id: id, name: name.trim() });
      } else if (act === "mailbox") {
        var suggested = user.mailbox ||
          (user.name.trim().split(/\s+/)[0] || "").toLowerCase().replace(/[^a-z0-9.-]/g, "") + "@macc-inc.com";
        var addr = prompt(
          "Personal mailbox address for " + user.name + " (must be @macc-inc.com).\n\n" +
          "Mail to this address shows only in their own mailbox on the Mail page, and they can send as it. " +
          "Leave empty and press OK to remove the mailbox.\n\n" +
          "Remember to add the matching Email Routing rule and PERSONAL_FORWARDS entry " +
          "on the hello-fanout Worker so inbound mail actually arrives (see funnel/README.md).",
          suggested
        );
        if (addr === null) return;
        await api("/api/users", "PATCH", { id: id, mailbox: addr.trim() });
      } else if (act === "reset") {
        var suggestion = strongPassword();
        var next = prompt("New temporary password for " + user.name +
          " (they must change it on first sign-in).\n\nThis signs them out everywhere.", suggestion);
        if (next === null || !next.trim()) return;
        await api("/api/users", "PATCH", { id: id, password: next.trim() });
        alert("Password reset. Give " + user.name + " this password over a channel you trust:\n\n" + next.trim());
      } else if (act === "role") {
        var target = user.role === "master" ? "founder" : "master";
        if (!confirm("Change " + user.name + " to " + roleLabel(target) + "?" +
          (target === "master"
            ? "\n\nFull access: they can create, edit and delete accounts and read everyone's activity."
            : "\n\nLimited: tools only, their own activity, and no account admin."))) return;
        await api("/api/users", "PATCH", { id: id, role: target });
      } else if (act === "toggle") {
        var question = user.is_shared_login
          ? (user.active
              ? "Switch off the shared team password?\n\nEveryone using it is signed out immediately and will need their own login."
              : "Allow the shared team password again?\n\nAnyone who knows it can sign in, and their activity is logged as “" + user.name + "” rather than a person.")
          : (user.active ? "Disable " : "Enable ") + user.name + "?" +
            (user.active ? "\n\nThey are signed out of every device immediately." : "");
        if (!confirm(question)) return;
        await api("/api/users", "PATCH", { id: id, active: !user.active });
      } else if (act === "delete") {
        if (!confirm("Delete the account for " + user.name + " <" + user.email + ">?\n\n" +
          "Their login stops working immediately. Their entries in the activity log are kept.")) return;
        await api("/api/users", "DELETE", { id: id });
      }
      await load();
    } catch (error) {
      alert(error.message);
    }
  }

  function suggestPassword() {
    els.createForm.elements.password.value = strongPassword();
    els.createForm.elements.password.focus();
  }

  /* ── self-service ──────────────────────────────────────────────────────── */

  async function changePassword(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var data = new FormData(form);
    var next = String(data.get("new_password") || "");
    if (next !== String(data.get("confirm_password") || "")) {
      alert("The two new passwords do not match.");
      return;
    }
    try {
      var result = await api("/api/session", "POST", {
        action: "change_password",
        current_password: String(data.get("current_password") || ""),
        new_password: next,
      });
      state.me = result.user;
      form.reset();
      renderMe();
      await loadActivity(false);
      status("Password changed. Every other device has been signed out.");
    } catch (error) {
      alert(error.message);
    }
  }

  async function changeName(event) {
    event.preventDefault();
    var name = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!name) return;
    try {
      var result = await api("/api/session", "POST", { action: "update_name", name: name });
      state.me = result.user;
      renderMe();
      if (isMaster()) await load();
      else status("Name updated.");
    } catch (error) {
      alert(error.message);
    }
  }

  /* ── helpers ───────────────────────────────────────────────────────────── */

  function isMaster() { return !!state.me && state.me.role === "master"; }

  async function api(url, method, body) {
    var options = {
      method: method || "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    var response = await fetch(url, options);
    var data = await response.json().catch(function () { return {}; });
    // Only bounce to login on a real auth failure. Credential checks (e.g. wrong
    // current password on change) must surface their own error without signing out.
    if (response.status === 401) {
      redirectLogin();
      throw new Error(data.error || "Session expired — signing in again.");
    }
    if (!response.ok || !data.ok) throw new Error(data.error || "Request failed (" + response.status + ").");
    return data;
  }

  function redirectLogin() { location.href = "/login.html?next=" + encodeURIComponent(location.pathname); }

  function selectTab(name) {
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === name));
    });
    document.querySelectorAll("[data-panel]").forEach(function (p) {
      p.hidden = p.getAttribute("data-panel") !== name;
    });
  }

  function strongPassword() {
    // Readable but unguessable: 4 syllable-ish blocks plus digits. Only ever used as
    // a temporary password the founder replaces on first sign-in.
    var consonants = "bcdfghjkmnpqrstvwxz";
    var vowels = "aeiou";
    var out = "";
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (var i = 0; i < 4; i++) {
      out += consonants[bytes[i * 3] % consonants.length] +
             vowels[bytes[i * 3 + 1] % vowels.length] +
             consonants[bytes[i * 3 + 2] % consonants.length];
      if (i < 3) out += "-";
    }
    return out + (100 + (bytes[15] % 900));
  }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  // "master" is what a founder is: full access. "founder" is the limited role kept for
  // installers, interns and bookkeepers.
  function roleLabel(role) { return role === "master" ? "Founder" : "Limited"; }

  function actionLabel(action) {
    var known = {
      login: "Signed in",
      logout: "Signed out",
      login_failed: "Failed sign-in",
      login_blocked: "Sign-in blocked",
      password_changed: "Changed own password",
      password_change_failed: "Failed password change",
      profile_updated: "Updated own profile",
      "users.create": "Created account",
      "users.update": "Edited account",
      "users.delete": "Deleted account",
      "users.denied": "Blocked from account admin",
    };
    if (known[action]) return known[action];
    return String(action || "").replace(/[._]/g, " ").replace(/^\w/, function (c) { return c.toUpperCase(); });
  }

  function when(iso) {
    var date = new Date(iso);
    if (isNaN(date)) return "—";
    var days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return days + " days ago";
    return date.toISOString().slice(0, 10);
  }

  function clock(iso) {
    var date = new Date(iso);
    if (isNaN(date)) return "";
    return date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  }

  function status(message, bad) {
    els.status.textContent = message;
    els.status.style.color = bad ? "#b42318" : "";
  }

  function text(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function html(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function esc(value) { return html(value).replace(/`/g, "&#96;"); }
})();
