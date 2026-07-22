# Solar City — Conversion Funnel

A self-contained, single-page lead-generation funnel for the Solar City homeowner packages
(LIWANAG / ILAW / SANDIGAN). Built to deploy on **Cloudflare Pages** with a Pages Function
for lead capture. No build step, no framework, no external requests.

## What's here

```
funnel/
├── index.html                 # public landing page (all copy + sections)
├── login.html                 # founder login screen
├── assets/
│   ├── funnel.css             # public funnel styles (warm, mobile-first)
│   ├── funnel.js              # form validation, package pre-select, submit
│   └── img/{liwanag,ilaw,sandigan}.svg   # hand-built package hero scenes
├── internal/                  # GATED founder docs + tools (behind login)
│   ├── index.html             # founder home (leads link + doc grid)
│   ├── leads.html             # PREMIUM leads pipeline (kanban, drag between stages)
│   ├── overview.html … market.html   # SC-00…06 engineering/strategy docs
│   ├── assets/                # docs' shared CSS/JS (style.css, site.js, designer.js)
│   └── vendor/d3.min.js
├── functions/
│   ├── _auth.js               # shared: HMAC-signed session cookie helpers
│   ├── api/
│   │   ├── lead.js            # POST /api/lead  (public) → validate + insert into D1
│   │   ├── leads.js           # GET/PATCH/DELETE /api/leads (founder-gated) → pipeline data
│   │   ├── notes.js           # GET/POST/PATCH/DELETE /api/notes (founder-gated) → team notes
│   │   ├── note-image.js      # POST upload / GET serve note images (founder-gated, R2)
│   │   ├── founder-login.js   # POST → verify password, set signed cookie
│   │   └── founder-logout.js  # clear cookie
│   └── internal/_middleware.js  # gate: valid cookie or redirect to /login
├── wrangler.toml              # D1 binding (DB) + R2 binding (NOTES_R2 → solar-city-notes)
├── schema.sql                 # leads + notes table schemas
├── _headers                   # security + cache headers
└── README.md
```

The three package images are hand-built **SVG scenes** — crisp at any size, a few KB each,
fully editable, and requiring no external assets (Cloudflare Pages serves them as-is).

## The conversion flow

1. **Hero** — one promise (cut the bill / keep the lights on), price anchor, primary CTA.
2. **Stat strip** — quick credibility numbers.
3. **Pain** — the two problems (high bill / outages) + the "solar feels hard" objection.
4. **Packages** — three ₱99,500 offers with images, benefit-led bullets, per-package CTAs
   that pre-fill the form.
5. **How it works** — 4 low-friction steps.
6. **FAQ** — handles price, financing, savings, typhoons, warranty, paperwork objections.
7. **Lead form** — the goal: name + mobile + goal (required), bill range / package / financing
   (optional). Package CTAs deep-link here and pre-select.
8. **Final CTA + sticky mobile bar** — urgency close, always-visible mobile button.

Every CTA points to the single conversion action: **the free savings estimate.**

## Savings calculator (instant time-to-value)

The `#calc` section (hero CTA lands here) turns a visitor's monthly bill into an instant estimate
— savings/month, payback, and the recommended package — then **pre-fills the lead form** (bill
range + package + goal) and jumps to it. This is the engineer-founder channel: it collapses the
quote cycle from a week to seconds, and it is the precondition for any ad spend (SC-11 boost gate).

- Assumptions live at the top of `assets/funnel.js` (rate **₱12.95/kWh** = BILECO, 4.0 peak-sun-hrs,
  0.78 derate, ~2.3 kWp for a ₱99,500 system). Change the rate there for a different utility.
- Outputs are shown as **ranges** and labelled estimates on purpose — confirmed on the free survey,
  never presented as guarantees (value-gap honesty rule).
- Calculator use fires `fbq('track','Lead')` / `gtag('calculator_estimate')` for attribution.

## Deploy to Cloudflare Pages

**Option A — dashboard (Git):**
1. Push this repo to GitHub/GitLab.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `funnel`
   - **Root directory:** *(repo root, or set to `funnel` and output `.`)*
4. Deploy. The Function at `functions/api/lead.js` is auto-detected and served at `/api/lead`.

**Option B — Wrangler CLI (direct upload):**
```bash
npx wrangler pages deploy funnel --project-name solar-city-funnel
```

