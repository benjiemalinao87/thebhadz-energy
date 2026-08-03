# Chrome Web Store submission — MACC Field Kit

**Doc:** publishing runbook · **REV A · 2026-08-04** · Owner: _[founder]_
Extension source: `tools/product-scraper-extension/` · Package: `node tools/product-scraper-extension/pack.mjs`

Why the Web Store and not a zip in the group chat: **auto-update**. Today the extension
is loaded unpacked, so every fix means telling four people to `git pull` and click
Reload, and there is no way to know who actually did. Published unlisted, Chrome updates
everyone within a few hours and nobody does anything.

**Unlisted means:** not searchable, not browsable, installable by anyone who has the
link. It is *not* secret — treat the link as internal, and know that anyone with it can
download and read the extension's source, including the outreach message templates. See
§6 before deciding that is fine.

---

## 1. The publisher account

| | |
|---|---|
| **Google account** | `maccsystemseng@gmail.com` — created 2026-08-04 |
| **Held by** | Benjie |
| **Why a Gmail and not `@macc-inc.com`** | Google has removed the "use my existing email address" option from personal account signup. It no longer appears anywhere in the flow, so a Gmail is the only route. This costs us nothing: the login address is never shown to anyone (see §3 — the listing shows the *publisher display name*, and the *contact email* is set separately to `official@macc-inc.com`). |

**The publisher account owns the extension**, and moving an item between accounts later
is painful. Treat those credentials as company property: password manager, recovery
pointed at a person who is reachable, and a second founder added under **Account →
Users** so the listing does not die with one Google login.

### What only an account holder can do

Chrome will not let an agent do these; they need the signed-in account and a card.

1. Register the developer account — **one-time US$5** — at
   <https://chrome.google.com/webstore/devconsole>.
2. Upload the zip, paste the copy from §3, answer the privacy questions in §4.
3. Submit for review. First review typically takes a few days; updates are usually faster.

## 2. Build the package

```bash
node tools/product-scraper-extension/pack.mjs
# → tools/product-scraper-extension/dist/macc-field-kit-<version>.zip
```

It ships only the 15 files the extension actually loads — no tests, no README, no icon
generator. Output is deterministic: same source, byte-identical zip, so a changed hash
means changed contents. The `dist/` folder is gitignored; rebuild it, don't commit it.

**Bump `version` in `manifest.json` before every upload.** The Store rejects a package
whose version is not higher than the published one.

## 3. Store listing copy

**Name** (45 max)

```
MACC Field Kit
```

**Summary** (132 max — shown under the name)

```
Internal tool for MACC Systems & Engineering staff: save supplier listings to our workspace, and fill supplier contact forms.
```

**Category:** Workflow & Planning · **Language:** English

**Description**

```
MACC Field Kit is an internal work tool for staff of MACC Systems & Engineering Inc., a
solar installation company in Biliran, Philippines. It is published unlisted so our own
team can install and update it. It is not intended for general use.

It does two things with the page you are currently looking at, and only when you click
its toolbar button:

SAVE A SUPPLIER LISTING
On a supplier or product page, it reads the product name, price, minimum order quantity,
supplier and location, shows them to you for correction, and saves the row — dated and
with its source URL — to our own company workspace, signed in as you. This exists because
supplier prices go stale fast and our records require every price to be dated and
attributable.

FILL A SUPPLIER CONTACT FORM
On a manufacturer's contact or distributor-enquiry page, it types your saved details
(name, email, phone, company, city, country) into the matching fields and drafts a
message for the enquiry you are making. You read it, correct it, and send it yourself.

It never submits a form for you. It never fills passwords, captchas, checkboxes or radio
buttons. It does not run while you browse — only in the moment you click it. It contains
no analytics and no advertising, and talks to no server other than our own workspace.

Privacy policy: https://macc-inc.com/field-kit-privacy
```

**Privacy policy URL**

```
https://macc-inc.com/field-kit-privacy
```

> This page ships in this repo at `funnel/field-kit-privacy.html`. **Confirm it loads
> publicly before you paste the URL** — the reviewer will open it, and a 404 fails the
> submission. If the funnel's public host is not `macc-inc.com`, use the host that
> actually serves the funnel and update this doc.

**Support / contact email:** `official@macc-inc.com`

### Graphics you must supply

