# Instructions — Meeting log recording UX

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
