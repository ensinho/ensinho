// Builds README.md and the SVG panels in profile/generated/ from profile.config.json.
//
//   node scripts/build-profile.mjs             fetch fresh numbers from the GitHub API, then build
//   node scripts/build-profile.mjs --offline   build from the last snapshot (profile/generated/data.json)
//
// Node's standard library only. GitHub shows README images as plain <img>: no scripts,
// no external fonts or images. So every panel is a self-contained SVG with its fonts,
// covers and mascots embedded, in a dark and a light version picked by <picture>.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { encodeIndexedPng } from './lib/png.mjs';
import { ditherFrames } from './lib/dither.mjs';
import { measure, wrap, ellipsize, esc, MONO, SANS } from './lib/text.mjs';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const OFFLINE = process.argv.includes('--offline');
const OUT = 'profile/generated';
const SNAPSHOT = path.join(OUT, 'data.json');
const cfg = JSON.parse(readFileSync('profile.config.json', 'utf8'));
validate(cfg);

/* ---------------- data ---------------- */

const fullName = (repo) => (repo.includes('/') ? repo : `${cfg.github.username}/${repo}`);

async function fetchData() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = { 'User-Agent': 'profile-readme-build', Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const get = async (p) => {
    const res = await fetch(`https://api.github.com${p}`, { headers });
    if (!res.ok) throw new Error(`GET ${p}: HTTP ${res.status}`);
    return res.json();
  };
  const user = await get(`/users/${cfg.github.username}`);
  const repos = {};
  for (const key of new Set([...cfg.featured, ...cfg.more])) {
    const r = await get(`/repos/${fullName(cfg.projects[key].repo)}`);
    repos[key] = { name: r.name, language: r.language || '—', stars: r.stargazers_count, pushed_at: r.pushed_at };
  }
  return { user: { public_repos: user.public_repos, followers: user.followers }, repos };
}

let data;
if (!OFFLINE) {
  try { data = await fetchData(); } catch (err) { console.warn(`GitHub API unavailable (${err.message}); using the last snapshot.`); }
}
if (!data) {
  if (!existsSync(SNAPSHOT)) throw new Error(`No snapshot at ${SNAPSHOT}: run once with network access to the GitHub API.`);
  data = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
}

/* ---------------- shared pieces ---------------- */

const FM = `'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
const FS = `'Geist', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`;
const b64 = (file) => readFileSync(file).toString('base64');
const FACE = {
  sans: `@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${b64('fonts/Geist-latin.woff2')}) format('woff2');font-weight:100 900}`,
  mono: `@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,${b64('fonts/GeistMono-latin.woff2')}) format('woff2');font-weight:100 900}`,
};
const r1 = (n) => Math.round(n * 10) / 10;

function text(x, y, str, { family = MONO, weight = 400, size = 13, fill, spacing = 0, anchor } = {}) {
  return `<text x="${r1(x)}" y="${r1(y)}" font-family="${family === MONO ? FM : FS}" font-size="${size}" font-weight="${weight}" fill="${fill}"`
    + `${spacing ? ` letter-spacing="${spacing}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(str)}</text>`;
}
const hline = (x1, x2, y, c) => `<path d="M${x1} ${y + 0.5}H${x2}" stroke="${c}"/>`;
const vline = (x, y1, y2, c) => `<path d="M${x + 0.5} ${y1}V${y2}" stroke="${c}"/>`;
const arrow = (x, y, c, s = 8) => `<path d="M${x} ${y + s}L${x + s} ${y}M${x + s * 0.3} ${y}H${x + s}V${y + s * 0.7}" fill="none" stroke="${c}" stroke-width="1.4"/>`;
function star(cx, cy, r, c) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    return `${r1(cx + Math.cos(a) * rr)} ${r1(cy + Math.sin(a) * rr)}`;
  });
  return `<path d="M${pts.join('L')}Z" fill="${c}"/>`;
}
const ICONS = {
  globe: (x, y, c) => `<g fill="none" stroke="${c}" stroke-width="1.3"><circle cx="${x + 8}" cy="${y + 8}" r="7"/><ellipse cx="${x + 8}" cy="${y + 8}" rx="3" ry="7"/><path d="M${x + 1} ${y + 8}H${x + 15}"/></g>`,
  grid: (x, y, c) => `<g fill="${c}"><rect x="${x + 1}" y="${y + 1}" width="6" height="6"/><rect x="${x + 9}" y="${y + 1}" width="6" height="6"/><rect x="${x + 1}" y="${y + 9}" width="6" height="6"/><rect x="${x + 9}" y="${y + 9}" width="6" height="6"/></g>`,
};