| Asset | Size | Notes |
|---|---|---|
| Store icon | 128×128 PNG | `tools/product-scraper-extension/icons/icon128.png` — already the right size. |
| Screenshot (≥1) | 1280×800 or 640×400 PNG | Required. Take one of the popup open on a real supplier contact page, Outreach tab showing a filled form. Crop/pad to exactly 1280×800. |
| Small promo tile | 440×280 PNG | Optional for unlisted. Skip it. |

A screenshot with a real filled-in form is the most useful thing for the reviewer — it
shows the single purpose better than the description does.

## 4. Privacy tab — the exact answers

**Single purpose** (this is the field most likely to draw a rejection — see §6)

```
Moving information between the supplier page a staff member is viewing and their own
company records: reading product and supplier details from the page into our workspace,
and writing the staff member's own saved contact details into that supplier's enquiry
form. Both directions act only on the page the user explicitly clicks the extension on.
```

**Permission justifications**

| Permission | Justification to paste |
|---|---|
| `activeTab` | The extension reads the page only in the moment the user clicks its toolbar button. This permission is what limits it to that one tab at that one moment, instead of granting access to browsing generally. |
| `scripting` | Required to inject the reader/filler into the current tab on click. Nothing is injected automatically or persistently; there is no content script registered in the manifest. |
| `storage` | Stores the user's own contact details for form filling, the address of their company workspace, and any rows waiting to upload while offline. All local to the user's browser. |
| Host permissions (`*.macc-inc.com`, `*.pages.dev`, `localhost`) | Optional, requested at runtime, and only for the company's own workspace, which the user enters in the options page. It is where captured rows are sent, authenticated with the user's existing session cookie. `*.pages.dev` covers our Cloudflare Pages preview deployments and `localhost` our local development server. The extension requests exactly one of these origins — whichever the user configures — never the whole pattern. |
| Remote code | **None.** All code is in the package. No `eval`, no remotely-hosted scripts. |

**Data usage — tick these, and only these**

- ☑ **Personally identifiable information** — "name, address, email address, phone number":
  the user's *own* details, which they type in, stored only in their browser for filling forms.
- ☑ **Website content** — "text, images": product and supplier details read from the page
  the user clicks on, sent to the user's own company workspace.

Leave unticked: health, financial and payment information, authentication information,
personal communications, location, web history, user activity.

> Authentication information is genuinely **not** collected: the extension never sees a
> password. It relies on the browser's existing session cookie for our own domain, which
> it neither reads nor stores.

**Three certifications — all three are true, tick all three**

- ☑ I do not sell or transfer user data to third parties, apart from the approved use cases.
- ☑ I do not use or transfer user data for purposes unrelated to my item's single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes.

## 5. Visibility and rollout

1. **Visibility → Unlisted.** (Not Public. *Private* requires Google Workspace, and
   macc-inc.com mail runs through Cloudflare Email Routing into Gmail, not Workspace, so
   Private is not available to us.)
2. **Distribution → all regions.** The team is remote; do not region-restrict.
3. Submit. When it is approved, copy the item link into the group channel.
4. **Each founder: remove the unpacked copy first**, then install from the link. Two
   copies of the same extension both add a toolbar icon and both keep their own queue,
   which is exactly the confusion this move is meant to end.
5. Their outreach profile and Command Center URL do **not** carry over — the store build
   is a different extension ID with its own storage. Re-enter both in Options. One
   minute, once.

## 6. Know this before you publish

- **Unlisted is not private.** Anyone with the link can install it and read its source,
  including `templates.js` — which contains the Biliran co-marketing pitch and our
  positioning. None of it is a secret we are keeping from customers, but a competitor
  reading our outreach strategy is a real, if small, cost. If that matters more than
  auto-update, the alternative is keeping load-unpacked and living with manual reloads.
- **The single-purpose question is the likely friction.** Reviewers reject extensions
  that read as two unrelated tools bolted together. The §4 wording frames both features
  as one purpose — moving data between the supplier page and our records — which is
  accurate. If it is rejected anyway, the fix is to split into two extensions, not to
  argue; say so in the group channel before anyone spends a week on it.
- **Review is not instant.** Do not schedule anything around the extension landing on a
  particular day. Urgent fixes during a review can still be distributed as a zip.
- **Publishing is public and permanent-ish.** The publisher account name appears on the
  listing. Use the company account, not a personal one.

## 7. Shipping an update afterwards

1. Change the code, run `./test/run.sh` (fill-engine regression checks).
2. Bump `version` in `manifest.json`.
3. `node tools/product-scraper-extension/pack.mjs`
4. Dev console → the item → **Package → Upload new package** → Submit.
5. Chrome pushes it to everyone within a few hours. Nobody reloads anything.
