// Measures glyph advances for the embedded fonts and writes fonts/metrics.json.
// SVG has no text layout, so the build wraps and right-aligns text with these numbers.
//
//   node scripts/measure-fonts.mjs      (needs Playwright; run it when a font changes)
import { readFileSync, writeFileSync } from 'node:fs';
import { loadChromium } from './lib/playwright.mjs';

const FONTS = {
  'Geist': { file: 'fonts/Geist-latin.woff2', weights: [300, 400, 500, 600] },
  'Geist Mono': { file: 'fonts/GeistMono-latin.woff2', weights: [400, 500, 600] },
};
const CHARS = [...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)),
  ...'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ·–—‘’“”…•×°'];

const faces = Object.entries(FONTS).map(([family, f]) =>
  `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${readFileSync(f.file).toString('base64')}) format('woff2');font-weight:100 900}`).join('');

const chromium = loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<style>${faces}</style><p style="font-family:Geist">a</p><p style="font-family:'Geist Mono'">a</p>`);
await page.evaluate(() => document.fonts.ready);
const out = {};
for (const [family, f] of Object.entries(FONTS)) {
  out[family] = {};
  for (const w of f.weights) {
    out[family][w] = await page.evaluate(([fam, weight, chars]) => {
      const c = document.createElement('canvas').getContext('2d');
      c.font = `${weight} 1000px '${fam}'`;
      return Object.fromEntries(chars.map((ch) => [ch, Math.round(c.measureText(ch).width) / 1000]));
    }, [family, w, CHARS]);
  }
}
await browser.close();
writeFileSync('fonts/metrics.json', JSON.stringify(out) + '\n');
console.log('fonts/metrics.json:', Object.entries(out).map(([k, v]) => `${k} ${Object.keys(v).join('/')}`).join(', '));
