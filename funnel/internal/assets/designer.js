/* SC-01 Panel designer.
   Model: full-cell electrical parameters (Voc, Isc, Vmp, Imp) + geometry + topology
   → module electricals, dimensions, mass, efficiency, cell map, IV/PV curves.
   Rendering: D3 into #panel-svg (module face) and #iv-svg (curves). */

(function () {
  "use strict";

  // ---------- Cell formats (mm, full-cell electrical defaults) ----------
  var FORMATS = {
    m10h: { label: "M10 half-cut · 182 × 91 mm", w: 182, h: 91,  half: true,
            elec: { voc: 0.725, isc: 13.90, vmp: 0.615, imp: 13.20 } },
    m10f: { label: "M10 full · 182 × 182 mm",    w: 182, h: 182, half: false,
            elec: { voc: 0.725, isc: 13.90, vmp: 0.615, imp: 13.20 } },
    g12h: { label: "G12 half-cut · 210 × 105 mm", w: 210, h: 105, half: true,
            elec: { voc: 0.730, isc: 18.40, vmp: 0.620, imp: 17.40 } },
    m6f:  { label: "M6 full · 166 × 166 mm",     w: 166, h: 166, half: false,
            elec: { voc: 0.690, isc: 11.45, vmp: 0.580, imp: 10.80 } },
    c125: { label: "125 mm full · 125 × 125 mm", w: 125, h: 125, half: false,
            elec: { voc: 0.640, isc: 5.60, vmp: 0.530, imp: 5.30 } }
  };

  var PRESETS = [
    { id: "perc405",  label: "405 W · 108HC PERC",   format: "m10h", cols: 6, rows: 18, topo: "twin",
      elec: { voc: 0.690, isc: 13.85, vmp: 0.578, imp: 13.00 } },
    { id: "topcon435", label: "435 W · 108HC TOPCon", format: "m10h", cols: 6, rows: 18, topo: "twin",
      elec: { voc: 0.725, isc: 13.90, vmp: 0.615, imp: 13.20 } },
    { id: "topcon580", label: "585 W · 144HC TOPCon", format: "m10h", cols: 6, rows: 24, topo: "twin",
      elec: { voc: 0.725, isc: 13.90, vmp: 0.615, imp: 13.20 } },
    { id: "trainer",  label: "100 W · 36-cell trainer", format: "c125", cols: 4, rows: 9, topo: "series",
      elec: { voc: 0.640, isc: 5.60, vmp: 0.530, imp: 5.30 } }
  ];

  // Fixed construction constants (mm / kg-basis)
  var GAP = 2;          // cell-to-cell gap
  var CENTER_GAP = 12;  // half-cut center bus strip
  var EDGE_X = 20;      // laminate edge margin, sides
  var EDGE_Y = 25;      // laminate edge margin, top/bottom
  var GLASS_KG_M2 = 8.0;    // 3.2 mm glass @ 2500 kg/m3
  var SHEETS_KG_M2 = 1.45;  // EVA x2 + backsheet + cells
  var FRAME_KG_M = 0.55;    // Al frame per meter of perimeter
  var JBOX_KG = 0.35;

  var state = {
    format: "m10h",
    cols: 6, rows: 18, topo: "twin", diodes: "auto",
    elec: { voc: 0.725, isc: 13.90, vmp: 0.615, imp: 13.20 },
    preset: "topcon435"
  };

  // ---------- Model ----------
  function compute(s) {
    var f = FORMATS[s.format];
    var n = s.cols * s.rows;
    var twin = s.topo === "twin";
    var np = twin ? 2 : 1;
    var ns = n / np;                       // cells in series per parallel branch
    var e = s.elec;
    var pFull = e.vmp * e.imp;             // full-cell Pmpp
    var cellP = f.half ? pFull / 2 : pFull;
    var cellIsc = f.half ? e.isc / 2 : e.isc;
    var cellImp = f.half ? e.imp / 2 : e.imp;

    var voc = ns * e.voc;
    var vmp = ns * e.vmp;
    var isc = np * cellIsc;
    var imp = np * cellImp;
    var pmax = n * cellP;

    var wmm = s.cols * f.w + (s.cols - 1) * GAP + 2 * EDGE_X;
    var hmm = s.rows * f.h + (s.rows - 1) * GAP + (twin ? CENTER_GAP : 0) + 2 * EDGE_Y;
    var area = (wmm / 1000) * (hmm / 1000);
    var eff = pmax / (area * 1000) * 100;
    var perim = 2 * (wmm + hmm) / 1000;
    var kg = area * (GLASS_KG_M2 + SHEETS_KG_M2) + perim * FRAME_KG_M + JBOX_KG;

    var nd = s.diodes === "auto" ? Math.max(1, Math.floor(s.cols / 2)) : +s.diodes;
    nd = Math.min(nd, s.cols);

    return { fmt: f, n: n, ns: ns, np: np, twin: twin,
             voc: voc, isc: isc, vmp: vmp, imp: imp, pmax: pmax,
             wmm: wmm, hmm: hmm, area: area, eff: eff, kg: kg, nd: nd };
  }

  // Empirical single-point IV model (King/PVWatts-style approximation):
  // I(V) = Isc [1 - C1 (exp(V / (C2·Voc)) - 1)]
  function ivCurve(m) {
    var c2 = (m.vmp / m.voc - 1) / Math.log(1 - m.imp / m.isc);
    var c1 = (1 - m.imp / m.isc) * Math.exp(-m.vmp / (c2 * m.voc));
    var pts = [];
    for (var i = 0; i <= 200; i++) {
      var v = m.voc * i / 200;
      var cur = m.isc * (1 - c1 * (Math.exp(v / (c2 * m.voc)) - 1));
      if (cur < 0) cur = 0;
      pts.push({ v: v, i: cur, p: v * cur });
    }
    return pts;
  }

  // ---------- Module face rendering ----------
  var CELL_FILL = "#1b3055", CELL_EDGE = "#8fa0b5", BUSBAR = "#c8d6e6";
  var STRING_COPPER = "#c67a3e", DIM = "#8fa0b5", FRAME_FILL = "#66768c";

  function renderPanel(s, m) {
    var svg = d3.select("#panel-svg");
    svg.selectAll("*").remove();

    var f = m.fmt;
    var PAD_L = 64, PAD_R = 126, PAD_T = 30, PAD_B = 58;
    var maxW = 640, maxH = 660;
    var k = Math.min(maxW / m.wmm, maxH / m.hmm);
    var W = m.wmm * k, H = m.hmm * k;
    svg.attr("viewBox", "0 0 " + (W + PAD_L + PAD_R) + " " + (H + PAD_T + PAD_B))
       .attr("width", W + PAD_L + PAD_R).attr("height", H + PAD_T + PAD_B);

    var g = svg.append("g").attr("transform", "translate(" + PAD_L + "," + PAD_T + ")");

    // frame + glass
    var frameT = 11 * k > 4 ? 11 * k : 4;
    g.append("rect").attr("x", -frameT).attr("y", -frameT)
      .attr("width", W + 2 * frameT).attr("height", H + 2 * frameT)
      .attr("fill", FRAME_FILL).attr("rx", 2);
    g.append("rect").attr("width", W).attr("height", H).attr("fill", "#0f1d33")
      .attr("stroke", "#3a4f75").attr("stroke-width", 1);

    var halfRows = s.rows / 2;
    function cellY(r) {
      var y = EDGE_Y + r * (f.h + GAP);
      if (m.twin && r >= halfRows) y += CENTER_GAP;
      return y * k;
    }
    function cellX(c) { return (EDGE_X + c * (f.w + GAP)) * k; }
    var cw = f.w * k, ch = f.h * k;

    // cells
    var cells = [];
    for (var r = 0; r < s.rows; r++)
      for (var c = 0; c < s.cols; c++) cells.push({ r: r, c: c });

    var cellG = g.append("g");
    cellG.selectAll("rect").data(cells).enter().append("rect")
      .attr("x", function (d) { return cellX(d.c); })
      .attr("y", function (d) { return cellY(d.r); })
      .attr("width", cw).attr("height", ch)
      .attr("fill", CELL_FILL).attr("stroke", CELL_EDGE).attr("stroke-width", 0.5);

    // busbar hints: 4 vertical lines per cell (only if cells are large enough)
    if (cw > 26) {
      var bb = g.append("g").attr("stroke", BUSBAR).attr("stroke-width", 0.6).attr("opacity", 0.75);
      cells.forEach(function (d) {
        for (var i = 1; i <= 4; i++) {
          var x = cellX(d.c) + cw * i / 5;
          bb.append("line").attr("x1", x).attr("x2", x)
            .attr("y1", cellY(d.r) + 1.5).attr("y2", cellY(d.r) + ch - 1.5);
        }
      });
    }

    // string wiring (serpentine per column pair), copper
    var wire = g.append("g").attr("fill", "none")
      .attr("stroke", STRING_COPPER).attr("stroke-width", 2).attr("opacity", 0.55)
      .attr("stroke-linecap", "round").attr("stroke-linejoin", "round");

    function serpentine(rowStart, rowEnd, topYpx, botYpx) {
      // one path per column pair within [rowStart, rowEnd)
      for (var p = 0; p < Math.floor(s.cols / 2); p++) {
        var xA = cellX(2 * p) + cw / 2, xB = cellX(2 * p + 1) + cw / 2;
        wire.append("path").attr("d",
          "M " + xA + " " + botYpx + " L " + xA + " " + topYpx +
          " L " + xB + " " + topYpx + " L " + xB + " " + botYpx);
      }
      if (s.cols % 2) { // odd column count: last column plain vertical
        var xL = cellX(s.cols - 1) + cw / 2;
        wire.append("path").attr("d", "M " + xL + " " + topYpx + " L " + xL + " " + botYpx);
      }
    }

    if (m.twin) {
      var topStrip = cellY(0) - 4, midTop = cellY(halfRows - 1) + ch + 3;
      var midBot = cellY(halfRows) - 3, botStrip = cellY(s.rows - 1) + ch + 4;
      serpentine(0, halfRows, topStrip, midTop);
      serpentine(halfRows, s.rows, midBot, botStrip);

      // center bus strip + split junction boxes with diode glyphs
      var busY = (midTop + midBot) / 2;
      g.append("line").attr("x1", 4).attr("x2", W - 4).attr("y1", busY).attr("y2", busY)
        .attr("stroke", STRING_COPPER).attr("stroke-width", 2.4).attr("opacity", 0.8);
      for (var d = 0; d < m.nd; d++) {
        var xj = W * (d + 0.5) / m.nd;
        var jb = g.append("g").attr("transform", "translate(" + xj + "," + busY + ")");
        jb.append("rect").attr("x", -13).attr("y", -8).attr("width", 26).attr("height", 16)
          .attr("fill", "#0c1322").attr("stroke", BUSBAR).attr("stroke-width", 1).attr("rx", 2);
        jb.append("path").attr("d", "M -5 -4 L 3 0 L -5 4 Z").attr("fill", "#e9a21b");
        jb.append("line").attr("x1", 3).attr("x2", 3).attr("y1", -4).attr("y2", 4)
          .attr("stroke", "#e9a21b").attr("stroke-width", 1.4);
      }
      g.append("text").attr("x", W + 8).attr("y", busY + 4)
        .attr("fill", DIM).attr("font-size", 10).attr("font-family", "ui-monospace, Menlo, monospace")
        .text(m.nd + "× J-BOX / DIODE");
    } else {
      var topY = cellY(0) - 4, botY = cellY(s.rows - 1) + ch + 4;
      serpentine(0, s.rows, topY, botY);
      // bottom inter-pair connectors
      for (var p2 = 0; p2 + 2 < s.cols; p2 += 2) {
        var xEnd = cellX(p2 + 1) + cw / 2, xNext = cellX(p2 + 2) + cw / 2;
        wire.append("path").attr("d", "M " + xEnd + " " + botY + " L " + xNext + " " + botY);
      }
      // single j-box, top edge
      var jx = W / 2;
      var jb2 = g.append("g").attr("transform", "translate(" + jx + "," + (topY - 6) + ")");
      jb2.append("rect").attr("x", -22).attr("y", -10).attr("width", 44).attr("height", 14)
        .attr("fill", "#0c1322").attr("stroke", BUSBAR).attr("stroke-width", 1).attr("rx", 2);
      jb2.append("text").attr("x", 0).attr("y", 1).attr("text-anchor", "middle")
        .attr("fill", "#e9a21b").attr("font-size", 8.5)
        .attr("font-family", "ui-monospace, Menlo, monospace")
        .text("J-BOX · " + m.nd + "D");
    }

    // bypass-diode column groups (dashed)
    var colsPerD = s.cols / m.nd;
    for (var q = 0; q < m.nd; q++) {
      var x0 = cellX(Math.round(q * colsPerD)) - 2.5;
      var lastCol = Math.round((q + 1) * colsPerD) - 1;
      var x1 = cellX(lastCol) + cw + 2.5;
      g.append("rect").attr("x", x0).attr("y", cellY(0) - 2.5)
        .attr("width", x1 - x0).attr("height", cellY(s.rows - 1) + ch - cellY(0) + 5)
        .attr("fill", "none").attr("stroke", "#e9a21b").attr("stroke-width", 0.9)
        .attr("stroke-dasharray", "5 4").attr("opacity", 0.55);
    }

    // dimension arrows
    var dims = g.append("g").attr("font-family", "ui-monospace, Menlo, monospace")
      .attr("font-size", 11).attr("fill", DIM);
    // width (bottom)
    var dyB = H + frameT + 22;
    dims.append("line").attr("x1", 0).attr("x2", W).attr("y1", dyB).attr("y2", dyB)
      .attr("stroke", DIM).attr("marker-start", "url(#arrL)").attr("marker-end", "url(#arrR)");
    dims.append("text").attr("x", W / 2).attr("y", dyB + 16).attr("text-anchor", "middle")
      .text(Math.round(m.wmm) + " mm");
    // height (left)
    var dxL = -frameT - 22;
    dims.append("line").attr("x1", dxL).attr("x2", dxL).attr("y1", 0).attr("y2", H)
      .attr("stroke", DIM).attr("marker-start", "url(#arrU)").attr("marker-end", "url(#arrD)");
    dims.append("text")
      .attr("transform", "translate(" + (dxL - 8) + "," + H / 2 + ") rotate(-90)")
      .attr("text-anchor", "middle").text(Math.round(m.hmm) + " mm");

    var defs = svg.append("defs");
    [["arrL", "M8 0 L0 3 L8 6", "auto"], ["arrR", "M0 0 L8 3 L0 6", "auto"],
     ["arrU", "M0 8 L3 0 L6 8", "auto"], ["arrD", "M0 0 L3 8 L6 0", "auto"]]
      .forEach(function (a) {
        defs.append("marker").attr("id", a[0]).attr("markerWidth", 9).attr("markerHeight", 7)
          .attr("refX", 4).attr("refY", 3).attr("orient", a[2])
          .append("path").attr("d", a[1]).attr("fill", "none")
          .attr("stroke", DIM).attr("stroke-width", 1);
      });
  }

  // ---------- IV / PV curves ----------
  function renderIV(m) {
    var svg = d3.select("#iv-svg");
    svg.selectAll("*").remove();

    var W = 640, H = 300, ML = 56, MR = 64, MT = 16, MB = 40;
    svg.attr("viewBox", "0 0 " + W + " " + H).attr("width", W).attr("height", H);

    var pts = ivCurve(m);
    var pmaxCurve = d3.max(pts, function (d) { return d.p; });

    var x = d3.scaleLinear().domain([0, m.voc * 1.06]).range([ML, W - MR]);
    var yI = d3.scaleLinear().domain([0, m.isc * 1.18]).range([H - MB, MT]);
    var yP = d3.scaleLinear().domain([0, pmaxCurve * 1.18]).range([H - MB, MT]);

    var mono = "ui-monospace, Menlo, monospace";

    // grid
    var grid = svg.append("g").attr("stroke", "#e4e9ee");
    x.ticks(8).forEach(function (t) {
      grid.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", MT).attr("y2", H - MB);
    });
    yI.ticks(5).forEach(function (t) {
      grid.append("line").attr("x1", ML).attr("x2", W - MR).attr("y1", yI(t)).attr("y2", yI(t));
    });

    // axes
    var ax = svg.append("g").attr("font-family", mono).attr("font-size", 10).attr("fill", "#5c6b7e");
    x.ticks(8).forEach(function (t) {
      ax.append("text").attr("x", x(t)).attr("y", H - MB + 16).attr("text-anchor", "middle").text(t);
    });
    yI.ticks(5).forEach(function (t) {
      ax.append("text").attr("x", ML - 8).attr("y", yI(t) + 3).attr("text-anchor", "end").text(t);
    });
    yP.ticks(5).forEach(function (t) {
      ax.append("text").attr("x", W - MR + 8).attr("y", yP(t) + 3).attr("text-anchor", "start").text(Math.round(t));
    });
    ax.append("text").attr("x", (ML + W - MR) / 2).attr("y", H - 6).attr("text-anchor", "middle").text("VOLTAGE (V)");
    ax.append("text").attr("transform", "translate(14," + (H / 2) + ") rotate(-90)")
      .attr("text-anchor", "middle").text("CURRENT (A)");
    ax.append("text").attr("transform", "translate(" + (W - 12) + "," + (H / 2) + ") rotate(90)")
      .attr("text-anchor", "middle").attr("fill", "#b8860b").text("POWER (W)");

    svg.append("rect").attr("x", ML).attr("y", MT).attr("width", W - ML - MR).attr("height", H - MT - MB)
      .attr("fill", "none").attr("stroke", "#c6cfd8");

    var lineI = d3.line().x(function (d) { return x(d.v); }).y(function (d) { return yI(d.i); });
    var lineP = d3.line().x(function (d) { return x(d.v); }).y(function (d) { return yP(d.p); });

    svg.append("path").attr("d", lineP(pts)).attr("fill", "none")
      .attr("stroke", "#e9a21b").attr("stroke-width", 1.6).attr("stroke-dasharray", "6 4");
    svg.append("path").attr("d", lineI(pts)).attr("fill", "none")
      .attr("stroke", "#14243d").attr("stroke-width", 2.2);

    // MPP marker
    var mpp = pts.reduce(function (a, b) { return b.p > a.p ? b : a; });
    svg.append("line").attr("x1", x(mpp.v)).attr("x2", x(mpp.v)).attr("y1", yI(mpp.i)).attr("y2", H - MB)
      .attr("stroke", "#a8622d").attr("stroke-dasharray", "2 3");
    svg.append("circle").attr("cx", x(mpp.v)).attr("cy", yI(mpp.i)).attr("r", 4.5)
      .attr("fill", "#a8622d").attr("stroke", "#fff").attr("stroke-width", 1.5);
    svg.append("text").attr("x", x(mpp.v) - 8).attr("y", yI(mpp.i) - 10)
      .attr("text-anchor", "end").attr("font-family", mono).attr("font-size", 11)
      .attr("font-weight", "600").attr("fill", "#a8622d")
      .text("MPP " + Math.round(mpp.p) + " W @ " + mpp.v.toFixed(1) + " V / " + mpp.i.toFixed(1) + " A");
  }

  // ---------- Readouts ----------
  function fmtNum(v, dp) { return v.toFixed(dp === undefined ? 1 : dp); }

  function renderReadout(s, m) {
    var items = [
      ["Pmax (STC)", Math.round(m.pmax) + " <small>W</small>", "power"],
      ["Voc", fmtNum(m.voc) + " <small>V</small>"],
      ["Isc", fmtNum(m.isc) + " <small>A</small>"],
      ["Vmp", fmtNum(m.vmp) + " <small>V</small>"],
      ["Imp", fmtNum(m.imp) + " <small>A</small>"],
      ["Dimensions", Math.round(m.wmm) + "×" + Math.round(m.hmm) + " <small>mm</small>"],
      ["Area", fmtNum(m.area, 2) + " <small>m²</small>"],
      ["Weight (est)", fmtNum(m.kg) + " <small>kg</small>"],
      ["Module eff.", fmtNum(m.eff) + " <small>%</small>"],
      ["Cells", m.n + " <small>(" + m.ns + "S × " + m.np + "P)</small>"]
    ];
    var html = items.map(function (it) {
      return '<div class="cell"><span class="k">' + it[0] + '</span><span class="v ' +
        (it[2] || "") + '">' + it[1] + "</span></div>";
    }).join("");
    document.getElementById("readout").innerHTML = html;
  }

  // ---------- Controls ----------
  function $(id) { return document.getElementById(id); }

  function syncControls(s) {
    $("ctl-format").value = s.format;
    $("ctl-cols").value = s.cols; $("ctl-cols-val").textContent = s.cols;
    $("ctl-rows").value = s.rows; $("ctl-rows-val").textContent = s.rows;
    $("ctl-topo").value = s.topo;
    $("ctl-diodes").value = s.diodes;
    $("ctl-voc").value = s.elec.voc; $("ctl-isc").value = s.elec.isc;
    $("ctl-vmp").value = s.elec.vmp; $("ctl-imp").value = s.elec.imp;
    document.querySelectorAll(".presets button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.preset === s.preset);
    });
  }

  function normalize(s) {
    // twin topology needs an even row count
    if (s.topo === "twin" && s.rows % 2) s.rows += 1;
    // electrical sanity for the IV model
    if (s.elec.vmp >= s.elec.voc) s.elec.vmp = s.elec.voc * 0.84;
    if (s.elec.imp >= s.elec.isc) s.elec.imp = s.elec.isc * 0.95;
  }

  function update(fromPreset) {
    if (!fromPreset) state.preset = "";
    normalize(state);
    syncControls(state);
    var m = compute(state);
    renderReadout(state, m);
    renderPanel(state, m);
    renderIV(m);
  }

  function applyPreset(p) {
    state.format = p.format; state.cols = p.cols; state.rows = p.rows;
    state.topo = p.topo; state.diodes = "auto";
    state.elec = { voc: p.elec.voc, isc: p.elec.isc, vmp: p.elec.vmp, imp: p.elec.imp };
    state.preset = p.id;
    update(true);
  }

  function init() {
    // preset buttons
    var pr = document.querySelector(".presets");
    PRESETS.forEach(function (p) {
      var b = document.createElement("button");
      b.textContent = p.label; b.dataset.preset = p.id;
      b.addEventListener("click", function () { applyPreset(p); });
      pr.appendChild(b);
    });

    // format select
    var fs = $("ctl-format");
    Object.keys(FORMATS).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = FORMATS[k].label;
      fs.appendChild(o);
    });

    fs.addEventListener("change", function () {
      state.format = fs.value;
      state.elec = Object.assign({}, FORMATS[fs.value].elec);
      state.topo = FORMATS[fs.value].half ? "twin" : "series";
      update();
    });
    $("ctl-cols").addEventListener("input", function () { state.cols = +this.value; update(); });
    $("ctl-rows").addEventListener("input", function () { state.rows = +this.value; update(); });
    $("ctl-topo").addEventListener("change", function () { state.topo = this.value; update(); });
    $("ctl-diodes").addEventListener("change", function () { state.diodes = this.value; update(); });
    ["voc", "isc", "vmp", "imp"].forEach(function (k) {
      $("ctl-" + k).addEventListener("change", function () {
        var v = parseFloat(this.value);
        if (isFinite(v) && v > 0) state.elec[k] = v;
        update();
      });
    });

    applyPreset(PRESETS[1]); // 435 W TOPCon default
  }

  document.addEventListener("DOMContentLoaded", init);
})();
