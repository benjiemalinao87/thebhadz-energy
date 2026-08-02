/**
 * The customer's quotation, laid out on paper.
 *
 * This is the second renderer of the same quote — the first is the on-screen
 * sheet in internal/assets/quote-builder.js. They deliberately share the MODEL
 * (the client posts the computed figures; nothing is recalculated here), so the
 * numbers cannot disagree. Only the layout is written twice, because a browser
 * laying out HTML and a PDF placing glyphs are not the same machine.
 *
 * This renders the CUSTOMER copy only, and it is the only quote document that
 * leaves the building. It carries scope — what lands on the roof, named by brand
 * and quantity where the brand is the warranty — and one fixed price. The itemised
 * bill of materials with unit prices, our cost and our margin is the internal cost
 * sheet, which lives on screen in the quote builder and is never posted here: an
 * endpoint that never receives the build-up cannot accidentally email it.
 *
 * What must never diverge, and is asserted by /api/quote before this runs:
 *   - the compliance checklist prints on every quote (Founder OS §7)
 *   - a system with no battery prints the brownout truth (Founder OS §1.6)
 *   - unconfirmed prices stamp the sheet INDICATIVE (Founder OS §7)
 */
import { A4, Page, buildPdf, wrap } from "./_pdf.js";

const M = 42;                       // page margin
const RIGHT = A4.width - M;
const INK = 0;
const MUTED = 0.35;

