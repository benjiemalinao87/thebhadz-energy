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
│   ├── _auth.js               # accounts, passwords, sessions, activity log (shared)
│   ├── api/
│   │   ├── _middleware.js     # gate + audit: authenticates /api/*, logs every write
│   │   ├── lead.js            # POST /api/lead  (public) → validate + insert into D1
│   │   ├── leads.js           # GET/PATCH/DELETE /api/leads (founder-gated) → pipeline data
│   │   ├── notes.js           # GET/POST/PATCH/DELETE /api/notes (founder-gated) → team notes
│   │   ├── note-image.js      # POST upload / GET serve note images (founder-gated, R2)
│   │   ├── founder-login.js   # POST {email,password} → open a session
│   │   ├── founder-logout.js  # end the session server-side + clear cookie
│   │   ├── session.js         # GET who am I · POST change own password / name
│   │   ├── users.js           # account admin (MASTER ONLY): create/edit/disable/delete
│   │   └── activity.js        # audit trail (all founders for master, own rows otherwise)
│   └── internal/_middleware.js  # gate: valid session or redirect to /login
├── wrangler.toml              # D1 binding (DB) + R2 binding (NOTES_R2 → solar-city-notes)
├── schema.sql                 # leads, notes, finance, install-ops + users/sessions/activity
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
There are two ways in: **each founder's own email + password**, or the **shared team
password** (`FOUNDER_PASSWORD`) via "Use the shared team password instead" on the login
screen. Both open a normal session; the difference is whose name ends up in the activity
log. Once signed in, everything under **`/internal/*`** unlocks:

- **`/internal/`** — the Command Center dashboard.
- **`/internal/leads.html`** — the premium **leads pipeline** board.
- **`/internal/team.html`** — **SC-15 Team & access**: your own password, and (master only)
  the founder accounts plus the whole team's activity log.
- **`/internal/overview.html` … `market.html`** — the internal engineering/strategy file.

### Accounts and roles

**The founders are equals — there is no owner account.** Every founder login is a
`master`: full access to everything, account administration, and the whole activity log.
No single address is privileged, and any founder can edit or delete any other's account.
The audit trail, not a permission wall, is what makes that accountable.

| Role | Can do |
|---|---|
| **master** (the default for a founder) | All tools, plus create / rename / disable / delete accounts, reset passwords, change roles, set what each account can see, switch shared access on and off, and read the **entire** activity log. |
| **founder** (the *limited* login) | All tools that are visible to it, but only its own activity and no account administration. This is what installers, interns and bookkeepers get. |
| **shared login** — `team@macc-inc.com` (env `SHARED_LOGIN_EMAIL`) | What the shared team password signs you in as: an ordinary limited account, listed in the Accounts table like any other. It can never be a master, has no password of its own to reset, and cannot be deleted — disable it to switch shared access off. |

Guard rails, enforced server-side in `functions/api/users.js` — not just hidden in the UI:
there is always ≥1 active master; nobody can delete or disable the account they're signed in
with; the shared login can only be renamed or disabled (never promoted, re-emailed,
re-passworded or deleted); and Team & access itself can never be hidden from anyone, because
that is where each person changes their own password.

### Hiding sections from an account

`Team & access → Accounts → Sections` sets, per account, which parts of the Command Center
exist for them — for an installer who should see Install Operations but not the books, or an
intern who should see notes and research but not the mailbox. Quick-start presets for
Installer / Intern / Bookkeeper prefill sensible ticks.

This is a **real boundary, not a hidden menu**. The section registry
(`functions/_pages.js`) maps each section to its pages *and* its API paths, and both
middlewares check it: `/internal/finance` returns 403 and `/api/finance` returns 403 for an
account with Finance unticked. The sidebar and the dashboard's cards and metric tiles for
that section also disappear, so nobody is teased with links they can't open.

**The honest cost of the shared password:** actions taken through it are logged as "Shared
team login", so the audit trail can tell you *what* happened but not *who* did it, and one
leaked string is a way in for anyone who has it. Personal logins are what make the log
answer "who". Both are supported deliberately — use personal logins by default and keep the
shared one for the workshop tablet, a phone with no account yet, or an urgent hand-off.

### How the gate works (genuinely private)

- **Passwords** are PBKDF2-SHA256 with a per-user salt, stored as
  `pbkdf2-sha256$<iterations>$<salt>$<hash>`. The iteration count lives inside the string, so
  changing `PASSWORD_ITERATIONS` never invalidates existing hashes. Minimum 10 characters.
- **Sessions live in the database** (`user_sessions`). The cookie `sc_founder` carries only
  `<sessionId>.<HMAC-SHA256(sessionId, AUTH_SECRET)>`, so a forged cookie is rejected without a
  database hit, and disabling an account, deleting it, or resetting its password **kills its open
  sessions on the next request**. Sessions last 12 hours and slide forward while you work.
