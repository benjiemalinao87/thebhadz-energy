# Solar City

Interactive technical documentation for designing, building, and scaling production of
our own ~400W residential solar panels (module assembly from purchased cells — cell
fabrication itself is out of scope).

## What this repo is

A static site (plain HTML/CSS/JS + D3, no build step, no framework) that a technical
team uses as the working manual for the manufacturing effort. Open `index.html` in a
browser — everything must work from the local filesystem with no server and no network
(D3 is vendored locally, never loaded from a CDN).

## Sections

1. **Interactive panel designer** (`designer.html`) — choose cell format (M10/G12,
   half-cut), string layout, series/parallel config → live D3 diagram of the panel
   layout plus computed Voc, Isc, Vmp, Imp, wattage, and physical dimensions.
2. **Step-by-step build guide** (`build-guide.html`) — hand-building the prototype:
   tabbing, stringing, layup (glass/EVA/cells/EVA/backsheet), lamination, framing,
   junction box, testing (flash/EL/hipot).
3. **Bill of materials + suppliers** (`bom.html`) — full parts list with real supplier
   options and costs, Philippines / SE Asia sourcing focus (plus China-direct import).
4. **Manufacturing & logistics strategy** (`strategy.html`) — the three-stage roadmap:
   DIY prototype → small-batch workshop line → full factory. Equipment vendors and
   capex, certifications (IEC 61215/61730, PH standards, DOE/BOI/PEZA angles),
   packaging, freight, distribution channels.
5. **Source & install** (`sourcing.html`) — "Model B": buy what's uneconomical to
   reproduce (panels, inverters, batteries), fabricate racking/boxes/harnesses, and earn
   as the installer. Buy-vs-build table, install ops, unit economics. Stage-0 revenue
   that funds Model A and becomes its sales channel.
6. **Market, packaging & pricing** (`market.html`) — segments, named packages
   (LIWANAG on-grid / ILAW off-grid / SANDIGAN hybrid), the ₱99,500 homeowner flagship
   inside the ₱80–100k window, pricing ladder, and marketing plan.

The company runs TWO models in parallel: Model A (build our own modules, SC-01…04) is
the long-term moat; Model B (source & install, SC-05…06) is the near-term revenue engine
and sales channel. The overview page (SC-00) frames both.

## Customer funnel (`funnel/`)

Separate self-contained conversion funnel (NOT part of the SC engineering file — different
visual system, warm/sunlit, mobile-first). Single landing page selling the three ₱99,500
homeowner packages, ready to deploy to **Cloudflare Pages**. Structure:
- `funnel/index.html` — landing page (hero → pain → packages → steps → proof → FAQ → lead form → CTA).
- `funnel/assets/funnel.css`, `funnel.js` — styles + form logic (validation, package pre-select,
  UTM capture, submit with graceful fallback).
- `funnel/assets/img/{liwanag,ilaw,sandigan}.svg` — hand-built persuasive package images (self-contained SVG).
- `funnel/functions/api/lead.js` — Cloudflare Pages Function for lead capture (validates + optional
  KV / Slack / email delivery via env vars; acknowledges even with nothing wired).
- `funnel/_headers`, `funnel/README.md` — CF headers + full deploy/wire-up instructions.

Funnel conventions: keep it fully self-contained (no CDN/external requests — CF Pages serves
static). Placeholders to replace before launch are listed in funnel/README.md (phone number,
Messenger link, real testimonials, analytics pixel, confirmed prices).

## Two sites, one content source — DO NOT hand-edit generated pages

The engineering-file content exists in **two site trees** that must render identically apart
from branding and link paths:

- **Root site** (this directory) — public-facing brand "Solar City", relative paths
  (`assets/…`), deployed as its own static site.
- **`funnel/internal/`** — the founder/team Command Center, brand "BADJJ Energy Systems"
  (BADJJ logo, absolute `/internal/…` paths, founder-auth-gated), deployed as part of the
  `funnel` Cloudflare Pages project. Your team works from here day to day.

These two trees **used to be hand-copied** and drifted badly (8–93 line diffs per page,
including a missing Founder-OS-mandated strategy.html row and five pages entirely absent
from the internal Command Center). That's fixed structurally now:

- **`content/*.html`** — the single source of truth. One `<main>` body partial per shared
  page (no `<main>` wrapper, no sidebar, no `<head>` — just the doc content). Body copy
  uses the `{{BRAND}}` token wherever the product name should switch between "Solar City"
  (root) and "BADJJ" (internal) — e.g. "branded {{BRAND}} power boxes."
  - `content/<id>.head.html` — optional per-page inline `<style>` block for that page's `<head>`.
  - `content/<id>.scripts.html` — everything that goes after `</main>` (trailing `<script>` tags).
  - `content/pages.json` — the registry: which pages exist, their SC-code + nav label, output
    filename per site, extra `<link>` tags, and footer variant (`standard` or `biliran`).
