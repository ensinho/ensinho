// The header's band: an aurora drawn with 4×4 ordered (Bayer) dithering into five
// palette levels. Every moving term uses a whole multiple of the loop phase, so the
// last frame flows back into the first without a seam.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((n) => (n + 0.5) / 16);
const TAU = Math.PI * 2;

export function ditherFrames({ width = 200, height = 40, frames = 30 } = {}) {
  const out = [];
  for (let i = 0; i < frames; i++) {
    const phase = (i / frames) * TAU;
    const flicker = Math.floor((i / frames) * 8) * (TAU / 8);
    const px = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cy = height * 0.58 + Math.sin(x * 0.045 + phase) * 4.5 + Math.sin(x * 0.013 - phase) * 3.5;
        const spread = 7.5 + 3 * Math.sin(x * 0.07 + phase);
        let v = Math.max(0, 1 - Math.abs(y - cy) / spread);
        v *= 0.62 + 0.38 * Math.sin(x * 0.11 + 2 * phase + Math.sin(y * 0.28));
        if (y < cy) v += 0.5 * 0.45 * Math.max(0, Math.sin(x * 0.9 + flicker)) * Math.max(0, 1 - (cy - y) / 16);
        const level = Math.min(1, v) * 4.15;
        let idx = Math.floor(level);
        if (level - idx > BAYER[(y & 3) * 4 + (x & 3)]) idx++;
        px[y * width + x] = Math.max(0, Math.min(4, idx));
      }
    }
    out.push(px);
  }
  return out;
}
