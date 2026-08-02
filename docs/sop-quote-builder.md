# SOP — Quoting a homeowner: bill in, two documents out (SC-16)

**Doc:** standard operating procedure · **REV A · 2026-08-02** · Owner: _[founder]_
Tool: **Quote Builder** → `/internal/quote-builder` (SC-16). Applies to anyone who quotes a
customer: founders, and any limited account granted the **quotes** section.

---

## 1. Purpose

Enter a homeowner's BILECO bill and the tool sizes the array, builds the bill of materials,
prices it against the ladder, and produces **two documents from one set of numbers**. Neither
recalculates anything, so they cannot disagree.

| Document | Who sees it | What it carries |
|---|---|---|
| **Customer copy** | The homeowner. Emailed. | Scope — what lands on their roof, named by brand and quantity — and one fixed price. Plus every honesty block. |
| **Internal cost sheet** | Us only. Never emailed. | The itemised BOM with unit prices, our delivery cost, profit against the floor, take-home, and the crew's array geometry. |

Why the customer copy is not the itemised one: a priced parts list invites the Shopee-kit
comparison — the homeowner prices our clamps against Lazada and reads the labour fee as
padding. We sell a fixed-price installed package (§3), so the document has to argue that.

## 2. Before you quote

- **Sign in with your own login**, not the shared team password. A quote goes out attributable
  to a person, and "Prepared by" is what the customer reads on the signature line.
- **Skim the flag rail** on the right before you touch anything else. It names every rule that
  applies to the configuration in front of you.
- If a supplier has confirmed a price since your last quote, put it in **Price list** first,
  with who quoted it and when. A confirmed price without a source note is refused — that flag
  is what removes the INDICATIVE stamp from a customer's quotation.

## 3. Building the quote (daily use)

1. **Customer** — full name, site address, phone, email, your name in *Prepared by*. Phone is
   how an existing lead is matched, so a quote never forks a contact into two rows.
2. **Their BILECO bill** — ask to see last month's bill and type the exact figure. The band is
   a fallback; the exact number sizes the system properly and keeps the conversation
   past-specific (§2). Rate and yield are both EST until a metered install replaces them.
3. **System** — package, panel, inverter, battery. Use *Panel count override* once the roof
   survey gives you the real usable area.
4. **Money** — the contract price defaults to the ladder. For a system bigger than our fixed
   packages, use the **Market price helper**: competitor ₱/kW × size, less our discount.
   Never work backwards from the sheet total plus a markup — cost-plus is banned (§3).
5. **Customer copy** — check the scope lines (§4).
6. Read the **Next action** box. It resolves to exactly one thing to do.

## 4. The Customer copy panel — what the homeowner reads

One row per scope line: a tick, a heading, a detail, and a revert.

- **Untouched fields follow the system.** The grey placeholder text is what will print, and it
  keeps tracking your configuration — change the panel count and the panels line follows.
- **An edited field is yours**, and prints exactly what is in it — **including blank**. Rename
  a line and clear its detail and you get a heading with nothing under it, spanning the row.
  That is how you write a one-line scope ("Supply and installation of a 6 kW solar setup").
- **↺** hands a line back to the system. **Reset to auto** does the whole panel.
- **Unticking** removes the line from the customer's quotation entirely.
- Your settings are saved in your browser and reused on your next quote.

**The rule that matters:** anything left off the customer copy is named in the flag rail and on
the internal sheet. Leaving out something that genuinely is not in the job is fine. Leaving out
something that IS in the job means the customer paid a fixed price for a scope that never
mentioned it — that is the dispute you will lose.

## 5. Packages & pricing — the ladder is not settled

The ladder, the sizing assumptions and the fee formulas are **data, not code**. Any founder can
change them; every change is audited and the dialog names who last changed it and when.

- **Tiers** — name, kWp ceiling, kWh ceiling, price, with-battery price, and the sentence the
  flag rail shows. A quote takes the **first tier it fits inside, smallest first**. Tiers are
  sorted on save so a tier can never be shadowed by a larger one. Nothing fits → CUSTOM, and
  you set the price from the market.
- **Self-consumption %** is the number to be careful with. It is the share of generation that
  actually comes off the bill — 85% without storage, because the rest exports below retail.
  It moves the saving figure the customer is promised more than anything else in the tool.
  Dropping it 85 → 75 takes a ₱4,060/mo quote to ₱3,583/mo.
