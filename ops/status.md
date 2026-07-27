# ops/status.md — the ledger

**Updated:** 2026-07-28 · **Update cadence:** every Friday (CLAUDE.md §0)
**Owner:** _[founder name]_

> This is the single source of truth for every business/strategy/spend decision.
> If a number here is missing or older than 7 days, the relevant gate is treated as
> **UNMET** and we ask for the number instead of assuming (CLAUDE.md §0).

---

## 0. Mission & death clock

- **MISSION (north star):** 5 paid ₱99,500-package installs — **deposits banked, not
  promised** — by **2026-10-09**.
- **Weeks remaining to Mission date:** ~12 (as of 2026-07-19).
- **Death clock (Nvidia Way):** _we are **N** installs from being unable to continue._
  - Cash on hand: **TBD — founder to fill** ₱______
  - Monthly burn: **TBD — founder to fill** ₱______/mo
  - Runway: **N installs / ____ months** ← fill once cash + burn are known.

## 1. Traction ledger (only countable commitments — CLAUDE.md §1.4)

| Metric | Count | Notes |
|---|---|---|
| Paid deposits banked | **0** | Mission counts these only. |
| Signed contracts | 0 | |
| Site surveys booked | 0 | |
| Lead-form submissions | 0 | Funnel not yet instrumented (§4). |
| Homeowner story interviews logged (this week) | 0 | Filed in `ops/tree.md`. Scripts ready: `ops/interview-scripts.md`. |
| Installs energized | 0 | |

**Pipeline (sales-mode only, zombies excluded):** _none yet._

## 2. Gate status

| Gate | Requirement | Status (2026-07-19) |
|---|---|---|
| **Mission** | 5 paid installs by 2026-10-09 | **UNMET** — 0 / 5 |
| **Model A gate** (§1.2) | Mission met **AND** ≥₱400k Model B gross margin banked | **UNMET** — ₱0 banked |
| Scale spend gate (§4) | ≥2 real deposits from first lead batch | **UNMET** |
| Workshop-line gate (§5) | ≥10 installs/mo sustained 3 months | **UNMET** |
| IEC submission gate (§5) | In-house assembly beats landed tier-1 by ≥₱3/W at real volume | **UNMET / untested** |

**Consequence:** all in-house **panel/module manufacturing** is gated OFF. In-house
**system fabrication** (racking, harnesses, power boxes, cabinets — SC-05 §1) is un-gated
and begins with the first install.

## 3. Time split (50/50 rule — CLAUDE.md §1.3)

Last week traction % across founders: **TBD** (fill from `ops/t5t/`).
Until the ≥2-deposit bar is met, 50% traction is a **floor, not a ceiling** (§1.8).
> If team <50% traction last week → Mon+Tue next week are traction-only.

## 4. Logged decisions & overrides

| Date | Decision / override | Rule | Logged by |
|---|---|---|---|
| 2026-07-19 | Bootstrapped `ops/` ledger; parked in-house panel manufacturing behind §1.2 gate (pre-revenue, 0 installs). Chose in-house **system** fabrication as the un-gated margin lever. | §1.2, §5, §7 | AI + founder |
| 2026-07-19 | AI flagged a new "Founder Lessons" docs-site section (SC-12, `founders.html`) under §7's "Add/polish X on the docs site" row — no `ops/tree.md` hypothesis, no booked survey/deposit, and this week's traction split unlogged. Founder directed the AI to build it anyway ("I want you to build it but you can suggest on the presentation"), asked only for presentation input. Built as internal team-culture reading, explicitly labeled non-Mission and not customer-facing in the page copy itself, kept to a single page + assets with no new nav weight elsewhere. Traction work this week is unaffected — flag it if it starts consuming founder time earmarked for interviews/channel tests. | §7 ("Add/polish X"), §1.3 | AI + founder |

| 2026-07-23 | Added SC-14 "ERC & net metering" docs page at founder request. §7's "Add/polish X on the docs site" row checked: unlike SC-12 this one maps to an existing requirement — the permit / net-metering checklist §7 itself mandates on every quote ("permits and net-metering handled" table stakes), same class as SC-13 SEC registration. Research dated 2026-07-23; DU turnaround must be field-verified before quote templates promise dates. | §7, §3 table stakes | AI + founder |

