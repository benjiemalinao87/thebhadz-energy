#!/usr/bin/env python3
"""
Render the PH solar competitive-landscape workbook into a browsable Command Center page.

    python3 scripts/build-workbook.py
    python3 scripts/build-workbook.py --check   (exits 1 if the page is stale)

Reads  funnel/internal/downloads/ph-solar-competitive-landscape.xlsx
Writes funnel/internal/research-workbook.html

Same philosophy as scripts/build-pages.mjs: a pre-commit generation pass, not a runtime
build. The sheet data is inlined into the page as JSON, so the page stays self-contained
and works offline with no network and no CDN. Re-run this after replacing the .xlsx.

openpyxl is the one non-stdlib dependency (read-only, generation time only — nothing the
site itself ever loads):  pip3 install openpyxl
"""

import json
import re
import sys
from datetime import date, datetime
from html import escape
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required to regenerate the workbook page:  pip3 install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "funnel/internal/downloads/ph-solar-competitive-landscape.xlsx"
OUT = ROOT / "funnel/internal/research-workbook.html"
CHECK = "--check" in sys.argv

# Sheets whose rows are prose/notes rather than a record table — rendered as stacked
# lines instead of a grid, because a one-column "table" with a sentence per row reads
# worse than the sentences themselves.
PROSE_SHEETS = {"README"}

# Short human labels + one-line descriptions for the tab rail. Anything not listed falls
# back to the raw sheet name with underscores turned into spaces.
SHEET_META = {
    "README": ("Read me", "What this workbook is, how it was compiled, evidence status"),
    "FB_Pages": ("FB pages", "Competitor Facebook pages — reach, cadence, activity"),
    "FB_Post_Patterns": ("FB post patterns", "What competitors actually post, and what engages"),
    "FB_Sample_Posts": ("FB sample posts", "Verbatim competitor posts worth imitating"),
    "FB_Groups": ("FB groups", "Buy/sell and community groups where solar demand shows up"),
    "FB_Playbook_SolarCity": ("FB playbook", "Our own posting playbook drawn from the patterns"),
    "Companies": ("Companies", "Installer directory — coverage, scale, positioning"),
    "Packages_Pricing": ("Package pricing", "Published package prices by company and size"),
    "Market_Benchmarks": ("Benchmarks", "₱/W, system-size and market reference points"),
    "Real_Quotes_May2026": ("Real quotes", "Actual homeowner quotes collected May 2026"),
    "Components_Brands": ("Component brands", "Panel / inverter / battery brands in market"),
    "Biliran_Local": ("Biliran local", "The Biliran-specific competitor set"),
    "Sources": ("Sources", "Every URL and reference behind the numbers"),
    "DIY_Kit_Alternatives": ("DIY kits", "Shopee/Lazada kit alternative — our 4th competitor"),
    "Excluded_Unverified": ("Excluded", "Claims dropped for being unverifiable"),
    "Company_Directory_Extended": ("Directory (full)", "Extended company directory with contacts"),
    "Residential_Pricing_Extended": ("Residential pricing", "Extended residential price detail"),
    "Equipment_Pricing_Detailed": ("Equipment pricing", "Line-item equipment cost detail"),
    "Net_Metering_Payback": ("Net metering", "Net-metering and payback reference"),
    "Research_Notes_Flags_Extended": ("Notes & flags", "Researcher notes, caveats, confidence flags"),
}

URL_RE = re.compile(r"^https?://\S+$", re.I)


def cell_text(value):
    """openpyxl value -> display string. Keeps numbers readable, dates ISO."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, float):
        # Whole floats come back as 12.0 — show 12. Everything else keeps 4 dp max.
        if value == int(value):
            return str(int(value))
        return f"{value:.4f}".rstrip("0").rstrip(".")
    return str(value).strip()


def read_workbook():
    wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
    sheets = []
    for ws in wb.worksheets:
        rows = []
        for raw in ws.iter_rows(values_only=True):
            cells = [cell_text(v) for v in raw]
            while cells and cells[-1] == "":
                cells.pop()
            if any(c != "" for c in cells):
                rows.append(cells)
        if not rows:
            continue
        label, blurb = SHEET_META.get(ws.title, (ws.title.replace("_", " "), ""))
        prose = ws.title in PROSE_SHEETS
        sheets.append(
            {
                "name": ws.title,
                "label": label,
                "blurb": blurb,
                "prose": prose,
                "header": [] if prose else rows[0],
                "rows": rows if prose else rows[1:],
            }
        )
    wb.close()
    return sheets


PAGE = """<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SC-08a Competitor research workbook — BADJJ Energy Systems</title>
<script>
  // The Command Center shell is the UI for this page. A standalone load — refresh,
  // bookmark, pasted link — hits this real file with no shell around it, so bounce to
  // the dashboard, which reopens the page inside the SPA via ?open= (spa-router.js).
  // Inside the shell it re-runs after a swap, finds #cc-view, and does nothing.
  (function () {{
    if (document.getElementById('cc-view')) return;
    var m = /^\\/internal\\/([a-z0-9-]+)(?:\\.html)?$/i.exec(location.pathname);
    if (m && m[1].toLowerCase() !== 'index') location.replace('/internal/?open=' + m[1].toLowerCase());
  }})();
