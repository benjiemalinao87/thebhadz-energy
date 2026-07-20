# Lesson Learn

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
