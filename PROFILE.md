# Profile README

`README.md` and every panel in `profile/generated/` are built by `scripts/build-profile.mjs` from [`profile.config.json`](./profile.config.json). Edit the config, not the README.

## Change what appears

- `profile`: handle, name, intro line, status word, the header mascot and the four facts. `{public_repos}` and `{followers}` are filled from the GitHub API.
- `featured`: the two project cards, as keys of `projects`. To show Dino Library instead of DevQuest, use `["pokemonbuilder", "dinolibrary"]` and move `devquest` into `more`.
- `more`: the compact repository list under the cards.
- `projects`: one entry per project. A featured project needs `title`, `slug`, `url`, `description`, `short`, `cta`, `accent` and `cover`; `guest` puts a mascot on its banner (`corner`: `left` or `right`).
- `links`: the strip at the bottom (up to six). `icon` is `globe`, `grid` or any file name in `profile/mascot/`.
- `covers`: how each banner is captured (URL, colour scheme, locale, a click to dismiss an intro, and the crop).
- `theme`: dark and light colours, including the four levels of the dithered band. Its fifth level is the second featured project's accent.

## Build

```bash
npm run build           # fetch stars, languages and dates, then write README.md and the SVGs
npm run build:offline   # same, from the last snapshot in profile/generated/data.json
```

The build uses Node's standard library only. `.github/workflows/profile.yml` runs it every day and whenever the config, scripts or assets change, and commits only when the output changed.

## Assets

- **Covers** (`profile/covers/*.jpg`): screenshots of the live sites. Refresh them with `npm install`, `npx playwright install chromium`, then `npm run covers` (or `npm run covers -- devquest`).
- **Mascots** (`profile/mascot/*.svg`): the ghost comes from PokemonBuilder's rig (`src/utils/mascot/rig.js`) and the fox, Kitsuby, from DevQuest's `pixelSprites.js`. Regenerate them with `node scripts/render-mascot.mjs <pokemonTeamBuilder checkout> <devquest checkout>`.
- **Fonts** (`fonts/`): Geist and Geist Mono (latin subset), embedded in every SVG under the SIL Open Font License (`fonts/OFL.txt`). SVG has no text layout, so `fonts/metrics.json` holds glyph widths for wrapping; run `npm run fonts` after changing a font.

## How it works on GitHub

GitHub shows README images as plain `<img>`: no scripts and no external fonts or images inside an SVG. So each panel embeds its fonts, banner and mascots, and the dithered band is one animated PNG (30 frames) inside the header SVG. With `prefers-reduced-motion`, a still frame replaces it and the mascot stops floating. Every panel has a dark and a light file, picked by `<picture>`, and a `?v=` hash so GitHub's image cache updates when the content changes.