</script>
<script src="/internal/assets/theme.js"></script>
<link rel="stylesheet" href="/internal/assets/style.css">
<link rel="icon" href="/assets/img/badjj-favicon.png">
<link rel="stylesheet" href="/internal/assets/workspace-redesign.css">
<style>
  .wb-tabs {{ display: flex; flex-wrap: wrap; gap: 6px; margin: 18px 0 4px; }}
  .wb-tab {{ font: 600 11.5px/1 var(--mono, ui-monospace, "SF Mono", Menlo, monospace);
    letter-spacing: 0.04em; padding: 8px 11px; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--ws-line); background: var(--ws-surface); color: var(--ws-muted); }}
  .wb-tab:hover {{ color: var(--ws-ink); border-color: var(--ws-petrol); }}
  .wb-tab[aria-selected="true"] {{ background: var(--ws-petrol); border-color: var(--ws-petrol); color: #fff; }}
  .wb-tab[aria-selected="true"] .n {{ color: rgba(255,255,255,0.72); }}
  .wb-tab .n {{ color: var(--ws-muted); margin-left: 6px; font-weight: 400; }}

  .wb-controls {{ display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 16px 0 10px; }}
  .wb-search {{ flex: 1 1 260px; min-width: 0; padding: 9px 12px; border-radius: 8px;
    border: 1px solid var(--ws-line); background: var(--ws-surface); color: var(--ws-ink); font-size: 14px; }}
  .wb-search:focus {{ outline: 2px solid var(--ws-petrol); outline-offset: 1px; }}
  .wb-count {{ font: 12px/1.4 var(--mono, ui-monospace, Menlo, monospace); color: var(--ws-muted); }}
  .wb-blurb {{ margin: 2px 0 0; color: var(--ws-muted); font-size: 14px; }}

  .wb-scroll {{ overflow-x: auto; border: 1px solid var(--ws-line); border-radius: var(--ws-radius, 10px);
    background: var(--ws-surface); }}
  /* max-content + min-width lets each column take the width its content needs and the
     container scroll sideways. With width:100% a 13-column sheet crushes the prose
     columns to a few characters and every row grows to the height of its longest note. */
  table.wb {{ border-collapse: collapse; width: max-content; min-width: 100%;
    font-size: 13.5px; color: var(--ws-copy); }}
  table.wb th, table.wb td {{ padding: 8px 11px; text-align: left; vertical-align: top;
    border-bottom: 1px solid var(--ws-line); white-space: pre-wrap;
    max-width: 380px; min-width: 0; }}
  table.wb thead th {{ position: sticky; top: 0; z-index: 1; white-space: nowrap;
    font: 600 11px/1.3 var(--mono, ui-monospace, Menlo, monospace); letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--ws-muted); background: var(--ws-surface-2);
    border-bottom: 1px solid var(--ws-line); }}
  table.wb tbody tr:last-child td {{ border-bottom: 0; }}
  table.wb tbody tr:hover {{ background: var(--ws-surface-2); }}
  table.wb td:first-child {{ font-weight: 600; color: var(--ws-ink); }}
  table.wb .num {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
  .wb-empty {{ padding: 22px; color: var(--ws-muted); font-size: 14px; }}

  .wb-prose p {{ margin: 0 0 4px; color: var(--ws-copy); }}
  .wb-prose .h {{ margin-top: 16px; font: 600 11px/1.4 var(--mono, ui-monospace, Menlo, monospace);
    letter-spacing: 0.1em; text-transform: uppercase; color: var(--ws-muted); }}
  .wb-prose .cols {{ display: flex; gap: 14px; flex-wrap: wrap; }}
  .wb-prose .cols span:first-child {{ font-weight: 600; min-width: 220px; }}

  @media print {{ .wb-tabs, .wb-controls {{ display: none; }} }}
</style>

<div class="frame">
  <aside class="sidebar">
    <div class="brand">
      <a href="/internal/overview.html">
        <img class="logo-mark" src="/assets/img/badjj-logo.png" alt="BADJJ"><span class="brand-text"><span class="wordmark">BADJJ</span>
        <span class="sub">MODULE ENGINEERING FILE</span></span>
      </a>
    </div>
    <nav class="nav" aria-label="Document sections">
      <a href="/internal/overview.html"><span class="code">SC-00</span>Overview</a>
      <a href="/internal/competitors.html"><span class="code">SC-08</span>Biliran competitors</a>
      <a href="/internal/research-workbook.html"><span class="code">SC-08a</span>Research workbook</a>
      <a href="/internal/map.html"><span class="code">SC-09</span>Biliran map</a>
      <a href="/internal/ad-library.html"><span class="code">SC-11</span>Ad library</a>
    </nav>
    <div class="foot">
      REV A · {compiled}<br>
      MARKET: BILIRAN · BILECO<br>
      SITE: PHILIPPINES
      <div style="margin-top:12px;border-top:1px solid #26324a;padding-top:12px">
        <a href="/internal/" style="color:#8fa0b5;text-decoration:none">↩ Founder home</a><br>
        <a href="/api/founder-logout" style="color:#8fa0b5;text-decoration:none">Log out</a>
      </div>
    </div>
  </aside>

  <main class="content workspace-page workspace-competitors">
    <p class="doc-eyebrow">SC-08a · COMPETITOR RESEARCH WORKBOOK <span class="rev">· REV A · {compiled}</span></p>
    <h1>The research, not the spreadsheet</h1>
    <p class="lede">
      Every sheet behind <a href="/internal/competitors.html">SC-08 Biliran competitors</a>, rendered
      here so nobody has to download a file to check a number. {nsheets} sheets, {nrows} rows —
      company directory, published package pricing, real May 2026 quotes, equipment pricing,
      net-metering payback, and the Facebook page and post-pattern analysis.
    </p>

    <div class="callout warn">
      <span class="label">Evidence status</span>
      Everything here is <strong>web-sourced and HYPOTHESIS</strong> until a founder ground-truths it
      on the island. Prices move fast — treat each row as a lead to confirm, not a fact to quote to a
      customer. The <span class="mono">Sources</span> sheet carries the URL behind each claim, and
      <span class="mono">Excluded</span> lists what was dropped for being unverifiable.
    </div>

    <div class="wb-tabs" role="tablist" aria-label="Workbook sheets" id="wb-tabs"></div>

    <div class="wb-controls">
      <input class="wb-search" id="wb-search" type="search" placeholder="Filter rows in this sheet…"
             aria-label="Filter rows in the selected sheet" autocomplete="off">
      <span class="wb-count" id="wb-count"></span>
    </div>
    <p class="wb-blurb" id="wb-blurb"></p>

    <div id="wb-body"></div>

    <p style="margin-top:26px;font-size:13px;opacity:0.7">
      Source file: <a href="/internal/downloads/ph-solar-competitive-landscape.xlsx" download>ph-solar-competitive-landscape.xlsx</a>
      — this page is generated from it by <span class="mono">scripts/build-workbook.py</span>.
      Replace the .xlsx and re-run that script; do not hand-edit this page.
    </p>

<script type="application/json" id="wb-data">{data}</script>
<script>
(function () {{
  "use strict";
  var node = document.getElementById("wb-data");
  if (!node) return;
  var sheets = JSON.parse(node.textContent);
  var tabs = document.getElementById("wb-tabs");
  var body = document.getElementById("wb-body");
  var search = document.getElementById("wb-search");
  var count = document.getElementById("wb-count");
  var blurb = document.getElementById("wb-blurb");
  var active = 0;

  var NUM = /^[₱$]?\\s*-?[\\d,]+(\\.\\d+)?\\s*(%|kWh|kWp|W|kW|Wp)?$/i;
  var URL = /^https?:\\/\\//i;

  function el(tag, cls, text) {{
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }}

  function fillCell(td, text) {{
    if (URL.test(text)) {{
      var a = el("a", null, text.length > 60 ? text.slice(0, 57) + "…" : text);
      a.href = text;
      a.target = "_blank";
      a.rel = "noopener";
      td.appendChild(a);
    }} else {{
      td.textContent = text;
    }}
  }}

  function renderProse(sheet, needle) {{
    var wrap = el("div", "wb-prose");
    var shown = 0;
    sheet.rows.forEach(function (row) {{
      var joined = row.join(" ").trim();
      if (needle && joined.toLowerCase().indexOf(needle) === -1) return;
      shown++;
      if (row.length > 1) {{
        var line = el("p", "cols");
        row.forEach(function (c) {{ line.appendChild(el("span", null, c)); }});
        wrap.appendChild(line);
        return;
      }}
      // A short all-caps line is a section heading in these notes sheets.
      var isHeading = joined === joined.toUpperCase() && joined.length < 60 && /[A-Z]/.test(joined);
      wrap.appendChild(el("p", isHeading ? "h" : null, joined));
    }});
    return {{ node: wrap, shown: shown, total: sheet.rows.length }};
  }}

  function renderTable(sheet, needle) {{
    var scroll = el("div", "wb-scroll");
    var table = el("table", "wb");
    var thead = el("thead");
    var htr = el("tr");
    sheet.header.forEach(function (h) {{ htr.appendChild(el("th", null, h)); }});
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = el("tbody");
    var shown = 0;
    sheet.rows.forEach(function (row) {{
      if (needle && row.join(" ").toLowerCase().indexOf(needle) === -1) return;
      shown++;
      var tr = el("tr");
      for (var i = 0; i < sheet.header.length; i++) {{
        var text = row[i] == null ? "" : row[i];
        var td = el("td", NUM.test(text) && text !== "" ? "num" : null);
        fillCell(td, text);
        tr.appendChild(td);
      }}
      tbody.appendChild(tr);
    }});
    table.appendChild(tbody);
    scroll.appendChild(table);
    return {{ node: scroll, shown: shown, total: sheet.rows.length }};
  }}

  function render() {{
    var sheet = sheets[active];
    var needle = search.value.trim().toLowerCase();
    var out = sheet.prose ? renderProse(sheet, needle) : renderTable(sheet, needle);
    body.innerHTML = "";
    if (out.shown === 0) {{
      body.appendChild(el("div", "wb-empty", 'No rows in "' + sheet.label + '" match "' + search.value + '".'));
    }} else {{
      body.appendChild(out.node);
    }}
    count.textContent = needle
      ? out.shown + " of " + out.total + " rows"
      : out.total + (out.total === 1 ? " row" : " rows");
    blurb.textContent = sheet.blurb;
    Array.prototype.forEach.call(tabs.children, function (btn, i) {{
      btn.setAttribute("aria-selected", i === active ? "true" : "false");
    }});
  }}

  sheets.forEach(function (sheet, i) {{
    var btn = el("button", "wb-tab");
    btn.type = "button";
    btn.setAttribute("role", "tab");
    btn.title = sheet.name;
    btn.appendChild(el("span", null, sheet.label));
    btn.appendChild(el("span", "n", sheet.rows.length));
    btn.addEventListener("click", function () {{
      active = i;
      try {{ history.replaceState(null, "", "#" + sheet.name); }} catch (e) {{}}
      render();
    }});
    tabs.appendChild(btn);
  }});

  // Deep link: /internal/research-workbook#Packages_Pricing opens that sheet.
  var hash = decodeURIComponent((location.hash || "").slice(1));
  for (var i = 0; i < sheets.length; i++) {{
    if (sheets[i].name.toLowerCase() === hash.toLowerCase()) active = i;
  }}

  search.addEventListener("input", render);
  render();
}})();
</script>
  </main>
</div>
"""


def main():
    if not XLSX.exists():
        sys.exit(f"missing workbook: {XLSX.relative_to(ROOT)}")

    sheets = read_workbook()
    nrows = sum(len(s["rows"]) for s in sheets)
    compiled = date.fromtimestamp(XLSX.stat().st_mtime).isoformat()

    data = json.dumps(sheets, ensure_ascii=False, separators=(",", ":"))
    # </script> inside JSON would close the tag early; < keeps it inert and valid JSON.
    data = data.replace("<", "\\u003c")

    html = PAGE.format(
        data=data,
        compiled=compiled,
        nsheets=len(sheets),
        nrows=f"{nrows:,}",
    )

    current = OUT.read_text(encoding="utf-8") if OUT.exists() else None
    if current == html:
        print(f"up to date: {OUT.relative_to(ROOT)}")
        return
    if CHECK:
        print(f"OUT OF DATE: {OUT.relative_to(ROOT)} — run: python3 scripts/build-workbook.py")
        sys.exit(1)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} — {len(sheets)} sheets, {nrows} rows")


if __name__ == "__main__":
    main()