## Lead delivery

Leads are **already stored** — every submission goes into the D1 database (see the founder /
leads-pipeline section below) and shows up on the board. Storage needs no extra setup.

Optionally, add **instant notifications** on top of storage so you hear about a lead the moment
it lands. Set these in **Pages → Settings → Environment variables** (or `wrangler pages secret put`):

| Variable | Enables | Notes |
|---|---|---|
| `LEAD_WEBHOOK_URL` | Instant Slack/Discord/Viber alert | Paste an incoming-webhook URL. Fires a formatted message per lead. |
| `LEAD_NOTIFY_EMAIL` + `LEAD_FROM_EMAIL` | Email notification | Uses MailChannels (free from CF). `LEAD_FROM_EMAIL` must be a domain you can send from. |

Both are optional and additive; the lead is stored regardless.

## Placeholders to replace before going live

- **Phone number** `0900 000 0000` — in `index.html` topbar + footer (`tel:` links).
- **Messenger link** `https://m.me/` — success-screen button (point to your page: `m.me/<yourpage>`).
- **Proof section** — add only real, permissioned customer quotes, install photos, or founder-roof
  R&D proof. Do not publish representative testimonials, ratings, or install counts.
- **Prices / savings numbers** — the ₱99,500 anchor and savings estimates come from
  `SC-06` planning targets. Confirm against live equipment quotes (see the engineering file)
  before advertising specific figures.
- **Analytics** — `funnel.js` calls `fbq('track','Lead')` and `gtag('event','generate_lead')`
  if a Meta Pixel or GA tag is present. Add the tag in `<head>` to activate.

## Marketing attribution

The form automatically captures `utm_source/medium/campaign/content/term` from the URL and
sends them with the lead — so links like
`?utm_source=facebook&utm_campaign=brownout` are tracked end-to-end.

## Local preview

Because the form posts to `/api/lead`, use a local server (not `file://`) to exercise the
Function. Simplest:
```bash
npx wrangler pages dev funnel
```
Opening `index.html` directly still works for layout/UX — the form falls back to the success
screen when the API isn't reachable.

## Founder access & the leads pipeline

The public funnel has a discreet 🔒 lock in the lower-right that opens **`/login.html`**.
After a founder enters the shared password, everything under **`/internal/*`** unlocks:

- **`/internal/`** — founder home: the leads pipeline + the SC-00…06 documentation.
- **`/internal/leads.html`** — the premium **leads pipeline** board.
- **`/internal/overview.html` … `market.html`** — the internal engineering/strategy file.

### How the gate works (genuinely private)

- `functions/_auth.js` signs a session cookie `sc_founder` with **HMAC-SHA256(expiry, AUTH_SECRET)**.
  It can't be forged without the secret; sessions last 12 hours.
- `functions/internal/_middleware.js` runs before *any* `/internal/*` file is served. No valid
  cookie → 302 redirect to `/login.html`. So the doc/board files are never served unauthenticated.
- `POST /api/founder-login` checks the password (constant-time) and issues the cookie.
  `/api/founder-logout` clears it. `/api/leads` re-checks the cookie on every call.

### Secrets (set once, in Cloudflare)

Both are already set on this project; rotate anytime:
```bash
echo -n "YOUR_NEW_PASSWORD" | npx wrangler pages secret put FOUNDER_PASSWORD --project-name solar-city-funnel
# AUTH_SECRET is a random 64-hex string; regenerate to invalidate all sessions:
openssl rand -hex 32 | npx wrangler pages secret put AUTH_SECRET --project-name solar-city-funnel
```
Secrets only apply to **new deployments** — redeploy after changing them.
**The current founder password is a placeholder (`solarcity2026`) — change it before sharing the link.**

### The leads pipeline (D1-backed)

Every funnel submission is stored in a **Cloudflare D1** database (`solar-city-leads`, bound as
`DB` in `wrangler.toml`) and appears on the board at stage **New Lead**. Founders drag cards
across six stages — **New Lead → Contacted → Demoed, Not Sold → Proposal Sent → Sold → Lost** —
and each move saves instantly. Click a card for a detail drawer: Call/Text buttons, all lead
fields, a stage dropdown, editable notes, and delete. The header shows live counts and an
estimated pipeline value (open leads × ₱99,500).

