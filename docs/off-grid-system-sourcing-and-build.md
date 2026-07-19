# Off-grid / hybrid solar power system — sourcing & step-by-step build

**Doc:** SC-05 companion · Model B (source & install) · **REV A · 2026-07-19**
**Scope:** the exact system in the reference diagram — solar panel → MPPT charge
controller → DC breakers → deep-cycle/LiFePO₄ battery → pure sine wave inverter →
AC & DC loads. This is the **ILAW (off-grid)** and **SANDIGAN (hybrid)** package
architecture, not the on-grid **LIWANAG** package.
**Currency basis:** ~₱56/$ (2026-07). **Site:** Philippines.

> **Price basis (read first).** Every peso figure below is dated **2026-07-19** and
> anchored to live PH listings (LakaSolar, Anakaraw, SolarMiner PH, pinas.solar,
> WattAttack, Lazada/Shopee). Solar component prices move monthly. Figures marked
> `EST` / *unverified* were not point-of-sale confirmed. **Re-quote every line item
> (3 quotes minimum) before ordering or before putting a price in a customer quote.**
> This is a negotiation and design baseline, not a catalog.

---

## 0. The system, in one paragraph

Sunlight hits the **panel**, which produces DC. The **MPPT charge controller** takes
that variable panel voltage and pushes a correct, current-limited charge into the
**battery** while protecting it from over/under-charge. A **DC breaker between panel
and controller** and a **second DC breaker between battery and inverter** isolate each
side for service and interrupt fault current. The **pure sine wave inverter** converts
battery DC (12/24/48 V) up to 220 V AC for home appliances; DC loads (5 V USB, 12 V
appliances) can tap the controller's load terminals or the battery bus directly. That
is the whole loop — the engineering is in **sizing** each block to the others and in
**protecting and testing** every connection.

**The one sizing rule that governs everything:** pick the **battery bus voltage first**
(12 V for tiny loads, **48 V for anything running a home**), then buy an MPPT, inverter,
and breakers rated for that voltage. Higher bus voltage = lower current = thinner, cheaper
cable and smaller breakers for the same power. A 2 kW load at 12 V pulls ~167 A (needs
50 mm² cable and a 200 A breaker); the same 2 kW at 48 V pulls ~42 A (needs 10 mm² cable
and a 63 A breaker). **For any real home system, standardize on a 48 V bus.** The 12 V
architecture in the reference diagram is correct only for a trainer rig or a lights-and-
phone-charging micro-system.

---

## 1. Sourcing — component by component

### 1.1 Solar panels — `BUY` (tier-1 certified)

Spec to order: **monocrystalline, 400–600 W, IEC 61215/61730 certified, tier-1 maker with
a PH warranty presence**, N-type TOPCon preferred over older PERC. STC-rated wattage, not
"peak."

| Channel | Typical price | Notes |
|---|---|---|
| Marketplace / direct-import (Lazada, Shopee) | **₱7–10/W** — e.g. Jinko 550–580 W ≈ ₱4,500–5,500/panel | Cheapest per watt. **Grey-market:** often no honored warranty, cert claims unverifiable. Use only where warranty transfer to the customer is not promised. |
| Tier-1 authorized / installer channel | **₱15–32/W** — N-type 550 W+ ≈ ₱14,400–21,600/panel; 400–420 W ≈ ₱6,500–11,000/panel | The premium **is** the bankable warranty + real cert. This is what a warrantied customer install must use. |

Brands seen at PH retail: **Canadian Solar, JA Solar, Jinko, LONGi, Trina** (WattAttack,
pinas.solar). The ₱8/W-import vs ₱22–32/W-tier-1 spread is the single biggest number to
re-confirm per specific model — *both bands are real, they are different products.*

> **Rule for a resale/install business:** every panel that goes on a paying customer's
> roof must be IEC 61215/61730-certified from a maker with PH warranty handling
> (SC-05 §2). The grey-market channel is for your own trainer/demo rigs only.

**Sources:** pinas.solar, watt-attack.com/solar-panels, lakasolar.ph, lazada.com.ph.

### 1.2 MPPT charge controller — `BUY`

Spec to order: **true MPPT** (not PWM mislabeled), max PV input voltage (Voc) safely above
your array's cold-morning Voc, charge current ≥ array short-circuit current, battery-voltage
auto-detect (12/24/48 V).