const peso = (n) => "PHP " + Number(n || 0).toLocaleString("en-PH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const pesoShort = (n) => "PHP " + Math.round(Number(n || 0)).toLocaleString("en-PH");

/** Column geometry for the scope table: a heading column and a detail column. */
const COL = {
  item: M + 6,
  detail: M + 146,          // where the detail column starts
  total: RIGHT - 6,
};
const ROW_H = 13;
const LINE_H = 11;          // leading inside a wrapped detail cell

export function renderQuotePdf(q) {
  const pages = [];
  let page = new Page(A4);
  let y = M;
  pages.push(page);

  /** Start a new page when the next block would run past the bottom margin. */
  const need = (space) => {
    if (y + space <= A4.height - M) return;
    page = new Page(A4);
    pages.push(page);
    y = M;
    page.text("MACC Systems & Engineering Inc.", M, y + 8, { size: 8, gray: MUTED });
    page.text("Quotation " + q.quoteNo + " (continued)", RIGHT, y + 8, { size: 8, gray: MUTED, align: "right" });
    y += 20;
  };

  const para = (text, opts = {}) => {
    const size = opts.size || 8.5;
    const lines = wrap(text, RIGHT - M, size, opts.bold);
    need(lines.length * (size + 3) + 4);
    for (const line of lines) {
      page.text(line, opts.x == null ? M : opts.x, y + size, { size, bold: opts.bold, gray: opts.gray });
      y += size + 3;
    }
    y += opts.gap == null ? 4 : opts.gap;
  };

  const heading = (text) => {
    need(24);
    y += 6;
    page.text(text.toUpperCase(), M, y + 9, { size: 9, bold: true });
    y += 14;
  };

  // ---- letterhead ----------------------------------------------------------
  page.text("MACC", M, y + 20, { size: 22, bold: true });
  page.text("SYSTEMS & ENGINEERING INC.", M, y + 32, { size: 8, bold: true, gray: 0.25 });
  page.text("Talustusan, Naval, Biliran, Philippines", M, y + 44, { size: 8, gray: MUTED });
  page.text("0955 723 5093 · official@macc-inc.com", M, y + 54, { size: 8, gray: MUTED });
  page.text("Solar supply, fabrication and installation", M, y + 64, { size: 8, gray: MUTED });

  page.text("QUOTATION", RIGHT, y + 12, { size: 11, bold: true, align: "right" });
  page.text("No. " + q.quoteNo, RIGHT, y + 26, { size: 8.5, align: "right" });
  page.text("Date: " + q.date, RIGHT, y + 37, { size: 8.5, align: "right" });
  page.text("Valid until: " + q.validUntil, RIGHT, y + 48, { size: 8.5, align: "right" });
  y += 72;
  page.line(M, y, RIGHT, y, { lineWidth: 1.2 });
  y += 16;

  // ---- parties -------------------------------------------------------------
  const half = (RIGHT - M - 14) / 2;
  const boxTop = y;
  const partyLines = [
    ["PREPARED FOR", [q.customer.name, q.customer.address, q.customer.phone, q.customer.email].filter(Boolean)],
    ["PREPARED BY", [q.preparedBy, "MACC Systems & Engineering Inc.", q.packageLabel + " package"].filter(Boolean)],
  ];
  let boxHeight = 0;
  partyLines.forEach(([, lines]) => { boxHeight = Math.max(boxHeight, 20 + lines.length * 11 + 6); });
  partyLines.forEach(([label, lines], i) => {
    const x = M + i * (half + 14);
    page.stroke(x, boxTop, half, boxHeight, { gray: 0.6 });
    page.text(label, x + 7, boxTop + 12, { size: 7, bold: true, gray: 0.35 });
    lines.forEach((line, n) => {
      page.text(line, x + 7, boxTop + 25 + n * 11, { size: 8.5 });
    });
  });
  y = boxTop + boxHeight + 16;

  // ---- headline: price and the outcome it buys -----------------------------
  // A price never appears without its outcome (Founder OS §3), so these live in
  // one band and are written together.
  const cells = [
    ["TOTAL INVESTMENT", pesoShort(q.customerPrice), "All-in, installed"],
    ["EST. MONTHLY SAVINGS", pesoShort(q.savedPerMonth), q.savingsBasis],
    ["SYSTEM SIZE", q.kwp.toFixed(2) + " kWp", q.panelSummary],
    ["BATTERY STORAGE", q.batteryLabel, q.batteryNote],
  ];
  const cw = (RIGHT - M) / 4;
  const bandH = 40;
  page.rect(M, y, cw, bandH, { rgb: [0.992, 0.953, 0.839] });
  page.stroke(M, y, RIGHT - M, bandH, { gray: 0 });
  cells.forEach(([label, value, note], i) => {
    const x = M + i * cw;
    if (i > 0) page.line(x, y, x, y + bandH, { gray: 0.8 });
    page.text(label, x + 7, y + 12, { size: 6.5, bold: true, gray: 0.35 });
    page.text(value, x + 7, y + 25, { size: 11, bold: true });
    page.text(note, x + 7, y + 35, { size: 6.5, gray: 0.4 });
  });
  y += bandH + 16;

  // ---- what the price includes ---------------------------------------------
  // Scope, not a shopping list. Each row is a heading and a sentence; the detail
  // wraps, so a row is as tall as its text rather than a fixed 13pt.
  const tableHead = () => {
    page.rect(M, y, RIGHT - M, ROW_H + 2, { gray: 0.93 });
    page.stroke(M, y, RIGHT - M, ROW_H + 2, { gray: 0.55 });
    page.text("WHAT'S INCLUDED IN THIS PRICE", COL.item, y + 10, { size: 8, bold: true });
    y += ROW_H + 2;
  };
  tableHead();

  for (const row of q.scope || []) {
    const label = String(row.label || "").trim();
    const detail = String(row.detail || "").trim();
    // A line with only one half filled in spans the whole row. Printing an empty
    // cell next to a heading reads as something the quote forgot to say.
    const full = !label || !detail;
    const text = full ? (label || detail) : detail;
    const lines = wrap(text, (full ? RIGHT - COL.item : RIGHT - COL.detail) - 12, 8.5, full && !!label);
    // The heading wraps rather than being clipped: the browser sheet wraps it, and
    // a founder who proof-read a two-line heading on screen must get one on paper.
    const keyLines = full ? [] : wrap(label, COL.detail - COL.item - 16, 8.5, true);
    const h = Math.max(ROW_H + 3, Math.max(lines.length, keyLines.length) * LINE_H + 6);
    if (y + h > A4.height - M - 40) {
      need(999);          // force the page break, then repeat the header
      tableHead();
    }
    page.stroke(M, y, RIGHT - M, h, { gray: 0.6 });

    if (full) {
      lines.forEach((line, i) => page.text(line, COL.item, y + 11 + i * LINE_H, { size: 8.5, bold: !!label }));
    } else {
      page.line(COL.detail - 8, y, COL.detail - 8, y + h, { gray: 0.6 });
      keyLines.forEach((line, i) => page.text(line, COL.item, y + 11 + i * LINE_H, { size: 8.5, bold: true }));
      lines.forEach((line, i) => page.text(line, COL.detail, y + 11 + i * LINE_H, { size: 8.5 }));
    }
    y += h;
  }

  // One price, set apart from the scope above it. It comes off the SC-06 ladder,
  // and there is no arithmetic on this document for a customer to reverse-engineer.
  page.rect(M, y, RIGHT - M, ROW_H + 4, { rgb: [0.992, 0.941, 0.812] });
  page.stroke(M, y, RIGHT - M, ROW_H + 4, { gray: 0, lineWidth: 1 });
  page.text("CONTRACT PRICE (fixed package)", COL.item, y + 11, { size: 9, bold: true });
  page.text(peso(q.customerPrice), COL.total, y + 11, { size: 9, bold: true, align: "right" });
  y += ROW_H + 4 + 8;

  // The reason the price is what it is (§3). With no itemised build-up on this
  // document, this sentence is the customer's only explanation for a number below
  // what established installers charge — so it prints whenever the sheet carries it.
  if (q.priceNote) {
    para(q.priceNote, { size: 7.5, gray: 0.4, gap: 10 });
  } else {
    y += 8;
  }

  // ---- brownout truth ------------------------------------------------------
  // Triggered by the ABSENCE OF A BATTERY, never by the package name: a hybrid
  // quoted without storage backs nothing up either (Founder OS §1.6).
  if (q.brownout) {
    const lines = wrap(q.brownout, RIGHT - M - 18, 8);
    const h = 16 + lines.length * 10 + 8;
    need(h + 10);
    page.stroke(M, y, RIGHT - M, h, { gray: 0, lineWidth: 1.2 });
    page.text("WHAT HAPPENS DURING A BROWNOUT", M + 9, y + 13, { size: 7.5, bold: true });
    lines.forEach((line, i) => page.text(line, M + 9, y + 25 + i * 10, { size: 8 }));
    y += h + 12;
  }

  // ---- indicative stamp ----------------------------------------------------
  if (q.indicative) {
    const lines = wrap(q.indicative, RIGHT - M - 18, 8);
    const h = 16 + lines.length * 10 + 8;
    need(h + 10);
    page.stroke(M, y, RIGHT - M, h, { gray: 0, lineWidth: 1.2 });
    page.text("INDICATIVE QUOTATION", M + 9, y + 13, { size: 7.5, bold: true });
    lines.forEach((line, i) => page.text(line, M + 9, y + 25 + i * 10, { size: 8 }));
    y += h + 12;
  }

  // ---- compliance gate -----------------------------------------------------
  // Prints on every quote. It cannot be switched off, and a deposit cannot be
  // accepted until all of it is signed off (Founder OS §7).
  {
    const items = q.checklist.map((t) => wrap(t, RIGHT - M - 34, 8));
    const h = 22 + items.reduce((n, l) => n + l.length * 10 + 3, 0) + 8;
    need(h + 10);
    page.stroke(M, y, RIGHT - M, h, { gray: 0, lineWidth: 1.2 });
    page.text("COMPLIANCE CHECKLIST - COMPLETED BEFORE ANY DEPOSIT IS ACCEPTED", M + 9, y + 14, { size: 8, bold: true });
    let iy = y + 27;
    items.forEach((lines) => {
      page.stroke(M + 12, iy - 6, 7, 7, { gray: 0 });
      lines.forEach((line, i) => page.text(line, M + 26, iy + i * 10, { size: 8 }));
      iy += lines.length * 10 + 3;
    });
    y += h + 12;
  }

  // ---- what happens next ---------------------------------------------------
  heading("What happens next");
  q.steps.forEach((step, i) => para((i + 1) + ".  " + step, { size: 8, gap: 1 }));
  y += 6;

  // ---- warranties, basis, terms -------------------------------------------
  heading("Warranties");
  q.warranties.forEach((w) => para("-  " + w, { size: 8, gap: 1 }));

  heading("Basis of the savings estimate");
  para(q.basis, { size: 8 });

  if (q.terms && q.terms.length) {
    heading("Terms");
    q.terms.forEach((t) => para("-  " + t, { size: 8, gap: 1 }));
  }

  // ---- signatures ----------------------------------------------------------
  need(60);
  y += 14;
  page.line(M, y, M + half, y, { gray: 0 });
  page.line(M + half + 14, y, RIGHT, y, { gray: 0 });
  page.text("Conforme - Customer signature over printed name / Date", M, y + 11, { size: 7.5 });
  page.text("For MACC Systems & Engineering Inc. - " + q.preparedBy + " / Date", M + half + 14, y + 11, { size: 7.5 });
  y += 26;

  page.line(M, y, RIGHT, y, { gray: 0.75 });
  wrap(
    "This quotation is confidential and prepared solely for the named customer. Equipment prices marked " +
    "indicative are market estimates pending supplier confirmation.",
    RIGHT - M, 7
  ).forEach((line, i) => page.text(line, M, y + 11 + i * 9, { size: 7, gray: 0.4 }));

  return buildPdf(pages, { title: "Quotation " + q.quoteNo, author: "MACC Systems & Engineering Inc." });
}
