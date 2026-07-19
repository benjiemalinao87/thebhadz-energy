# Biliran recon toolkit — ground-truth the competitor strategy this week

**Doc:** field scripts · **REV A · 2026-07-19** · Owner: _[founder]_
Closes the §6 gaps in `docs/biliran-competitor-strategy.md`. Log every result back into
`ops/` (pointers at the end). **This is traction work (§1.3), not product.**

> Rules baked in: homeowner questions are **past-tense** (Mom Test — never "would you
> buy"). Competitor quotes are legitimate market research (§4 — their spend is free
> research); ask as a genuinely-interested homeowner for a real address, claim nothing
> false. BILECO is a factual process inquiry.

---

## 1. BILECO net-metering — call or visit the Naval office

**Why:** confirms our #2 wedge (we own the paperwork) and the calculator's buyback number.
**Where:** BILECO main office, Brgy. Caraycaray, Naval · FB: `bilecoofficial`.
**Who to ask for:** the engineering / net-metering / new-connections desk.

**Say:** "Good day — I'm looking into installing rooftop solar for a home here in Biliran
and I want to understand BILECO's net-metering process before anything else. Can you help
me with a few questions?"

**Ask (write the answers down):**
1. Does BILECO currently accept **net-metering applications** for residential rooftop solar?
2. What's the **step-by-step process** and what **forms/requirements** do you need from the
   homeowner? (single-line diagram, REE-signed plans, etc.)
3. How **long** does approval + meter change take, start to finish?
4. What is the current **export/buyback credit rate** (₱/kWh)? (Nearby Leyte ≈ ₱5.50/kWh —
   confirm BILECO's.)
5. Roughly **how many residential solar net-metering systems** have you already approved on
   Biliran? (Gauges how new/contested this is.)
6. Is there a **system-size cap** for residential (RA 9513 allows up to 100 kW)?
7. Who at BILECO is the **point of contact** for installer coordination?

**Also capture:** current **residential rate** on your latest bill (we have ₱12.95/kWh for
2026 — confirm) and note any **brownout/interruption advisories** posted at the office.

---

## 2. Competitor quote requests — reveal their price + our freight wedge

Send the **same request** to each so the answers are comparable. Use a real Naval address
and a real, simple spec: **~3 kWp on-grid (or 3 kW hybrid w/ small battery), GI/metal roof,
single-storey.** Goal: total all-in price **and** whether they'll even cross to Biliran +
what the freight/delivery adds.

### 2a. RK Energy — Facebook Messenger (`RKEnergyPH`)
> "Hi! I'm a homeowner in **Naval, Biliran** and I'd like a quote for a rooftop solar system
> — around **3 kW**, metal/GI roof, single-storey. A few questions so I can compare:
> 1) What's the **total installed price**, all-in?
> 2) Do you **service Biliran**, or only Leyte mainland? If you come here, is there a
>    **delivery/freight charge** on top?
> 3) Do you **handle the BILECO net-metering paperwork**, or is that on me?
> 4) What's the **warranty**, and if something fails, how long to get a technician here?
> 5) What **lead time** from downpayment to install?
> Thanks!"

### 2b. SolarStream — Viber / WhatsApp (**+63 947 678 1297**)
> Same message as above. (SolarStream doesn't list Biliran — their freight/barge answer to
> Q2 is exactly the number that proves our on-island advantage.)

### What each answer tells us
| Their answer | Our read |
|---|---|
| Total all-in price | Corridor evidence — is ₱99,500 credible vs their number? |
| Freight/delivery to Biliran | The surcharge we don't have (wedge #1). |
| "We don't service Biliran" | Confirms the uncontested pond. |
| "BILECO paperwork is on you" | Confirms wedge #2 (we handle it). |
| Warranty turnaround | Their across-the-strait weakness = our service story. |

> Do **not** copy their claims into our copy (§1.6/§4). This is intel, not a script to imitate.

---

## 3. Homeowner interviews — 3 this week (Mom Test, past-tense)

Talk to 3 Naval-area homeowners with a ₱8k+ BILECO bill. **Casual discovery — no pitch.**
The only ask allowed is an intro to another homeowner (§2). Snapshot within 24h, exact
quotes, into `ops/tree.md`.

**Ask about the past:**
- "Walk me through your **last brownout** — what happened, how long, what did it cost you?"
- "What have you **already done or bought** about the power here — genset, UPS, AVR, extra
  batteries?" *(no prior spend → weight the pain near zero)*
- "Can I see **last month's BILECO bill**? What's a normal month for you?"
- "Have you ever **looked into solar or gotten a quote** — what happened, what stopped you?"

**Classify each statement:** compliment / fluff / idea / **fact-or-commitment** (only the
last is data). "Ang mahal ng kuryente!" without a number or prior spend = fluff.

---

## 4. Two field sweeps (30 min each)

- **Naval hardware/electrical stores (2–3):** what panels/inverters/batteries are sold
  locally, at what price, which brands? → fastest local-sourcing option + read on the
  DIY-kit competition. Note prices.
- **Rooftop count:** drive/walk Naval + nearest barangays, **photograph every solar roof you
  see** (from public view). Each is proof the market is real + a future referral seed. Any
  installer branding visible? → chase it (possible on-island incumbent).

---

## 5. Where to log the results

| Finding | File |
|---|---|
| BILECO process, buyback rate, confirmed residential rate | `ops/status.md` (calculator rate) + `docs/biliran-competitor-strategy.md` §6 |
| Competitor prices + freight answers | `docs/biliran-competitor-strategy.md` §3 (replace "confirm" notes with real figures + date) |
| Homeowner quotes + classification | `ops/tree.md` interview log |
| Named barangays/FB groups that surfaced | `ops/channel-tests.md` slice list |
| Local hardware prices / any on-island installer | `docs/biliran-competitor-strategy.md` §3 Tier / §6 |

**Definition of done for the week:** BILECO net-metering process known · ≥1 competitor
all-in price + freight answer in hand · 3 homeowner interviews logged · slice list has 3
real named barangays + FB groups. That unblocks the first pre-registered channel test.