- **Fee vs our delivery cost** are two separate numbers on purpose. The fee is what the
  customer is charged for labour; the delivery cost is what that labour costs us. The gap is
  the profit. One field standing in for both is how a job looks profitable when it isn't.

Change the ladder because the market moved, not because a deal stalled. Repeated stalls at the
list price trigger a positioning review, not a price cut (§3).

## 6. Sending

**Email quote to customer** always sends the **customer copy**, whichever sheet is on screen.
Confirm the dialog — recipient, quote number, price, and whether that price is firm.

One click then does four things in this order, and the order is the point:

1. Renders the PDF. If the document cannot be produced, nothing else happens.
2. Creates or updates the contact.
3. Sends the mail — the step that fails for reasons outside us.
4. **Only if the mail actually went:** moves them to *Quote Sent* with a follow-up due in two
   days, and writes the quote row. "Quote Sent" has to mean a quote was sent (§1.4).

A failed send leaves the contact where it was and shows you the error. The quotation also lands
in the Mailbox under **Sent**, so anyone can see what a customer was actually told.

**Print / save as PDF** prints whichever sheet is showing — that is how you get the internal
cost sheet as a file. It is never emailed and never left on a site.

**Copy summary** gives you the plain-text version for the Messenger follow-up.

Then do the thing the tool cannot do for you: **ask for a date.** "Can I come Saturday 9am, or
is Sunday better?" A quote that ends in "I'll message you" is a zombie lead (§2).

## 7. What the tool will not let you do

These are not warnings, they are gates. Do not look for a way around them.

| Gate | Why |
|---|---|
| A grid-tied system with no battery prints the **brownout statement** | Anti-islanding shuts it off in an outage. Implying otherwise is the value gap that kills word-of-mouth (§1.6). |
| Every quote prints the **permit / licensed-practitioner / net-metering checklist** | No deposit can be accepted until all of it is signed off (§7). |
| Any unconfirmed supplier price stamps the sheet **INDICATIVE** | On the customer copy there are no per-line prices, so this stamp is the only warning they get (§7). |
| A CUSTOM-tier quote cannot be sent with no price set | With no price the sheet falls back to our own cost total, which is cost-plus (§3). |
| Every scope line switched off blocks the send | A price with nothing attached to it is not a quotation. |
| A confirmed price needs a source note | Otherwise an estimate silently becomes a number on a contract. |

## 8. Troubleshooting

| Symptom | Do this |
|---|---|
| A scope line shows text you did not write | The field is untouched, so it is following the system. Type over it, or clear it after typing to make it deliberately blank. |
| A line you edited will not go back to normal | Press **↺** on that row. Clearing the field alone is not enough — an edited field stays yours. |
| The heading you typed is missing from the sheet | The row is unticked, or both fields are blank. Check the flag rail; it lists everything left off. |
| Prices look wrong across the board | Someone changed **Packages & pricing**. Open it — the top line names who and when. |
| "Only … can change these" / fields greyed out | The server says this account is read-only. Sign in with your own founder login. |
| Send fails with a Cloudflare error | The error is shown verbatim. The contact was not advanced; fix and resend. |
| The price tier is not the one you expected | Tiers match smallest-first. A tier whose ceiling is below another's will be reached first. Check both ceilings, not just the price. |

## 9. Rules

1. **The customer copy is the only document that leaves the building.** Never email, print for
   a customer, or leave on a site the internal cost sheet.
2. **Own login only.** Quotes are attributed and audited.
3. **Never promise brownout cover on LIWANAG.** No exceptions, no softening (§1.6).
4. **Never quote a price you cannot defend from the market** — what this customer already pays
   BILECO, a genset, or another installer. Not from our costs plus a markup (§3).
5. **Every price carries its outcome.** ₱ saved per month, or hours of backup. A price without
   its outcome is a bug.
6. **A quote ends with a commitment ask**, or it is not a sales-mode interaction (§2).

## 10. Ownership

- **Ladder + Packages & pricing settings:** _[name — the offer/pricing owner]_
- **Price list accuracy (supplier confirmations):** _[name — the BOM refresh owner]_
- **Quotes sent and followed up:** _[name — the customer/interviews owner]_
- No name filled in = not being done (Founder OS §6).

---

*Revision history: REV A 2026-08-02 — initial issue. Matches the split into customer copy +
internal cost sheet, the per-line Customer copy panel, and the Packages & pricing settings
that moved the ladder out of code.*