/** A mascot from profile/mascot/, nested as its own <svg> at x, y, size. */
function art(name, x, y, size) {
  const src = readFileSync(`profile/mascot/${name}.svg`, 'utf8');
  const viewBox = src.match(/viewBox="([^"]+)"/)[1];
  const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const crisp = name === 'kitsuby' ? ' shape-rendering="crispEdges"' : '';
  return `<svg x="${r1(x)}" y="${r1(y)}" width="${size}" height="${size}" viewBox="${viewBox}" overflow="visible"${crisp}>${inner}</svg>`;
}

function svg(width, height, title, body, extraCss = '', fonts = ['sans', 'mono']) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">`
    + `<title>${esc(title)}</title><style>${fonts.map((f) => FACE[f]).join('')}${extraCss}</style>${body}</svg>\n`;
}

const date = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Fortaleza' });
const host = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
const fill = (s) => String(s).replace(/\{(\w+)\}/g, (m, k) => data.user[k] ?? m);
const featured = cfg.featured.map((key) => ({ key, ...cfg.projects[key], ...data.repos[key] }));

/* ---------------- header ---------------- */

const BAND = { width: 200, height: 40 };
const frames = ditherFrames({ ...BAND, frames: cfg.motion.frames });

function header(t) {
  const W = 1000, P = cfg.profile;
  const palette = [...t.dither, featured[1]?.accent || t.accent];
  const anim = encodeIndexedPng(frames, { ...BAND, palette, frameMs: cfg.motion.frameMs }).toString('base64');
  const still = encodeIndexedPng([frames[0]], { ...BAND, palette }).toString('base64');
  const bandY = 44, idY = 244, LW = 610;

  let s = '';
  // strip
  s += text(20, 27, P.handle, { weight: 600, size: 13, fill: t.text });
  let x = 20 + measure(P.handle, { weight: 600, size: 13 }) + 22;
  s += `<rect x="${r1(x)}" y="18" width="9" height="9" fill="${t.accent}"/><rect x="${r1(x + 12)}" y="18" width="9" height="9" fill="${palette[4]}"/>`;
  s += text(x + 31, 27, P.status, { weight: 600, size: 12.5, spacing: 1.2, fill: t.text });
  s += text(W - 20, 27, `github.com/${cfg.github.username}`, { size: 12.5, fill: t.muted, anchor: 'end' });
  // band
  const img = (cls, data64) => `<image class="${cls}" x="0" y="${bandY}" width="${W}" height="200" preserveAspectRatio="none" image-rendering="optimizeSpeed" style="image-rendering:crisp-edges;image-rendering:pixelated" href="data:image/png;base64,${data64}"/>`;
  s += img('anim', anim) + img('still', still);
  // identity
  const nameY = idY + 76;
  s += text(28, nameY, P.name, { family: SANS, weight: 300, size: 58, spacing: -1.6, fill: t.text });
  const intro = wrap(P.intro, LW - 56, { family: SANS, size: 16 }, 2);
  intro.forEach((line, i) => { s += text(28, nameY + 36 + i * 23, line, { family: SANS, size: 16, fill: t.text }); });
  const kvY = nameY + 36 + (intro.length - 1) * 23 + 40;
  const rows = [['NOW', `building ${featured.map((p) => p.title).join(' and ')}`], ['HANDLE', `@${cfg.github.username}`]];
  const labelW = Math.max(...rows.map(([l]) => measure(l, { size: 12, spacing: 0.8 })));
  rows.forEach(([l, v], i) => {
    s += text(28, kvY + i * 26, l, { size: 12, spacing: 0.8, fill: t.label });
    s += text(28 + labelW + 30, kvY + i * 26, ellipsize(v, LW - 86 - labelW, { weight: 600, size: 13.5 }), { weight: 600, size: 13.5, fill: t.text });
  });
  const idH = Math.max(kvY + 26 + 30 - idY, 172);
  const H = idY + idH, half = idY + Math.round(idH / 2);
  // facts 2×2
  const cw = (W - LW) / 2;
  P.facts.slice(0, 4).forEach((f, i) => {
    const cx = LW + (i % 2) * cw, cy = i < 2 ? idY : half, ch = i < 2 ? half - idY : H - half;
    s += text(cx + 22, cy + 30, f.label, { size: 11, spacing: 1, fill: t.label });
    s += text(cx + 22, cy + ch - 26, ellipsize(fill(f.value), cw - 40, { weight: 600, size: 16 }), { weight: 600, size: 16, fill: t.text });
  });
  // rules (drawn over the band so its edges stay crisp)
  s += hline(0, W, bandY, t.rule) + hline(0, W, idY, t.rule) + vline(LW, idY, H, t.rule) + hline(LW, W, half, t.rule) + vline(LW + cw, idY, H, t.rule);
  s += `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${t.rule}"/>`;
  // the mascot stands on the band's lower edge
  s += `<g class="float">${art(P.mascot, 820, 118, 150)}</g>`;
  const css = '.still{display:none}.float{animation:float 3.2s ease-in-out infinite}@keyframes float{50%{transform:translateY(-5px)}}'
    + '@media (prefers-reduced-motion:reduce){.anim{display:none}.still{display:inline}.float{animation:none}}';
  return svg(W, H, `${P.name}: ${P.intro}`, `<rect width="${W}" height="${H}" fill="${t.bg}"/>${s}`, css);
}

