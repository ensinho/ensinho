// Renders the profile's mascots to plain SVG in profile/mascot/.
//
//   node scripts/render-mascot.mjs <pokemonTeamBuilder checkout> <devquest checkout>
//
// The ghost is drawn by PokemonBuilder's rig (src/utils/mascot/rig.js) and the fox
// by DevQuest's sprite sheet (devquest/src/components/companion/pixelSprites.js).
// GitHub shows README images as plain <img>, so every CSS variable is resolved here
// to a literal colour: the output has no dependency on either app.
import { pathToFileURL } from 'node:url';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [,, ptb, dq] = process.argv;
if (!ptb || !dq) { console.error('usage: node scripts/render-mascot.mjs <pokemonTeamBuilder> <devquest>'); process.exit(1); }
const OUT = 'profile/mascot';

// PokemonBuilder's dark brand palette (index.css brand layer), as plain values.
const TOKENS = {
  'm-line': '#B860F8', 'm-eye': '#F8F4FF', 'm-fang': '#F8F4FF', 'm-fang-edge': 'transparent', 'm-mouth': '#B860F8',
  'm-blush': '#B860F8', 'm-fill': '#200048', 'm-bg': '#200048', 'm-glint': '#FFFFFF', 'm-heart': '#F95587', 'm-tear': '#B4CBF8',
  'm-anger': '#DA8683', 'm-gold': '#FFD23F', 'm-gold-ink': '#8D6E29', 'm-live': '#FF3D9A', 'm-shadow': 'rgba(0,0,0,.35)',
  'm-smoke': '#9C8FB8', 'm-hat': '#3A1A6E', 'm-shade': '#1B0A3D', 'm-orb': '#3F1A7A', 'm-sil': '#FFFFFF', 'm-cape': '#3A1A6E',
  'm-ledge': '#2A1060', 'm-tongue': '#FCA9C9', 'm-tone-mix': '#F4F1FA', 'mascot-shiny': '#5CC8FF',
};
const resolve = (svg) => svg.replace(/var\(--([a-z-]+)(?:,\s*([^)]+))?\)/g, (m, name, fb) => TOKENS[name] ?? fb ?? m);

const rig = await import(pathToFileURL(path.join(ptb, 'src/utils/mascot/rig.js')).href);
const cat = await import(pathToFileURL(path.join(ptb, 'src/utils/mascot/catalog.js')).href);
const GHOSTS = {
  'ghost-wave': ['radiante', 'acenando', { hat: 'headphones' }],
  'ghost-headphones': ['feliz', 'parado', { hat: 'headphones' }],
  'ghost-champion': ['radiante', 'campeao'],
  'ghost-magnifier': ['curioso', 'investigando'],
  'ghost-laptop': ['concentrado', 'trabalhando', { hat: 'headphones' }],
};
for (const [id, [mood, pose, extra]] of Object.entries(GHOSTS)) {
  const p = { ...cat.MOODS[mood], ...cat.POSES[pose], ...(extra || {}) };
  const view = pose === 'parado' ? rig.VIEWS.head : rig.VIEWS.body;
  writeFileSync(path.join(OUT, `${id}.svg`), resolve(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${rig.mascotInner(p)}</svg>`) + '\n');
}

// pixelSprites.js is an ES module without a .js-aware package.json around it: copy it to .mjs to import it.
const tmp = path.join(mkdtempSync(path.join(tmpdir(), 'sprites-')), 'pixelSprites.mjs');
copyFileSync(path.join(dq, 'devquest/src/components/companion/pixelSprites.js'), tmp);
const px = await import(pathToFileURL(tmp).href);
const FOX = { outline: '#141b3a', shade: '#2449c2', body: '#4d7af5', light: '#a3bcff', belly: '#f2f4fa', eye: '#0a0f1e', shine: '#ffffff',
  blush: '#ff74cc', accent: '#ffcb35', accent2: '#fff0b3', 'hat-light': '#a3bcff', spark: '#ffcb35', drop: '#a3bcff' };
const art = px.getStageArt(1);
const layer = (paths) => Object.entries(paths).map(([k, d]) => `<path fill="${FOX[k]}" d="${d}"/>`).join('');
writeFileSync(path.join(OUT, 'kitsuby.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">${art.shadow ? `<path fill="rgba(0,0,0,.28)" d="${art.shadow}"/>` : ''}${layer(art.tail[0])}${layer(art.body)}${layer(art.eyes.happy)}${layer(art.spark)}</svg>\n`);
console.log(`${OUT}: ${Object.keys(GHOSTS).join(', ')}, kitsuby`);