Schema lives in `schema.sql`. To change it:
```bash
npx wrangler d1 execute solar-city-leads --remote --file=schema.sql
```
Query leads directly anytime:
```bash
npx wrangler d1 execute solar-city-leads --remote --command "SELECT name, phone, stage FROM leads ORDER BY created_at DESC;"
```

### Team notes (D1 + R2-backed)

**`/internal/notes.html`** is the founders' shared notebook — write a note (name, optional
title, text), attach photos, save. Everyone with founder access sees, edits, and deletes the
same feed. Use it for site-survey findings, supplier call notes, install photos, meeting prep.

- **Text** lives in the same D1 database (`notes` table, `schema.sql`).
- **Images** live in the R2 bucket **`solar-city-notes`** (bound as `NOTES_R2` in
  `wrangler.toml`). The bucket is private — images are streamed through the founder-gated
  `GET /api/note-image?key=…`, never exposed publicly. Deleting a note also deletes its
  images from R2. Accepted: PNG/JPEG/WebP/GIF/HEIC, ≤ 8 MB each, ≤ 12 per note.
- Provisioning (already done once): `npx wrangler r2 bucket create solar-city-notes` and
  the `schema.sql` apply above. Local dev gets its own simulated bucket + DB automatically.

### Meeting recordings (D1 + R2-backed)

**`/internal/meetings.html`** — every meeting entry has a **Recordings** section. Upload the
exported Zoom file (MP4/MOV/WebM video or M4A/MP3/WAV/OGG audio, ≤ 2 GB) and it plays back
inline for the whole team.

- **Metadata** lives in D1 (`meeting_recordings` table, `schema.sql`); the media file lives in
  the same private R2 bucket as note images (`solar-city-notes`), under the `recordings/` prefix.
- Uploads are **chunked** (25 MB parts via R2 multipart) through the founder-gated
  `/api/recordings`, so large Zoom files clear the Workers per-request body limit. Playback
  streams through the same endpoint with HTTP Range support, so seeking works in the player.
- Deleting a recording removes both the D1 row and the R2 object. Nothing is ever public —
  every method requires the founder session cookie.
- Provisioning (one-time, already-created bucket is reused): apply `schema.sql` per above —
  no new R2 bucket or binding needed.

### Company mailbox (D1 + Email Service)

**`/internal/mail.html`** — a shared inbox for `hello@` and `main@maccsyseng.com`, so the whole
team can read and reply from the company address instead of four personal Gmails.

- **Receiving** is handled by the `hello-fanout` Email Worker (`workers/hello-fanout/`), which
  forwards every message to the founders' Gmail inboxes **and** writes a copy to the `emails`
  table in D1. Forwarding is the priority: a D1 failure is logged and never costs a delivery.
- **Sending** goes through the Email Sending **REST API** (`/api/mail`), not a binding —
  Pages Functions only support a subset of bindings and `send_email` is Workers-only.
- **Attachments are metadata only.** Inbound file names/sizes are recorded so you know a file
  exists, but the bytes are not stored — open the forwarded Gmail copy to download them.
  Outbound mail is plain text, no attachments. **For SEC/government filings with PDFs, use a
  real mail client**; this is a convenience layer, not a system of record.
- Two extra secrets are required for sending (both scoped to Email Sending only):
  ```bash
  # API token with "Email Sending: Edit" on the account that owns maccsyseng.com
  npx wrangler pages secret put CF_API_TOKEN  --project-name solar-city-funnel
  npx wrangler pages secret put CF_ACCOUNT_ID --project-name solar-city-funnel
  ```
- Prerequisites: the domain must be onboarded for sending
  (`npx wrangler email sending enable maccsyseng.com`, which adds SPF/DKIM/DMARC records on the
  `cf-bounce` subdomain), and **Email Sending is Beta and requires a Workers Paid plan**.
  Receiving works on the free plan; only outbound needs the upgrade.

### Deploy note

Because Functions + the D1 binding must be detected, **always deploy from inside `funnel/`**:
```bash
cd funnel && npx wrangler pages deploy . --project-name solar-city-funnel --branch main
```
Deploying the directory from the repo root skips the Functions bundle (the `/api/*` routes
silently return the static HTML instead of running).
