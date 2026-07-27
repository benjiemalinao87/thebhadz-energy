# MACC Product Capture — Chrome extension

One-click clipper for sourcing research. Open a product page (Alibaba supplier
listing, a Facebook group post, Shopee/Lazada, any shop), click the toolbar icon,
review the auto-extracted fields, hit **Save to Sheet** — a dated row lands in the
team Google Sheet. Every row carries the capture date and source URL, which is
exactly the "supplier prices must be research-backed and dated" rule from the BOM
conventions, enforced by tooling instead of discipline.

Works in Chrome, Edge, Brave and any Chromium browser (Manifest V3). Plain
HTML/CSS/JS, no build step, no dependencies — same philosophy as the rest of the
repo.

## What ends up in the sheet

One row per capture, in a `Products` tab (created automatically, headers included):

| Column | Filled from |
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
| Source site | Hostname of the page |
| Product URL | The page URL |
| Image URL | JSON-LD / `og:image` |
| Other info | Auto extras: supplier tenure, SKU, rating, availability, FB group name |
| Notes | Yours — why it matters, next step |

Every field is shown in the popup and editable **before** saving, so a bad guess
never has to reach the sheet. Reorder/rename columns by editing `COLUMNS` in
`apps-script/Code.gs` (then redeploy) — the extension sends named fields, so column
order lives only there.

## Setup

### Part 1 — the Google Sheet (≈5 minutes, once for the whole team)

1. Create (or open) the Google Sheet that should collect captures.
2. **Extensions → Apps Script**. Delete the placeholder code, paste the full
   contents of [`apps-script/Code.gs`](apps-script/Code.gs), save.
3. Optional: set `SECRET = 'something-long'` at the top if you want requests
   without the secret rejected.
4. **Deploy → New deployment** → gear icon → type **Web app** →
   *Execute as:* **Me** · *Who has access:* **Anyone** → **Deploy**.
   Authorize when Google asks (it runs as your account, writing to your sheet).
5. Copy the **Web app URL** (ends in `/exec`).

> ⚠️ The most common gotcha: after editing `Code.gs` later, the `/exec` URL keeps
> serving the **old** code until you do **Deploy → Manage deployments → ✏️ →
> Version: New version**.

> 🔑 "Anyone" means anyone *with the URL* can append rows (they can never read the
> sheet). Treat the URL like a password; share it only with founders, and redeploy
> to rotate it if it leaks. Set `SECRET` for an extra lock.

### Part 2 — the extension (each founder's browser)

1. Get this folder onto the machine (clone the repo or download it).
2. Open `chrome://extensions`, switch on **Developer mode** (top right).
3. **Load unpacked** → select the `tools/product-scraper-extension` folder.
4. Pin "MACC Product Capture" to the toolbar (puzzle-piece menu → pin).
5. Right-click the icon → **Options** → paste the `/exec` URL (+ secret if set) →
   **Save settings** → **Send test row**. A `TEST — connection check` row should
   appear in the sheet's `Products` tab.

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
- **No setup / offline fallback** — **Copy row** puts the row on the clipboard as
  tab-separated text; paste it straight into any spreadsheet.

The extension only reads a page **when you click it** (`activeTab`) — it has no
access to your browsing otherwise, and the only server it ever talks to is your
own Apps Script URL. It's a clipper for pages you're already reading, one at a
time — not a bulk crawler; keep it that way.

### Offline queue

If the sheet is unreachable (no signal, Google hiccup), the row is queued locally
— the toolbar icon shows a count badge. **Retry queued** in the popup (or Options)
uploads everything; the queue also retries automatically on browser startup.

### Multiple founders

Each founder loads the extension and pastes the same `/exec` URL — everyone
appends to the same sheet. Settings live in Chrome sync storage, so they follow a
signed-in Chrome profile.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Unexpected response (a Google login page?)" | Deployment access isn't **Anyone** — redeploy with the settings from Part 1 step 4. |
| Test row worked once, edits to Code.gs do nothing | You must publish a **new version**: Deploy → Manage deployments → ✏️ → New version. |
| "Bad secret" | `SECRET` in Code.gs and the secret in extension Options don't match. |
| Nothing auto-detected on Facebook | Highlight the post text first, then click the icon. |
| Nothing auto-detected elsewhere | The site exposes no structured data — select text / fill manually; it still saves fine. |
| Rows queue forever | Check the URL in Options ends in `/exec` and "Send test row" passes. |

## Development notes

- `content.js` is the extractor: generic layer (selection → JSON-LD → OpenGraph →
  price/MOQ/location regexes) plus site modules for Alibaba/AliExpress and
  Facebook. It must stay a single IIFE expression — its value is what
  `chrome.scripting.executeScript` returns to the popup.
- `background.js` (service worker) owns the webhook POST (survives popup close),
  the offline queue and the badge. `Content-Type: text/plain` is deliberate:
  Apps Script can't answer CORS preflights.
- Icons: `node icons/make-icons.mjs` regenerates the PNGs (self-contained PNG
  encoder, no deps).
- Extractor smoke tests run against local HTML fixtures in headless Chromium
  (`?cap_site=` forces a site module from `file://`); they live outside the repo —
  see the branch/PR description for the harness pattern.
