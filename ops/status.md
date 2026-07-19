# ops/status.md — the ledger

**Updated:** 2026-07-19 (bootstrap) · **Update cadence:** every Friday (CLAUDE.md §0)
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
| Homeowner story interviews logged (this week) | 0 | Filed in `ops/tree.md`. |
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

_No Prime-Directive overrides on record. An override requires an explicit
"I understand rule N and am overriding it" logged here (CLAUDE.md precedence)._

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
