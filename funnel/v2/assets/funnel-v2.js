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

/* Solar City — BILECO savings calculator (Test 1 instant time-to-value).
   Bill in → estimated savings / payback / recommended package out, then
   pre-fills the lead form (bill range + package + goal) and jumps to it.
   Assumptions are deliberately conservative and clearly labelled as estimates. */
(function () {
  "use strict";
  var billEl = document.getElementById("calc-bill");
  var goBtn = document.getElementById("calc-go");
  if (!billEl || !goBtn) return;

  var RATE = 12.95, PSH = 4.0, DERATE = 0.78; // BILECO ₱/kWh, peak-sun-hrs, system derate
  var KWP = { save: 2.3, both: 2.2, backup: 1.6 };      // ~₱99,500 system by priority
  var PKG = {
    save:   { code: "LIWANAG", opt: "LIWANAG (on-grid)",  goal: "Lower my bill (on-grid)",  tag: "On-grid — lowers your bill" },
    both:   { code: "SANDIGAN", opt: "SANDIGAN (hybrid)", goal: "Both (hybrid)",            tag: "Hybrid — savings + brownout backup" },
    backup: { code: "ILAW", opt: "ILAW (off-grid)",       goal: "Backup power (off-grid)",  tag: "Off-grid — backup through brownouts" }
  };
  var prio = "save";

  var pills = document.getElementById("calc-pills");
  if (pills) {
    pills.querySelectorAll(".calc-pill").forEach(function (b) {
      b.addEventListener("click", function () {
        prio = b.getAttribute("data-prio");
        pills.querySelectorAll(".calc-pill").forEach(function (x) { x.classList.toggle("sel", x === b); });
      });
    });
  }

  function peso(n) { return "₱" + Math.round(n).toLocaleString(); }
  function round100(n) { return Math.max(0, Math.round(n / 100) * 100); }

  function compute() {
    var bill = parseFloat(billEl.value);
    if (!isFinite(bill) || bill <= 0) { billEl.focus(); return null; }
    var kwp = KWP[prio];
    var prodKwh = kwp * PSH * 30 * DERATE;          // monthly production
    var usedKwh = bill / RATE;                        // monthly consumption
    var offsetKwh = Math.min(prodKwh, usedKwh);
    var save = offsetKwh * RATE * 0.9;               // 0.9 = conservative self-consumption haircut
    save = Math.min(save, bill * 0.9);               // never imply we zero the bill
    var lo = round100(save * 0.85), hi = round100(save * 1.15);
    var payLo = 99500 / (hi * 12), payHi = 99500 / (lo * 12);
    return { bill: bill, lo: lo, hi: hi, payLo: payLo, payHi: payHi, five: save * 60, pkg: PKG[prio] };
  }

  function billRange(n) {
    if (n < 3000) return "Under ₱3,000";
    if (n < 6000) return "₱3,000 - ₱6,000";
    if (n < 10000) return "₱6,000 - ₱10,000";
    if (n < 15000) return "₱10,000 - ₱15,000";
    return "Over ₱15,000";
  }
  function setSelect(id, text) {
    var s = document.getElementById(id);
    if (!s) return;
    for (var i = 0; i < s.options.length; i++) {
      if (s.options[i].value === text || s.options[i].text === text) { s.selectedIndex = i; break; }
    }
  }

  goBtn.addEventListener("click", function () {
    var r = compute();
    if (!r) return;
    document.getElementById("calc-save").textContent =
      r.lo === r.hi ? peso(r.lo) + " / mo" : peso(r.lo) + " – " + peso(r.hi) + " / mo";
    var py = Math.max(1, Math.round(r.payLo)), pyH = Math.max(py, Math.round(r.payHi));
    document.getElementById("calc-payback").textContent = (py === pyH ? py : py + "–" + pyH) + " yrs";
    document.getElementById("calc-5yr").textContent = "~" + peso(r.five);
    var backupLine = (prio !== "save") ? " Plus lights, fans and WiFi through a brownout." : "";
    document.getElementById("calc-pkg").innerHTML =
      "Best fit: <b>" + r.pkg.code + "</b> — " + r.pkg.tag + ". Request a free estimate for your installed price." + backupLine;

    // pre-fill the lead form so the quote request carries the estimate context
    setSelect("f-bill", billRange(r.bill));
    setSelect("f-package", r.pkg.opt);
    var radio = document.querySelector('input[name="goal"][value="' + r.pkg.goal + '"]');
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
      var pill = radio.closest(".pill");
      if (pill) pill.classList.add("sel");
    }

    var box = document.getElementById("calc-result");
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (window.fbq) window.fbq("track", "Lead", { content_name: "savings_calculator" });
    if (window.gtag) window.gtag("event", "calculator_estimate");
  });

  billEl.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); goBtn.click(); } });
})();

/* v2 only — photo carousel.
   Autoplays, pauses on hover/focus/hidden tab, keyboard + swipe, honours
   prefers-reduced-motion. Dots are generated from the slides so adding a slide
   to the HTML is the only edit needed. */
(function () {
  "use strict";
  var root = document.querySelector("[data-gallery]");
  if (!root) return;

  var track = root.querySelector(".gal-track");
  var slides = Array.prototype.slice.call(track.children);
  var live = root.querySelector(".gal-live");
  var dotBox = document.querySelector(".gal-dots");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var DWELL = 6500;
  var index = 0;
  var timer = null;

  var dots = slides.map(function (slide, n) {
    var d = document.createElement("button");
    d.type = "button";
    d.className = "gal-dot";
    d.setAttribute("role", "tab");
    d.setAttribute("aria-label", "Slide " + (n + 1) + ": " + slide.dataset.title);
    d.addEventListener("click", function () { go(n); restart(); });
    dotBox.appendChild(d);
    return d;
  });

  function go(n) {
    index = (n + slides.length) % slides.length;
    track.style.transform = "translateX(" + (index * -100) + "%)";
    slides.forEach(function (s, k) {
      var off = k !== index;
      s.setAttribute("aria-hidden", off ? "true" : "false");
      s.inert = off;
    });
    dots.forEach(function (d, k) {
      d.setAttribute("aria-selected", k === index ? "true" : "false");
      d.tabIndex = k === index ? 0 : -1;
    });
    live.textContent = "Slide " + (index + 1) + " of " + slides.length + ": " + slides[index].dataset.title;
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function start() { if (!timer && !reduce.matches) timer = setInterval(function () { go(index + 1); }, DWELL); }
  function restart() { stop(); start(); }

  root.querySelector(".gal-prev").addEventListener("click", function () { go(index - 1); restart(); });
  root.querySelector(".gal-next").addEventListener("click", function () { go(index + 1); restart(); });

  dotBox.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    go(index + (e.key === "ArrowRight" ? 1 : -1));
    dots[index].focus();
    restart();
  });

  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", start);
  root.addEventListener("focusin", stop);
  root.addEventListener("focusout", function (e) { if (!root.contains(e.relatedTarget)) start(); });
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  reduce.addEventListener("change", function () { reduce.matches ? stop() : start(); });

  var x0 = null;
  root.addEventListener("pointerdown", function (e) { x0 = e.clientX; });
  root.addEventListener("pointerup", function (e) {
    if (x0 === null) return;
    var dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 45) { go(index + (dx < 0 ? 1 : -1)); restart(); }
  });

  go(0);
  start();
})();
