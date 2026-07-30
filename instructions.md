# Instructions — FB-ad solar calculator landing page

## 1. Project Overview
Standalone, phone-optimized savings calculator landing page for Facebook ads. Layout modeled on the lime/teal split reference; copy and proof adapted for MACC / Biliran (Founder OS).

## 2. Core Functionalities
- Mobile-first stack: header → roof photo + calc → headline/CTA → lead capture
- Live BILECO bill → estimated ₱/mo savings + package fit (same math as funnel v2)
- Priority pills: lower bill / backup / both (LIWANAG brownout rule preserved)
- Mini lead form with UTM passthrough → existing `/api/lead` cross-origin endpoint
- Honest trust chips only — no fabricated testimonials, ratings, or foreign cert seals

## 3. Docs and Libraries
- Plain HTML/CSS/JS, self-contained under `funnel/v2/`
- Reuses v2 lead endpoint meta pattern and BILECO calc assumptions
- Positioning: `ops/positioning.md`; Founder OS §1.6 / §4 / §7

## 4. Current File Structure
- `funnel/v2/calc.html` — page
- `funnel/v2/assets/calc-ad.css` — styles
- `funnel/v2/assets/calc-ad.js` — calc + lead submit
- Images: `funnel/v2/assets/img/hero.jpg`, `macc-logo.png`, `macc-mark.png`
