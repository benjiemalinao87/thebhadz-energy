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
│   │   ├── founder-login.js   # POST → verify password, set signed cookie
│   │   └── founder-logout.js  # clear cookie
│   └── internal/_middleware.js  # gate: valid cookie or redirect to /login
├── wrangler.toml              # D1 binding (DB → solar-city-leads)
├── schema.sql                 # leads table schema
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
6. **Proof** — testimonials (placeholder — swap for real ones ASAP; social proof converts hardest).
7. **FAQ** — handles price, financing, savings, typhoons, warranty, paperwork objections.
8. **Lead form** — the goal: name + mobile + goal (required), bill range / package / financing
   (optional). Package CTAs deep-link here and pre-select.
9. **Final CTA + sticky mobile bar** — urgency close, always-visible mobile button.

Every CTA points to the single conversion action: **the free savings estimate.**

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
- **Testimonials** — currently representative examples with shortened names. Swap in real,
  permissioned customer quotes; this section drives the most lift.
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

### Deploy note

Because Functions + the D1 binding must be detected, **always deploy from inside `funnel/`**:
```bash
cd funnel && npx wrangler pages deploy . --project-name solar-city-funnel --branch main
```
Deploying the directory from the repo root skips the Functions bundle (the `/api/*` routes
silently return the static HTML instead of running).
