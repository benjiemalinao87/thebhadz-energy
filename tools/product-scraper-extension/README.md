# MACC Product Capture — Chrome extension

One-click clipper for sourcing research. Open a product page (Alibaba supplier
listing, a Facebook group post, Shopee/Lazada, any shop), click the toolbar icon,
review the auto-extracted fields, hit **Save** — a dated row lands in the MACC
Command Center at **`/internal/captures` (SC-19 · Product Captures)**, attributed
to whichever founder is signed in. Every row carries the capture date and source
URL, which is exactly the "supplier prices must be research-backed and dated" rule
from the BOM conventions, enforced by tooling instead of discipline.

Works in Chrome, Edge, Brave and any Chromium browser (Manifest V3). Plain
HTML/CSS/JS, no build step, no dependencies — same philosophy as the rest of the
repo.

**Team SOP** (setup, per-site capture steps, review cadence, rules):
[`docs/sop-product-capture.md`](../../docs/sop-product-capture.md).

## How it fits together

```
browser page ──click──▶ popup (review/edit fields)
                            │ Save
                            ▼
             background service worker
                            │ POST /api/captures  (credentials: include —
                            ▼   your own founder session cookie signs it)
             funnel app (Cloudflare Pages)
               · functions/api/captures.js  → D1 table product_captures
               · /internal/captures (SC-19) → view, search, annotate, export CSV
```

No extra secret, token, or webhook password exists: the extension talks to the
app as *you*. Auth, per-founder attribution, the activity log, and per-account
section hiding all come from the funnel's existing founder-auth system.

## What gets captured

| Field | Filled from |
|---|---|
| Captured at | Save time, ISO 8601 — automatic |
| Brand name | JSON-LD `brand`, meta tags, or you |
| Product | JSON-LD name, `og:title`, `h1`, or page title |
| Description | Your text selection first, else page description |
| Cost | Structured price if present, else first price-looking text (`US $28.50 - 32.00 / piece`, `₱6,500`, …) |
| Currency | Guessed from the price (₱/PHP, US$/USD, ¥/CNY, €, £) — editable |
| Location | "Ships from / Located in / Location:" text, Alibaba supplier region, FB Marketplace "Listed … in …" |
| Supplier | JSON-LD seller, Alibaba company name |
| MOQ | "Min. order …" / "MOQ: …" text |
| Source site + URL | The page you clipped |
| Image URL | JSON-LD / `og:image` |
| Other info | Auto extras: supplier tenure, SKU, rating, availability, FB group name |
| Notes | Yours — why it matters, next step |

Every field is shown in the popup and editable **before** saving, so a bad guess
never has to reach the database.

## Setup

### Part 1 — server (one-time, ships with this repo)

The API and the viewer page are part of the funnel app. If the deployed funnel is
current, all that's needed is the schema addition:

```bash
npx wrangler d1 execute solar-city-leads --remote --file=funnel/schema.sql
npx wrangler pages deploy funnel --project-name solar-city-funnel
```

(`schema.sql` is all `CREATE TABLE IF NOT EXISTS`, so re-running it is safe.
Run from the repo root; drop `funnel/` from the path if you run inside `funnel/`.)

### Part 2 — each founder's browser

1. Get this folder onto the machine (clone the repo or download it).
2. Open `chrome://extensions`, switch on **Developer mode** (top right).
3. **Load unpacked** → select the `tools/product-scraper-extension` folder.
4. Pin "MACC Product Capture" to the toolbar (puzzle-piece menu → pin).
5. Right-click the icon → **Options** → paste the deployed app's URL
   (e.g. `https://solar-city-funnel.pages.dev` or the custom domain) →
   **Save settings** → allow the permission prompt (that's Chrome asking whether
   the extension may talk to your app — required).
6. Make sure you're signed in to the Command Center in this browser, then click
   **Test connection**. It should confirm you're signed in and the API is
   reachable.

