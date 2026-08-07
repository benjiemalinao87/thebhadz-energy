# SEC & business registration checklist

**Purpose:** legal readiness to sign contracts and bank deposits under the company's
own name — this is a Mission prerequisite (CLAUDE.md §7: "A quote or deposit accepted
without the permit / licensed-electrician sign-off / net-metering checklist" is a hard
stop), not a Model A/B spend item, so it is **not** subject to the §1.2 gate. All figures
below are research-backed as of **2026-07-20** and marked HYPOTHESIS/unverified where the
source wasn't a primary government page — confirm against sec.gov.ph, bir.gov.ph, and
your LGU before filing, since fees and processing rules change.

## Map — two chains, don't confuse them

Everything below belongs to one of two chains. **Chain 1 registers the company** (once, then
renewed annually). **Chain 2 permits each installation** (repeated per job, per LGU, per
homeowner). A complete Chain 1 does not let you energise a roof; a complete Chain 2 without
Chain 1 is not a company. §7's deposit blocker sits across both.

| Chain | Issuer | What it is | Do we need it? |
|---|---|---|---|
| 1 | **SEC** | Certificate of Incorporation | **Yes** — the company legally exists only from this date |
| 1 | **BIR** | Certificate of Registration (2303) + invoices/ORs | **Yes** — before any legally receipted deposit |
| 1 | Barangay | Business clearance | **Yes** — prerequisite to the Mayor's permit |
| 1 | **BFP** | Fire Safety Inspection Certificate (FSIC) for the office/workshop | **Yes** — Mayor's permit cannot issue or renew without it (RA 9514) |
| 1 | LGU (Mayor) | Mayor's / Business Permit | **Yes** — annual, per business address |
| 1 | SSS · PhilHealth · Pag-IBIG | Employer registration | **Yes** — from the first employee, incl. a salaried founder |
| 1 | **PCAB** (CIAP/DTI) | Contractor's licence + Sustaining Technical Employee | **Yes** — the licence to *contract* installation work |
| 1 | **PRC** | REE/PEE and RME licences — held by people, not the company | **Yes** — Jundhel (REE, PRC 0050698) is the technical basis |
| 1 | **DOE** | Solar-PV installer registry / RESC accreditation | **Not a legal blocker for private residential** — see §6 |
| 2 | LGU building/electrical office | Electrical Permit → Certificate of Final Electrical Inspection (CFEI) | **Yes — every install** |
| 2 | Signing professional | Sealed electrical plan + Certificate of Compliance | **Yes — every install** |
| 2 | Distribution utility (ERC rules) | Net-metering agreement + bi-directional meter | **Grid-tied only** (LIWANAG); not applicable to pure off-grid ILAW |

**Shortest true answer to "what do we legally need before taking a homeowner's deposit?"** —
SEC + BIR + barangay/BFP/Mayor's permit for the business, **PCAB** for the contracting, a
**PRC-licensed** signing professional, and per job the LGU **electrical permit + CFEI**, plus
the **DU net-metering** application when the system is grid-tied. DOE is not on that list.

## 0. Decide the entity first (blocks everything else)

| Question | Answer drives |
|---|---|
| How many founders will hold equity? | 1 → One Person Corporation (OPC) eligible. 2+ → regular domestic stock corporation (min. 2 incorporators, no more minimum capital under the Revised Corporation Code except where a law sets one). |
| Do we need SEC at all, or is DTI enough? | DTI sole-proprietorship is faster/cheaper (~1 day, <₱5,000) but has **unlimited personal liability** and can't hold a corporate bank account, can't easily bring in a second founder as a legal owner, and reads as less credible to a scam-wary homeowner market and to distribution utilities processing net-metering paperwork. Given the T5T/role structure in CLAUDE.md assumes multiple founders, **SEC corporation (or OPC if truly solo) is the default recommendation**, not DTI. |
| Foreign equity? | If any non-Filipino equity, check the Foreign Investment Negative List — retail/installation services may have Filipino-ownership requirements. Flag for a lawyer before filing if applicable. |

**Action:** log the answer (entity type + founder list) as a decision in `ops/status.md` §4
before starting eSPARC — this checklist assumes a **regular domestic stock corporation**
unless you're solo, in which case swap "incorporators (2+)" steps for "single stockholder + nominee/alternate nominee" (OPC).

## 1. Pre-filing prep