- **`templates/shell.html`** — the one page shell (head / sidebar / nav / footer / main slot /
  trailing scripts), parametrized per brand.
- **`scripts/build-pages.mjs`** — the generator. No dependencies (Node built-ins only,
  matches the repo's no-build-step philosophy — this is a pre-commit generation pass, not a
  runtime build). Reads `content/` + `templates/shell.html`, writes both the root `.html` file
  and its `funnel/internal/` twin.

**Workflow: edit `content/<id>.html` (or `.head.html` / `.scripts.html`), then run
`node scripts/build-pages.mjs`, then commit both the content change and the regenerated
HTML.** Never hand-edit the `<main>` body of a page in `content/pages.json` directly at its
root or `funnel/internal/` location — that edit will be silently overwritten (and drift right
back) the next time someone runs the generator. Run `node scripts/build-pages.mjs --check`
in CI / pre-commit to fail the build if generated output is stale.

**Adding a new shared page:** write `content/<id>.html`, add an entry to
`content/pages.json` (id, titleBase, rootFile, internalFile, footer, navCode, navLabel,
extraLinks), run the generator — both sites' nav and content update from one edit.

**Pages intentionally excluded from this system** (kept hand-maintained separately per
site — do not try to unify them):
- `projects.html` — root's is a static doc-styled page; `funnel/internal/projects.html` is
  a different, live D1-backed CRUD board with its own layout (no shared shell).
- `index.html` — root's is the SC-00 overview hero page (its content partner is
  `content/overview.html`, output to root as `index.html`); `funnel/internal/index.html` is
  the bespoke Command Center dashboard, structurally unrelated.
- Founder-tools-only pages (`finance.html`, `install-ops.html`, `founder-lab.html`, `leads.html`,
  `meetings.html`, `notes.html`, `principles.html`, `strategy-deck-*.html`) exist only inside
  `funnel/internal/` — there is no root twin, nothing to unify.

## Audience & tone

Written for engineers/technicians who will execute. Lead with specs, tolerances, and
process parameters. Explain solar-specific terminology once, then use it. No marketing
copy.

## Key project facts

- Target panel: standard residential ~400W (half-cut monocrystalline, glass + aluminum
  frame). The build guide may recommend a smaller trainer panel as step zero, but the
  400W module is the product target.
- Sourcing/manufacturing region: Philippines, with SE Asia / China-direct supply chain.
- Supplier names, prices, and freight data must be research-backed and dated (prices
  change fast) — mark unverified figures explicitly.
- Deployment: local-only for now. Keep the site fully self-contained so hosting later
  (Cloudflare Pages, Railway, anywhere static) is a copy operation.

## Conventions

- Plain HTML/CSS/JS. Vendored `vendor/d3.min.js`. No package.json, no bundler.
- Shared styles in `assets/style.css`; shared nav/layout JS in `assets/site.js`.
- Each page must be readable standalone (deep-linkable) and work offline.

## Founder Operating System (Strategy & Decision Guidelines)

Distilled from the founders' ten-book canon: Traction (Weinberg/Mares), The Innovator's
Dilemma (Christensen), Blue Ocean Strategy (Kim/Mauborgne), Obviously Awesome (Dunford),
The Mom Test (Fitzpatrick), The Nvidia Way (Tae Kim), The Startup Owner's Manual
(Blank/Dorf), Product-Led Growth (Bush), Continuous Discovery Habits (Torres), and
Ready, Fire, Aim (Michael Masterson — pen name of Mark Ford). Ready, Fire, Aim sets the
tempo only where a missed shot is reversible; every gate below marks a place where it
is not.

**How the AI must use this section.** This is a standing filter on ALL business,
strategy, product, pricing, marketing, and spend work in this repo — not reference
material. Before executing any request that touches what to build, sell, price, publish,
or spend: (1) read `ops/status.md` (the ledger); if a needed number is missing or older
than 7 days, treat the relevant gate as **UNMET** and ask for the number instead of
assuming. (2) Check the request against the Red Flags table (§7) — the table outranks
the §1–6 prose. (3) When a rule fires, say so, cite it, and propose the compliant
alternative. Bias every ambiguous call toward whichever option produces a countable
commitment (§1.4) soonest — a lead submitted, a survey booked, a deposit paid.