| Tier | Model / brand | Rating | Price | Notes |
|---|---|---|---|---|
| Budget-reliable | **EPEVER Tracer AN** | 40–60 A, PV 150 V | **₱3,000** (60 A, Lazada promo; list ~₱7,000) | The default DIY/small-install choice. Widely stocked. |
| Budget | EPEVER Tracer (100 A) | 100 A | *unverified — higher* | For larger arrays. |
| Premium | **Victron SmartSolar MPPT** | 75/10 → 100/50 | **₱5,594** entry; 100/50 ≈ **₱17,000–22,000** `EST` | Bluetooth monitoring, best reliability. Premium tier. |
| — | SRNE / MPP Solar standalone | 60–80 A | *not found standalone in PH — usually bundled in all-in-one inverters* | See §1.3. |

> **Watch-out:** many cheap Lazada "MPPT" units are PWM relabeled. Confirm the datasheet
> says MPPT and that max PV **Voc** exceeds your string's cold Voc (panel Voc × ~1.15 for
> a cold morning). A blown controller from over-voltage is not warrantied.

**Sources:** lazada.com.ph (EPEVER Tracer AN listings), ph.biggo.com (Victron), epever.com.

### 1.3 Inverter — `BUY` (pure sine wave; hybrid all-in-one preferred)

For a home system, the market has consolidated on **48 V hybrid all-in-one units** that
integrate the MPPT controller (§1.2) and inverter in one box — simpler, one warranty, one
brand for crews to learn. Standardize on **1–2 brands** (SC-05 §1).

| Model | Rating | Price | Notes |
|---|---|---|---|
| **Voltronic Axpert King 5 kW** | 5 kW off-grid, 48 V | **₱19,000–25,000** | Value workhorse. MPP Solar is the same OEM. |
| **SRNE HF4850S80-H** | 5 kW off-grid, 80 A MPPT | **₱21,000–29,000** | Integrated 80 A MPPT. |
| **Must PH3000 Plus 5048** | 5 kW off-grid | **₱24,000–32,000** | Common budget hybrid. |
| **Deye SUN-5K-SG04LP1** | 5 kW hybrid | **₱24,000–52,000** (variant-dependent) | Strong closed-loop battery support; **warranty needs authorized purchase proof.** |
| **Growatt SPF 5000 ES** | 5 kW off-grid, 80 A MPPT built-in | **₱27,000–37,000** | Popular; some QC variance reported. |
| **Deye SUN-3K / 3.6K-SG04LP1** | 3–3.6 kW hybrid | **₱25,000–37,000** | Smaller-home tier. |

Standalone 2000–3000 W 12/24 V pure-sine units (as in the diagram) exist but are a
trainer/small-cabin choice; a home install should use a 48 V hybrid from the table above.

> **Warranty trap (critical for the business):** LakaSolar documents Deye/Growatt warranty
> claims **rejected** for grey-market units (one case: ₱3k saved on purchase → ₱15k repair
> bill). Source hybrids through **authorized distributors** (J2 Solar claims direct
> Deye/Growatt/LuxPower/SolaX/Sungrow partnerships) so the 5–10 yr warranty stays
> transferable to your customer. A rejected warranty on a customer's roof is a Facebook
> liability (per §1.6 of the operating rules), not just a cost.

**Sources:** watt-attack.com/inverters, lakasolar.ph, ph.biggo.com, j2solar.com.ph.

### 1.4 Battery — `BUY` (finished LiFePO₄ packs with BMS)

**LiFePO₄ (LFP) only for any daily-cycling install.** Buy finished packs with a BMS — never
assemble from loose cells for a customer (fire + warranty liability, SC-05 §1).

**48 V / 51.2 V server-rack & powerwall packs (the home tier)** — verified live, LakaSolar:

| Model | Config | kWh | Price | ₱/kWh |
|---|---|---|---|---|
| One Solar HIGEE120 | 51.2 V 120 Ah | 6.14 | ₱42,000–45,000 | ~7,100 |
| Solarhome LPS1.2V230 | 51.2 V 230 Ah | 11.78 | ₱70,000 | ~5,900 |
| LVTOPSUN Power Wall | 51.2 V 300 Ah | 15.36 | ₱72,000–79,000 | ~4,900 |
| One Solar EVE 51.2 V 230 Ah | 51.2 V 230 Ah (EVE cells) | 11.78 | ₱80,000–85,000 | ~7,000 |
| Solarhome LPS1.2V300 | 51.2 V 300 Ah | 15.36 | ₱90,000 | ~5,900 |

