// Packs the extension into a Chrome Web Store-ready zip.
//
//   node tools/product-scraper-extension/pack.mjs
//   → dist/macc-field-kit-2.2.0.zip
//
// The Web Store wants manifest.json at the ROOT of the archive (not inside a
// folder), and it rejects anything containing files the listing doesn't need. So
// this ships only what the extension loads at runtime: no tests, no README, no
// icon generator, no packer.
//
// Zero dependencies and a hand-rolled ZIP writer, same reasoning as
// icons/make-icons.mjs — this repo has no package.json and is not getting one for
// a hundred lines of well-specified binary format. Every timestamp is pinned so the
// same source always produces a byte-identical archive; a zip whose hash changes
// on every run tells you nothing about whether the contents changed.

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(ROOT, 'dist');

// Everything here is developer-side only. Shipping it would enlarge the package,
// widen the review surface, and put our test fixtures in front of a reviewer.
const EXCLUDE = [
  /^dist[/\\]/,
  /^test[/\\]/,
  /^README\.md$/,
  /^pack\.mjs$/,
  /^icons[/\\]make-icons\.mjs$/,
  /(^|[/\\])\.DS_Store$/,
  /\.zip$/,
];

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const rel = relative(base, full).split('\\').join('/');
    if (statSync(full).isDirectory()) walk(full, base, out);
    else if (!EXCLUDE.some((re) => re.test(rel))) out.push(rel);
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// 1980-01-01 00:00:00 in DOS format — the epoch of the ZIP timestamp field, and the
// conventional choice for reproducible archives.
const DOS_TIME = 0;
const DOS_DATE = 33;

function localHeader(name, crc, compressed, raw) {
  const nameBuf = Buffer.from(name, 'utf8');
  const h = Buffer.alloc(30 + nameBuf.length);
  h.writeUInt32LE(0x04034b50, 0);   // signature
  h.writeUInt16LE(20, 4);           // version needed
  h.writeUInt16LE(0, 6);            // flags
  h.writeUInt16LE(8, 8);            // method: deflate
  h.writeUInt16LE(DOS_TIME, 10);
  h.writeUInt16LE(DOS_DATE, 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(compressed, 18);
  h.writeUInt32LE(raw, 22);
  h.writeUInt16LE(nameBuf.length, 26);
  h.writeUInt16LE(0, 28);           // extra field length
  nameBuf.copy(h, 30);
  return h;
}

function centralHeader(name, crc, compressed, raw, offset) {
  const nameBuf = Buffer.from(name, 'utf8');
  const h = Buffer.alloc(46 + nameBuf.length);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(20, 4);           // version made by
  h.writeUInt16LE(20, 6);           // version needed
  h.writeUInt16LE(0, 8);
  h.writeUInt16LE(8, 10);
  h.writeUInt16LE(DOS_TIME, 12);
  h.writeUInt16LE(DOS_DATE, 14);
  h.writeUInt32LE(crc, 16);
  h.writeUInt32LE(compressed, 20);
  h.writeUInt32LE(raw, 24);
  h.writeUInt16LE(nameBuf.length, 28);
  h.writeUInt16LE(0, 30);           // extra
  h.writeUInt16LE(0, 32);           // comment
  h.writeUInt16LE(0, 34);           // disk number
  h.writeUInt16LE(0, 36);           // internal attrs
  h.writeUInt32LE(0o644 << 16, 38); // external attrs: regular file, rw-r--r--
  h.writeUInt32LE(offset, 42);
  nameBuf.copy(h, 46);
  return h;
}

function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const crc = crc32(data);
    const deflated = deflateRawSync(data, { level: 9 });
    // Deflate can inflate tiny or already-compressed payloads (our PNGs). Falling
    // back to stored would need a second method code per entry; keeping deflate
    // everywhere costs a few bytes and keeps the writer honest.
    const head = localHeader(name, crc, deflated.length, data.length);
    parts.push(head, deflated);
    central.push(centralHeader(name, crc, deflated.length, data.length, offset));
    offset += head.length + deflated.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, dir, end]);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const names = walk(ROOT);

if (!names.includes('manifest.json')) {
  console.error('manifest.json is missing — refusing to build a package without it.');
  process.exit(1);
}

const files = names.map((name) => ({ name, data: readFileSync(join(ROOT, name)) }));
const archive = zip(files);

mkdirSync(OUT_DIR, { recursive: true });
const outName = `macc-field-kit-${manifest.version}.zip`;
writeFileSync(join(OUT_DIR, outName), archive);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`${manifest.name} ${manifest.version} → dist/${outName}  (${kb(archive.length)})`);
for (const name of names) console.log('  ' + name);
console.log(`\n${names.length} files. Upload this zip at https://chrome.google.com/webstore/devconsole`);
console.log('Listing copy, permission justifications and the review answers: docs/chrome-web-store-listing.md');
