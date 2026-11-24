// Captures each project's live site into profile/covers/<key>.jpg (the card banners).
//
//   npm run covers                 every cover in profile.config.json
//   npm run covers -- devquest     only the ones named
//
// Run it when a site changes; the daily build only embeds what is already here.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadChromium } from './lib/playwright.mjs';

const config = JSON.parse(readFileSync('profile.config.json', 'utf8'));
const only = process.argv.slice(2);
const entries = Object.entries(config.covers).filter(([key]) => !only.length || only.includes(key));

const chromium = loadChromium();
const browser = await chromium.launch();
for (const [key, c] of entries) {
  // 0.75 scale keeps each banner near 900px wide: sharp at GitHub's 50% column, light in base64.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 0.75, colorScheme: c.colorScheme || 'dark', locale: c.locale || 'en-US' });
  const page = await ctx.newPage();
  await page.goto(c.url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  if (c.click) {
    const target = page.getByText(c.click, { exact: true });
    if (await target.count()) await target.first().click();
  }
  await page.waitForTimeout(c.wait ?? 3000);
  const [x, y, width, height] = c.clip;
  const file = path.join('profile/covers', `${key}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 80, clip: { x, y, width, height } });
  console.log(`${file}  ${c.url}`);
  await ctx.close();
}
await browser.close();
