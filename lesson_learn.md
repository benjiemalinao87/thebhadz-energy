# Lesson Learn

## Moving a number into the database leaves its label behind in the markup

**Fixed:** 2026-08-03

**What went wrong:** After the VAT rate, coverage and referral fee became editable settings, the UI still asserted the old values in hard-coded copy — the checkbox read "Add 12% VAT on materials" while the sheet printed "VAT 8%". A control that names a number it no longer controls is worse than one that names none.

**Also:** `/api/quote-settings` PUT built its new config from `DEFAULT_CONFIG` rather than from the currently saved row, so any partial save silently reset every other setting — a founder saving a margin floor would have reverted a renamed package and the whole ladder. Merge over the CURRENT value, never over the defaults.

**And:** the covering email still told the customer the attachment was a "complete bill of materials" a day after the customer copy stopped being one.

**Do not:** treat "make it configurable" as done when the storage and the form work. Grep the surrounding copy for the old value, and check every downstream document that describes the thing.

## Editable defaults: "blank means auto" is two intentions, not one

**Fixed:** 2026-08-02

**What went wrong:** The customer-copy editor treated an empty field as "use the automatic text". A founder renamed a scope line and cleared its detail, and the tool printed the *old* line's sentence under the new heading — it could not tell "I haven't filled this in" from "I want this blank".

**What worked:** Track whether a field has ever been *edited*, not whether it is empty. Untouched fields follow the model and show it as a placeholder; edited fields print literally, including blank. Add a per-row revert so there is a way back, and mark edited rows visually.

**Do not:** Infer intent from emptiness in any field that has a computed default. And when a field can be deliberately blank, check the whole path — the row was also being silently dropped by three separate `label && detail` filters.

**Also:** Numbers that are still being negotiated do not belong in code. The price ladder moved to `quote_settings` the same day, for the same reason.

## Client quote companion: incentives without overclaim

**Fixed:** 2026-08-02

**What worked:** Attach a short homeowner MD with the quote covering (1) package vs brownout honesty, (2) self-use vs export-credit savings, (3) national RA 9513 net metering via BILECO, (4) explicit “no Biliran cash rebate.” Keep FIT/ITH/developer perks out of the homeowner promise list.

**Do not:** Promise government refunds, cash from the co-op, or LIWANAG brownout backup. Do not cite unverified competitor prices or install counts in client collateral.

## FB-ad calculator page: layout yes, fabricated proof no

**Fixed:** 2026-07-30

**What worked:** Clone the lime/teal split + phone-first stack (calc panel with roof photo first on mobile), but replace "Robin saved $100k" / Trustpilot / NABCEP with honest Biliran trust chips and live BILECO estimate math. Tag leads `fb-calc-ad` + UTM query params. Keep LIWANAG brownout disclaimer on the page.

**Do not:** Ship fabricated named savings or cert seals on an ad landing. Do not boost FB traffic until lead delivery + UTMs are verified end-to-end (§4).

## Funnel v2 hero: model reference without fabricating proof

**Fixed:** 2026-07-30

**What worked:** Match the Solar Matrix layout (sky backdrop, two-column copy/visual, floating cards on dashed spokes, yellow pill CTAs, white trust strip) while swapping fake "12k+ Reviews" / SaaS partner logos for honest MACC signals (on-island Biliran chip + real table-stakes trust items). Keep headline on bill savings — not brownout backup — so LIWANAG §1.6 stays clean.

**Do not:** Copy fabricated review counts, avatar stacks, or unrelated brand logos from a mockup into a live funnel. Do not lead the hero with brownout/backup language that applies only to ILAW/SANDIGAN. Do not drop the calculator CTA or phone number when restyling — those are conversion spine, not chrome.

## Funnel packages: price behind free estimate

**Fixed:** 2026-07-27

**What worked:** Replace the `price-row` list price with estimate-led copy ("Custom-priced for your home" / "Free estimate") and point each card CTA at `#quote` with "Request free estimate". Keep package meta (`Installed · …`) so cards still differentiate. Soften calculator result copy the same way so the landing page does not re-leak the list price.

**Do not:** Leave "Fixed ₱99,500" in `funnel.js` calculator output when cards hide price — visitors hit both. Internal Mission / quote-builder can still use ₱99,500; public package cards should not contradict the estimate-first CTA.

## Command Center: sidebar auto-collapse as icon rail

**Fixed:** 2026-07-27

**What worked:** Drive collapse with a body class (`cc-sb-collapsed`) + pure CSS `:hover` / `:focus-within` for expand, and a small pin script for persistence. Hide bare text labels with `font-size: 0` on `.cc-sb-item` so existing markup (icon + text node + `.tail`) needs no label wrappers. Keep mobile drawer separate via `matchMedia('(min-width: 981px)')`.

