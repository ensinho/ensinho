// Indexed PNG and animated PNG (APNG) encoder on Node's standard library.
// The header's dithered band is one APNG: GitHub strips scripts from README images,
// but an animated PNG inside an SVG still plays.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const u32 = (...values) => { const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeUInt32BE(v, i * 4)); return b; };
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Filter-0 scanlines, deflated: the payload of IDAT / fdAT. */
function pixelsData(indices, width, height) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = indices[y * width + x];
  }
  return deflateSync(raw, { level: 9 });
}

/**
 * frames: Uint8Array palette indices (width × height each). One frame → a plain PNG.
 * palette: hex colours. frameMs: delay between frames; the animation loops forever.
 */
export function encodeIndexedPng(frames, { width, height, palette, frameMs = 100 }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // indexed colour
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(palette.flatMap(hexToRgb)))];
  if (frames.length === 1) {
    parts.push(chunk('IDAT', pixelsData(frames[0], width, height)));
  } else {
    parts.push(chunk('acTL', u32(frames.length, 0)));
    let seq = 0;
    frames.forEach((frame, i) => {
      const fctl = Buffer.alloc(26);
      fctl.writeUInt32BE(seq++, 0);
      fctl.writeUInt32BE(width, 4);
      fctl.writeUInt32BE(height, 8);
      fctl.writeUInt32BE(0, 12);
      fctl.writeUInt32BE(0, 16);
      fctl.writeUInt16BE(frameMs, 20);
      fctl.writeUInt16BE(1000, 22);
      fctl[24] = 0; // dispose: none
      fctl[25] = 0; // blend: source
      parts.push(chunk('fcTL', fctl));
      const data = pixelsData(frame, width, height);
      if (i === 0) parts.push(chunk('IDAT', data));
      else parts.push(chunk('fdAT', Buffer.concat([u32(seq++), data])));
    });
  }
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