**Precedence:** honesty/safety rules (value gap, fabricated proof, legal readiness) are
never overridable in chat. A Prime Directive is overruled only by an explicit "I
understand rule N and am overriding it," which the AI logs in `ops/status.md`. When two
rules conflict, cite both and ask — never pick silently.

Numbers marked ▸ are house defaults committed at adoption (2026-07-11); revise any of
them only via a logged decision in `ops/status.md`. A rule whose threshold is still
missing is applied at its strictest reading.

### 0. Mission and ledger

**MISSION (the single north star — every other rule references this, never a different
number):** ▸ 5 paid ₱99,500-package installs — deposits banked, not promised — by
2026-10-09. Anything not on the Critical Path to it is deferred every Monday
(Traction: Critical Path).

**Stage map (Ready, Fire, Aim — the $ bands are Masterson's):** Infancy $0–1M revenue
(one problem: no proven sale yet), Childhood $1–10M (many products), Adolescence
$10–50M (systems), Adulthood $50M+ (re-entrepreneurialize). $1M ≈ ₱56M at ~₱56/$
(2026-07) ≈ 500+ flagship installs — a descriptive band, not a target; the Mission
number is the only target. Solar City is Stage One for its entire planning horizon,
and Stage One's whole job is the Mission's first paid installs. Everything the later
stages license — product proliferation, specialist hires, management systems, and (in
RFA's terms) the Model A panel line as a Stage Two "new product" — stays out of scope
until the §1.2 gate (Mission met AND ▸ ₱400k banked Model B margin) and the §5
stage-gate numbers unlock it. Stage gates stay numbers, not dates (§5).

The ledger and working artifacts live in `ops/` (plain markdown, committed):

- `ops/status.md` — cash, runway stated as "we are N installs from being unable to
  continue" (Nvidia Way: death clock), paid deposits/installs, last week's hours split,
  interviews logged, gate status, logged decisions/overrides. Updated every Friday.
- `ops/channel-tests.md` — pre-registered channel tests: hypothesis, budget, pass/fail
  number, end date, score.
- `ops/positioning.md` — current positioning canvas (Obviously Awesome, component order).
- `ops/tree.md` — opportunity solution tree rooted in the Mission (Continuous Discovery).
- `ops/canvas.md` — Business Model Canvas, each box labeled HYPOTHESIS or EVIDENCED
  (Startup Owner's Manual).
- `ops/t5t/` — each founder's weekly Top-5 bullets (Nvidia Way), ending with their
  traction-vs-product hours.

**Bootstrap (do once, this week):** create the six `ops/` files; mirror the Model A gate
(§1.2) as a "Stage 0 — Model B revenue gate" row in strategy.html §1 (its current stage
gates are technical-only and would otherwise authorize Model A progression with zero
installs); replace the funnel's placeholder testimonials before any deploy (§7); list
▸ 3 candidate subdivisions/barangays + their exact Facebook groups in
`ops/channel-tests.md` before the first peso of ad spend.

### 1. Prime Directives

1. **Search, not Execute** (Startup Owner's Manual). Solar City is pre-revenue: the job
   is to find a repeatable, paid sale of the ₱99,500 packages — not to scale, not to
   manufacture. The Mission is the boss (Nvidia Way).
2. **Model A is gated, not scheduled.** ▸ No Model A spend over ₱20k per item, no cell
   orders beyond 40 trainer cells, no workshop lease, no IEC 61215/61730 submission
   spend until the Mission is met AND ≥₱400k Model B gross margin is banked
   (ledger-verified; forecasts and pipeline count as zero). Rationale:
   discovery-driven planning — a plan to learn, not a schedule (Innovator's Dilemma);
   premature scaling kills startups (Blank). Model B funds Model A the way GeForce
   funded CUDA (Nvidia Way) — noting honestly that Jensen force-fed CUDA *ungated*
   because GeForce cash flow already existed; we don't have our GeForce yet, so we
   gate. Trainer-panel R&D continues inside a fixed cap: ▸ 1 founder-day/week plus
   trainer-quantity materials.
3. **50/50 time split, measured** (Traction: the 50% Rule). Each founder's Friday T5T
   ends with their hours split. Traction = ads, group posts, Messenger replies,
   surveys, quotes, installs, AND funnel/instrumentation work that directly serves the
   Mission (savings calculator, lead delivery, UTM events). Product = designer, build
   guide, BOM, prototype, docs. Team under 50% traction last week → ▸ Monday and
   Tuesday of the next week are traction-only. Until §4's ▸ 2-deposit bar is met, 50%
   traction is a floor, not a ceiling — see §1.8.
4. **Only countable commitments are evidence** (Mom Test; Blank): lead-form
   submissions, booked site surveys, paid deposits, signed contracts. Likes, comments,
   compliments, "my tito wants one" — inadmissible in any decision.
5. **Never bet more than one-third of cash on a single unvalidated commitment** (house
   rule implementing Innovator's Dilemma: conserve enough resources to be wrong
   twice). Anything bigger is a bet-the-company move — name it, then propose the
   staged version.
6. **Never promise what the package doesn't deliver** (PLG: the value gap kills
   word-of-mouth). Hard stop on any brownout-backup implication for LIWANAG (on-grid —
   anti-islanding shuts it off in an outage). Same class: no fabricated testimonials,
   ratings, or install counts, anywhere, ever — in a scam-wary Facebook market, one
   betrayed customer taxes every future lead.
7. **A week must ship** (Nvidia Way; Torres). Every week: ≥1 customer-facing action
   (install advanced, quote delivered, funnel experiment live) AND ≥1 homeowner story
   interview by a founder. A week of only internal work is a missed release, flagged
   in Monday review.
8. **Ready-Fire-Aim velocity** (Ready, Fire, Aim). For anything reversible within
   ▸ one week at zero customer harm — funnel copy, calculator logic, package framing,
   Messenger scripts, ad creative, the quote process — the sequence is fixed: READY =
   the smallest version a real buyer can say yes to; FIRE = a real offer at the real
   price in front of real PH homeowners; AIM = refine only on sales data (§1.4
   countable commitments), never on internal taste. Perfecting anything no buyer has
   seen is banned — a second polish pass on an unlaunched thing is the classic Stage
   One mistake. Reconciliations: until §4's ▸ ≥2-deposit bar is met, the §1.3 50%
   traction split is a FLOOR, not a target — selling wins every tie (Masterson's 80%
   rule, bounded by the §1.2 trainer cap plus work needed to deliver a signed
   install). A fire test is still pre-registered in `ops/channel-tests.md` (§2) — RFA
   speeds the loop, it never skips the scorecard. Copy fires fast but still ships
   from the current `ops/positioning.md` (§3). And fire-now-fix-later NEVER applies
   to safety, honesty, or legality: the LIWANAG value gap (§1.6), fabricated proof
   (§7), the permit/electrician checklist (§7), and the IEC gate (§1.2, §5) all
   outrank velocity — there, a missed shot is a liability, not a lesson.

### 2. Customer truth & evidence

- **Ask about the past, never the future** (Mom Test). Banned in every script, survey,
  and ad: "would you buy / would you pay / do you like." Required shape: "What happened
  during your last brownout? What did it cost you? Show me last month's Meralco bill.
  Ever gotten a solar quote — what killed it?" The AI rewrites hypothetical questions
  before returning them.
- **Classify every reported customer statement** (Mom Test): compliment / fluff / idea /
  fact-or-commitment. Only the last is data. "Ang galing niyo!" = failed meeting; log
  it as such.
- **Pain requires prior spend** (Mom Test): if brownouts are "unbearable," ask what they
  already bought — genset, AVR, UPS, a competing quote. No prior attempt → weight the
  pain near zero.
- **Two conversation modes, never mixed** (Mom Test): *discovery interviews* stay casual
  — the only permitted ask is an intro to another homeowner, and they never enter
  pipeline counts. *Sales-mode interactions* (quotes, surveys, follow-ups) must end
  with a commitment ask — a survey date, an intro, a refundable reservation deposit;
  refused or dodged → zombie lead, excluded from the pipeline.
- **Interviews are a weekly founder habit** (Torres; Blank: get out of the building) —
  never delegated. Snapshot within 24h, exact quotes, filed on `ops/tree.md`. An
  interview not written up didn't happen.
- **Every belief is a hypothesis until tested** (Blank). Label claims HYPOTHESIS in
  written docs and ask for the interview count or deposit data behind them. The
  cheapest 7-day in-market test beats analysis — markets that don't exist can't be
  analyzed (Innovator's Dilemma).
- **Pre-register every test** (Torres; Traction): "of X who encounter this, Y will do
  Z," written in `ops/channel-tests.md` BEFORE launch. No pre-committed number = not
  evidence, and results may not be reinterpreted afterward.
- **The lead form is a research instrument** (Torres; Dunford): capture "what are you
  doing about brownouts / your bill right now?", an interview opt-in, and which
  alternative they compared us to. Tag non-buyers by their relationship to home solar
  as a category (Blue Ocean: three tiers of noncustomers): (1) on stopgaps out of
  necessity — genset/UPS/enduring the bills; (2) considered solar and refused — price,
  scam fear, roof or renter issues; (3) never considered it. Mine commonalities across
  tiers, not one-off feature requests.

### 3. Positioning & offer design

- **Copy is downstream of positioning** (Obviously Awesome). No hero, ad, or Messenger
  script without a current `ops/positioning.md`, built in component order: competitive
  alternatives → unique attributes → value + proof → best-fit customer → market
  category → (last, optional) trend. "Meralco keeps rising, brownouts keep getting
  worse" is the why-now — usable only after the first screen answers "what is this?"
  (a fixed-price ₱99,500 home solar package, installed). A visitor who can't
  categorize us files us under "probably a scam."
- **The real alternatives** (Obviously Awesome): (a) do nothing / keep paying Meralco,
  (b) genset or UPS, (c) established installer at ₱150k+, (d) Shopee/Lazada kit +
  freelance electrician. An alternatives list containing only solar companies is
  invalid; "unique" means none of these four can claim it.
- **Style: Big Fish, Small Pond** (Obviously Awesome). We cannot win head-to-head
  against installers with track records while we have zero installs. The pond:
  **fixed-price home solar packages inside the ₱80–100k window**; LIWANAG/ILAW/SANDIGAN
  are the ladder within it. No create-a-new-category play until the pond is won AND
  the IEC cert exists.
- **Table stakes are exempt from ERRC — conform without debate:** tier-1 panels,
  honored warranty, typhoon-rated mounting, permits/net-metering handled, anti-scam
  trust signals. That is the market's minimum bar (Obviously Awesome: build to the
  market's standard; Innovator's Dilemma: in a commoditized industry the basis of
  competition shifts to reliability, convenience, price). **Above** the table-stakes
  line, every addition must pass ERRC (Blue Ocean): name what it Eliminates or Reduces
  to pay for what it Raises or Creates, and which buyer-experience stage
  (purchase/delivery/use/supplements/maintenance/disposal) it unblocks. Competitor
  parity alone never justifies an addition — divergence must come from the value curve
  as a whole.
- **Price from the corridor, cost backward** (Blue Ocean). ₱99,500 is justified by what
  the mass already pays for alternatives — genset + fuel, UPS, 3–5 years of Meralco
  bills — then the install BOM is target-costed to a stated margin. Cost-plus is
  banned in every spreadsheet; rebuild any sighted instance price-first.
- **Front end acquires, back end profits** (Ready, Fire, Aim). The ₱99,500 install is
  the FRONT END: it buys the customer relationship. Profit is lifetime value from the
  BACK END — annual cleaning/maintenance contracts, monitoring service, battery and
  SANDIGAN+ upgrades — each labeled HYPOTHESIS in `ops/canvas.md` until it clears its
  own pre-registered SKU threshold (§3 whole-cow rule); the Model A waitlist stays
  demand evidence only, never bookable revenue (§5). Deliberate departure from the
  book: RFA sanctions loss-making front ends to build a list — we don't, because in a
  scam-wary market a discounted flagship reads as corner-cutting. The front end holds
  the corridor price; the only sanctioned loss-leaders are free information artifacts
  — the savings calculator and the site survey (§4) — never the hardware. A front-end
  discount requires ALL of: an EVIDENCED back-end path written in `ops/canvas.md`, a
  price still inside the corridor, and a pre-registered experiment (§2) — and
  repeated ₱99,500 stalls trigger §3's positioning review BEFORE any discount.
  Because ₱99,500 sits ~₱50k under established installers, every ad and quote carries
  the one-line reason why: fixed package, standardized BOM, no showroom
  (direct-response "reason why" principle).
- **The lead list is an asset** (Ready, Fire, Aim). Every non-buyer enters a nurture
  list, tagged per §2's noncustomer tiers, with scheduled honest touches — nearby
  install photos, brownout-season check-ins, Meralco rate news. Ignoring a cold lead
  throws away back-end revenue; any price experiment against this list stays
  pre-registered (§2) and inside the corridor.
- **Outcome next to every price** (PLG: understand and communicate value). ₱99,500
  never appears without its outcome: projected ₱ saved/month (LIWANAG), hours of
  backup (ILAW/SANDIGAN). A price without its outcome is a bug.
- **Offer vs targeting vs SKUs — three layers, three rules.** The OFFER stays
  desegmented: exactly three fixed packages in the window (Blue Ocean: build on
  commonalities — bill pain, brownouts, scam fear, fixed budgets). TARGETING is sliced
  as narrowly as evidence demands: named subdivisions, ₱8k+ monthly bills, specific
  Facebook groups (Mom Test: a who-and-where, not "PH homeowners"). Whole-cow bins
  (Nvidia Way) — leads below/above the window mapped to "smaller brownout kit" /
  "SANDIGAN+" — are logged as demand *evidence only*; a new SKU exists only after its
  own pre-registered threshold (N leads in the bin + M paid deposits at a test price).
- **Headline test:** spec units — watts, efficiency %, cell counts, panel dimensions —
  go below the fold; peso amounts, backup hours, and bill-reduction percentages are
  exactly what headlines should carry. Lead with trust, fixed all-in price, brownout
  hours covered, typhoon durability (Innovator's Dilemma: performance oversupply — the
  spec race is the incumbents' game). Every piece of copy climbs the benefit ladder
  (Ready, Fire, Aim: feature → benefit → deeper benefit) and lands the deeper benefit
  — ₱ off the Meralco bill, safe clean power without genset fumes, lights and WiFi
  through the brownout. Copy that stops at equipment features fails; the ladder never
  licenses claim inflation — §1.6 still binds.
- **Re-position on evidence** (Obviously Awesome): two consecutive weeks of
  weak-positioning symptoms — compared to Shopee kits, "so how are you different?",
  stalls at ₱99,500 — triggers a canvas review BEFORE discounts and BEFORE building
  anything. After the first 5–10 installs, interview every buyer on what actually
  closed them and re-run the full process.

### 4. Traction & channels

- **Bullseye outer ring** (Traction): all 19 channels get one written sentence on how
  each could plausibly work for PH residential solar before any is dismissed.
  Engineers overrate SEO/content and underrate what most likely wins here: direct
  sales, offline demo events (barangay/HOA demo day with a touchable
  panel+inverter+battery rig), Facebook community presence, referrals from visible
  rooftops. Fight the bias mechanically.
- **Imitate proven mechanics, diverge on the promise** (Ready, Fire, Aim; Blue Ocean).
  When ranking and designing channel tests, clone WHERE and HOW established PH solar
  and home-improvement players already advertise profitably — their Facebook groups
  and boost formats, posting cadence, offer structure (free survey, bundle pricing):
  their spend is free market research, and a mediocre ad in a proven spot beats a
  brilliant ad nobody sees. The line: channel mechanics and table stakes are copied
  without debate (§3); the value-curve promise must diverge per ERRC (§3); competitor
  CLAIMS are never copied — theirs aren't held to §1.6.
- **Middle ring:** max 3 concurrent tests, each ▸ ≤₱12k and ≤3 weeks, each with a
  pre-committed number in `ops/channel-tests.md` (▸ defaults: FB/Messenger lead ads
  ≤₱500 per qualified lead; community/offline ≥5 surveys booked per test window). An
  unscored finished test blocks the next test from starting.
- **Instrument before spend** (PLG; Traction): no ad peso until funnel/ is deployed,
  `funnel/functions/api/lead.js` actually delivers leads, UTM attributes every lead to
  its test, and stage events fire end-to-end: view → calculator → lead → Messenger
  reply → survey booked → signed → energized.
- **The free-trial analogue** (PLG; Traction: engineering as marketing): a public
  Meralco-bill savings calculator — bill in; savings, payback, and recommended package
  out; package pre-selected in the lead form. The canonical engineer-founder channel;
  collapses time-to-value from a week-long quote cycle to seconds.
- **Don't scale a leaky bucket** (PLG; Traction): no spend beyond the first test budget
  until ▸ ≥2 leads from the first batch pay a real deposit at the real ₱99,500. A
  hundred cheap leads for an offer nobody pays for is a failed offer, not a working
  channel.
- **Instrument the referral loop** (Traction: viral, translated to hardware): the
  visible rooftop plus the neighbor's brownout IS the viral mechanic. Yard signage
  during installs, a photographed handover post (with permission), ▸ ₱3,000 referral
  fee per closed neighbor, referral source logged on every lead.
- **Inner ring:** once one channel demonstrably converts to deposits, all traction
  effort goes there until cost per customer degrades; re-test 2–3 fresh channels
  quarterly regardless — channels saturate (Traction).

### 5. The two-model strategy (disruption & moat logic)

- **Model B's market type: existing market, re-segmented on low cost + trust** (Blank).
  Filipinos already know solar exists — we never budget for category education. We
  *prospect* the industry's noncustomers: brownout-weary homeowners with no solar and
  no competing quotes, whose real comparison is the Meralco bill and the genset. That
  is the low-end / new-value-network foothold incumbents happily cede (Innovator's
  Dilemma).
- **Model A's losing fight is spec parity.** "As good as tier-1, made by us" enters a
  commoditized, performance-oversupplied industry on the incumbents' terms
  (Innovator's Dilemma: the sustaining-technology race). Model A survives only in a
  different value network: locally honored warranty, PH typhoon field data, service
  turnaround, BOI/DOE angles, "assembled in the Philippines" trust. Those — never ₱/W
  parity — are the factory's gate criteria.
- **Stage gates are numbers, not dates** (Innovator's Dilemma: discovery-driven
  planning; Blank): ▸ workshop-line spend unlocks at ≥10 installs/month sustained 3
  months; ▸ IEC submission spend unlocks when a costed model at actual install volume
  shows in-house assembly beating landed tier-1 cost by ≥₱3/W. Each roadmap stage is a
  set of assumptions to test cheapest-first, not a schedule.
- **Test Model A's riskiest assumption for pesos, not capex** (Torres: an honest
  fake-door). The ONLY permitted pre-cert customer-facing Model A exposure is a
  clearly-labeled future-option line in real Model B quotes — "Solar City-built panel
  option (in development): join the waitlist" — with zero availability or performance
  claims. In every other customer-facing context the uncertified panel is anti-proof
  and stays out of the offer (Obviously Awesome). Build-in-public R&D content —
  founder-roof photos, an honest build log — is allowed, labeled R&D, never a product
  claim.
- **Buy the emulator before the tape-out** (Nvidia Way: RIVA 128): before any formal
  IEC submission, run pre-compliance thermal-cycling / damp-heat / mechanical-load
  trials on trainer panels at a local lab or DOST facility. A failed formal cert run
  is an unaffordable wasted spin.
- **Prototypes live where their attributes are acceptable** (Innovator's Dilemma):
  founders' roofs and the workshop, never a paying customer's roof pre-cert. Log
  monthly kWh, degradation, and storm survival — ▸ a monthly photo + kWh-produced post
  on the Solar City Facebook page, starting the month the first trainer panel is on a
  founder's roof. Eighteen months of typhoon field data becomes Model A's launch
  marketing.
- **Guard the ring-fence both ways** (Innovator's Dilemma: resource dependence).
  Pre-revenue, the romance of manufacturing starves the revenue engine; post-revenue,
  install customers will rationally starve Model A forever. The written split (§1.2,
  §1.3) decides allocation — not mood — reviewed weekly.

### 6. Cadence & culture

- **Speed-of-light dates** (Nvidia Way): every deadline derives from named physical or
  legal constraints — supplier lead time, permit/net-metering queue, EVA cure time,
  cert-lab queue. Padding not tied to a named constraint is challenged and deleted.
- **Pilot in command** (Nvidia Way): a named owner per live deliverable — the funnel,
  the first install, the current channel test, the BOM refresh. No name = not being
  done. Reviewed against its speed-of-light date weekly.
- **Friday T5T + canvas** (Nvidia Way; Blank): each founder posts five bullets of raw
  ground truth ≤7 days old — Messenger threads, leads, surveys, supplier calls — to
  `ops/t5t/`, ending with their hours split. The same meeting updates `ops/canvas.md`
  from field data and logs every iterate/pivot decision.
- **Weekly Triple-A sprint** (PLG; Ready, Fire, Aim): **Analyze** the funnel numbers,
  opening with one written sentence — "what did the market teach us this week?" —
  logged in `ops/status.md`; **Ask** ≥3 leads or lost deals why (until the funnel has
  produced its first 10 leads, substitute 3 homeowner story interviews per §2);
  **Act** with exactly one experiment against one metric — a live fire test: a real
  offer, price, or message in front of real homeowners this week, pre-registered per
  §2 (a variant inside a running channel test counts toward §4's 3-test cap, not
  beyond it). Exception: if Analyze names a broken instrumentation or lead-delivery
  step (§4), fixing that leak and relaunching IS the week's fire test.
- **Outcomes headline, outputs footnote** (Torres): weekly progress is reported as
  surveys booked, deposits paid, installs signed — never as pages shipped, panels
  laminated, or docs written.
- **Role coverage regardless of headcount** (Torres): three named owners —
  customer/interviews, offer/pricing, install/technical — assigned across however many
  founders exist (one person may hold two; no role may be unowned). All attend the
  weekly interview: all-engineer teams default every decision to feasibility, and
  feasibility is almost never our riskiest assumption.
- **No whether-or-not decisions** (Torres): every "should we do X?" becomes
  compare-and-contrast — 2–3 alternatives for the same opportunity, side by side,
  before any recommendation.
- **Public postmortems, then erase the whiteboard** (Nvidia Way): lost quote, cold
  lead, failed lamination — root cause stated bluntly to the whole team, lesson
  extracted, no defending prior pages, BOMs, or plans. No private founder status
  one-on-ones; decisions and bad news go to the group channel.
- **Onboard signed customers with bumpers** (PLG: bowling alley): milestone messages at
  survey done → design approved → permit filed → install date → energized → first
  lower bill, ending with a referral/testimonial ask. Prevent ability debt: the
  homeowner must understand the monitoring app, net-metering paperwork, and what to do
  on an inverter fault — or the debt compounds publicly on Facebook.

### 7. Red flags — when the AI must push back

This table is the enforcement layer; it outranks the §1–6 prose.

| Trigger in a request | Required challenge |
|---|---|
| Model A spend/work beyond the trainer cap (§1.2: ▸ 1 founder-day/wk, 40 cells, ₱20k/item) | State the gate (Mission + ▸ ₱400k banked margin) and its ledger status. Unmet → name it premature scaling (Blank); offer the cheapest gate-testing step or this week's highest-value traction task instead. |
| Model B fabrication tooling/inventory spend (racking jigs, stock) before the Mission is met | Same gate logic one level down — the engineer-builds-first trap in miniature. Propose off-the-shelf racking/boxes for the first 5 installs. |
| Deploying or boosting the funnel with placeholder testimonials, ratings, or install counts | HARD STOP (never overridable). Replace with verifiable proof — founder-roof photos, live build log, named early customers with permission — or remove the section. |
| A quote or deposit accepted without the permit / licensed-electrician sign-off / net-metering checklist | Block until the checklist exists and is attached to the quote template. |
| Any backup/brownout implication on LIWANAG | HARD STOP (value gap, §1.6). Correct the claim; keep the "what happens in a brownout?" row in the package comparison. |
| "People loved it / lots of comments / my kumpare wants one" cited as evidence | Classify aloud — compliment, fluff, or idea (Mom Test) — and ask for the countable number: leads, surveys booked, deposits paid. |
| Any "would you buy/pay/use" question in a script, survey, or ad | Rewrite as a past-specific story prompt before returning it; explain the false-positive risk. |
| A new marketing idea | Which of the 19 channels? What pre-committed number and end date in `ops/channel-tests.md`? A 4th concurrent test → which existing test dies? |
| An ad/boost spend request | Verify end-to-end instrumentation, instant time-to-value (calculator or same-day estimate), and the slice list (§0 bootstrap). Anything missing → block the spend; route effort to the leak. |
| "Add/polish X" on the docs site, designer, or BOM | Which hypothesis, which `ops/tree.md` opportunity, which booked survey or paid deposit within 60 days does it serve — and is the 50% traction split met this week? None → park it; propose the customer-facing alternative. |
| Copy leading with spec units or "as good as tier-1" | Rewrite to trust / fixed price / backup hours / typhoon durability / ₱ saved (peso amounts, backup hours, bill-% are welcome in headlines; watts and efficiency % are not). Flag spec-parity framing as the sustaining-race trap. |
| "Competitors all offer X, so we should too" | Is X on the table-stakes list (§3)? Then conform, no debate. Above it → demand the ERRC trade-off; a parity-only justification → recommend against. |
| Cost-plus pricing, or a price change driven from the BOM sheet | Rebuild price-first from the corridor (gensets, UPS, Meralco bills); require the change framed as a pre-registered experiment. |
| A proposed date or milestone with unexplained buffer | Demand the speed-of-light derivation: which physical/legal constraint sets the floor, what padding was added, why. |
| A single commitment consuming > 1/3 of cash (per ledger) | Name it a bet-the-company move; propose the staged version that leaves room to be wrong twice. |
| A test ended unscored; a pipeline full of "keep me posted" | No new test until the last is scored against its pre-registered number; label unadvanced leads zombies and draft the commitment ask. |
| Weak conversion diagnosed as "the product needs to be better" | Which weak-positioning symptom is it — wrong comparison, "so it's like X?", price stall, no-decision (Obviously Awesome)? Positioning review before any building. |
| A week with zero homeowner conversations or zero customer-facing shipments | Flag the broken week in Monday review; next week's first scheduled item is an interview or an install-advancing action, not code. |
| "One more week to polish before we launch/ship/post it" | RFA challenge (§1.8): what would firing THIS week look like, and which sales datum are we waiting on that polish can't answer? Reversible → fire the smallest sellable version now; a safety/legal/honesty concern → name the gate, not the polish. |
| A front-end discount or freebie with no evidenced back-end path | Block per §3 front-end/back-end: name the EVIDENCED back-end line in `ops/canvas.md`, keep the price inside the corridor, run it as a pre-registered experiment (§2) — or hold the price. Free calculator/survey are the only sanctioned loss-leaders. |
| A new offer or feature with no fire-test plan (campaigns route to the "new marketing idea" row) | Demand the smallest real-market test: what goes in front of which homeowners this week, at what pre-registered number (§2)? No fire plan → an unlaunched perfection project; park it. |
