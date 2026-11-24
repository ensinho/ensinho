// Text measurement for SVG, which has no layout of its own.
// Advances come from fonts/metrics.json (written by scripts/measure-fonts.mjs).
import { readFileSync } from 'node:fs';

const METRICS = JSON.parse(readFileSync(new URL('../../fonts/metrics.json', import.meta.url), 'utf8'));

export const MONO = 'Geist Mono';
export const SANS = 'Geist';

export function measure(text, { family = MONO, weight = 400, size = 13, spacing = 0 } = {}) {
  const table = METRICS[family]?.[weight] || METRICS[family]?.[400] || {};
  const fallback = family === MONO ? 0.6 : 0.56;
  let em = 0;
  for (const ch of text) em += table[ch] ?? fallback;
  return em * size + spacing * [...text].length;
}

/** Greedy word wrap. Returns at most `maxLines`; the last one ends in an ellipsis if text was cut. */
export function wrap(text, maxWidth, font, maxLines = Infinity) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, font) <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(`${kept[maxLines - 1]} ${lines[maxLines]}`, maxWidth, font, true);
  return kept;
}

/** Cuts text to fit maxWidth, ending in "…". `force` adds the ellipsis even if it already fits. */
export function ellipsize(text, maxWidth, font, force = false) {
  if (!force && measure(text, font) <= maxWidth) return text;
  let t = text;
  while (t.length && measure(`${t.trimEnd()}…`, font) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd().replace(/[,.;:]$/, '')}…`;
}

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