/* ---------------- project cards ---------------- */

const DESC = { family: SANS, size: 14.5 };
const descLines = Math.min(3, Math.max(...featured.map((p) => wrap(p.description, 464, DESC).length)));

function card(t, p, i) {
  const W = 500, coverY = 40, coverH = 325, bodyY = coverY + coverH;
  let s = '';
  s += text(18, 25, `0${i + 1}`, { weight: 600, size: 12.5, fill: p.accent });
  s += text(18 + measure(`0${i + 1}`, { weight: 600, size: 12.5 }) + 9, 25, p.slug, { weight: 600, size: 12.5, fill: t.text });
  s += text(W - 18, 25, host(p.url), { size: 12, fill: t.muted, anchor: 'end' });
  s += `<image x="0" y="${coverY}" width="${W}" height="${coverH}" preserveAspectRatio="xMinYMin slice" href="data:image/jpeg;base64,${b64(`profile/covers/${p.cover}.jpg`)}"/>`;
  if (p.guest) {
    s += p.guest.corner === 'left'
      ? art(p.guest.art, 20, bodyY - 80, 84)
      : art(p.guest.art, W - 14 - 112, bodyY - 108, 112);
  }
  s += text(18, bodyY + 54, p.title, { family: SANS, size: 30, spacing: -0.6, fill: t.text });
  wrap(p.description, 464, DESC, 3).forEach((line, k) => { s += text(18, bodyY + 84 + k * 21, line, { ...DESC, fill: t.muted }); });
  const y0 = bodyY + 84 + (descLines - 1) * 21 + 28, y1 = y0 + 64, H = y1 + 60;
  [['LANGUAGE', p.language], ['STARS', String(p.stars)], ['UPDATED', date(p.pushed_at)]].forEach(([l, v], k) => {
    const cx = (W / 3) * k;
    s += text(cx + 18, y0 + 26, l, { size: 10.5, spacing: 1, fill: t.label });
    s += text(cx + 18, y0 + 48, v, { weight: 600, size: 14, fill: t.text });
  });
  const label = p.cta.toUpperCase(), lw = measure(label, { weight: 600, size: 12, spacing: 1.2 });
  const bw = Math.round(lw + 18 + 40), bx = W - 18 - bw, by = y1 + 13;
  s += `<rect x="${bx}" y="${by}" width="${bw}" height="34" fill="${p.accent}"/>`;
  s += text(bx + 20, by + 22, label, { weight: 600, size: 12, spacing: 1.2, fill: t.ink });
  s += arrow(bx + 20 + lw + 8, by + 13, t.ink);
  // rules: the second card leaves its left edge to the first, so the pair reads as one grid
  s += hline(0, W, coverY, t.rule) + hline(0, W, bodyY, t.rule) + hline(0, W, y0, t.rule) + hline(0, W, y1, t.rule);
  s += vline(W / 3, y0, y1, t.rule) + vline((W / 3) * 2, y0, y1, t.rule);
  s += hline(0, W, 0, t.rule) + hline(0, W, H - 1, t.rule) + vline(W - 1, 0, H, t.rule) + (i === 0 ? vline(0, 0, H, t.rule) : '');
  return svg(W, H, `${p.title}: ${p.description}`, `<rect width="${W}" height="${H}" fill="${t.bg}"/>${s}`);
}

