(function () {
  var deck = document.querySelector(".deck");
  var slides = Array.prototype.slice.call(document.querySelectorAll("[data-slide]"));
  var current = 0;
  var counter = document.getElementById("deck-counter");
  var progress = document.getElementById("deck-progress");

  function setCurrent(index, updateHash) {
    current = Math.max(0, Math.min(slides.length - 1, index));
    counter.textContent = String(current + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
    progress.style.width = (((current + 1) / slides.length) * 100) + "%";
    if (updateHash && history.replaceState) history.replaceState(null, "", "#slide-" + (current + 1));
  }

  function go(index) {
    var target = slides[Math.max(0, Math.min(slides.length - 1, index))];
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.getElementById("deck-prev").addEventListener("click", function () { go(current - 1); });
  document.getElementById("deck-next").addEventListener("click", function () { go(current + 1); });
  document.getElementById("deck-fullscreen").addEventListener("click", function () {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
  });

  document.addEventListener("keydown", function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (["ArrowRight", "ArrowDown", "PageDown", " "].indexOf(event.key) >= 0) { event.preventDefault(); go(current + 1); }
    if (["ArrowLeft", "ArrowUp", "PageUp"].indexOf(event.key) >= 0) { event.preventDefault(); go(current - 1); }
    if (event.key === "Home") { event.preventDefault(); go(0); }
    if (event.key === "End") { event.preventDefault(); go(slides.length - 1); }
  });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
        setCurrent(slides.indexOf(entry.target), true);
      }
    });
  }, { root: deck, threshold: [0.55] });
  slides.forEach(function (slide) { observer.observe(slide); });

  var match = location.hash.match(/^#slide-(\d+)$/);
  var initial = match ? Number(match[1]) - 1 : 0;
  setCurrent(initial, false);
  if (initial > 0) requestAnimationFrame(function () { go(initial); });
})();