**Do not:** Animate collapse on mobile (conflicts with the off-canvas drawer), or put the pin over the logo in the 68px rail — hide the pin until the rail is expanded.

## Fleet monitor: keep Advanced UI in its own directory

**Done:** 2026-07-27

**What worked:** Ship the Advanced fleet visualization as a self-contained `monitor/` tree (HTML/CSS/JS + mock `data.js`) instead of folding into `content/` + `build-pages.mjs` or the Command Center SPA. Offline `file://` works; no CDN.

**Do not:** Hand-edit generated SC pages for a product experiment that still uses mock telemetry — isolate until real inverter data and auth wiring exist.

## Cursor canvas: Pill tabs may not switch views

**Fixed:** 2026-07-27

**Problem:** User could only see the Basic mock; Pill tab clicks did not change the focused variant (and wrapping `Pill` in `<span>` for `key` typing made the control less reliable).

**Fix:** Drive focus with `Button` + `Select` (`useCanvasState`), and also list all four mocks under `CollapsibleSection` so each style is reachable by expand even if focus controls fail.

**Do not:** Rely on `Pill` alone as the only way to switch exclusive canvas views.

## Cursor canvas: Pill `key` typing

**Fixed:** 2026-07-27

**Problem:** Canvas TypeScript check failed with `Property 'key' does not exist on type 'PillProps'` when mapping `<Pill key={…}>`.

**Fix:** Put `key` on a wrapping `<span>` (or other host element); keep `active` / `onClick` on `Pill`.

**Do not:** Assume every `cursor/canvas` primitive accepts React's `key` in its published props type — wrap when the checker complains.

## Meeting log: auto-collapse open actions column

**Fixed:** 2026-07-22

**Problem:** The right "Open action items" column ate ~320px on desktop and cramped the upload dock / meeting detail center column.

**Fix:** Collapse the actions panel by default on wide viewports (`actions-collapsed` on `.layout`). Show an **Open action items (N)** button under the page head; panel expands with a **✕** close control. Preference persists in `localStorage` (`macc-meetings-actions-open`). Below 1180px the panel stays in the stacked layout (full width under content) with collapse controls hidden.

**Do not:** Keep a permanent third column on desktop when the primary job is reading meetings and uploading recordings — gate secondary panels behind an explicit expand.

## Meeting log upload dock: status text overflow

**Fixed:** 2026-07-22

**Problem:** "4 recordings stored." spilled past the orange-bordered upload dock and overlapped the Open action items column.

**Root cause:** `.rec-dock-row` was a 5-column grid (`… auto auto`) with `.rec-dock-status { white-space: nowrap }`. The status sized to its full text width and the grid could not shrink below content, so it overflowed the dock (no `min-width: 0` / `overflow` containment).

**Fix:** Drop the status from the control row — use 4 columns (`auto minmax(0,…) minmax(0,…) auto`) and `grid-column: 1 / -1` so status wraps on a full-width line under the controls. Add `min-width: 0` + `overflow: hidden` on the dock.

**Do not:** Put nowrap status text as a fifth `auto` grid column beside Upload when the center column shares space with a side panel.

## Meeting log upload dock: dark mode contrast

**Fixed:** 2026-07-21

**Problem:** In dark mode, the upload dock showed a light cream card but text used `--ops-ink` (light in dark theme) — title, description, and "MEETING" label were nearly invisible.

**Root cause:** `operations-redesign.css` applied light-theme `.rec-dock` styles unconditionally; dark mode flipped text tokens to light without changing the card background.

**Fix:** Scope light rec-dock/rec-panel rules to `html:not([data-theme="dark"])` and add explicit `html[data-theme="dark"] .ops-meetings .rec-dock` overrides with dark surfaces + light text.

**Do not:** Set text colors from theme tokens on a container whose background is hardcoded to a fixed light color.

## Meeting log: recording upload was nearly invisible

**Fixed:** 2026-07-21

**Problem:** On `/internal/meetings.html`, the upload control was a faint dashed label appended at the *bottom* of long meeting notes. Founders had to scroll past the digest + full minutes to find it.

**Root cause:** JS mounted the Recordings block with `article.appendChild(...)` after all content, and `.rec-add` used low-contrast dashed styling that blended into the page.

**Fix:**
1. Add a sticky top `rec-dock` (meeting select + drop zone + solid CTA) as the primary entry point.
2. Mount each meeting’s recordings panel *right under* `.mh` (header), not at the bottom.
3. Style upload as a solid amber/orange button; show rail badges for recording counts.
4. Keep upload logic in `funnel/internal/assets/meetings.js` so SPA re-injection stays clean.

