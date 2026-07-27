# SOP — Product Capture: web page → Command Center (SC-19)

**Doc:** standard operating procedure · **REV A · 2026-07-27** · Owner: _[founder]_
Tool: **MACC Product Capture** browser extension (`tools/product-scraper-extension`) →
`/internal/captures` (SC-19 · Product Captures). Applies to everyone doing sourcing
research: founders, and any limited account granted the **captures** section.

---

## 1. Purpose

While browsing supplier listings — Alibaba, AliExpress, Facebook groups, FB Marketplace,
Shopee/Lazada, any shop — one click saves the product, price, supplier, MOQ and location
into a single shared list in the Command Center. Every row is automatically **dated**,
**linked to its source URL**, and **attributed to whoever captured it**.

Why it exists: the BOM rule says every supplier price must be *research-backed and dated*
(prices change fast). This tool enforces that by construction — no more screenshots in
chat, half-remembered prices, or undated spreadsheet cells.

## 2. What captures are — and are not

- A capture is **field evidence**: "this listing said US $28.50–32.00 / piece on 2026-07-27."
  Ranges, units, and messy text are kept verbatim on purpose.
- A capture is **NOT a confirmed price**. Never paste one into a customer quote or the
  quote builder's price list without confirming with the supplier first — confirmed prices
  go into the quote builder with their `source_note` (who quoted it, when), same as always.
- This is a **clipper, not a crawler**: capture pages you are actually reading, one at a
  time. No bulk scraping, no automation on top of it.

## 3. One-time setup

### 3.1 Server (admin, once — likely already done)

```bash
npx wrangler d1 execute solar-city-leads --remote --file=funnel/schema.sql
npx wrangler pages deploy funnel --project-name solar-city-funnel
```

Safe to re-run; `schema.sql` only creates what's missing.

### 3.2 Each person's browser (~3 minutes)

1. Get the repo folder `tools/product-scraper-extension` onto your machine.
2. Open `chrome://extensions` (works the same in Edge/Brave) → turn on **Developer mode**
   (top right) → **Load unpacked** → select the `product-scraper-extension` folder.
3. Pin **MACC Product Capture** to the toolbar (puzzle-piece icon → 📌).
4. Right-click the extension icon → **Options**:
   - Paste the Command Center address (the same URL you open for `/internal`).
   - Click **Save settings** → Chrome asks permission to let the extension talk to that
     site → **Allow**.
5. Sign in to the Command Center in this browser **with your own founder login** (not the
   shared team password — captures are attributed, and "Shared team login" tells us nothing).
6. Click **Test connection**. Expected: *"Connected ✓ — signed in, captures API reachable."*
   Anything else → §6 Troubleshooting.

Done. There is no password or secret inside the extension — it rides on your own sign-in.

## 4. Capturing (daily use)

### 4.1 Alibaba / AliExpress product page

1. Open the product page → click the extension icon.
2. It pre-fills product, price range, MOQ, supplier company, and region where the page
   exposes them. **Check the Cost field kept the full range and unit** ("US $28.50 - 32.00
   / piece") and the MOQ.
3. Add one line in **Notes**: why this matters and the next step
   (e.g. "candidate for ILAW battery — ask for spec sheet + FOB Cebu").
4. **Save**.

### 4.2 Facebook group post

1. **Highlight (select) the post text first** — Facebook posts can't be auto-read, the
   selection *is* the capture. Then click the extension icon.
2. The selection becomes the Description; a ₱-price and a "Location:" line are parsed out
   of it when present. The group name and post URL are recorded automatically.
3. Fill in whatever the parser missed (price, city, seller name into Supplier). Save.

### 4.3 Facebook Marketplace item page

Click the icon directly — title, price, and "Listed … in *City*" are detected. Review, save.

### 4.4 Shopee / Lazada / any other site

Click the icon. Pages with proper product data fill automatically; otherwise select the
relevant text first, or type the fields by hand. A row saves as long as it has at least a
product name or a description.

### 4.5 Quality bar for every row

- **Cost captured whenever the page shows one** — the price is usually why we're capturing.
- **Notes says why**: which package/BOM line it could feed, or what to do next. A row
  nobody can act on is noise.
- Popup says **"Saved to the Command Center ✓"** → done. Any other message → §6.

## 5. Reviewing captures (SC-19)

1. Command Center sidebar → **Field Intelligence → Product Captures** (`/internal/captures`).
2. Search across product, brand, supplier, location, notes. Click a row for the full
   description, auto-collected extras, and links to the source page/image.
3. **Annotate**: open the row → edit Notes → *Save notes*. Keep decisions there
   ("emailed 7/27, waiting on freight quote"), so the next person doesn't redo the work.
4. **Delete** junk and duplicates on sight — the list is only useful clean.
5. **Export CSV** when you need the data elsewhere (BOM refresh session, cost modelling).
   The export honors the current search filter.

**Weekly:** whoever owns the BOM refresh skims the week's new captures in the Friday
review. A captured price older than ~30 days is stale — re-verify before it informs
anything. Confirmed numbers graduate out of SC-19 into the BOM / quote-builder price list
with their source note; SC-19 itself stays the raw evidence trail.

## 6. Troubleshooting

| Popup / page says | Do this |
|---|---|
| "You're signed out of the Command Center — row queued" | The row is safe. Click the sign-in link it offers, log in, reopen the popup → **Retry queued**. |
| "App unreachable — row queued" | No signal or the app is down. Rows wait locally (badge shows the count) and also retry on browser restart. |
| "site permission was declined" (Options) | Options → **Save settings** again → click **Allow** on Chrome's prompt. |
| Nothing auto-fills on a Facebook post | You didn't select the post text first. Highlight it, click the icon again (or use ↻). |
| Nothing auto-fills elsewhere | The site publishes no product data. Select text or type it in — it still saves fine. |
| "Test failed / Unexpected response" | The URL in Options isn't the deployed app. It must be the address where `/internal` opens. |
| Saving 404s after a redeploy | The deployment predates the captures feature — redeploy from current `main` and re-run the schema command (§3.1). |
| Extension icon shows an orange number | That many rows are queued locally. Open the popup → **Retry queued**. |

Still stuck → post in the group channel (not a private DM — same rule as everything else).

## 7. Rules

1. **Own login only.** Captures are attributed and audited like every Command Center action.
2. **Evidence, not quotes.** Captured prices are indicative until a supplier confirms them
   — the honesty rules (Founder OS §1.6) apply to what we tell customers, so nothing
   reaches a quote unverified.
3. **Clip, don't crawl.** Only pages you're viewing, one at a time.
4. **Point the extension only at our Command Center URL.** Nothing else ever receives data.
5. **Delete on doubt.** A wrong price in the list is worse than no price.

## 8. Ownership

- **SC-19 data hygiene + weekly capture review:** _[name — same person as the BOM refresh owner]_
- **Server/extension maintenance:** _[name]_
- No name filled in = not being done (Founder OS §6).

---

*Revision history: REV A 2026-07-27 — initial issue, matches extension v2.0.0 (Command
Center delivery; the retired Google-Sheets path was v1).*