/* ---------------- more repositories ---------------- */

function repos(t) {
  const W = 1000, head = 42, rowH = 42, list = cfg.more.map((key) => ({ ...cfg.projects[key], ...data.repos[key] }));
  const H = head + rowH * list.length;
  let s = text(20, 26, 'ALSO ON GITHUB', { size: 11, spacing: 1.2, fill: t.label });
  const total = `${data.user.public_repos} REPOSITORIES`;
  s += text(W - 36, 26, total, { size: 11, spacing: 1.2, fill: t.label, anchor: 'end' });
  s += arrow(W - 28, 18, t.label, 7);
  list.forEach((r, i) => {
    const y = head + i * rowH, base = y + 26;
    s += hline(0, W, y, t.rule);
    s += text(20, base, ellipsize(r.name, 200, { weight: 600, size: 13.5 }), { weight: 600, size: 13.5, fill: t.text });
    s += text(240, base, ellipsize(r.short || '', 490, { family: SANS, size: 13.5 }), { family: SANS, size: 13.5, fill: t.muted });
    s += text(760, base, r.language, { size: 12.5, fill: t.muted });
    s += text(W - 20, base, String(r.stars), { weight: 600, size: 12.5, fill: t.text, anchor: 'end' });
    s += star(W - 20 - measure(String(r.stars), { weight: 600, size: 12.5 }) - 11, base - 4.5, 5.5, t.muted);
  });
  s += `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${t.rule}"/>`;
  return svg(W, H, `More repositories by ${cfg.github.username}`, `<rect width="${W}" height="${H}" fill="${t.bg}"/>${s}`);
}

/* ---------------- links ---------------- */

function link(t, l, i) {
  const W = 250, H = 56;
  let s = `<rect x="16.5" y="13.5" width="29" height="29" fill="none" stroke="${t.rule}"/>`;
  if (ICONS[l.icon]) s += ICONS[l.icon](23, 20, t.muted);
  else s += art(l.icon, l.icon === 'kitsuby' ? 19 : 17, l.icon === 'kitsuby' ? 16 : 14, l.icon === 'kitsuby' ? 24 : 28);
  s += text(58, 33, ellipsize(l.label, W - 58 - 36, { size: 13 }), { size: 13, fill: t.text });
  s += arrow(W - 26, 24, t.muted);
  s += hline(0, W, 0, t.rule) + hline(0, W, H - 1, t.rule) + vline(W - 1, 0, H, t.rule) + (i === 0 ? vline(0, 0, H, t.rule) : '');
  return svg(W, H, l.label, `<rect width="${W}" height="${H}" fill="${t.bg}"/>${s}`, '', ['mono']);
}