**12 V 100 Ah LFP (trainer / micro-system tier)** — verified, SolarMiner PH tested-capacity
roundup. **Nameplate Ah is routinely inflated;** tested capacity shown:

| Brand | Price | Rated / **Tested** Ah | Verdict |
|---|---|---|---|
| GD Battery | ₱6,500 | 100 / **75** | Avoid for cycling — 25% short. |
| DCPolarity | ₱9,000 | 100 / **73** | Large shortfall. |
| Blue Carbon | ₱11,000 | 100 / 93 | Decent. |
| X-Power | ₱12,500 | 100 / **97** | Best value/honesty. |
| Lvtopsun | ₱13,500 | 100 / **102** | Full rated capacity. |

**Lead-acid deep-cycle 12 V 100 Ah AGM (budget-cash only):** PH range ₱18,000–42,000
*(unverified aggregate)*. **Note it overlaps/exceeds 12 V LFP retail.** With ~50% usable DoD
and 500–900 cycles vs LFP's 4,000–10,000, AGM is **5–10× worse per usable-kWh over life.**
Reserve AGM for rare-backup or tightest-capex jobs; default to LFP for anything cycling daily.

> **Closed-loop compatibility is the #1 field failure.** Rack packs advertise CAN/RS485
> comms with Deye/Growatt/LuxPower/Victron. Confirm the **exact protocol + dip-switch
> setting per your chosen inverter** before ordering. Prefer EVE-cell packs with a stated
> cycle rating (6,000–9,000) and ≥5 yr local warranty (LakaSolar, One Solar) over anonymous
> Lazada rack packs.

**Sources:** lakasolar.ph/shop, solarminerph.com, powercentral.ph.

### 1.5 DC protection — breakers, isolators, fuses (`ASSEMBLE` into the power box)

The two DC breakers in the diagram (③ panel-side, ⑤ battery-side) plus a PV isolator.

| Item | Brand | Rating | Price |
|---|---|---|---|
| DC fuse holder + fuse | Suntree SRD-30 | 1000 V DC, 30 A | ₱550 |
| PV isolator switch | Suntree SISO-40 | 40 A DC | ₱3,750 |
| IP66 DC isolator | Worldsunlight | 1000 V DC | ₱2,100 |
| String/battery DC MCB | **Chint NB1-63DC** / FEEO | 6–63 A, up to 1000 V DC | ~₱150–800/pole `EST` |
| High-amp battery breaker | Chint / generic MCCB | 100–125 A DC (48 V feed) | ₱1,500–4,000 `EST` |

> **The DC-rated trap:** marketplace "550 V DC" generics are frequently **AC breakers
> relabeled**. DC arc interruption needs a true DC device with correct polarity and a voltage
> margin ≥ 1.2× string Voc. Buy Chint/Schneider/Suntree from the brand's **official store**
> and verify the datasheet DC rating (Chint NB1-63DC is a real DC part). **Never substitute
> an AC MCB on a DC circuit** — it will not safely break a DC fault and can weld closed.

**Sources:** lakasolar.ph/shop, Chint NB1-63DC datasheet, Lazada Chint official store, RS PH.

### 1.6 Connectors, cable, busbars, lugs (`BUILD` the harness)

| Item | Spec | Price |
|---|---|---|
| MC4 pair | XIONGI, 1000 V 30 A | **₱200/pair** |
| MC4 Y-branch | 1→2 / 4-way | ₱500 / ₱680 |
| PV cable (tinned copper) | 4 mm² / 6 mm² / 8 mm² | **₱60 / ₱80 / ₱90 per m** |
| Genuine Stäubli MC4 | 4–6 mm², 30 A 1 kV | via RS PH, ~₱250–500/pc `EST` |
| Battery cable + lugs | welding-grade flex Cu 16–50 mm² | Lazada, ready-made leads |
| Crimp lugs (SC tinned Cu) | 4–50 mm² | ₱15–60 each; 70-pc kit ₱300–600 `EST` |
| Copper busbar | tin-plated, amp-rated | ₱150–1,500 `EST` |

