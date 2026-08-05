# Progress

## Goals: new Command Center section (2026-08-05) — done
- Sidebar **Goals** + `/internal/goals.html` + `/api/goals` (D1 `goals`, auto-migrate)
- Countable metrics: new leads, sold, deposits, surveys, manual — live progress for non-manual
- Board + Timeline views; owner from session; assignee picker; urgency colors; delete
- Dashboard “Goals on track” KPI + Goals panel; Next actions pulls at-risk goals
- Removed Company tasks tab from Jobs
- Local: `cd funnel && npx wrangler pages dev . --port 8000` → hard-refresh → Goals in rail

## Jobs: delete company tasks from Company tab (2026-08-05) — done
- Company tasks board was read-only mini-cards; `/api/projects` DELETE already existed
- Added ✕ on each card → confirm → DELETE → reload company list
- Local: hard-refresh Jobs → Company tasks; delete a test card

## Quote: remove Compliance checklist from customer copy + PDF (2026-08-04) — done
- Dropped the printed checklist block from Quote Builder customer sheet and `_quote-pdf.js`
- `/api/quote` no longer requires `checklist` in the payload; covering email wording updated
- Jobs / Install Ops still enforce permit · electrician · net-metering before deposit
- Local: hard-refresh Quote Builder; Print / Email quote to confirm the block is gone

## Contacts: Create lead button + POST /api/leads (2026-08-04) — done
- `+ Create lead` beside search opens a modal (name + mobile required)
- Founder-entered contacts land as New Lead with `source: manual`
- Local: hard-refresh Contacts after Wrangler is up

## Contacts: edit fields + attach files to a lead (2026-08-04) — done
- Contact drawer: editable name/phone/email/package/address/goal/bill/financing + Save contact
- Files section uploads via `/api/document-file` → `/api/documents` with `lead_id` (category legal)
- `documents.lead_id` column; Documents APIs shared with Contacts section visibility
- Local: hard-refresh Contacts; open a lead → edit + upload a PDF

## Jobs: delete from Overview drawer (2026-08-04) — done
- Wired existing `/api/jobs` DELETE into the job drawer Overview danger zone
- Confirm → delete (checklist + stage history + unpaid rows); refused once a payment is received
- Paid jobs get Cancel instead (`stage: cancelled`); cancelled jobs stay off the board columns
- Local: hard-refresh Jobs (`/internal/projects`) after Wrangler is up

## Ops create forms → modals (2026-08-04) — done
- Finance Ledger: Add/Edit transaction opens `#fin-dialog` (list + filter stay default view)
- Install Ops: Create project, Add cost, Add payment, Add installer, Create assignment each open a native `<dialog>`
- Shared chrome in `ops-tools.css` (`.ops-dialog`); dialogs live inside `<main>` so SPA swap keeps them
- Local: hard-refresh Finance / Install Ops after Wrangler is up

## Fix: password change false "session expired" (2026-08-03) — done
- Wrong current password on `/api/session` was HTTP 401; Team UI treated every 401 as logout
- Now returns 403 + shows "Current password is incorrect"; only real auth failures bounce to login
- Also: don't wipe the current session if `currentSessionId` is missing after a successful change
- Needs deploy to `founders.macc-inc.com` before Benjie can retry the temporary-password replace

## Ops tools: drop marketing page-heads (2026-08-03) — done
- Jobs: removed `ops-page-head jb-head` + unused mission/head CSS
- Same cleanup on Contacts, Documents, Notes, Meetings (kept action-items toggle)
- Also stripped eyebrow/h1/lede from Finance, Install Ops, Quote Builder, Next Actions, Team, Captures, Founder Lab
- Engineering doc pages unchanged

## Jobs page: drop ops page-head (2026-08-03) — done
- Removed `ops-page-head jb-head` (SC-07 eyebrow, lede, mission gate chip) from `funnel/internal/projects.html`
- Trimmed unused `.jb-head*` / `.jb-mission*` / `.jb-eyebrow` CSS; KPI strip now starts with `margin: 0`

## Command Center premium polish pass (2026-08-03) — done
- Navy icon rail + blue active state (overrides petrol via `hub-home.css`)
- Cool grey canvas, glass topbar, white mark plate, tighter type/card craft
- Card CTAs aligned to Pabbly pattern (Open / View …)

## Command Center Pabbly-style hub home (2026-08-03) — done
- Primary sidebar rail: Leads, Jobs (install-ops), Documents, Mailbox, Finance with premium stroke icons + live badges
- Secondary nav collapsed into disclosures (More tools / Strategy / Field / System)
- Home view replaced with light app-launcher cards (`hub-home.css`); sticky topbar outside `#cc-view`
- SPA: `cc-hub-home` toggled on dashboard; `install-ops` in operation slugs; greeting survives re-inject
- Local preview: `cd funnel && npx wrangler pages dev . --port 8000` → sign in → `/internal/`

