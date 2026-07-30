/* MACC FB-ad calculator — bill estimate + lead capture.
   Same BILECO assumptions as funnel v2; source tagged fb-calc-ad. */
(function () {
  "use strict";

  var RATE = 12.95, PSH = 4.0, DERATE = 0.78;
  var KWP = { save: 2.3, both: 2.2, backup: 1.6 };
  var PKG = {
    save:   { code: "LIWANAG",  opt: "LIWANAG (on-grid)",  goal: "Lower my bill (on-grid)",  tag: "On-grid — lowers your bill" },
    both:   { code: "SANDIGAN", opt: "SANDIGAN (hybrid)",  goal: "Both (hybrid)",            tag: "Hybrid — savings + brownout backup" },
    backup: { code: "ILAW",     opt: "ILAW (off-grid)",    goal: "Backup power (off-grid)",  tag: "Off-grid — backup through brownouts" }
  };
  var prio = "save";
  var last = null;

  var billEl = document.getElementById("calc-bill");
  var areaEl = document.getElementById("calc-area");
  var goBtn = document.getElementById("calc-go");
  var pills = document.getElementById("calc-pills");
  var backupNote = document.getElementById("calc-backup-note");

  function peso(n) { return "₱" + Math.round(n).toLocaleString(); }
  function round100(n) { return Math.max(0, Math.round(n / 100) * 100); }

  function billRange(n) {
    if (n < 3000) return "Under ₱3,000";
    if (n < 6000) return "₱3,000 - ₱6,000";
    if (n < 10000) return "₱6,000 - ₱10,000";
    if (n < 15000) return "₱10,000 - ₱15,000";
    return "Over ₱15,000";
  }

  if (pills) {
    pills.querySelectorAll(".prio-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        prio = b.getAttribute("data-prio");
        pills.querySelectorAll(".prio-btn").forEach(function (x) {
          x.classList.toggle("sel", x === b);
        });
        if (last) render(last);
      });
    });
  }

  function compute() {
    var bill = parseFloat(billEl.value);
    if (!isFinite(bill) || bill <= 0) {
      billEl.focus();
      return null;
    }
    var kwp = KWP[prio];
    var prodKwh = kwp * PSH * 30 * DERATE;
    var usedKwh = bill / RATE;
    var offsetKwh = Math.min(prodKwh, usedKwh);
    var save = offsetKwh * RATE * 0.9;
    save = Math.min(save, bill * 0.9);
    var lo = round100(save * 0.85);
    var hi = round100(save * 1.15);
    var mid = round100((lo + hi) / 2);
    return { bill: bill, lo: lo, hi: hi, mid: mid, five: save * 60, pkg: PKG[prio] };
  }

  function syncLeadFields(r) {
    var pkg = (r && r.pkg) || PKG[prio];
    document.getElementById("f-package").value = pkg.opt;
    document.getElementById("f-goal").value = pkg.goal;
    if (r && r.bill) {
      document.getElementById("f-bill").value = billRange(r.bill);
    } else if (billEl.value) {
      var n = parseFloat(billEl.value);
      if (isFinite(n) && n > 0) document.getElementById("f-bill").value = billRange(n);
    }
    var addr = document.getElementById("f-address");
    if (areaEl && areaEl.value.trim() && addr && !addr.value.trim()) {
      addr.value = areaEl.value.trim();
    }
  }

  function render(r) {
    last = r;
    var box = document.getElementById("calc-result");
    document.getElementById("calc-save").textContent = peso(r.mid);
    var range = document.getElementById("calc-range");
    if (r.lo !== r.hi) {
      range.hidden = false;
      range.textContent = "Typical range " + peso(r.lo) + " – " + peso(r.hi);
    } else {
      range.hidden = true;
      range.textContent = "";
    }
    document.getElementById("calc-pkg").innerHTML =
      "<b>" + r.pkg.code + "</b> " + r.pkg.tag;
    backupNote.hidden = (prio === "save");
    box.classList.add("has-value");
    var next = document.getElementById("calc-next");
    if (next) next.hidden = false;
    syncLeadFields(r);
  }

  goBtn.addEventListener("click", function () {
    var r = compute();
    if (!r) return;
    render(r);
    document.getElementById("calc-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (window.fbq) window.fbq("track", "Lead", { content_name: "fb_calc_estimate" });
    if (window.gtag) window.gtag("event", "calculator_estimate", { page: "fb-calc-ad" });
  });

  billEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      goBtn.click();
    }
  });

  /* ---- lead form → same /api/lead as main funnel → Contacts CRM ---- */
  var form = document.getElementById("lead-form");
  if (!form) return;

  var epMeta = document.querySelector('meta[name="lead-endpoint"]');
  var LEAD_ENDPOINT = (epMeta && epMeta.content) || "/api/lead";
  var nameEl = document.getElementById("f-name");
  var phoneEl = document.getElementById("f-phone");
  var submitBtn = document.getElementById("submit-btn");
  var fail = document.getElementById("send-fail");
  var leadSec = document.getElementById("lead");

  function phoneValid(v) {
    var digits = (v || "").replace(/[^\d]/g, "");
    return digits.length >= 10 && digits.length <= 13;
  }

  function setErr(el, on) {
    var field = el && el.closest(".field");
    if (field) field.classList.toggle("err", !!on);
  }

  [nameEl, phoneEl].forEach(function (el) {
    el.addEventListener("input", function () { setErr(el, false); });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var ok = true;
    if (!nameEl.value.trim()) { setErr(nameEl, true); ok = false; }
    if (!phoneValid(phoneEl.value)) { setErr(phoneEl, true); ok = false; }
    if (!ok) {
      var first = form.querySelector(".field.err");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Prefer a fresh compute; otherwise still fill goal/package from the priority pills
    // so /api/lead never 422s on missing goal (required, same as main funnel).
    if (!last) {
      var computed = compute();
      if (computed) render(computed);
    }
    syncLeadFields(last);

    var data = Object.fromEntries(new FormData(form).entries());
    data.source = data.source || "fb-calc-ad";
    data.page = location.pathname;
    data.referrer = document.referrer || "";
    if (areaEl && areaEl.value.trim() && !data.address) data.address = areaEl.value.trim();
    if (!data.goal) data.goal = PKG[prio].goal;
    if (!data.package) data.package = PKG[prio].opt;
    var qs = new URLSearchParams(location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
      if (qs.get(k)) data[k] = qs.get(k);
    });

    submitBtn.disabled = true;
    var original = submitBtn.textContent;
    submitBtn.textContent = "Sending…";
    if (fail) {
      fail.classList.remove("show");
      fail.textContent = "Couldn’t send — check your signal and try again, or call 0955 723 5093.";
    }

    fetch(LEAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then(function (r) {
        return r.json().then(function (body) {
          if (!r.ok || (body && body.ok === false)) {
            var err = new Error((body && body.error) || ("HTTP " + r.status));
            err.status = r.status;
            throw err;
          }
          return body;
        });
      })
      .then(function () {
        leadSec.classList.add("sent");
        leadSec.scrollIntoView({ behavior: "smooth", block: "center" });
        if (window.fbq) window.fbq("track", "Lead");
        if (window.gtag) window.gtag("event", "generate_lead");
      })
      .catch(function (err) {
        if (fail) {
          if (err && err.message && err.status === 422) fail.textContent = err.message;
          fail.classList.add("show");
          fail.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      });
  });
})();