> **Two hardware traps that cause fires:**
> 1. **Never cross-mate connector brands.** A generic "MC4-compatible" mated to a Stäubli
>    (or two different generics) gives high contact resistance → hot-spot → connector fire.
>    Use **one brand across every mated pair**, matched to the panel pigtail brand.
> 2. **"Pure copper" on marketplaces is often copper-clad aluminum (CCA)** — undersized real
>    conductor that overheats at battery currents. For 48 V battery cables (100–200 A),
>    insist on genuine tinned copper, correct mm² for the breaker, and **hex/hydraulic
>    crimps** (not pliers). Fuse or breaker the positive **within 300 mm** of the battery
>    terminal.

**Sources:** lakasolar.ph/shop, powercentral.ph, ph.rs-online.com.

### 1.7 Mounting / racking (`BUILD` — our differentiator)

Verified live, Anakaraw (anakaraw.com):

| Item | Price | Item | Price |
|---|---|---|---|
| Corrugated-GI roof bracket | ₱2,000 | Roof hook, double adjustable | ₱440 |
| Adjustable-tilt mount | ₱1,500 | Z-type "no-rail" bracket | ₱280 |
| Short rail bracket | ₱1,500 | Flat/tile roof hook | ₱180 |
| Mounting rail (100 mm) | ₱550 | Hanger bolt + L-foot | ₱150 |
| — | — | End/mid clamp (2 pcs) | ₱150 |
| SNADI Al rail + clamp set (LakaSolar) | ₱1,000 | Ground lug (rail) | ₱60 |

Local fabrication (bent anodized Al or hot-dip GI angle) undercuts imported rail — **confirm
6005-T5 aluminum, not soft/thin extrusion, and stainless/HDG fasteners.** Standard PH
corrugated-roof method: hanger bolt / L-foot tek-screwed into GI purlins.

> **The #1 install callback in PH is roof leaks.** Use EPDM/rubber-backed brackets + butyl
> tape on **every** roof penetration. Light-duty "flat roof" hooks (₱180) are not for exposed
> high-wind rooflines — this is where our **typhoon-rated racking** is the visible
> differentiator (SC-05 §5).

**Sources:** anakaraw.com, lakasolar.ph, solaric.com.ph.

---

## 2. Reputable PH supplier directory

| Supplier | URL | Best for | Note |
|---|---|---|---|
| **LakaSolar** | lakasolar.ph/shop | Batteries, DC protection, MC4, cable, rail, combiners | Best live 2026 catalog — anchor prices. |
| **Anakaraw** | anakaraw.com | Full mounting/racking range | Live product pages. |
| **SolarMiner PH** | solarminerph.com | LFP tested-capacity data (real vs rated Ah) | Buy-guide, not a store. |
| **WattAttack** | watt-attack.com | Inverters, panels — price/spec catalog | — |
| **J2 Solar** | j2solar.com.ph | Authorized Deye/Growatt/LuxPower/SolaX/Sungrow | Authorized-channel angle (warranty). |
| **Solaric** | solaric.com.ph | Rail kits + installs | Est. 2013, Manila. Spelled Solari**c**. |
| **PowerCentral PH** | powercentral.ph | PV cable, LFP batteries | — |
| **RS Components PH** | ph.rs-online.com | Genuine Stäubli MC4, DC MCBs | Industrial line items. |
| Lazada / Shopee | — | EPEVER, Victron, panels (cheapest) | **Highest grey-market/counterfeit + warranty risk.** |

> *Not verified as active component storefronts:* "Solaris" (solaris.com.ph is a project
> developer, **not** a retailer — do not confuse with Solaric), "DIY Solar PH," "Sikat Solar."
> "Ecoshift" is mainly LED lighting. Confirm before citing to a customer.

---

## 3. Two worked bills of materials

Sizing rule of thumb: **daily kWh need ÷ ~4 peak-sun-hours = kWp of panels**; **battery kWh
= daily kWh × days of autonomy ÷ usable DoD (0.8–0.9 for LFP).**

### 3.1 ILAW-class off-grid — small home / brownout backup (~1.6 kWp, 48 V)

