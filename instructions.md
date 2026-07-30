# Instructions — Funnel v2 Solar Matrix-style hero

## 1. Project Overview
Rebuild `funnel/v2` hero to match the provided Solar Matrix reference: bright sky backdrop, left copy/CTAs, right visual with floating feature cards on dotted connectors, yellow pill buttons, white trust strip — adapted for MACC / Biliran Founder OS copy (no fabricated reviews, ratings, or partner logos).

## 2. Core Functionalities
- Sky-gradient hero with two-column layout (copy left, visual right)
- Floating glass cards linked to a central hub image via dashed SVG paths
- Primary/secondary pill CTAs → `#quote` / `#packages`
- Honest trust chip (on-island team) instead of fake review counts
- White trust bar reusing real table-stakes (fixed price, licensed, typhoon-rated)
- Generated local images under `funnel/v2/assets/img/` (no CDN)

## 3. Docs and Libraries
- Plain HTML/CSS/JS, self-contained under `funnel/v2/`
- Styles: `funnel/v2/assets/funnel-v2.css`
- Positioning: `ops/positioning.md` (copy downstream)
- Founder OS §1.6 / §7: no fabricated proof

## 4. Current File Structure
- `funnel/v2/index.html` — hero markup
- `funnel/v2/assets/funnel-v2.css` — hero + button styles
- `funnel/v2/assets/img/hero-sky.jpg`, `hero-turbine.png`, `card-*.jpg`
