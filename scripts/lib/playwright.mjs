// Loads Playwright for the optional local tools (covers, font metrics).
// The daily build never needs it: it runs on Node's standard library only.
import { createRequire } from 'node:module';

export function loadChromium() {
  const require = createRequire(import.meta.url);
  for (const name of ['playwright', 'playwright-core']) {
    try { return require(name).chromium; } catch { /* try the next one */ }
  }
  throw new Error('This tool needs Playwright. Run `npm install` first (it is a devDependency), then `npx playwright install chromium`.');
}
