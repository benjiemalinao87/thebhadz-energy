# MACC Field Kit — Chrome extension

Two tools behind one toolbar icon, because both do the same thing structurally:
read the page you are looking at, using your own founder identity.

- **Capture** — one-click clipper for sourcing research (below).
- **Outreach** — fills a brand's contact form with your details and a drafted
  message: distributor enquiries, installer accounts, and the Biliran co-marketing
  ask. See [Outreach tab](#outreach-tab).

## Capture tab

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
npx wrangler pages deploy funnel --project-name thebhadz-energy
```

(`schema.sql` is all `CREATE TABLE IF NOT EXISTS`, so re-running it is safe.
Run from the repo root; drop `funnel/` from the path if you run inside `funnel/`.)

### Part 2 — each founder's browser

1. Get this folder onto the machine (clone the repo or download it).
2. Open `chrome://extensions`, switch on **Developer mode** (top right).
3. **Load unpacked** → select the `tools/product-scraper-extension` folder.
4. Pin "MACC Field Kit" to the toolbar (puzzle-piece menu → pin).
5. Right-click the icon → **Options** → paste the deployed app's URL
   (e.g. `https://founders.macc-inc.com` or the `…pages.dev` preview) →
   **Save settings** → allow the permission prompt (that's Chrome asking whether
   the extension may talk to your app — required).
6. Make sure you're signed in to the Command Center in this browser, then click
   **Test connection**. It should confirm you're signed in and the API is
   reachable.

**Allowed hosts.** `optional_host_permissions` in `manifest.json` lists where the
Command Center is permitted to live — `*.macc-inc.com`, `*.pages.dev`, and
`localhost`/`127.0.0.1` for `wrangler pages dev`. Chrome will only prompt for an
origin matching one of those patterns, so a new deployment domain means adding a
line there and reloading the extension; the options page says so explicitly if you
paste an origin it can't request. It is deliberately not `https://*/*` — a clipper
that saves to one known app has no business asking for permission on every site.

### Updating

**Loaded unpacked** (developers, and anyone before the Store listing is live):
Chrome never updates it for you. After a `git pull` that touches this folder, open
`chrome://extensions` and click **Reload** on the extension's card. The options page
shows the running version under **This build** — compare it with `version` in
`manifest.json` to see whether you're stale.

**Installed from the Chrome Web Store** (the plan for the remote team): Chrome
updates everyone within a few hours of a new package being approved. Nobody reloads
anything. Publishing runbook, listing copy and the review answers:
[`docs/chrome-web-store-listing.md`](../../docs/chrome-web-store-listing.md).
Build the upload with:

```bash
node tools/product-scraper-extension/pack.mjs   # → dist/macc-field-kit-<version>.zip
```

Either way: **bump `version` in `manifest.json` in any commit that changes extension
behaviour.** Unpacked, it makes "reload it" checkable; on the Store, an unbumped
version is rejected outright.

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
Command Center origin you configured. This is also why the Outreach tab needs no
extra permissions to work on sungrowpower.com or anywhere else: it injects on your
click, the same way Capture does. It's a clipper for pages you're already reading,
one at a time — not a bulk crawler; keep it that way.

### Offline / signed-out queue

If the app is unreachable — no signal, or your Command Center session expired —
the row is queued locally and the toolbar icon shows a count badge. Sign in (the
popup offers the link) and hit **Retry queued**; the queue also retries
automatically on browser startup.

### Multiple founders

Each founder loads the extension, points it at the same app URL, and signs in
with their own founder login — every capture is attributed to its clipper, and
the activity log records each save like any other Command Center action.

## Outreach tab

You are on Sungrow's "become a distributor" page, or Deye's contact form, or any
brand's partner enquiry. Click the icon → **Outreach** → pick the message → **Fill
this form**. Your name, email, phone, company, city and country go into the right
boxes, the dropdowns get sensible answers, and the message box gets a draft.

**It never submits.** It fills; you read what it wrote, tick any consent box
yourself, and click send. Filled fields are outlined in amber for a few seconds,
and **Undo** puts every one of them back.

### The messages

| Template | For |
|---|---|
| **Biliran co-marketing event** | The partnership ask: we host an informational event in Naval, the brand supplies literature / banner / demo unit / a speaker, and becomes our preferred brand for what we install on the island. |
| **Become a distributor** | Distribution or dealership terms for the Philippines — tiers, MOQ, trade pricing, warranty service path, certification docs. |
| **Installer / dealer account** | Open a buying account, or get pointed at the brand's authorised PH distributor. |
| **Technical docs & compliance** | Datasheets, IEC 62109 / anti-islanding certificates, warranty statement — what a net-metering submission needs. |

Every draft is editable in the popup before it goes anywhere, and every one of them
is written to the honesty rules in CLAUDE.md §1.6 / §7: **no install counts we have
not banked, no claim of certification or distributor status we do not hold, no
volume commitment we have not earned.** The Biliran draft says out loud that we are
newly incorporated and pre-revenue, because a brand that finds out later stops
answering. If you edit a draft, keep that line honest.

Templates live in `templates.js` — add one by appending to `MACC_TEMPLATES` with a
`build(profile, ctx)` returning `{subject, long, short}`. `short` is used when the
target box has a `maxlength` the long draft would overflow.

### Your profile

Options → **Outreach profile**. Company details (name, address, website, city,
province, country) ship pre-filled from the repo so all four founders' outreach
matches; your name, title, email and phone are yours to add. **Use my Command
Center name & email** copies those two from your founder account so you don't
retype them. It is stored in your own Chrome profile and never sent to the
Command Center.

### What it will and won't touch

Fills: text inputs and textareas it can identify, plus `<select>` menus for
country, province, "which best describes you", business focus, inquiry type, and
"how did you hear about us".

Never touches: passwords, captchas ("Code *"), checkboxes and radios (a consent box
is yours to tick knowingly), search boxes, quantity fields, and anything that
already has a value — unless you tick **Overwrite**.

Anything it can't identify is listed in the report under the buttons, so you know
exactly what is left for you to type.

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
  CORS. A 401 is surfaced as the distinct `not-signed-in` state, and queued. The
  queue flushes in slices of `MAX_BATCH` (50) — it must not exceed the endpoint's
  own `MAX_BATCH`, or a queue that grew past it would be rejected wholesale (422)
  on every retry and never drain.
- Server side lives in the funnel app: `funnel/functions/api/captures.js`
  (GET/POST/PATCH/DELETE, validation, `created_by` from the session),
  `funnel/schema.sql` → `product_captures`, viewer at
  `funnel/internal/captures.html` + `funnel/internal/assets/captures.js`,
  section key `captures` in `funnel/functions/_pages.js` (so it can be hidden
  per-account like any other section).
- Icons: `node icons/make-icons.mjs` regenerates the PNGs (self-contained PNG
  encoder, no deps). `pack.mjs` builds the Web Store zip the same way — hand-rolled
  ZIP writer, Node built-ins only, deterministic output so a changed hash means
  changed contents. Both exclude themselves from the package.
- `fill.js` is the outreach form engine. Like `content.js` it runs inside the page,
  but it is handed to `executeScript` as a **function** rather than a file, so it is
  serialised with `toString()` and may not reference anything outside itself —
  no imports, no shared helpers, everything arrives in `payload`. It runs with
  `allFrames: true`, because brand contact forms are so often an embedded iframe;
  `outreach.js` merges the per-frame reports.
- **Tests.** `./test/run.sh` drives `fill.js` against `test/form-fixture.html` in
  headless Chrome and fails on any regression (23 checks: field matching, the
  captcha/password/checkbox skips, per-form scoping, maxlength clipping). Open the
  fixture in a normal browser and click **Run** to debug interactively. The fixture
  replicates the two form shapes we actually hit — captions as sibling `<div>`s
  (Sungrow) and placeholder-only with a captcha (Deye) — and it caught three real
  bugs on first run: a caption heuristic that labelled "City" as "Country", a
  fieldset legend poisoning every field beneath it, and a page-wide "fill each
  field once" rule that starved the second form on the page.
- The **capture** extractor has no automated tests. `content.js` keeps the
  `?cap_site=` hook so a site module can be forced from a `file://` fixture (where
  `location.hostname` is empty), which is the seam a harness would use, but it was
  never written. Changes to it are verified by hand: a real Alibaba listing, an FB
  group post with the text selected, and one Shopee/Lazada page.
