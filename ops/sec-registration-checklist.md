# SEC & business registration checklist

**Purpose:** legal readiness to sign contracts and bank deposits under the company's
own name — this is a Mission prerequisite (CLAUDE.md §7: "A quote or deposit accepted
without the permit / licensed-electrician sign-off / net-metering checklist" is a hard
stop), not a Model A/B spend item, so it is **not** subject to the §1.2 gate. All figures
below are research-backed as of **2026-07-20** and marked HYPOTHESIS/unverified where the
source wasn't a primary government page — confirm against sec.gov.ph, bir.gov.ph, and
your LGU before filing, since fees and processing rules change.

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
- [ ] Appoint corporate secretary (must be a Filipino citizen; cannot be the sole stockholder if OPC), treasurer (Philippine resident), and (OPC only) nominee + alternate nominee.
- [ ] Create/credential an SEC **eSECURE** account (identity verification, OTP by email + mobile) for every incorporator/officer — required before eSPARC will accept filings.

## 2. SEC eSPARC filing

- [ ] Reserve the company name via eSPARC.
- [ ] Complete online Articles of Incorporation (or upload notarized PDF).
- [ ] Complete By-laws (regular corp) — OPCs are exempt from filing by-laws.
- [ ] Complete Treasurer's Affidavit.
- [ ] Upload supporting docs: incorporator IDs, TINs, proof of office address, (OPC) nominee written consent.
- [ ] Pay filing fees online through eSPARC's payment channel.
- [ ] Monitor the eSPARC dashboard for clarificatory comments; respond within the window given (SEC commits to a first response within ~7 working days).
- [ ] Once approved, courier/mail the 2 notarized hard-copy sets to the SEC office on file — must arrive within 60 calendar days of the approval date on the Certificate of Incorporation, or the approval lapses.
- [ ] Receive the **Certificate of Incorporation** — this is the moment the corporation legally exists; nothing above this line lets you sign a binding contract as "the company."

**Reality-check timeline:** straightforward eSPARC filings are running ~5–10 business days
in 2026 per industry sources (unverified against a primary SEC SLA — treat as a planning
estimate, not a guarantee).

## 3. Immediately after the Certificate of Incorporation

- [ ] Open a corporate bank account; deposit paid-up capital (bank will ask for the Certificate of Incorporation, Articles, secretary's certificate, and board resolution naming signatories).
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

## 6. Solar/electrical-industry-specific licensing (do NOT skip — this is what unlocks the CLAUDE.md §7 "permit / net-metering checklist" gate for accepting deposits)

These are separate from SEC/BIR/LGU and are what actually let you sign an install contract and get the distribution utility (e.g. Meralco) to approve net metering:

- [ ] **PCAB (Philippine Contractors Accreditation Board) license** — required for commercial/residential electrical and structural (rooftop) installation contracting. Confirm required category/classification for solar EPC work with PCAB directly; this is a licensing step separate from SEC and typically requires a licensed professional (PEE/RME) on staff or as a named qualifier.
- [ ] **DOE accreditation/registration** as a renewable-energy service/installation provider — DOE does not accredit on self-declaration; expect to show technical staff qualifications and a completed-installation track record. For a pre-track-record company, research whether DOE has a provisional/first-time-applicant pathway, or plan the first handful of installs under a licensed subcontractor/partner while accreditation is pending — do not imply DOE accreditation you don't yet hold in marketing copy (CLAUDE.md §1.6 — never promise/imply what isn't true).
- [ ] Employ or contract a **licensed electrician / Registered Master Electrician (RME)** for sign-off on every install — this is the specific checklist item CLAUDE.md §7 already blocks quotes/deposits on.
- [ ] Distribution-utility (e.g. Meralco) **net-metering application** process and requirements — confirm current DU turnaround (a 2026 DOE circular reportedly mandates 10-working-day DU review and 3-working-day LGU electrical-permit/inspection turnaround; verify against the DOE circular text before quoting customers a timeline).
- [ ] Electrical Permit + Certificate of Final Electrical Inspection from the LGU building/electrical office for each install.

**Unverified — confirm before quoting any customer:** exact PCAB classification needed,
DOE accreditation prerequisites for a first-time applicant, and current DU net-metering
SLA. Treat every timeline figure here as HYPOTHESIS until confirmed with the primary
source (pcab.gov.ph, doe.gov.ph, your target DU) and log the confirmed numbers in this
file.

## 7. Rough cost & timeline planning numbers (unverified, 2026 market estimates)

- SEC + BIR + LGU registration for a small domestic corporation: **₱25,000–₱130,000**
  total depending on authorized capital, LGU, and whether a lawyer/agent is used.
- End-to-end (name reservation → Certificate of Incorporation): commonly **5–10 business
  days** via eSPARC for straightforward filings; add time for BIR/LGU/PCAB/DOE steps
  after that.
- PCAB and DOE accreditation timelines were not found in this pass — research separately
  before setting a customer-facing "we start installing on X date" commitment (CLAUDE.md
  §6 speed-of-light dates: don't pad, but don't commit to an unresearched constraint either).

## 8. Sources (fetched 2026-07-20 — verify against primary .gov.ph pages before relying on any fee/timeline figure)

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
- [ ] Confirm PCAB/DOE prerequisites (§6) before any install is quoted — this is the
  actual blocker on legally accepting a deposit, not the SEC filing itself.