## Quote builder bug sweep (2026-08-03) — done
- `/api/quote-settings` PUT merged from `DEFAULT_CONFIG`, so a partial save wiped every other setting; now merges over the saved row
- Covering email told the customer the PDF was a "complete bill of materials" — it hasn't been since the split; reworded in both HTML and plain-text bodies
- VAT checkbox hardcoded "Add 12% VAT" while the rate is editable; now written from the config and agrees with the sheet's VAT line
- Profit tile rounded to whole percent while the flag rail showed one decimal — same number reading 16% and 15.6% at once
- Delivery-cost field now shows its computed default as a placeholder, like the fee field
- Verified not bugs: payload is complete when sent from the internal view (`innerText` falls back to `textContent` when hidden); `wrap()` cannot loop on a long word; the endpoint renders label-only and detail-only scope rows inside workerd

## Quote builder: packages are editable too (2026-08-02) — done
- LIWANAG / ILAW / SANDIGAN moved out of code into `quote_settings.packages`; add, rename, remove from "Packages & pricing"
- Each package carries name, dropdown hint, coverage %, grid-tied and needs-battery — the last two drive net-metering copy, the storage picker and the inverter list
- Inverters now tagged `hybrid` (new `price_items` column, toggled in the price list) and matched against the package's needs-battery, replacing hard-coded package-name lists
- Fixed a crash the old design guaranteed: a new package matched no inverter, so `syncInverterOptions` read `options[0].id` off an empty array
- Closed an honesty gap: the no-battery disclosure now keys off the absence of a battery, not off `gridTied`, so an off-grid package with no storage says so (and stops disagreeing with `/api/quote`, which already 422'd without it)
- Legacy configs holding `coverageLiwanag/Ilaw/Sandigan` migrate onto the package rows rather than reverting

## Quote builder: customer copy vs internal cost sheet (2026-08-02) — done
- SC-16 now renders two sheets from one model; view tabs above the preview, both always in the DOM
- Customer copy = scope + one fixed price (no unit prices, no VAT/fee build-up); internal = the itemised BOM plus cost, profit and take-home
- `/api/quote` receives `scope[]` instead of `rows[]` — the build-up never reaches the endpoint, so it cannot be emailed
- Customer copy panel: per-line switch, editable heading and detail, ↺ revert; untouched fields follow the model, edited fields print literally including blank
- Price ladder + sizing assumptions + fee formulas moved out of code into `quote_settings` (`/api/quote-settings`, "Packages & pricing" dialog, any founder can edit, audited)
- Fixed: `.qb-dialog-wide` never won the cascade (all wide dialogs rendered at 420px); `.workspace-page h2` leaked a section border into every dialog title
- SOP: `docs/sop-quote-builder.md`

## Client quote companion (2026-08-02) — done
- Homeowner-facing MD to attach with quotes: `docs/client-quote-companion.md`
- Covers packages, savings, PH/Biliran incentives (honest: net metering, no local cash rebate), brownout honesty (LIWANAG), permits/BILECO, next steps, FAQs

## Next Actions dark-mode alert contrast (2026-08-02) — done
- `.ops-alert` no longer light-on-cream in dark theme
- `ops-tools.css`: pinned dark ink on light washes + dark fallback
- `workspace-redesign.css`: alert bg/text from `--ws-*-soft` tokens (both themes)
- Verified: dark alert = `#352b0d` ground + light copy

## FB-ad solar calculator landing (2026-07-30) — local, not pushed
- Standalone phone-first page: `funnel/v2/calc.html` + `calc-ad.css` / `calc-ad.js`
- Lime/teal layout from reference; Biliran/BILECO copy; no fake testimonials/certs
- Same savings math as v2; leads post to existing API with `source=fb-calc-ad` + UTMs
- Preview: `http://127.0.0.1:8766/calc.html`

## Funnel v2 Solar Matrix-style hero (2026-07-30) — hybrid (local review, not pushed)
- Hybrid: sky chrome + conversion spine (calc CTA, phone, real rooftop hub)
- Primary CTA → `#calc`; secondary → `#quote`; phone restored in header
- Hub uses `hero.jpg` (PH home), not wind turbine
- Files: `funnel/v2/index.html`, `funnel/v2/assets/funnel-v2.css`, generated card/sky assets

## Funnel packages: hide list price (2026-07-27) — done
- Package cards no longer show FROM ₱99,500; show "Free estimate" + system meta
- CTA on each card: "Request free estimate" → `#quote`
- Calculator copy no longer prints fixed ₱99,500; still uses internal model for savings math
- Files: `funnel/index.html`, `funnel/assets/funnel.js`, `funnel/assets/funnel.css`

## Command Center sidebar auto-collapse (2026-07-27) — superseded 2026-08-04
- Was: desktop icon rail (68px); hover/focus expands; pin keeps open, remembered in
  `localStorage` under `macc-cc-sidebar-pinned`
- Now: a permanent 82px rail with the full tool list, no hover-expand and no pin —
  see "Command Center rail: the full tool list, permanently narrow" below

## Command Center rail: the full tool list, permanently narrow (2026-08-04) — done
- The rail had been cut to two entries (Apps, Log) with tool navigation living on
  `/internal/apps.html`. Every destination is back in the rail, in work order:
  Dashboard, Leads, Mail, Quotes, Jobs, Install ops, Finance, Documents, Meetings,
  Captures — then a "Strategy" group (Actions, Notes, Lab, Market, Eng file, Legal,
  All apps), and Log / Team in the footer above theme + log out
- Fixed 82px wide on desktop: icon over a short label, no hover-expand, no pin, no width
  transition. Full names are `title` attributes; the mobile drawer keeps the wide form
- Markup: `funnel/internal/index.html`. Rail CSS: `funnel/internal/assets/shell.css`
  (the hover/pin block in `operations-redesign.css` and `sidebar-collapse.js` are gone)
- Every entry carries `data-section`, so `section-visibility.js` drops the ones an
  account may not open — the rail lists sections again, so it has to be filtered

## Solar monitor mock canvases (2026-07-27) — done
- Interactive Cursor canvas with 4 mock client/ops monitoring styles: Basic, Advanced, Creative, Jarvis
- Path: `~/.cursor/projects/Users-benjiemalinao-Codebases-solar-city/canvases/solar-monitor-mocks.canvas.tsx`
- Mock sites (Reyes LIWANAG / Santos SANDIGAN / Cruz ILAW); production, loads, maintenance, alerts
- Stage One pick noted in canvas: Basic (customer) + Advanced (founder fleet); Creative for demos; Jarvis after real deposits

## Solar monitor visual mocks — Cloudflare style (2026-07-27) — done
- Four PNG UI mocks inspired by CF analytics (KPI sparklines, maps, ranked bars, donuts, HUD)
- `outputs/solar-monitor-basic-cf.png` — homeowner site view
- `outputs/solar-monitor-advanced-cf.png` — fleet + map + site table
- `outputs/solar-monitor-creative-cf.png` — energy-orbit / load story
- `outputs/solar-monitor-jarvis-cf.png` — plant ops HUD + event stream

## Advanced fleet monitor live page (2026-07-27) — done
- New self-contained dir `monitor/` (not in content/ generator)
- Advanced CF-style fleet UI: KPIs + sparklines, PH pin map, sites table, prod vs load chart, top bars, status donut, site detail
- Mock sites in `monitor/js/data.js` (5 installs incl. watch + offline)
- Open: `open monitor/index.html` or `cd monitor && python3 -m http.server 8765`

## Meeting log — Jul 19 entry (2026-07-21) — done
- Added Meeting #4 (2026-07-19): lean HQ, Aug registration kickoff, three-tier approvals
- Digested office/runway/attorney/AOI-governance actions; pesos marked as discussed-not-locked

## Meeting log — Jul 12 entry (2026-07-21) — done
- Added Meeting #2 (2026-07-12): cap table, name placeholder MEC, vesting/cliff, product demo
- Renumbered Jul 13 → Meeting #3; refreshed open action-items digest
- Marked transcript as reconstructed / numbers as discussed-not-final; product work labeled HYPOTHESIS

## Meeting log recording UX (2026-07-21) — done
- Sticky top upload dock with meeting selector, drag-and-drop, and primary CTA
- Recordings panel moved under each meeting header
- Upload control restyled as a solid button (no longer a faint dashed link)
- Rail badges for recording counts
- Logic extracted to `funnel/internal/assets/meetings.js`
- Light-theme overrides added in `operations-redesign.css`

## PH solar competitive landscape Excel (2026-07-22) — done
- Deep web research: national installers, Visayas players, component brands, market ₱/kW bands
- Workbook: `outputs/ph-solar-competitive-landscape.xlsx` (8 sheets: Companies, Packages, Benchmarks, Quotes, Components, Biliran_Local, Sources, README)
- Status labeled WEB-SOURCED / HYPOTHESIS pending founder ground-truth (esp. RK Energy Naval quote)

## Facebook enrichment of competitor Excel (2026-07-22) — done
- Added FB_Pages, FB_Post_Patterns, FB_Sample_Posts, FB_Groups, FB_Playbook_SolarCity to `outputs/ph-solar-competitive-landscape.xlsx`
- Follower snapshot: GoSolar 521K, Solaric 338K, PHILERGY 134K, SolarNRG 117K, Buskowitz 16K
