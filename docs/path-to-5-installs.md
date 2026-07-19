# Path to 5 installs — the only plan that matters right now

**Doc:** Mission execution plan · **REV A · 2026-07-19**
**Mission:** 5 paid ₱99,500-package installs — **deposits banked, not promised** — by
**2026-10-09** (~12 weeks). Ledger: `ops/status.md`. Tests: `ops/channel-tests.md`.

> Everything else — including building materials in-house — is downstream of this number.
> With 0 installs and ₱0 banked, the Model A manufacturing gate (§1.2) is closed. This plan
> is how it opens: get to 5 paid installs and ≥₱400k Model B margin, then the factory
> conversation reopens **with cash to fund it.**

---

## The logic in one line

You don't have a manufacturing problem. You have a **first-paying-customer** problem.
5 deposits banked is the whole game this quarter.

## The funnel we must instrument BEFORE any ad peso (§4)

```
view → savings calculator → lead form → Messenger reply → survey booked → quote → DEPOSIT → install → energized
```

Every stage must fire an event and attribute to its channel test (UTM). No ad spend until
`funnel/functions/api/lead.js` actually delivers a lead end-to-end. Instrumentation counts
as **traction**, not product (§1.3).

## 12-week shape (gates are numbers, not dates — adjust as reality lands)

| Weeks | Focus | Countable target |
|---|---|---|
| **1–2 (now)** | Bootstrap + instrument. Fill cash/burn in `ops/status.md`. Finish the savings calculator + lead delivery. Pick 3 slices (subdivisions + exact FB groups) in `ops/channel-tests.md`. First 3 homeowner interviews. | Funnel live end-to-end; 3 interviews logged. |
| **3–5** | Fire Test 1 (FB/Messenger lead ad) into slice #1 + Test 2 (barangay/HOA demo day). Deliver quotes with the permit/electrician/net-metering checklist attached. | ≤₱500 CPL qualified leads; ≥5 surveys booked. |
| **6–8** | Convert surveys → deposits. Score every finished test against its pre-registered number. Fix the biggest leak the numbers name. | **First 2 deposits banked** (unlocks scale, §4). |
| **9–12** | Scale the one channel that converts to deposits. Install, energize, photograph handovers, trigger referrals. | **5 deposits banked → Mission met.** |

## Week-1 checklist (start here)

- [ ] Fill cash / monthly burn / runway in `ops/status.md` (the death clock).
- [ ] Finish + test the **Meralco-bill savings calculator** (bill in → savings, payback,
      recommended package out; pre-selects the package in the lead form). This is your
      engineer-founder superpower — collapses a week-long quote into seconds (§4).
- [ ] Wire `funnel/functions/api/lead.js` to actually deliver leads (KV/Slack/email) + UTM.
- [ ] List 3 subdivisions/barangays + their **exact** FB groups in `ops/channel-tests.md`.
- [ ] Attach the **permit + licensed-electrician + net-metering checklist** to the quote
      template (no deposit without it — §7 hard stop).
- [ ] Replace funnel placeholder testimonials, or remove the section (§7 hard stop).
- [ ] Book 3 homeowner story interviews (past-tense, Mom Test — see below).

## Interview script (Mom Test — ask about the past, never the future)

Banned: "would you buy / would you pay / do you like." Use:
- "Walk me through your **last brownout** — what happened, what did it cost you?"
- "What have you **already bought** about it — genset, UPS, AVR?" (no prior spend → pain ≈ 0)
- "Can I see **last month's Meralco bill**?"
- "Have you ever **gotten a solar quote** — what killed it?"

End sales-mode interactions with a commitment ask (survey date / intro / refundable
reservation deposit). Dodged → zombie lead, out of the pipeline.

## The offer discipline (so we don't undercut ourselves)

- Hold **₱99,500** — front end holds the corridor price; **no hardware discounts** in a
  scam-wary market (§3). The only sanctioned loss-leaders are the free **calculator** and
  the free **site survey**.
- Every price carries its **outcome**: ₱ saved/month (LIWANAG) or backup hours (ILAW/SANDIGAN).
- Lead copy with **trust, fixed price, brownout hours, typhoon durability, ₱ off the bill** —
  **not** watts and efficiency % (those go below the fold, §3).
- **No backup claim on LIWANAG** (on-grid; anti-islanding — §1.6 hard stop). Backup is
  ILAW/SANDIGAN only.

## What this plan deliberately does NOT do

- ❌ Build panels/modules in-house (gated, §1.2 — reopens after Mission + ₱400k banked).
- ❌ Buy fabrication tooling/inventory before the Mission (§7 — use off-the-shelf racking
      for the first 5 installs).
- ❌ Scale ad spend before 2 real deposits (§4 — don't scale a leaky bucket).

The in-house vertical-integration question is real and exciting — it's parked in a decision
memo for the day the gate opens, not abandoned. **First 5 deposits. Then we earn the factory.**
