# ops/channel-tests.md — pre-registered channel tests

**Updated:** 2026-07-19 · Cadence: reviewed every Friday.

> Every test is pre-registered BEFORE launch (CLAUDE.md §2): hypothesis, budget,
> pass/fail number, end date. No pre-committed number = not evidence. Max **3
> concurrent** tests, each ≤₱12k and ≤3 weeks (§4). An unscored finished test blocks
> the next from starting. **No ad peso until the funnel is instrumented end-to-end (§4).**

---

## Bullseye — outer ring (all 19 channels, one sentence each)

Fill one plausibility sentence per channel before dismissing any (Traction). Engineers
overrate SEO/content and underrate what likely wins here: **direct sales, offline demo
events, Facebook community presence, referrals from visible rooftops.** _[to complete]_

## Middle ring — the 3 candidate tests (design before spend)

### Slice list — REQUIRED before first ad peso (§0 bootstrap)
Market = **Biliran province** (Naval + municipalities, BILECO). See
`docs/biliran-competitor-strategy.md`. List 3 candidate barangays/subdivisions + **exact**
Facebook groups (e.g. Naval community/buy-sell groups):
1. _[Naval-area barangay/subdivision] — FB group: __________ (members: ___, ₱8k+ BILECO bill? Y/N)_
2. _[barangay/subdivision] — FB group: ___________
3. _[barangay/subdivision] — FB group: ___________

**Local recon feeding this list (do first — `biliran-competitor-strategy.md` §6):** confirm
BILECO net-metering process; get RK Energy + SolarStream quotes for a Naval address (reveals
their freight surcharge = our corridor evidence); check for any on-island installer.

### Test 1 — (proposed) FB/Messenger lead ad
- **Hypothesis:** of homeowners in [slice] who see the savings-calculator ad, ≥__% submit
  a qualified lead at **≤₱500 per qualified lead** (§4 default).
- **Budget:** ≤₱12k · **End date:** ______ · **Owner:** ______
- **Pass/fail:** ≥__ qualified leads at ≤₱500 CPL. **Score:** _pending_
- **Precondition:** funnel + `lead.js` delivering + UTM attribution live.

### Test 2 — (proposed) community / offline demo day
- **Hypothesis:** a barangay/HOA demo day with a touchable panel+inverter+battery rig
  books **≥5 site surveys** per test window (§4 default).
- **Budget:** ≤₱12k · **End date:** ______ · **Owner:** ______
- **Pass/fail:** ≥5 surveys booked. **Score:** _pending_

### Test 3 — (reserve slot)
- _Do not start until Test 1 or 2 is scored (§4)._

## Offer test — BANTAY support-tier attach rate (SC-18)

Not a channel test and **does not consume a middle-ring slot** — it runs on the contract
itself, at the real price, with zero ad spend. Pre-registered here because §2 requires a
committed number before launch and results may not be reinterpreted afterward.

- **Hypothesis:** of the first **10 signed customers**, **≥4 tick a paid support tier at
  contract signing** (BANTAY PLUS ₱600/mo or the ₱6,000/yr prepay; BANTAY 24 ₱2,499/mo
  counts only for livelihood/commercial buyers).
- **Instrument:** a tier tick-box printed on the contract + the sealed 90-day PLUS trial
  card in the Signing Folio. Attach recorded at signing, conversion recorded at day 90.
- **Budget:** ≤₱3,000 (print + folio materials, hand-assembled, 5 copies) · **Owner:** ______
- **End condition:** 10 signed customers, or 2026-12-31, whichever first.
- **Pass:** ≥4/10 attach → build the customer status portal + monitoring automation.
- **Fail:** <4/10 → the price or the framing is wrong; re-run `ops/positioning.md`
  **before** building anything (§3 re-position on evidence).
- **Secondary number (day-90 trial conversion):** ≥50% of trial starts convert to a paid
  month. Below that, the free tier is doing the job and the paid rung needs redesign.
- **Banned in the ask (§2):** "would you pay ₱600 for faster support?" The tick-box on a
  real contract at a real price is the only admissible evidence.
- **Score:** _pending — 0/10 signed customers as of 2026-07-27._

## Scale gate (§4 — do not scale a leaky bucket)

No spend beyond the first test budget until **≥2 leads from the first batch pay a real
deposit at the real ₱99,500.** A hundred cheap leads for an offer nobody pays for is a
failed offer, not a working channel.

## Referral loop instrumentation (§4)

- Yard signage during installs · photographed handover post (with permission)
- **₱3,000 referral fee** per closed neighbor · referral source logged on every lead.
