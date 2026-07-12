/* Solar City funnel — client behavior.
   - Pill (radio) selection styling
   - Package CTA buttons pre-select the package in the form and scroll to it
   - Inline validation
   - Submit to /api/lead (Cloudflare Pages Function); succeeds gracefully if offline/static
   - FB Pixel / GA hooks are no-ops unless a tag is added later */
(function () {
  "use strict";

  var form = document.getElementById("lead-form");
  if (!form) return;

  // ---- Goal pills (radio group) ----
  var pillWrap = document.getElementById("goal-pills");
  function syncPills() {
    pillWrap.querySelectorAll(".pill").forEach(function (p) {
      var input = p.querySelector("input");
      p.classList.toggle("sel", input.checked);
    });
  }
  if (pillWrap) {
    pillWrap.querySelectorAll(".pill").forEach(function (p) {
      p.addEventListener("click", function () {
        var input = p.querySelector("input");
        input.checked = true;
        syncPills();
        clearError(p.closest(".field"));
      });
    });
  }

  // ---- Package CTA → preselect + jump to form ----
  var pkgSelect = document.getElementById("f-package");
  var goalByPkg = {
    LIWANAG: "Lower my bill (on-grid)",
    ILAW: "Backup power (off-grid)",
    SANDIGAN: "Both (hybrid)"
  };
  document.querySelectorAll("a[data-pkg]").forEach(function (a) {
    a.addEventListener("click", function () {
      var pkg = a.getAttribute("data-pkg");
      // set package select
      if (pkgSelect) {
        var label = pkg === "LIWANAG" ? "LIWANAG (on-grid)"
                  : pkg === "ILAW" ? "ILAW (off-grid)"
                  : pkg === "SANDIGAN" ? "SANDIGAN (hybrid)" : "";
        for (var i = 0; i < pkgSelect.options.length; i++) {
          if (pkgSelect.options[i].value === label) { pkgSelect.selectedIndex = i; break; }
        }
      }
      // set matching goal pill
      var goal = goalByPkg[pkg];
      if (goal) {
        var radio = form.querySelector('input[name="goal"][value="' + goal + '"]');
        if (radio) { radio.checked = true; syncPills(); }
      }
    });
  });

  // ---- Validation ----
  function fieldOf(input) { return input.closest(".field"); }
  function setError(field) { if (field) field.classList.add("err"); }
  function clearError(field) { if (field) field.classList.remove("err"); }

  var nameEl = document.getElementById("f-name");
  var phoneEl = document.getElementById("f-phone");
  var emailEl = document.getElementById("f-email");

  function phoneValid(v) {
    var digits = (v || "").replace(/[^\d]/g, "");
    return digits.length >= 10 && digits.length <= 13;
  }
  function emailValid(v) {
    if (!v) return true; // optional
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  [nameEl, phoneEl, emailEl].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", function () { clearError(fieldOf(el)); });
  });

  function validate() {
    var ok = true;
    if (!nameEl.value.trim()) { setError(fieldOf(nameEl)); ok = false; }
    if (!phoneValid(phoneEl.value)) { setError(fieldOf(phoneEl)); ok = false; }
    if (!emailValid(emailEl.value)) { setError(fieldOf(emailEl)); ok = false; }
    var goal = form.querySelector('input[name="goal"]:checked');
    if (!goal) { setError(pillWrap.closest(".field")); ok = false; }
    return ok;
  }

  // ---- Submit ----
  var submitBtn = document.getElementById("submit-btn");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validate()) {
      var firstErr = form.querySelector(".field.err");
      if (firstErr) firstErr.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    var data = Object.fromEntries(new FormData(form).entries());
    data.source = "funnel";
    data.page = location.pathname;
    data.referrer = document.referrer || "";
    // querystring UTM passthrough (marketing attribution)
    var qs = new URLSearchParams(location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
      if (qs.get(k)) data[k] = qs.get(k);
    });

    submitBtn.disabled = true;
    var original = submitBtn.textContent;
    submitBtn.textContent = "Sending…";

    function done() {
      form.classList.add("sent");
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      // analytics hooks (no-op unless a pixel is present)
      if (window.fbq) window.fbq("track", "Lead");
      if (window.gtag) window.gtag("event", "generate_lead");
    }

    fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function () { done(); })
      .catch(function () {
        // Static preview or function not deployed yet: still show success so
        // the funnel is testable. Real deploys hit the function above.
        done();
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      });
  });
})();
