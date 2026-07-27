# Progress

## Funnel packages: hide list price (2026-07-27) — done
- Package cards no longer show FROM ₱99,500; show "Free estimate" + system meta
- CTA on each card: "Request free estimate" → `#quote`
- Calculator copy no longer prints fixed ₱99,500; still uses internal model for savings math
- Files: `funnel/index.html`, `funnel/assets/funnel.js`, `funnel/assets/funnel.css`

## Command Center sidebar auto-collapse (2026-07-27) — done
- Desktop icon rail (68px); hover/focus expands; pin keeps open
- `funnel/internal/assets/sidebar-collapse.js` + CSS in `operations-redesign.css`
- Pin preference: `localStorage` key `macc-cc-sidebar-pinned`
- Mobile drawer unchanged

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