| Block | Spec | Est. cost |
|---|---|---|
| Panels | 3 × 550 W tier-1 (1.65 kWp) | ₱16,000–20,000 |
| Inverter (hybrid, MPPT built in) | 3 kW 48 V (Deye 3K / Must) | ₱25,000–32,000 |
| Battery | 48 V 100 Ah LFP (~5 kWh) | ₱35,000–45,000 `EST` |
| DC protection | 2× DC MCB + PV isolator + fuse | ₱3,000–6,000 |
| Harness | MC4 pairs, 6 mm² PV cable, battery leads | ₱2,000–3,500 |
| Racking (built) | GI-roof rail + clamps, 3 panels | ₱4,000–6,000 |
| **Component subtotal** | | **~₱85,000–116,000** |

> **Margin warning (SC-05 §4):** at the ₱99,500 package price the **battery tier makes or
> breaks margin.** Hold the base package at a disciplined battery size and sell storage
> upgrades separately (SC-06 §3). Do **not** cost-plus from this sheet — price from the
> corridor and target-cost the BOM (operating rules §3).

### 3.2 SANDIGAN-class hybrid — home w/ grid + backup (~2.5 kWp, 48 V)

| Block | Spec | Est. cost |
|---|---|---|
| Panels | 5 × 550 W tier-1 (2.75 kWp) | ₱27,000–34,000 |
| Hybrid inverter | 5 kW 48 V (Deye/Growatt/SRNE) | ₱24,000–37,000 |
| Battery | 48 V 120–230 Ah LFP (6–12 kWh) | ₱42,000–70,000 |
| DC protection + AC changeover | breakers, isolator, SPD | ₱4,000–8,000 |
| Harness + combiner | MC4, PV cable, combiner box | ₱4,000–9,000 |
| Racking (built) | GI-roof rail, 5 panels | ₱6,000–9,000 |
| **Component subtotal** | | **~₱107,000–167,000** |

Hybrid keeps grid as backup **and** feeds critical loads through the brownout — this is the
package that legitimately carries a backup promise. (**LIWANAG on-grid never can** —
anti-islanding shuts it off in an outage; operating rules §1.6, hard stop.)

---

## 4. Step-by-step build & install

> **Golden safety rule:** a solar panel in daylight is **always live** — you cannot switch it
> off, only cover or disconnect it. Wire the **DC side dead**: keep panel-side breaker OPEN
> and panels covered/disconnected until the very end. Every torque, every polarity check,
> happens before energizing. Philippine Electrical Code throughout; final electrical work and
> sign-off by a **licensed electrician / REE** (operating rules §7 — no deposit accepted
> without the permit + electrician + net-metering checklist).

### Stage A — Tools & bench prep
- **Tools:** hydraulic/hex crimper (not pliers), MC4 crimp + spanner set, insulated
  screwdrivers, torque screwdriver, digital multimeter (DC V + continuity), clamp meter,
  IR thermometer, cordless drill/driver, tek screws, cable ties, heat-shrink, insulation
  (megohm) tester for the final hipot-style check.
- **PPE:** insulated gloves, eye protection, roof harness/anchor for any pitched-roof work.
- **Bench-build the harness first** (SC-05 §1): pre-cut PV wire, crimp genuine MC4s, label
  every lead per the design, and **test each lead for continuity + correct polarity before it
  leaves the shop.** Roof time is the most expensive and most error-prone time.

