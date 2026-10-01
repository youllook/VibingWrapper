// Draws the ice-diamond icon and writes assets/icon.ico (16/32/48/256, 32-bit BMP entries).
const fs = require('fs');
const path = require('path');

function drawBGRA(S) {
  const buf = Buffer.alloc(S * S * 4), c = (S - 1) / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.abs(x - c) / (S * 0.36) + Math.abs(y - c) / (S * 0.48);
    if (d > 1) continue;
    const i = (y * S + x) * 4;
    const lit = (x - c) + (y - c) < 0 ? 1 : 0.72;          // brighter top-left facet
    const rim = d > 0.9 ? 1 : 0;
    buf[i] = Math.round(255 * lit);                        // B
    buf[i + 1] = Math.round((rim ? 245 : 222) * lit);      // G
    buf[i + 2] = Math.round((rim ? 230 : 165) * lit);      // R
    buf[i + 3] = rim ? 255 : 225;                          // A
  }
  return buf;
}

function bmpEntry(S) {
  const px = drawBGRA(S);
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(S, 4); header.writeInt32LE(S * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
  header.writeUInt32LE(S * S * 4, 20);
  const rows = [];                                         // DIB rows are bottom-up
  for (let y = S - 1; y >= 0; y--) rows.push(px.subarray(y * S * 4, (y + 1) * S * 4));
  const maskRow = Math.ceil(S / 32) * 4;
  return Buffer.concat([header, ...rows, Buffer.alloc(maskRow * S)]);
}

const sizes = [16, 32, 48, 256];
const images = sizes.map(bmpEntry);
const dir = Buffer.alloc(6 + 16 * sizes.length);
dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(sizes.length, 4);
let offset = dir.length;
sizes.forEach((S, k) => {
  const e = 6 + 16 * k;
  dir.writeUInt8(S >= 256 ? 0 : S, e); dir.writeUInt8(S >= 256 ? 0 : S, e + 1);
  dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(images[k].length, e + 8); dir.writeUInt32LE(offset, e + 12);
  offset += images[k].length;
});
const out = path.join(__dirname, '..', 'assets', 'icon-ice.ico');   // old ice icon; the app now uses the StarWeather logo (assets/icon.ico, 2026-09-30)
fs.writeFileSync(out, Buffer.concat([dir, ...images]));
console.log('wrote', out);
