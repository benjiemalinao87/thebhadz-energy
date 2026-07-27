// Regenerates icon16/32/48/128.png. Dev-time only (Node built-ins, no deps —
// matches the repo's no-package.json philosophy): node make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(size, pixels) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * stride + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Point is inside a rounded rect if its distance to the clamped inner-corner box ≤ r.
function inRounded(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  const cx = Math.max(x0 + r, Math.min(x1 - r, x + 0.5));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y + 0.5));
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  return dx * dx + dy * dy <= r * r;
}

function draw(size) {
  const px = new Uint8Array(size * size * 4);
  const put = (x, y, rgb, a = 255) => {
    const i = (y * size + x) * 4;
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = a;
  };

  const navyTop = [23, 51, 95];
  const navyBot = [10, 30, 60];
  const white = [248, 250, 252];
  const green = [33, 163, 102];   // sheet header band
  const gray = [195, 204, 217];   // data rows
  const orange = [245, 158, 11];  // highlighted "price" cell

  const R = size * 0.21;
  const cx0 = Math.round(size * 0.20);
  const cx1 = size - cx0;
  const cy0 = Math.round(size * 0.18);
  const cy1 = size - cy0;
  const cardR = Math.max(1, size * 0.045);
  const band = Math.max(2, Math.round((cy1 - cy0) * 0.24));
  const pad = Math.max(1, Math.round(size * 0.05));
  const th = Math.max(1, Math.round(size * 0.05));
  const spacing = (cy1 - (cy0 + band)) / 4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inRounded(x, y, 0, 0, size, size, R)) { put(x, y, [0, 0, 0], 0); continue; }
      const t = y / size;
      let rgb = [
        Math.round(navyTop[0] + (navyBot[0] - navyTop[0]) * t),
        Math.round(navyTop[1] + (navyBot[1] - navyTop[1]) * t),
        Math.round(navyTop[2] + (navyBot[2] - navyTop[2]) * t)
      ];
      if (inRounded(x, y, cx0, cy0, cx1, cy1, cardR)) {
        rgb = y < cy0 + band ? green : white;
        for (let k = 1; k <= 3; k++) {
          const yk = cy0 + band + spacing * k;
          if (Math.abs(y + 0.5 - yk) < th / 2 + 0.01 && x >= cx0 + pad && x < cx1 - pad) {
            const orangeRow = size >= 32 && k === 1 && x < cx0 + pad + Math.round((cx1 - cx0) * 0.4);
            rgb = orangeRow ? orange : gray;
          }
        }
      }
      put(x, y, rgb);
    }
  }
  return px;
}

for (const size of [16, 32, 48, 128]) {
  const file = join(here, `icon${size}.png`);
  writeFileSync(file, png(size, draw(size)));
  console.log('wrote', file);
}