/* ---------------- write ---------------- */

mkdirSync(OUT, { recursive: true });
const written = new Set(['data.json']);
const hashes = {};
function emit(name, render) {
  const pair = {};
  for (const theme of ['dark', 'light']) {
    pair[theme] = render(cfg.theme[theme]);
    writeFileSync(path.join(OUT, `${name}-${theme}.svg`), pair[theme]);
    written.add(`${name}-${theme}.svg`);
  }
  hashes[name] = createHash('sha1').update(pair.dark + pair.light).digest('hex').slice(0, 10);
}
emit('header', header);
featured.forEach((p, i) => emit(`project-0${i + 1}`, (t) => card(t, p, i)));
emit('repos', repos);
cfg.links.forEach((l, i) => emit(`link-0${i + 1}`, (t) => link(t, l, i)));
writeFileSync(SNAPSHOT, JSON.stringify(data, null, 2) + '\n');
for (const f of readdirSync(OUT)) if (!written.has(f)) rmSync(path.join(OUT, f));

const pic = (name, width, alt) => `<picture><source media="(prefers-color-scheme: dark)" srcset="./${OUT}/${name}-dark.svg?v=${hashes[name]}">`
  + `<source media="(prefers-color-scheme: light)" srcset="./${OUT}/${name}-light.svg?v=${hashes[name]}">`
  + `<img src="./${OUT}/${name}-dark.svg?v=${hashes[name]}" width="${width}" alt="${esc(alt)}"></picture>`;
const P = cfg.profile;
const half = `${100 / featured.length}%`;
const quarter = `${100 / cfg.links.length}%`;
const readme = [
  '<!-- Generated by scripts/build-profile.mjs. Edit profile.config.json, not this file. -->',
  `<p align="center">${pic('header', '100%', `${P.name}: ${P.intro}`)}</p>`,
  // the cards must stay on one line: any whitespace between them becomes a gap and stacks them
  featured.map((p, i) => `<a href="${p.url}">${pic(`project-0${i + 1}`, half, `${p.title}: ${p.short}`)}</a>`).join(''),
  `<a href="https://github.com/${cfg.github.username}?tab=repositories">${pic('repos', '100%', `More repositories by ${cfg.github.username}`)}</a>`,
  `<p align="center">${cfg.links.map((l, i) => `<a href="${l.url}">${pic(`link-0${i + 1}`, quarter, l.label)}</a>`).join('')}</p>`,
].join('\n\n') + '\n';
writeFileSync('README.md', readme);
console.log(`README.md + ${written.size - 1} panels in ${OUT}/ (${OFFLINE ? 'offline' : 'live data'})`);

/* ---------------- config check ---------------- */

function validate(c) {
  const fail = (msg) => { throw new Error(`profile.config.json: ${msg}`); };
  if (!c.github?.username) fail('github.username is required');
  if (!Array.isArray(c.featured) || c.featured.length !== 2) fail('featured must list exactly 2 project keys');
  for (const key of [...c.featured, ...(c.more || [])]) if (!c.projects?.[key]?.repo) fail(`projects.${key}.repo is missing`);
  for (const key of c.featured) {
    const p = c.projects[key];
    for (const f of ['title', 'slug', 'url', 'description', 'short', 'cta', 'accent', 'cover']) if (!p[f]) fail(`projects.${key}.${f} is missing`);
    if (!existsSync(`profile/covers/${p.cover}.jpg`)) fail(`profile/covers/${p.cover}.jpg not found (npm run covers -- ${p.cover})`);
    if (p.guest && !existsSync(`profile/mascot/${p.guest.art}.svg`)) fail(`profile/mascot/${p.guest.art}.svg not found`);
  }
  if (!existsSync(`profile/mascot/${c.profile?.mascot}.svg`)) fail('profile.mascot must name a file in profile/mascot/');
  if (!Array.isArray(c.links) || c.links.length < 1 || c.links.length > 6) fail('links must have 1 to 6 entries');
}