**Do not:** Hide primary actions (upload, record, submit) as dashed secondary links at the end of long documents. Put the job the page exists for at the top.

## Local funnel dev: login 405 on POST /api/founder-login

**Fixed:** 2026-07-19

**Problem:** `npx wrangler pages dev funnel` run from the **repo root** logs `No Functions. Shimming...` and POST `/api/founder-login` returns **405 Method Not Allowed**. Static pages (e.g. `/login`) still load.

**Root cause:** Wrangler must run with `funnel/` as the working directory so it picks up `wrangler.toml`, `functions/`, and `.dev.vars`. Running `pages dev funnel` from the repo root only serves static files.

**Fix:**
```bash
cd funnel && npx wrangler pages dev . --port 8000
```

Also create `funnel/.dev.vars` (gitignored) with:
```
FOUNDER_PASSWORD=solarcity2026
AUTH_SECRET=<any-random-string-for-local>
```

**Do not:** Use `python3 -m http.server` from repo root for funnel work — wrong web root and no Functions.

**Do not:** Run `wrangler pages dev funnel` from repo root — Functions won't compile (look for `✨ Compiled Worker successfully`, not `No Functions. Shimming...`).

## Meeting log 3-column redesign

**Fixed:** 2026-07-21

**Problem:** Upload bar, open-action digest, and all meeting notes stacked vertically — action items buried below upload; hard to scan overdue items or switch meetings.

**Fix:**
1. Layout: meetings rail | center (stats + compact upload + one active meeting) | sticky open-actions panel.
2. Rail: filter chips (All / Has recording) + recording badges + red dot when meeting has open per-meeting actions.
3. Right panel: All / Mine / Overdue tabs, owner groups, clickable checkboxes persisted in `localStorage` (`macc-meetings-done`).
4. `meetings.js`: cache action rows before grouping (re-render destroys DOM if you re-query `:scope > .ai` after first group pass).

**Do not:** Regroup action items by querying only direct children after moving nodes into `.owner-group` — keep a cached `actionRows[]` array and rebuild the panel from it.

## PH solar competitive research → Excel

**Done:** 2026-07-22

**What worked:** Combine (1) company primary pages for named packages, (2) pinas.solar / r/SolarPH quote datasets for real street prices, (3) Visayas city pages for Biliran-relevant hybrids, and (4) non-solar alternatives. Output a multi-sheet workbook (`outputs/ph-solar-competitive-landscape.xlsx`) with README caveats + Sources sheet.

**Do not:** Treat installer marketing "#1" / install-count claims or stale promo prices (e.g. Buskowitz 2024 Dragon) as EVIDENCED. Do not put Solar City into the same 3–10 kWp custom pond — our pond is fixed ₱80–100k packages. Never imply LIWANAG has brownout backup when comparing to hybrid competitors.

## Enrich competitor Excel with Facebook page/post research

**Done:** 2026-07-22

**What worked:** Scrape public FB page intros for follower counts (no login), sample post hooks from indexed URLs, then add dedicated sheets (`FB_Pages`, `FB_Post_Patterns`, `FB_Sample_Posts`, `FB_Groups`, `FB_Playbook_SolarCity`) rather than cramming into Companies. Separated "copy mechanics" from "copy claims" so brownout-hybrid stories stay off LIWANAG.

**Do not:** Treat follower counts or video views as traction evidence (Mom Test). Do not boost until Biliran FB group slice list + funnel instrumentation are done. Login walls block some pages — mark PARTIAL and move on.

## Command Center dark mode: `.ops-alert` light-on-light

**Fixed:** 2026-08-02

**Problem:** Next Actions (and any page using `.ops-alert` from `ops-tools.css`) kept a hardcoded cream background (`#fff8e6`) while dark theme flipped text to near-white via `--ws-copy` / inherited ink — unreadable.

**What worked:**
1. Pin dark ink on the light washes in `ops-tools.css`, plus a dark-theme background/text pair as a global fallback.
2. On workspace pages, drive `.ops-alert` (and `.good` / `.danger`) from `--ws-*-soft` tokens so both themes stay coherent; add an `html[data-theme="dark"] .workspace-page .ops-alert` rule so it out-specifies the ops-tools fallback.

**Do not:** Restyle only the text color for dark mode and leave a hardcoded light wash, or set workspace text to `--ws-copy` without also theming the alert background. Finance/Team already had page-scoped fixes — don't re-break those by removing their overrides without checking specificity.
