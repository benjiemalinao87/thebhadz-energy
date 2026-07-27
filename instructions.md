# Instructions — Command Center sidebar auto-collapse

## 1. Project Overview
Give the Founder Command Center left nav more room for working pages by auto-collapsing to an icon rail on desktop, while keeping full labels on hover and the existing mobile drawer.

## 2. Core Functionalities
- Desktop (≥981px): sidebar defaults to a 68px icon rail
- Hover or keyboard focus expands to the full 248px nav
- Pin control locks the sidebar open; preference in `localStorage` (`macc-cc-sidebar-pinned`)
- Collapsed items keep `title` tooltips from their labels
- Mobile: unchanged hamburger drawer; pin control hidden

## 3. Docs and Libraries
- Plain HTML/CSS/JS (no bundler)
- Persistent shell: `funnel/internal/index.html` + `assets/spa-router.js`
- Styles live in `funnel/internal/assets/operations-redesign.css`

## 4. Current File Structure
- `funnel/internal/index.html` — shell markup (pin button + script tag)
- `funnel/internal/assets/sidebar-collapse.js` — pin / media-query / tooltips
- `funnel/internal/assets/operations-redesign.css` — collapsed-rail rules

---

# Instructions — Meeting log recording UX (prior)

## 1. Project Overview
Improve `/internal/meetings.html` so uploading and finding meeting recordings is obvious and fast for founders.

## 2. Core Functionalities
- Sticky orange **Upload meeting recording** dock at the top (meeting select + drop zone + CTA)
- Per-meeting **Recordings** panel directly under each meeting header (not buried at the bottom)
- Solid upload buttons (not faint dashed links)
- Rail badges showing recording counts
- Existing R2 chunked upload API unchanged

## 3. Docs and Libraries
- Plain HTML/CSS/JS (no bundler)
- Upload API: `/api/recordings`
- SPA shell: `funnel/internal/assets/spa-router.js` re-injects scripts on navigate

## 4. Current File Structure
- `funnel/internal/meetings.html` — page shell + styles + dock markup
- `funnel/internal/assets/meetings.js` — mount panels, dock, upload/playback
- `funnel/internal/assets/operations-redesign.css` — light-theme overrides for dock/panels