### Stage B — Mount the array (roof)
1. Survey purlin positions; mark rail feet over structural members, not just sheeting.
2. Install roof hooks / L-feet: pilot-drill, seat on **EPDM pad + butyl**, tek-screw into
   purlin, seal the head. Every penetration weatherproofed (the #1 callback).
3. Bolt rails to feet; check level and that panel clamps will land on frame clamp zones.
4. Lay panels, engage **mid clamps** between panels and **end clamps** at the ends; torque
   to the panel maker's spec. Bond frames/rail to the **ground lug**.
5. Route panel pigtails; series-string them with MC4s per the design (series adds voltage,
   parallel adds current). **Leave the last MC4 pair open** so the string is not yet closed.

### Stage C — Mount the electrical (wall / cabinet)
6. Mount inverter/hybrid and charge controller on a ventilated, dry, rodent-proof wall or
   cabinet, with clearance for airflow. Mount the battery close to the inverter to keep the
   high-current DC run short.
7. Mount the **power box**: panel-side DC breaker ③, PV isolator, battery-side DC breaker ⑤,
   SPD, and (hybrid) AC changeover — labeled, on DIN rail. All breakers **OPEN**.

### Stage D — Wire it up (all breakers OPEN, panels still covered/open)
8. **Panel → controller/inverter PV input:** run PV cable from the array (through PV isolator
   + panel-side DC breaker ③) to the MPPT/PV terminals. **Observe polarity** (red +, black −).
9. **Battery → inverter:** battery + → battery-side DC breaker ⑤ / fuse (within 300 mm of the
   battery terminal) → inverter B+; battery − → inverter B−. Use correctly-sized tinned-copper
   cable and hex crimps; torque terminals to spec.
10. **Comms cable (closed-loop LFP):** connect the battery CAN/RS485 to the inverter and set
    the correct battery-protocol dip-switch/menu (the #1 field-failure point — §1.4).
11. **DC loads:** 5 V USB / 12 V appliances tap the controller's LOAD terminals (or a fused
    DC distribution off the bus). **AC output:** inverter AC-out → main/critical-loads
    subpanel via a licensed electrician; grounding/bonding per PEC.

### Stage E — Commissioning sequence (order matters)
12. **Meter before energizing:** with everything still open, verify battery pack voltage and
    correct polarity at every breaker; verify no short across DC terminals.
13. **Battery first:** close the battery-side breaker ⑤ and power up the inverter from the
    battery. Confirm the inverter sees the battery and (closed-loop) reads its SoC/voltage.
14. **Then PV:** uncover panels, close the PV isolator and panel-side breaker ③. Confirm the
    controller/MPPT shows PV voltage climbing and begins charging (the reference display:
    PV 49.8 V, BAT 13.7 V, LOAD 12.6 A is exactly what you're verifying).
15. **Then loads:** switch on AC output; confirm 220 V pure-sine at the outlet, then bring up
    loads. Watch the clamp meter and IR thermometer on the battery cables — no hot lugs.
16. **Final checks:** insulation/megohm test on DC strings, polarity map, torque map on every
    lug, anti-islanding verified on any grid-tie/hybrid commissioning, RCD/breaker trip test
    on the AC side.

### Stage F — Handover
17. Owner training: monitoring app, what the controller readings mean, what to do on an
    inverter fault, net-metering paperwork (hybrid/on-grid). Leave the **handover pack**:
    single-line diagram, torque/polarity map, warranty cards, breaker labels (SC-05 §3;
    operating rules §6 "onboard with bumpers").

---

## 5. Compliance & honesty gates (non-negotiable)

- **No deposit / no install** without the permit + **licensed-electrician sign-off** +
  net-metering checklist attached to the quote (operating rules §7 — hard stop).
- **Panels & inverters must be certified** (IEC 61215/61730; inverter on the DU's approved
  list for any grid interaction) and sourced through channels whose **warranty transfers to
  the customer** (§1.1, §1.3).
- **Never imply backup on an on-grid-only (LIWANAG) system** — anti-islanding shuts it off in
  an outage (operating rules §1.6, hard stop). Backup claims belong only to ILAW/SANDIGAN
  packages that actually carry a battery.
- **DC-rated protection only** on DC circuits; **no CCA cable/lugs**; connectors single-brand
  per mated pair (§1.5, §1.6) — these are fire-safety rules, not preferences.

---

## 6. Action before ordering (per repo price-basis rule)

1. Re-quote every §1 line item — **3 quotes minimum** — and confirm current spot pricing
   (panel ₱/W moves monthly).
2. Confirm the **battery↔inverter closed-loop protocol** for your standardized brand pair
   before buying either.
3. Verify every "DC-rated" and "pure copper" claim against the actual datasheet.
4. Update this doc with **actual quoted figures and dates** as they land, and mirror any
   package-cost changes into SC-05 §4 / SC-06 pricing — **price-first from the corridor,
   never cost-plus** (operating rules §3).

---

*All prices dated 2026-07-19, PH market, ~₱56/$. Sources: LakaSolar, Anakaraw, SolarMiner PH,
pinas.solar, WattAttack, ph.biggo.com, Lazada/Shopee, RS Components PH, Chint. Re-verify
before quoting.*