- `functions/internal/_middleware.js` runs before *any* `/internal/*` file is served. No valid
  session → 302 redirect to `/login.html?next=…`. Doc and board files are never served
  unauthenticated.
- `functions/api/_middleware.js` authenticates every `/api/*` call (except the public
  `/api/lead` and the login/logout endpoints), refuses the APIs of sections hidden from that
  account, **and writes an `activity_log` row for every POST/PATCH/PUT/DELETE** — actor,
  action, record, HTTP status. It's central so no endpoint can forget either.
- **The shared password goes through the same machinery.** A password-only submit is compared
  (constant-time) against `FOUNDER_PASSWORD` and opens a session on the shared-login account —
  it does not bypass sessions, revocation, or the audit trail. Two switches turn it off: disable
  the shared login on Team & access (instant, and signs out everyone using it), or remove the
  `FOUNDER_PASSWORD` secret entirely.
- Repeated failures: 8 wrong passwords locks a personal account for 15 minutes (the master can
  unlock it from Team & access). The shared login locks after 20 instead — it's the whole team's
  way in, so one guesser must not be able to shut everybody out. An unknown email and a wrong
  password return the same message, so the form can't be used to discover who has an account.
- Note authorship and "who sent this email" now come from the session, not the request body —
  which is exactly why shared-login work reads as "Shared team login" everywhere.

### Secrets (set once, in Cloudflare)

```bash
# The initial master password — used ONCE to seed benjiemalinao87@gmail.com, then the
# database row is authoritative and this variable does nothing.
echo -n "A_STRONG_MASTER_PASSWORD" | npx wrangler pages secret put MASTER_PASSWORD --project-name thebhadz-energy
# Signs session cookies. Regenerate to sign everyone out (passwords are unaffected).
openssl rand -hex 32 | npx wrangler pages secret put AUTH_SECRET --project-name thebhadz-energy
# The shared team password. Rotate it here; unset it to switch shared access off for good.
echo -n "THE_SHARED_TEAM_PASSWORD" | npx wrangler pages secret put FOUNDER_PASSWORD --project-name thebhadz-energy
# Optional: different master or shared-login address, or cheaper hashing if you hit the
# Workers Free 10 ms CPU limit at login (error 1102). Iterations default to 100000.
npx wrangler pages secret put MASTER_EMAIL --project-name thebhadz-energy
npx wrangler pages secret put SHARED_LOGIN_EMAIL --project-name thebhadz-energy
npx wrangler pages secret put PASSWORD_ITERATIONS --project-name thebhadz-energy
```
Secrets only apply to **new deployments** — redeploy after changing them. If `MASTER_PASSWORD`
is unset, `FOUNDER_PASSWORD` doubles as the master's one-time seed password — so set
`MASTER_PASSWORD` if you don't want those two to start out the same.

### First deploy of per-founder auth (one-time)

1. Set `MASTER_PASSWORD` + `AUTH_SECRET` (keep `FOUNDER_PASSWORD` as-is if you want shared
   access to keep working), then deploy.
2. Sign in at `/login.html` as `benjiemalinao87@gmail.com`. The master account is created on
   that first sign-in; the `users` / `user_sessions` / `activity_log` tables are created on
   demand too, so a forgotten `schema.sql` run can't lock the team out.
3. On **`/internal/team.html` → Accounts**, add each founder with a temporary password and pass
   it to them over a channel you trust. They must replace it on first sign-in (they land on the
   change-password panel automatically).
4. Everyone is signed out once by this deploy — the cookie format changed — but the shared
   password still gets them back in, so nobody is stranded while you create accounts.
5. When the team is fully on personal logins, switch shared access off (Team & access →
   "Switch off shared access", or drop the `FOUNDER_PASSWORD` secret).

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
- Two extra secrets are required before the Compose box can send. **Set them on
  `thebhadz-energy`** — that is the project actually serving the live site
  (`www.badjjengineeringenergy.com`); `solar-city-funnel` is a stale leftover and
  secrets put there have no effect:
  ```bash
  # Create the token first: Cloudflare dashboard -> My Profile -> API Tokens,
  # custom token with permission "Email Sending: Edit" on this account.
  npx wrangler pages secret put CF_API_TOKEN  --project-name thebhadz-energy
  # Account id that owns maccsyseng.com:
  echo -n "b386322deca777360835c0f78dae766f" | npx wrangler pages secret put CF_ACCOUNT_ID --project-name thebhadz-energy
  ```
  Until both are set, Compose returns "Sending is not configured" — receiving is
  unaffected. Note the wrangler CLI can send without a token (it uses your OAuth
  login), so `wrangler email sending send` working does **not** mean the UI will.
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
