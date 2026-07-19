(function () {
  "use strict";

  var STORAGE_KEY = "solar-city-internal-theme";
  var root = document.documentElement;

  function preferredTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (_) {}
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function updateControls(theme) {
    var isDark = theme === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(isDark));
      button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      var icon = button.querySelector("[data-theme-icon]");
      var label = button.querySelector("[data-theme-label]");
      if (icon) icon.textContent = isDark ? "☀" : "◐";
      if (label) label.textContent = isDark ? "Light mode" : "Dark mode";
    });
  }

  function applyTheme(theme, persist) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    updateControls(theme);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent("solarcitythemechange", { detail: { theme: theme } }));
  }

  function makeStandaloneToggle() {
    if (document.querySelector("[data-theme-toggle]")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "sc-theme-toggle sc-theme-toggle-standalone";
    button.setAttribute("data-theme-toggle", "");
    button.innerHTML = '<span data-theme-icon aria-hidden="true">◐</span><span data-theme-label>Dark mode</span>';
    var target = document.querySelector(".sidebar .foot") || document.body;
    target.appendChild(button);
  }

  function mount() {
    makeStandaloneToggle();
    updateControls(root.dataset.theme || preferredTheme());
    if (document.documentElement.dataset.themeControlsReady === "true") return;
    document.documentElement.dataset.themeControlsReady = "true";
    document.addEventListener("click", function (event) {
      var button = event.target.closest && event.target.closest("[data-theme-toggle]");
      if (!button) return;
      applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });
    window.addEventListener("storage", function (event) {
      if (event.key === STORAGE_KEY && (event.newValue === "light" || event.newValue === "dark")) {
        applyTheme(event.newValue, false);
      }
    });
  }

  if (!root.dataset.theme) applyTheme(preferredTheme(), false);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();

  window.scTheme = { apply: applyTheme, mount: mount };
})();
