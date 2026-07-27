/**
 * Minimal PDF writer — enough to lay out a quotation, and nothing else.
 *
 * Why hand-rolled: this repo has no build step and no package.json, and the two
 * existing generators (scripts/build-pages.mjs, scripts/build-workbook.py) are
 * dependency-free for the same reason. A PDF that only needs positioned text,
 * rules and filled rectangles in the standard-14 fonts does not justify pulling a
 * bundler into a Pages Function — the whole format we use here is ~200 lines.
 *
 * Scope, deliberately: Helvetica / Helvetica-Bold only (standard-14, so no font
 * program is embedded and no font licence travels with the file), WinAnsi text,
 * uncompressed content streams. A quotation is a page of words, rules and
 * numbers; nothing here needs images, transparency or shading.
 *
 * Everything is in PDF points (72 per inch). A4 is 595.28 x 841.89.
 */

export const A4 = { width: 595.28, height: 841.89 };

/* --- text metrics -----------------------------------------------------------
 * Right-aligning a peso column means knowing how wide a string is before it is
 * drawn, which means the font's advance widths. These are the Adobe AFM widths
 * for Helvetica and Helvetica-Bold, in 1/1000 em, for the printable ASCII range
 * we actually emit (32..126). Anything outside that falls back to the width of
 * "n", which is close enough for the Latin-1 accents that may appear in a name.
 */
const HELV = [
  278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
  556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,
];
const HELV_BOLD = [
  278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
  975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
  333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
  611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,
];

/** Width of `text` at `size`, in points, for the given face. */
export function textWidth(text, size, bold) {
  const table = bold ? HELV_BOLD : HELV;
  let mils = 0;
  const s = String(text == null ? "" : text);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    mils += c >= 32 && c <= 126 ? table[c - 32] : table[110 - 32];
  }
  return (mils * size) / 1000;
}

/**
 * Map a JS string onto WinAnsi and escape what the PDF string syntax reserves.
 * The peso sign is the one character that matters here and is NOT in WinAnsi, so
 * it is transliterated to "PHP " rather than silently dropped — a quotation that
 * loses its currency marker is worse than one that spells it out.
 */
function pdfString(text) {
  const s = String(text == null ? "" : text)
    .replace(/₱/g, "PHP ")   // ₱
    .replace(/—/g, "-")      // em dash
    .replace(/–/g, "-")      // en dash
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, "-")      // middle dot
    .replace(/≈/g, "~")      // almost-equal
    .replace(/×/g, "x")      // multiplication sign
    .replace(/→/g, "->");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s[i];
    if (ch === "\\" || ch === "(" || ch === ")") out += "\\" + ch;
    else if (c >= 32 && c <= 126) out += ch;
    else if (c <= 255) out += "\\" + c.toString(8).padStart(3, "0");
    else out += "?";
  }
  return out;
}

/** Break `text` into lines that fit `width` at `size`. Greedy, on spaces. */
export function wrap(text, width, size, bold) {
  const words = String(text == null ? "" : text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (line && textWidth(candidate, size, bold) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/**
 * A page under construction. Coordinates are given the way a document reads —
 * y measured DOWN from the top edge — and flipped to PDF's origin-at-bottom on
 * the way out, so callers never have to think in upside-down space.
 */
export class Page {
  constructor(size = A4) {
    this.size = size;
    this.ops = [];
  }

  /** Draw text. `align` is "left" | "right" | "center" relative to x. */
  text(str, x, y, opts = {}) {
    const size = opts.size || 9;
    const bold = !!opts.bold;
    const gray = opts.gray == null ? 0 : opts.gray;
    let tx = x;
    if (opts.align === "right") tx = x - textWidth(str, size, bold);
    else if (opts.align === "center") tx = x - textWidth(str, size, bold) / 2;
    this.ops.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${gray} g ` +
      `1 0 0 1 ${tx.toFixed(2)} ${(this.size.height - y).toFixed(2)} Tm ` +
      `(${pdfString(str)}) Tj ET`
    );
    return this;
  }

  /** Filled rectangle. `gray` 0 = black, 1 = white; or pass rgb: [r,g,b] 0..1. */
  rect(x, y, w, h, opts = {}) {
    const y0 = this.size.height - y - h;
    if (opts.rgb) this.ops.push(`${opts.rgb.map(n => n.toFixed(3)).join(" ")} rg`);
    else this.ops.push(`${opts.gray == null ? 0.9 : opts.gray} g`);
    this.ops.push(`${x.toFixed(2)} ${y0.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    return this;
  }

  /** Rectangle outline. */
  stroke(x, y, w, h, opts = {}) {
    const y0 = this.size.height - y - h;
    this.ops.push(`${opts.gray == null ? 0 : opts.gray} G ${(opts.lineWidth || 0.5).toFixed(2)} w`);
    this.ops.push(`${x.toFixed(2)} ${y0.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    return this;
  }

  /** Horizontal rule. */
  line(x1, y1, x2, y2, opts = {}) {
    this.ops.push(`${opts.gray == null ? 0 : opts.gray} G ${(opts.lineWidth || 0.5).toFixed(2)} w`);
    this.ops.push(
      `${x1.toFixed(2)} ${(this.size.height - y1).toFixed(2)} m ` +
      `${x2.toFixed(2)} ${(this.size.height - y2).toFixed(2)} l S`
    );
    return this;
  }

  content() {
    return this.ops.join("\n");
  }
}

/**
 * Serialise pages into a PDF file. Returns a Uint8Array.
 *
 * Cross-reference offsets are byte offsets into the finished file, so the body
 * is assembled as bytes first and the table written from the real positions —
 * getting this wrong produces a file that opens in some readers and not others.
 */
export function buildPdf(pages, meta = {}) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const push = (str) => {
    const bytes = enc.encode(str);
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObject = () => offsets.push(length);

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  const pageCount = pages.length;
  //  1 catalog · 2 pages · 3 F1 · 4 F2 · 5 info · then per page: page obj + content
  const pageObjId = (i) => 6 + i * 2;
  const contentObjId = (i) => 7 + i * 2;

  startObject();
  push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObject();
  const kids = pages.map((_, i) => `${pageObjId(i)} 0 R`).join(" ");
  push(`2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>\nendobj\n`);

  startObject();
  push("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n");

  startObject();
  push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n");

  startObject();
  push(
    `5 0 obj\n<< /Title (${pdfString(meta.title || "Quotation")}) ` +
    `/Author (${pdfString(meta.author || "MACC Systems & Engineering Inc.")}) ` +
    `/Producer (${pdfString("MACC Command Center")}) >>\nendobj\n`
  );

  pages.forEach((page, i) => {
    const body = page.content();
    startObject();
    push(
      `${pageObjId(i)} 0 obj\n<< /Type /Page /Parent 2 0 R ` +
      `/MediaBox [0 0 ${page.size.width.toFixed(2)} ${page.size.height.toFixed(2)}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ` +
      `/Contents ${contentObjId(i)} 0 R >>\nendobj\n`
    );
    startObject();
    push(
      `${contentObjId(i)} 0 obj\n<< /Length ${enc.encode(body).length} >>\nstream\n` +
      body + "\nendstream\nendobj\n"
    );
  });

  const xrefStart = length;
  const objCount = offsets.length; // offsets[0] is the free entry
  let xref = `xref\n0 ${objCount}\n0000000000 65535 f \n`;
  for (let i = 1; i < objCount; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  push(xref);
  push(`trailer\n<< /Size ${objCount} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Base64 for the email attachment payload, chunked so large files don't blow the stack. */
export function toBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(binary);
}