- [ ] Pick 3 candidate corporate names (SEC name-availability search rejects duplicates/confusingly-similar names).
- [ ] Decide principal office address (can be a founder's home/registered address for now — must match what goes on file with BIR/LGU later).
- [ ] Decide authorized capital stock and paid-up capital (no statutory minimum for most activities under the Revised Corporation Code; paid-up must be ≥25% of subscribed, subscribed ≥25% of authorized — standard rule of thumb).
- [ ] List incorporators (2–15 for a regular corp; natural person/trust/estate of one for OPC) with valid government IDs, TINs (or note "to be secured"), and % ownership.
- [ ] Draft primary purpose clause — write it to cover **both** models honestly: "manufacture, assembly, sale, installation, and servicing of solar power systems and related equipment; and electrical/renewable-energy installation contracting services." Vague or overly narrow purpose clauses cause eSPARC kickback.
- [ ] Appoint corporate secretary (must be a Filipino citizen **and resident**; cannot be the sole stockholder if OPC), treasurer (Philippine resident), and (OPC only) nominee + alternate nominee.
  - **President — Jundhel Cabradilla** (confirmed 2026-07-24; must also be a director). Under RCC §24 the President **cannot** concurrently be Corporate Secretary or Treasurer, so those two seats go to other founders.
  - **Corporate Secretary — OPEN.** **Treasurer — OPEN.** Eligible pool is PH-resident founders only; confirm each founder's residency before assigning (a non-resident founder is ineligible for either seat).
- [ ] Create/credential an SEC **eSECURE** account (identity verification, OTP by email + mobile) for every incorporator/officer — required before eSPARC will accept filings.

## 2. SEC eSPARC filing

- [ ] Reserve the company name via eSPARC.
- [ ] Complete online Articles of Incorporation (or upload notarized PDF) — prep with
  `ops/templates/articles-of-incorporation-template.md`.
- [ ] Complete By-laws (regular corp) — OPCs are exempt from filing by-laws. Start from
  `ops/templates/by-laws-template.md`.
- [ ] Complete Treasurer's Affidavit — start from
  `ops/templates/treasurers-affidavit-template.md`.
- [ ] Upload supporting docs: incorporator IDs, TINs, proof of office address, (OPC) nominee written consent.
- [ ] Pay filing fees online through eSPARC's payment channel.
- [ ] Monitor the eSPARC dashboard for clarificatory comments; respond within the window given (SEC commits to a first response within ~7 working days).
- [ ] Once approved, courier/mail the 2 notarized hard-copy sets to the SEC office on file — must arrive within 60 calendar days of the approval date on the Certificate of Incorporation, or the approval lapses.
- [ ] Receive the **Certificate of Incorporation** — this is the moment the corporation legally exists; nothing above this line lets you sign a binding contract as "the company."

**Reality-check timeline:** straightforward eSPARC filings are running ~5–10 business days
in 2026 per industry sources (unverified against a primary SEC SLA — treat as a planning
estimate, not a guarantee).

## 3. Immediately after the Certificate of Incorporation

- [ ] Open a corporate bank account; deposit paid-up capital (bank will ask for the Certificate of Incorporation, Articles, secretary's certificate, and board resolution naming signatories — start from `ops/templates/secretarys-certificate-template.md`).
- [ ] (OPC only) File the Form of Appointment (FAO) naming treasurer/corporate secretary/officers with SEC within 20 days of the Certificate of Incorporation.
- [ ] Order the SEC-registered corporate seal/stamp (some banks and LGUs still ask for it).

## 4. BIR registration (required before issuing any official receipt/invoice — i.e. before a legal deposit)

- [ ] File BIR Form 1903 at the Revenue District Office (RDO) covering the principal office address.
- [ ] Pay Annual Registration Fee (₱500, BIR Form 0605) — check current fee, this has changed under recent BIR issuances.
- [ ] Register books of accounts.
- [ ] Apply for Authority to Print (ATP) official receipts/invoices, or register through a BIR-accredited e-invoicing/CRM system.
- [ ] Get the BIR Certificate of Registration (Form 2303) posted at the business address.

## 5. Local government (LGU) — needed before operating from any address, and before signing/energizing an install in that LGU

- [ ] Barangay Clearance (business).
- [ ] Mayor's/Business Permit — requires the SEC Certificate, BIR COR, barangay clearance, lease/title proof for the address, fire safety inspection certificate (FSIC), and (increasingly) a sanitary permit.
- [ ] Register as employer with SSS, PhilHealth, and Pag-IBIG (mandatory the moment you have even one employee, including a founder drawing salary).

### 5a. BFP — Fire Safety Inspection Certificate (FSIC)

The FSIC is issued by the **Bureau of Fire Protection** under **RA 9514 (Fire Code of the
Philippines, 2008)**. It certifies that the *premises* comply with fire safety rules. Two
things to keep straight:

- It applies to **our own office/workshop address**, and the **Mayor's/Business Permit
  cannot be issued or renewed without it**. Validity is **one year**, so it rides the same
  annual renewal cycle as the business permit.
- It is **not** part of the per-install permit chain for an ordinary residential rooftop job.
  That chain is the LGU **electrical permit → CFEI** (§6). BFP re-enters the picture for
  commercial/industrial buildings and, plausibly, for battery/ESS rooms — confirm locally
  rather than assume.

- [ ] Obtain the building's **Occupancy Permit** (certified true copy, from the Office of the
  Building Official) — normally the landlord's document; ask for it **before** signing a lease,
  because a building without one cannot produce an FSIC and therefore cannot host a permitted
  business.
- [ ] File the FSIC application with the BFP station covering the address; pay the **fire code
  fee** assessed by the city/municipal treasurer.
- [ ] Pass inspection: serviced fire extinguishers with current tags/receipts, unobstructed
  exits and exit signage, compliant electrical wiring.
- [ ] Attach the FSIC to the Mayor's permit application; diary the renewal with the January
  business-permit renewal.
- [ ] **Before leasing a workshop:** ask BFP what occupancy classification and fire-protection
  fit-out applies once we store batteries, lamination materials, or bulk stock — this is a
  different assessment from a plain office, and it is a lease-decision input, not an
  afterthought. UNVERIFIED.

Typical documentary requirements seen across LGU/BFP guidance (verify with your station —
lists vary): occupancy permit, previous year's FSIC (renewals), assessment of business tax
from the treasurer, fire extinguisher inventory/ORs, as-built plans where the building
deviated from approved plans, certificate of completion from the architect/engineer, and a
fire insurance policy where applicable.

## 6. Solar/electrical-industry-specific licensing (do NOT skip — this is what unlocks the CLAUDE.md §7 "permit / net-metering checklist" gate for accepting deposits)

These are separate from SEC/BIR/LGU and are what actually let you sign an install contract and get the distribution utility (e.g. Meralco) to approve net metering:

- [ ] **PCAB (Philippine Contractors Accreditation Board) license** — required for commercial/residential electrical and structural (rooftop) installation contracting. Confirm required category/classification for solar EPC work with PCAB directly; this is a licensing step separate from SEC and typically requires a licensed professional (PEE/RME) on staff or as a named qualifier.
  - **We have this in-house:** **Jundhel Cabradilla, Registered Electrical Engineer, PRC No. 0050698**, 12 years as project electrical engineer / site supervisor — the intended **Sustaining Technical Employee**. Two things still to confirm with PCAB directly, not assume: (a) whether the category covering solar/electrical installation accepts an **REE** or requires a **PEE**; (b) the capacity threshold above which electrical plan sign-off must be done by a PEE rather than an REE (residential rooftop PV is expected to sit inside REE scope — verify). Once confirmed, the CLAUDE.md §7 licensed-sign-off blocker on accepting deposits is effectively cleared.
- [ ] **DOE registration / RESC accreditation** — **CORRECTED 2026-08-07.** An earlier revision of
  this file treated DOE accreditation as a blocker on quoting a private homeowner. Public 2026
  sources say it is **not legally mandated for private residential installations**. Where it
  actually binds: **government procurement** — public agencies buying solar under **RA 9184** must
  use DOE-listed installers — plus its value as a **trust signal** homeowners, DUs and financiers
  check. The DOE registry listed ~**92 solar PV installers** (and 14 ESCOs doing solar PV) as of
  Jan 2026; **RESC** (Renewable Energy Service Contractor) accreditation under the Renewable Energy
  Act is the related company-level registration. Posture: **apply, don't wait for it** — it is not
  on the critical path to the Mission, and blocking the first five installs on it would be
  self-inflicted. Do **not** imply DOE accreditation until the certificate exists and its number can
  be quoted (CLAUDE.md §1.6). UNVERIFIED against a primary doe.gov.ph page — confirm before either
  claiming it or budgeting for it.
- [ ] Employ or contract a **licensed electrician / Registered Master Electrician (RME)** for sign-off on every install — this is the specific checklist item CLAUDE.md §7 already blocks quotes/deposits on.
- [ ] Distribution-utility (e.g. Meralco) **net-metering application** process and requirements — confirm current DU turnaround (a 2026 DOE circular reportedly mandates 10-working-day DU review and 3-working-day LGU electrical-permit/inspection turnaround; verify against the DOE circular text before quoting customers a timeline).
- [ ] Electrical Permit + Certificate of Final Electrical Inspection from the LGU building/electrical office for each install.

**Unverified — confirm before quoting any customer:** exact PCAB classification needed,
DOE registry/RESC prerequisites, BFP fire code fee and workshop occupancy classification,
and current DU net-metering SLA. Treat every timeline figure here as HYPOTHESIS until
confirmed with the primary source (pcab.gov.ph, doe.gov.ph, the local BFP station, your
target DU) and log the confirmed numbers in this file.

## 7. Rough cost & timeline planning numbers (unverified, 2026 market estimates)

- SEC + BIR + LGU registration for a small domestic corporation: **₱25,000–₱130,000**
  total depending on authorized capital, LGU, and whether a lawyer/agent is used.
- End-to-end (name reservation → Certificate of Incorporation): commonly **5–10 business
  days** via eSPARC for straightforward filings; add time for BIR/LGU/PCAB/DOE steps
  after that.
- PCAB and DOE accreditation timelines were not found in this pass — research separately
  before setting a customer-facing "we start installing on X date" commitment (CLAUDE.md
  §6 speed-of-light dates: don't pad, but don't commit to an unresearched constraint either).

## 8. Sources (fetched 2026-07-20, BFP/DOE/PCAB additions 2026-08-07 — verify against primary .gov.ph pages before relying on any fee/timeline figure)

Added 2026-08-07 (BFP/FSIC, DOE registry status, PCAB categorisation):

- [Fire Safety Inspection Certificate: compliance, fees, common causes of delay — Respicio & Co.](https://www.respicio.ph/commentaries/fire-safety-inspection-certificate-requirements-compliance-fees-and-common-causes-of-delay)
- [Complete guide to the Fire Safety Inspection Certificate — Emerhub](https://emerhub.com/philippines/fire-safety-inspection-certificate/)
- [BFP — issuance of FSIC for business permit (LGU procedure example)](https://angono.gov.ph/bureau-fire-protection-issuance-fire-safety-inspection-certificate-fsic-business-permit/)
- [DOE-accredited solar installers in the Philippines — SolarPro](https://solarproinstall.com/doe-accredited-solar-installers-philippines/)
- [How to choose a solar installer (DOE listing vs PCAB vs ERC) — Solar Scout PH](https://www.solarscout.ph/learn/how-to-choose-a-solar-installer-you-wont-regret-a-filipino-homeowners-guide-)
- [Can new contractors apply directly for PCAB Category A? — Respicio & Co.](https://www.respicio.ph/commentaries/can-new-contractors-apply-directly-for-pcab-category-a-requirements-and-eligibility)

Original set (fetched 2026-07-20):

- [Business Registration In The Philippines 2026 — Philippine Hub Partners](https://philippinehubpartners.com/business-registration-philippines-sec-requirements-2026/)
- [How to Register a Corporation in the Philippines (2026) — Romualdez Law Offices](https://romualdezlaw.com/how-to-register-a-corporation-in-the-philippines-2026-step-by-step-guide/)
- [SEC eSPARC portal](https://esparc.sec.gov.ph/application/overview)
- [Complete SEC Filing Requirements Philippines: Updated 2026 Guide — Aureada Law](https://www.aureadalaw.com/post/complete-sec-filing-requirements-philippines-updated-2026-guide)
- [Permitly Guide: OPC Registration 2026](https://www.permitly.ph/post/permitly-guide-how-to-register-a-business-one-person-corporation-or-opc-in-the-philippines-2026)
- [One Person Corporation Registration — Respicio & Co.](https://www.respicio.ph/commentaries/one-person-corporation-registration-in-the-philippines-requirements-and-step-by-step-process)
- [Guidelines on the Compliances of OPCs — Grant Thornton PH](https://www.grantthornton.com.ph/technical-alerts/accounting-alert/2026/guidelines-on-the-compliances-of-one-person-corporations-opcs/)
- [DTI vs SEC Registration — MG Madrid & Company](https://mgm.com.ph/news-and-publication/business-registration-vs-dti-which-is-right-for-you-in-the-philippines)
- [SEC vs. DTI Registration — Matiling & Maghopoy Law Office](https://mmlawoffice.ph/guides/sec-vs-dti-business-registration-philippines)
- [Philippines Solar Compliance Guide 2026: Net Metering, DOE Rules & DU Applications — SurgePV](https://www.surgepv.com/solar-compliance/philippines)
- [Philippines accelerates permits for solar net-metering — pv magazine](https://www.pv-magazine.com/2026/02/04/philippines-accelerates-permits-for-solar-net-metering/)
- [Philippines Net Metering 2026: 10-Day Approval — Reslink Energy](https://www.reslink.org/blogs/philippines-net-metering-approvals-now-take-10-days/)

## 9. Next actions

- [ ] Founders decide entity type + name candidates (§0–1) — this week.
- [ ] Log the decision in `ops/status.md` §4.
- [ ] Named owner assigned for this checklist (CLAUDE.md §6 "pilot in command" — no name, not being done).
- [ ] Confirm **PCAB** prerequisites (§6) before any install is quoted — PCAB plus the
  PRC-licensed sign-off is the actual blocker on legally accepting a deposit, not the SEC
  filing and **not** DOE registration.
- [ ] Ask the target LGU's building/electrical office for its real electrical-permit + CFEI
  paperwork list and fees — the per-install chain is what a homeowner's timeline depends on.
- [ ] Ask the local BFP station for the FSIC document list and fire code fee for our office
  address, and what changes for a workshop storing batteries/stock (§5a).