## Using it

- **Alibaba / AliExpress** — open the product page, click the icon. Title, price
  range, MOQ, supplier company and region are picked up where the page exposes
  them; whatever isn't found stays blank for you to fill.
- **Facebook groups** — feed posts use obfuscated markup, so *highlight the post
  text first*, then click the icon. The selection becomes the description, a
  `₱6,500`-style price and "Location:" line are parsed out of it, and the group
  name + post URL are recorded automatically. The popup reminds you if you forgot
  to select.
- **Facebook Marketplace** item pages — title, price and "Listed … in *City*" are
  auto-detected.
- **Shopee / Lazada / everywhere else** — structured product data (JSON-LD,
  OpenGraph) is used when present; otherwise fall back to selecting text, editing
  fields by hand, or both.
- **Zero-setup fallback** — **Copy row** puts the row on the clipboard as
  tab-separated text; paste it into any spreadsheet.

Captured rows show up immediately on **/internal/captures**: search, expand a row
for description/notes, annotate, delete, or export the current view as CSV.

The extension only reads a page **when you click it** (`activeTab`) — it has no
access to your browsing otherwise, and the only server it ever talks to is the
Command Center origin you configured. It's a clipper for pages you're already
reading, one at a time — not a bulk crawler; keep it that way.

### Offline / signed-out queue

If the app is unreachable — no signal, or your Command Center session expired —
the row is queued locally and the toolbar icon shows a count badge. Sign in (the
popup offers the link) and hit **Retry queued**; the queue also retries
automatically on browser startup.

### Multiple founders

Each founder loads the extension, points it at the same app URL, and signs in
with their own founder login — every capture is attributed to its clipper, and
the activity log records each save like any other Command Center action.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "You're signed out of the Command Center" | Open /internal in the same browser profile, sign in, then Retry queued. |
| "the site permission was declined" | Options → Save settings again → click **Allow** on Chrome's prompt. |
| "Unexpected response from …" | The URL isn't the funnel deployment (or a proxy page answered) — check it opens /internal in a tab. |
| Test says reachable but saving 404s | The deployed app predates `/api/captures` — redeploy the funnel from this repo and re-run the schema command. |
| Nothing auto-detected on Facebook | Highlight the post text first, then click the icon. |
| Nothing auto-detected elsewhere | The site exposes no structured data — select text / fill manually; it still saves fine. |
| Rows queue forever with "Timed out" | Check the URL in Options and that the site is up; queued rows upload on the next successful retry. |

## Development notes

- `content.js` is the extractor: generic layer (selection → JSON-LD → OpenGraph →
  price/MOQ/location regexes) plus site modules for Alibaba/AliExpress and
  Facebook. It must stay a single IIFE expression — its value is what
  `chrome.scripting.executeScript` returns to the popup.
- `background.js` (service worker) owns the API POST (survives popup close), the
  offline queue and the badge. Requests carry the founder's session cookie via
  `credentials: 'include'`; the options page requests the app origin as an
  optional host permission, which is what lets the cookie ride along and bypasses
  CORS. A 401 is surfaced as the distinct `not-signed-in` state, and queued.
- Server side lives in the funnel app: `funnel/functions/api/captures.js`
  (GET/POST/PATCH/DELETE, validation, `created_by` from the session),
  `funnel/schema.sql` → `product_captures`, viewer at
  `funnel/internal/captures.html` + `funnel/internal/assets/captures.js`,
  section key `captures` in `funnel/functions/_pages.js` (so it can be hidden
  per-account like any other section).
- Icons: `node icons/make-icons.mjs` regenerates the PNGs (self-contained PNG
  encoder, no deps).
- Extractor smoke tests run against local HTML fixtures in headless Chromium
  (`?cap_site=` forces a site module from `file://`); the endpoint has a Node
  test harness driving `onRequest` against real SQLite via `node:sqlite`.
