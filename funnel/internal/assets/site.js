// Shared site behavior: mark the current page in the nav.
(function () {
  // Keep the newest operating tools reachable from every legacy document page.
  var nav = document.querySelector(".nav");
  if (nav && !nav.querySelector('a[href$="finance.html"]')) {
    var anchor = nav.querySelector('a[href$="founder-lab.html"]') || nav.querySelector('a[href$="projects.html"]');
    var finance = document.createElement("a");
    finance.href = "/internal/finance.html";
    finance.innerHTML = '<span class="code">SC-09</span>Finance &amp; runway';
    var operations = document.createElement("a");
    operations.href = "/internal/install-ops.html";
    operations.innerHTML = '<span class="code">SC-10</span>Install operations';
    if (anchor) {
      anchor.insertAdjacentElement("afterend", operations);
      anchor.insertAdjacentElement("afterend", finance);
    } else {
      nav.append(finance, operations);
    }
  }

  var here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach(function (a) {
    var target = a.getAttribute("href").split("/").pop();
    if (target === here) a.setAttribute("aria-current", "page");
  });
})();
