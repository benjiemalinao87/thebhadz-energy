/**
 * Command Center sidebar: desktop auto-collapse to an icon rail.
 * Expands on hover / focus; pin keeps it open. Mobile drawer is unchanged.
 */
(function () {
  var KEY = "macc-cc-sidebar-pinned";
  var sidebar = document.getElementById("cc-sidebar");
  var pin = document.getElementById("cc-sb-pin");
  if (!sidebar || !pin) return;

  var mq = window.matchMedia("(min-width: 981px)");

  function isPinned() {
    try { return localStorage.getItem(KEY) === "1"; } catch (_) { return false; }
  }

  function setPinned(on) {
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) { /* private mode */ }
    apply();
  }

  function apply() {
    var desktop = mq.matches;
    var pinned = isPinned();
    document.body.classList.toggle("cc-sb-collapsed", desktop && !pinned);
    pin.setAttribute("aria-pressed", pinned ? "true" : "false");
    pin.setAttribute("aria-label", pinned ? "Unpin sidebar (auto-collapse)" : "Pin sidebar open");
    pin.title = pinned ? "Unpin — auto-collapse when idle" : "Pin open";
    pin.hidden = !desktop;
  }

  function labelText(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll(".tail, .dot-badge, .hub-badge, .hub-dot, .cc-sb-group-count, svg").forEach(function (n) {
      n.remove();
    });
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  // Tooltips when the rail is icon-only.
  sidebar.querySelectorAll(".cc-sb-item").forEach(function (item) {
    if (!item.getAttribute("title")) {
      var text = labelText(item);
      if (text) item.setAttribute("title", text);
    }
  });

  pin.addEventListener("click", function () {
    setPinned(!isPinned());
  });

  if (mq.addEventListener) mq.addEventListener("change", apply);
  else if (mq.addListener) mq.addListener(apply);

  apply();
})();
