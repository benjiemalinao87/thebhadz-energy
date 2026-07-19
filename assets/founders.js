// SC-12 Founder lessons — swipeable card deck (Tinder-style flip + swipe).
// Self-contained: no CDN, no framework, works from file://.

(function () {
  var FOUNDERS = [
    {
      id: "lutke", name: "Tobi Lütke", co: "Shopify", year: "2004 · Ottawa",
      cat: "SOFTWARE", tag: "SOFTWARE · E-COMMERCE",
      hook: "Tried to sell snowboards online. Hated every platform so much he built his own.",
      start: "Lütke and friends opened Snowdevil, an online snowboard shop, in 2004. No e-commerce software fit how he wanted to build, so he wrote his own.",
      crisis: "The snowboard shop stayed tiny. The real bet was walking away from it to sell the software instead — with almost no customers and no proof anyone else wanted it.",
      lesson: "The tool you build to solve your own problem can be worth more than the business it was built for."
    },
    {
      id: "ek", name: "Daniel Ek", co: "Spotify", year: "2006 · Stockholm",
      cat: "SOFTWARE", tag: "SOFTWARE · MUSIC STREAMING",
      hook: "Had to convince record labels to trust the guy who grew up on Napster.",
      start: "Ek built Spotify's first streaming engine in 2006, obsessed with getting a song to start playing in under 200 milliseconds — faster than piracy felt.",
      crisis: "Every major label had been burned by digital music before and had little reason to license a Swedish startup's catalog. Ek spent nearly two years negotiating before Spotify could legally launch in 2008.",
      lesson: "Beating a free, illegal competitor takes a legal product that's actually more convenient — not just cheaper."
    },
    {
      id: "musk", name: "Elon Musk", co: "Tesla &amp; SpaceX", year: "2002 / 2004 · California",
      cat: "HARDWARE", tag: "HARDWARE · AUTOMOTIVE &amp; AEROSPACE",
      hook: "Poured his last dollars into two companies in the same month they nearly both died.",
      start: "Musk put his PayPal payout into SpaceX (2002) to cut launch costs, then Tesla (2004) to prove electric cars didn't have to be slow or ugly.",
      crisis: "Late 2008: SpaceX's first three Falcon 1 launches had failed, and Tesla was days from running out of cash in the financial crisis. Musk personally funded both in the same week — one more failure would have ended either.",
      lesson: "The launch you can barely afford to attempt is sometimes the one that has to work."
    },
    {
      id: "munger", name: "Charlie Munger", co: "Wheeler, Munger &amp; Co. / Berkshire", year: "1962 · California",
      cat: "INVESTING", tag: "INVESTING · CAPITAL ALLOCATION",
      hook: "Watched his own fund lose more than half its value — and still ran it to a strong finish.",
      start: "Before partnering with Warren Buffett at Berkshire Hathaway, Munger ran his own investment partnership, Wheeler, Munger &amp; Co., through the 1960s and 70s.",
      crisis: "The 1973–74 bear market cut the fund's value by more than half. Investors who panicked and sold locked in the loss; Munger held his concentrated bets and fully recovered within a few years.",
      lesson: "Volatility isn't the same as risk — permanent loss of capital is. Don't confuse a bad quarter with a bad decision."
    },
    {
      id: "zuck", name: "Mark Zuckerberg", co: "Facebook", year: "2004 · Harvard",
      cat: "SOFTWARE", tag: "SOFTWARE · SOCIAL NETWORK",
      hook: "Built it in a dorm room, then had to defend that he'd actually built it.",
      start: "Zuckerberg launched thefacebook.com from his Harvard dorm in February 2004, opening it college by college instead of to everyone at once.",
      crisis: "Within months he was fighting a lawsuit over the site's origins — a legal cloud that followed the company for years while it was also trying to scale servers and raise money on a shoestring.",
      lesson: "A controlled, narrow rollout beats a big launch you can't yet support — grow into the next room only once the current one works."
    },
    {
      id: "uber", name: "Kalanick &amp; Camp", co: "Uber", year: "2009 · San Francisco",
      cat: "SOFTWARE", tag: "MARKETPLACE · MOBILITY",
      hook: "Got a cease-and-desist from the city before they had their first thousand riders.",
      start: "Camp and Kalanick started UberCab in 2009 after struggling to find a cab in Paris — an app to tap a button and get a black car.",
      crisis: "San Francisco's taxi authority sent a cease-and-desist within a year of launch, the first of dozens of city-by-city legal fights Uber had to win one market at a time for most of a decade.",
      lesson: "Some markets are won regulator by regulator, city by city — there's no shortcut that skips the fight."
    },
    {
      id: "jensen", name: "Jensen Huang", co: "Nvidia", year: "1993 · Denny's, San Jose",
      cat: "HARDWARE", tag: "HARDWARE · SEMICONDUCTORS",
      hook: "Planned the company at a Denny's booth — then nearly lost it all on the first chip.",
      start: "Huang and co-founders Chris Malachowsky and Curtis Priem founded Nvidia in 1993 to build graphics chips for the coming PC gaming boom.",
      crisis: "Their first chip bet on the wrong technical standard and flopped commercially. Nvidia had payroll to make and almost no cash left before the next chip, the RIVA 128, shipped and saved the company in 1997.",
      lesson: "One wrong architecture bet can nearly end a hardware company — the next one has to be right, because there may not be a next one after that."
    },
    {
      id: "sony", name: "Ibuka &amp; Morita", co: "Sony", year: "1946 · Tokyo",
      cat: "HARDWARE", tag: "HARDWARE · CONSUMER ELECTRONICS",
      hook: "Started by repairing radios in a burned-out department store — and their first product flopped.",
      start: "Ibuka and Morita founded Tokyo Tsushin Kogyo in 1946 in a bombed department store in postwar Tokyo, repairing shortwave radios.",
      crisis: "Their first original product, an automatic rice cooker, barely worked and sold almost nothing. They pivoted to tape recorders, then licensed transistor technology nobody else wanted — betting a broke, distrusted 'Made in Japan' label could still mean quality.",
      lesson: "Your first product is allowed to fail — it exists to teach you what to build next, not to be the company."
    },
    {
      id: "dell", name: "Michael Dell", co: "Dell (PC's Limited)", year: "1984 · Austin",
      cat: "HARDWARE", tag: "HARDWARE · COMPUTERS",
      hook: "Started with $1,000 from a dorm room — then a bad product line almost sank the company.",
      start: "Dell began building and selling custom PCs directly to customers from his University of Texas dorm in 1984, cutting out the retail markup entirely.",
      crisis: "By 1993, a botched notebook line and a cash crunch from overexpansion nearly broke the company. Dell had to step back into daily operations and rebuild inventory and quality discipline from the ground up.",
      lesson: "A fast-growing model can outrun the operational discipline it needs — growth has to be earned back at every stage, not assumed."
    },
    {
      id: "jobs", name: "Steve Jobs", co: "Apple", year: "1976 garage · 1997 return",
      cat: "HARDWARE", tag: "HARDWARE · CONSUMER ELECTRONICS",
      hook: "Got fired from the company he started in a garage — and it saved him.",
      start: "Jobs co-founded Apple in a Los Altos garage in 1976 with Steve Wozniak and Ronald Wayne.",
      crisis: "In 1985, a power struggle with CEO John Sculley pushed Jobs out of his own company. He spent twelve years outside Apple, building NeXT and Pixar, before a struggling Apple bought NeXT and brought him back as CEO in 1997.",
      lesson: "Losing the company you built can be the thing that teaches you how to actually run one."
    },
    {
      id: "toyoda", name: "Kiichiro Toyoda", co: "Toyota", year: "1937 · Japan",
      cat: "HARDWARE", tag: "HARDWARE · AUTOMOTIVE MANUFACTURING",
      hook: "Spun a car company off a loom maker — then nearly lost it to a postwar cash crisis.",
      start: "Kiichiro Toyoda, son of loom inventor Sakichi Toyoda, founded Toyota Motor Corporation in 1937 as a spinoff of the family's automatic loom business.",
      crisis: "A severe financial crisis in 1950 pushed Toyota to the edge of bankruptcy — banks forced layoffs, and executives and workers took pay cuts to keep the company alive. Kiichiro resigned to take responsibility.",
      lesson: "The near-bankruptcy that forces radical discipline can become the operating advantage that outlasts the crisis that caused it."
    },
    {
      id: "disney", name: "Walt Disney", co: "Disney", year: "1923 · Hollywood",
      cat: "MEDIA", tag: "MEDIA · ANIMATION",
      hook: "Went bankrupt with his first studio, then lost his first hit character to a bad contract.",
      start: "After his Kansas City animation studio went bankrupt in 1923, Disney moved to Hollywood with $40 and started over with his brother Roy.",
      crisis: "Their early hit character was legally owned by their distributor under the contract they'd signed — the distributor took the character and most of the animation staff in 1928. Disney had built a hit for someone else.",
      lesson: "If you don't own the IP you're building, you don't own the business — Mickey Mouse exists because that lesson landed hard."
    },
    {
      id: "white", name: "Dana White", co: "UFC", year: "2001 · Las Vegas",
      cat: "MEDIA", tag: "MEDIA · SPORTS PROMOTION",
      hook: "Bought a promotion so toxic it had been banned as ‘human cockfighting’ — then bet everything on a reality show to save it.",
      start: "White and the Fertitta brothers bought the UFC for about $2 million in 2001, when mixed martial arts was banned in most U.S. states and dropped by cable providers.",
      crisis: "By 2005 the promotion had burned through tens of millions with no path to profitability. They self-funded a reality show, betting the company's remaining runway on it — a hit that turned the business around within months of near-collapse.",
      lesson: "When the sales pitch keeps failing, change the medium — get the product in front of people directly instead of explaining it to gatekeepers."
    },
    {
      id: "spiegel", name: "Evan Spiegel", co: "Snapchat", year: "2011 · Stanford",
      cat: "SOFTWARE", tag: "SOFTWARE · SOCIAL/MESSAGING",
      hook: "Built a disappearing-photo app everyone mocked — then turned down $3 billion for it.",
      start: "Spiegel, Bobby Murphy, and Reggie Brown built Snapchat as a Stanford class project in 2011, betting that not every photo needs to last forever.",
      crisis: "Early press dismissed it as a sexting app, and in 2013 Facebook offered roughly $3 billion to acquire it outright. Spiegel turned it down with the company still unprofitable and far smaller than the buyer.",
      lesson: "An acquisition offer validates the idea; it doesn't obligate you to sell it — conviction in the roadmap has to outweigh the size of the check."
    },
    {
      id: "fried", name: "Jason Fried", co: "Basecamp (37signals)", year: "1999 · Chicago",
      cat: "SOFTWARE", tag: "SOFTWARE · PROJECT MANAGEMENT",
      hook: "Built a tool to manage his own client work — then fired all his clients to sell the tool instead.",
      start: "Fried ran 37signals as a small web-design consultancy from 1999, and built an internal project-tracking tool, Basecamp, to keep client work organized.",
      crisis: "Clients kept asking to use the internal tool. Fried made the harder call to wind down the profitable consulting business entirely and bet the whole company on the software product, with a small team and no outside funding.",
      lesson: "The internal tool you built to survive your own workload might be worth more than the work itself."
    },
    {
      id: "dyson", name: "James Dyson", co: "Dyson", year: "1978–1993 · UK",
      cat: "HARDWARE", tag: "HARDWARE · CONSUMER APPLIANCES",
      hook: "Built 5,127 failed prototypes — then every manufacturer refused to make the one that worked.",
      start: "Frustrated that his vacuum kept losing suction, Dyson spent five years and 5,127 prototypes developing bagless, cyclonic separation starting in 1978.",
      crisis: "No major UK manufacturer would license the finished design — vacuum bags were a recurring revenue stream they weren't willing to give up. Dyson launched it himself in Japan in 1986, then the UK in 1993, and later sued to protect the patent.",
      lesson: "If incumbents profit from the problem you just solved, they won't help you sell the fix — you may have to build the whole distribution yourself."
    },
    {
      id: "blakely", name: "Sara Blakely", co: "Spanx", year: "1998 · Atlanta",
      cat: "HARDWARE", tag: "CONSUMER PRODUCT · APPAREL",
      hook: "Self-funded with $5,000 — and every hosiery mill in North Carolina turned her down.",
      start: "Blakely spent two years and her entire $5,000 savings developing Spanx nights and weekends while working a day job selling fax machines.",
      crisis: "Every mill she pitched said no — until one owner took the idea home to his daughters, who tried it and told him to make it. She landed her first big order by demonstrating the product live to a Neiman Marcus buyer in the store bathroom.",
      lesson: "One yes after dozens of no's is still a yes — and sometimes you have to demo the product on your own body to get it."
    },
    {
      id: "knight", name: "Phil Knight", co: "Nike (Blue Ribbon Sports)", year: "1964 · Oregon",
      cat: "HARDWARE", tag: "HARDWARE · MANUFACTURING &amp; DISTRIBUTION",
      hook: "Sold shoes out of the trunk of his car — and nearly lost the company to his own bank.",
      start: "Knight started Blue Ribbon Sports in 1964, importing Japanese running shoes and selling them from the trunk of his Plymouth at track meets.",
      crisis: "For most of the next decade the company ran on razor-thin cash, with the bank repeatedly threatening to pull its credit line. A 1971 split from its supplier forced Knight to design and manufacture his own shoes almost overnight, launching the Nike brand.",
      lesson: "Being chronically cash-poor while growing fast isn't a sign you're doing it wrong — it can be the normal condition of building something real."
    },
    {
      id: "kamprad", name: "Ingvar Kamprad", co: "IKEA", year: "1943 · rural Sweden",
      cat: "HARDWARE", tag: "HARDWARE · RETAIL MANUFACTURING",
      hook: "Rival furniture makers got him boycotted by every supplier in Sweden — so he built his own factories instead.",
      start: "Kamprad founded IKEA at 17 as a mail-order business in 1943, expanding into furniture by the early 1950s.",
      crisis: "Established Swedish furniture makers pressured suppliers and trade fairs to freeze IKEA out entirely. Locked out of the domestic industry, Kamprad sourced from Poland and designed IKEA's own furniture — flat-pack was born when an employee removed a table's legs so it would fit in a car.",
      lesson: "Getting locked out of the existing supply chain can force you into a structurally cheaper one — the boycott built the moat."
    },
    {
      id: "chesky", name: "Brian Chesky", co: "Airbnb", year: "2007–2008 · San Francisco",
      cat: "SOFTWARE", tag: "SOFTWARE · MARKETPLACE",
      hook: "Sold novelty cereal to survive — then went door-to-door taking photos to save the company.",
      start: "Chesky, Joe Gebbia, and Nathan Blecharczyk started Airbnb in 2007–08, renting air mattresses in their apartment to conference attendees who couldn't find a hotel.",
      crisis: "Investors passed repeatedly, and by 2008 the founders were maxing out credit cards, partly funding the company by selling election-themed cereal boxes. Growth stayed flat until they personally visited hosts to professionally photograph listings — a manual, unscalable fix that finally moved the numbers.",
      lesson: "When the product isn't converting, go do the unscalable thing yourself before assuming the idea is wrong."
    }
  ];

  var CAT_CLASS = { SOFTWARE: "c-soft", HARDWARE: "c-hard", MEDIA: "c-media", INVESTING: "c-invest" };
  var STORE_KEY = "sc-founder-stars";

  function loadStars() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveStars(arr) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); } catch (e) { /* ignore */ }
  }

  function shuffledOrder(n) {
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(i);
    for (var j = arr.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = arr[j]; arr[j] = arr[k]; arr[k] = tmp;
    }
    return arr;
  }

  function initials(name) {
    var parts = name.split(/\s*&amp;\s*/);
    if (parts.length > 1) {
      return parts.map(function (p) { return p.trim().split(/\s+/)[0][0]; }).join("").toUpperCase();
    }
    return name.trim().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var stage = document.getElementById("fdeck-stage");
    if (!stage) return;

    var indexEl = document.getElementById("fdeck-index");
    var totalEl = document.getElementById("fdeck-total");
    var fillEl = document.getElementById("fdeck-progress-fill");
    var starredCountEl = document.getElementById("fdeck-starred-count");
    var endEl = document.getElementById("fdeck-end");
    var endStarredEl = document.getElementById("fdeck-end-starred");

    var order = shuffledOrder(FOUNDERS.length);
    var pos = 0;
    var starred = loadStars();

    totalEl.textContent = FOUNDERS.length;
    updateStarredCount();

    function updateStarredCount() {
      starredCountEl.textContent = starred.length;
    }

    function render() {
      stage.innerHTML = "";
      if (pos >= order.length) {
        stage.setAttribute("aria-hidden", "true");
        stage.classList.add("is-empty");
        endEl.hidden = false;
        endStarredEl.textContent = starred.length
          ? "You starred " + starred.length + " to revisit."
          : "You didn't star any this round — shuffle and try again.";
        indexEl.textContent = order.length;
        fillEl.style.width = "100%";
        return;
      }
      endEl.hidden = true;
      stage.removeAttribute("aria-hidden");
      stage.classList.remove("is-empty");
      indexEl.textContent = pos + 1;
      fillEl.style.width = Math.round(((pos) / order.length) * 100) + "%";

      var depth = Math.min(3, order.length - pos);
      for (var d = depth - 1; d >= 0; d--) {
        var f = FOUNDERS[order[pos + d]];
        var card = buildCard(f, d);
        stage.appendChild(card);
      }
      var top = stage.querySelector('.fcard[data-depth="0"]');
      if (top) wireDrag(top);
    }

    function buildCard(f, depth) {
      var isStarred = starred.indexOf(f.id) !== -1;
      var card = document.createElement("div");
      card.className = "fcard cat-" + (CAT_CLASS[f.cat] || "c-hard");
      card.setAttribute("data-depth", depth);
      card.style.setProperty("--depth", depth);
      card.innerHTML =
        '<div class="fcard-inner">' +
          '<div class="fcard-face fcard-front">' +
            '<div class="fcard-top">' +
              '<span class="fcard-tag">' + f.tag + '</span>' +
              (isStarred ? '<span class="fcard-star" title="Starred">★</span>' : '') +
            '</div>' +
            '<div class="fcard-avatar">' + initials(f.name) + '</div>' +
            '<h3 class="fcard-name">' + f.name + '</h3>' +
            '<p class="fcard-co">' + f.co + ' <span class="fcard-year">· ' + f.year + '</span></p>' +
            '<p class="fcard-hook">' + f.hook + '</p>' +
            '<p class="fcard-flip-hint">Tap to flip →</p>' +
          '</div>' +
          '<div class="fcard-face fcard-back">' +
            '<p class="fcard-section"><b>The start</b>' + f.start + '</p>' +
            '<p class="fcard-section"><b>The breaking point</b>' + f.crisis + '</p>' +
            '<p class="fcard-section fcard-lesson"><b>The lesson</b>' + f.lesson + '</p>' +
            '<p class="fcard-flip-hint">← Tap to flip back</p>' +
          '</div>' +
        '</div>';
      if (depth === 0) {
        card.tabIndex = 0;
        card.addEventListener("click", function (ev) {
          if (card.classList.contains("is-dragged")) return;
          card.classList.toggle("is-flipped");
        });
      }
      return card;
    }

    function advance(didStar) {
      var f = FOUNDERS[order[pos]];
      if (didStar && starred.indexOf(f.id) === -1) {
        starred.push(f.id);
        saveStars(starred);
        updateStarredCount();
      }
      pos++;
      render();
    }

    function wireDrag(card) {
      var startX = 0, startY = 0, dx = 0, dragging = false, moved = false;
      var inner = card.querySelector(".fcard-inner");

      function onDown(ev) {
        if (card.classList.contains("is-flipped")) return;
        dragging = true; moved = false;
        var p = ev.touches ? ev.touches[0] : ev;
        startX = p.clientX; startY = p.clientY; dx = 0;
        card.setPointerCapture && ev.pointerId != null && card.setPointerCapture(ev.pointerId);
        ev.preventDefault();
      }
      function onMove(ev) {
        if (!dragging) return;
        var p = ev.touches ? ev.touches[0] : ev;
        dx = p.clientX - startX;
        var dy = p.clientY - startY;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
        if (!moved) return;
        card.classList.add("is-dragged");
        var rot = dx / 14;
        inner.style.transform = "translate(" + dx + "px," + (dy * 0.15) + "px) rotate(" + rot + "deg)";
        card.style.setProperty("--like-opacity", Math.max(0, Math.min(1, dx / 120)));
        card.style.setProperty("--pass-opacity", Math.max(0, Math.min(1, -dx / 120)));
      }
      function onUp() {
        if (!dragging) return;
        dragging = false;
        if (Math.abs(dx) > 110) {
          var star = dx > 0;
          flingOut(card, dx > 0 ? 1 : -1, function () { advance(star); });
        } else if (moved) {
          inner.style.transform = "";
          card.style.setProperty("--like-opacity", 0);
          card.style.setProperty("--pass-opacity", 0);
          setTimeout(function () { card.classList.remove("is-dragged"); }, 200);
        }
      }

      card.addEventListener("pointerdown", onDown);
      card.addEventListener("pointermove", onMove);
      card.addEventListener("pointerup", onUp);
      card.addEventListener("pointercancel", onUp);
      card.addEventListener("pointerleave", function (ev) { if (dragging && !moved) onUp(); });
    }

    function flingOut(card, dir, done) {
      var inner = card.querySelector(".fcard-inner");
      card.classList.add("is-flying");
      inner.style.transform = "translate(" + (dir * 640) + "px, -40px) rotate(" + (dir * 28) + "deg)";
      card.style.opacity = "0";
      setTimeout(done, 220);
    }

    document.getElementById("fdeck-next").addEventListener("click", function () {
      var top = stage.querySelector('.fcard[data-depth="0"]');
      if (top && pos < order.length) flingOut(top, 1, function () { advance(true); });
    });
    document.getElementById("fdeck-prev").addEventListener("click", function () {
      var top = stage.querySelector('.fcard[data-depth="0"]');
      if (top && pos < order.length) flingOut(top, -1, function () { advance(false); });
    });
    document.getElementById("fdeck-flip").addEventListener("click", function () {
      var top = stage.querySelector('.fcard[data-depth="0"]');
      if (top) top.classList.toggle("is-flipped");
    });
    document.getElementById("fdeck-shuffle").addEventListener("click", function () {
      order = shuffledOrder(FOUNDERS.length);
      pos = 0;
      render();
    });
    document.getElementById("fdeck-restart").addEventListener("click", function () {
      order = shuffledOrder(FOUNDERS.length);
      pos = 0;
      render();
    });

    stage.addEventListener("keydown", function (ev) {
      var top = stage.querySelector('.fcard[data-depth="0"]');
      if (!top) return;
      if (ev.key === "ArrowRight") { flingOut(top, 1, function () { advance(true); }); }
      else if (ev.key === "ArrowLeft") { flingOut(top, -1, function () { advance(false); }); }
      else if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); top.classList.toggle("is-flipped"); }
    });

    render();
  });
})();