| 2026-07-27 | Designed the **BANTAY support architecture** (SC-18, `/internal/support-moat`) at founder request — support as the primary moat, three tiers (free ≤48h / ₱600 ≤12h / ₱2,499 ≤1h), Signing Folio + Handover Box, published SLA with a self-paid penalty, road-density rollout. §7 "Add/polish X on the docs site" checked and **cleared**: this is not docs polish — warranty + service is a §3 **table stake** that must exist before the first quote is issued, and the deliverable that ships first is paper (contract tick-box, tier sheet, folio), which is a sales asset serving the Mission directly. All software (portal, scorecard, monitoring automation) explicitly gated behind install counts per §1.8. Three challenges raised and carried into the page as hard stops: (1) ₱2,499/mo = 30% of the flagship price per year, outside the residential corridor → re-aimed at livelihood/commercial, with a ₱6,000/yr prepay for homeowners (§3 corridor pricing); (2) no published response window until a licensed electrician/REE is retained with PRC number printed (§7 electrician row); (3) no loaner-inverter promise until a spare is physically in the workshop (§1.6 value gap). LIWANAG anti-islanding hard stop restated — no tier may imply brownout backup. Back-end line added to `ops/canvas.md` as HYPOTHESIS; attach-rate test pre-registered in `ops/channel-tests.md` (≥4 of first 10 signed customers tick a paid tier). Traction impact: the paper deliverables are sales assets, but if this starts eating interview/channel-test hours, flag it. | §7, §3, §1.6, §1.8, §2 | AI + founder |

| 2026-07-28 | **Bug found and fixed in production: `/api/lead` was discarding the site address.** The funnel form collected Address and `funnel.js` sent it, but the endpoint never read it and the `leads` table had no such column — so every address a homeowner typed was dropped. A site survey cannot be booked without it. Fixed, deployed, and verified end-to-end against production (test row created, address confirmed stored, row deleted). Same commit adds the two research fields §2 requires of the lead form — `current_solution` (what they already do about the problem; prior spend is the pain signal) and `interview_opt_in`. Schema migrates itself via the idempotent ADD COLUMN guard. Internal drawer now shows address as a maps link. | §4 (instrument before spend), §2 (lead form is a research instrument) | AI + founder |

| 2026-07-28 | Built a redesigned public landing page as a **design mock only** (Claude artifact, not deployed, cannot submit leads — artifact CSP blocks all network calls). Founder directed gating the package price behind the estimate form; AI flagged under §3 that publishing the fixed price inside the ₱80–100k corridor IS the Big-Fish-Small-Pond positioning and that "PM for price" is the pattern a scam-wary market distrusts, and proposed the "from ₱99,500 all-in" middle option. Founder's call stands; mock built price-gated, with the outcome (₱/mo saved, backup hours) promoted to the headline figure so §3's "outcome next to every price" survives. Carousel uses licence-clean stock, labeled as reference photos — no fabricated install or customer proof (§7). **Not ported into `funnel/index.html`; the live site is unchanged in design.** | §3, §7, §1.8 | AI + founder |

## 5. This week's Triple-A (CLAUDE.md §6)

- **Analyze — what did the market teach us this week?** _Nothing yet — pre-market._
- **Ask** — 3 homeowner story interviews (funnel has <10 leads, so interviews substitute).
- **Act** — one pre-registered fire test (see `ops/channel-tests.md`).

## 6. Open bootstrap tasks (CLAUDE.md §0)

- [ ] Fill cash / burn / runway (death clock) above.
- [x] Create the six `ops/` files.
- [ ] Mirror the Model A gate as a "Stage 0 — Model B revenue gate" row in `strategy.html` §1.
- [ ] List 3 candidate subdivisions/barangays + exact Facebook groups in `ops/channel-tests.md`
      **before the first peso of ad spend.**
- [ ] Replace funnel placeholder testimonials before any deploy (§7 — hard stop).
- [ ] Instrument the funnel end-to-end before any ad spend (§4).
