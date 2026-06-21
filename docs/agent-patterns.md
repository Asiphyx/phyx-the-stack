# Agent Patterns & Hard-Won Solutions

Field notes for agents working on this codebase. Each entry is a real problem
that cost debugging time, with the solution that stuck. Read this before
touching `src/main.js` or `src/index.css`.

## 1. Position UI on the artwork, never on the viewport

Title and hero-select backgrounds stretch with `background-size: 100% 100%`.
The art distorts with the window, which means **CSS percentages map 1:1 to
image coordinates** — a button at `left: 47.8%; top: 53.8%` hits the same
pixel of the painting at every window size.

What failed: `left: clamp(32px, 7.2vw, 118px)` intended to hit the cat's nose.
Viewport units drift relative to stretched art; the button ended up in the
bottom-left corner. If you need to anchor to a feature in the art, measure the
image and use bare percentages.

Landmarks in `public/assets/backgrounds/cait-labs-title.png` (1672×941):

| Feature            | x      | y      |
|--------------------|--------|--------|
| Cat nose (launcher button) | 47.8%  | 53.8%  |
| Cat mouth          | 49.3%  | 60%    |
| Cat face center (visualizer ring) | 47.8%  | 43%    |

The pattern in use (`.title-cat-launcher` in `index.css`): a zero-size
absolutely-positioned anchor at the landmark, children centered on it with
`transform: translate(-50%, -50%)`. Remember that any later `transform` on a
child (hover scale, active press) must repeat the translate:
`transform: translate(-50%, -50%) scale(1.14);`.

## 2. "npm run build green" does NOT mean the game runs

`main.js` calls `render()` mid-module (around line 110). Any module-level
`let`/`const` declared *after* that call but touched during the first render
throws a temporal-dead-zone ReferenceError — **but only in `vite dev`**.
The production bundle works because esbuild relaxes TDZ semantics, so the
deployed site can be fine while dev is a black screen (this happened with
`musicCtrlBar`; the first-render path was
`render() → prepareMusicForPhase() → updateMusicControlBar()`).

Rules:
- Declare all module-level state in the declarations block near the top of
  `main.js` (the `let introMusicEnabled…` cluster), never next to the function
  that uses it.
- Verify changes against `npm run dev` in a browser, not just the build.

## 3. The global pointerdown handler has side effects on EVERY button

Near the top of `main.js`:

```js
root.addEventListener('pointerdown', (event) => {
  const interactive = event.target.closest('button, .game-card, ...');
  if (!interactive) return;
  triggerInteractionPulse(...);
  if (!introMusicEnabled && !musicUserPaused && game.getSnapshot().phase !== 'title') startIntroMusic();
}, { capture: true });
```

This exists to satisfy browser autoplay policy (music can only start from a
user gesture). Two traps:

- **Every new button you add** triggers the interaction pulse and is a
  potential music-resume gesture. A button that "does nothing but unpauses
  the music" (the codec CENTER button bug) is this handler, not your button.
- **Never auto-resume past an explicit pause.** Without the `musicUserPaused`
  guard, the play/pause toggle fights itself: pointerdown resumes the music,
  then the click event toggles it straight back to paused — the button appears
  dead. `musicUserPaused` is set in `toggleIntroMusic()` on pause and cleared
  in `startIntroMusic()`. Keep that invariant if you add new music entry points.

## 4. Full re-render model — design around it

`bus.on('stateChange'|'combatUpdate', render)` wipes `root.innerHTML` and
rebuilds the whole screen. Consequences:

- Event handlers are re-attached on every render; assign with `.onclick =`
  inside the render function, never `addEventListener` on long-lived nodes
  (they'd stack if the node survives).
- Anything that must NOT visually reset on re-render needs in-place updates
  instead of a re-render. Pattern: `updateMusicControlBar()` mutates the
  existing bar (track name, toggle glyph) so play/pause doesn't rebuild the
  screen. Follow it for any frequently-updating widget.
- Transient UI state that must survive re-renders lives in module-level
  variables (`titleLauncherOpen`, `caitCodecOffset`, `systemMenuOpen`) and is
  re-applied during render.

## 5. Title visualizer architecture (and the design rule behind it)

Two full-viewport canvases (`#title-spectrum` back, `#title-spectrum-front`),
both driven by `drawTitleSpectrum(ctx, w, h, time, layer)` in one rAF loop.

**Design rule (user feedback, do not regress):** the composition needs a
*stationary anchor* plus *one coherent moving part*, both centered on the cat.
Scattered independent drift (the old lemniscate field + web lines + off-axis
ellipse sweeps) reads as chaotic noise. Current structure:

- Back layer = stationary: halo, `drawTitleEqCrown` (56 frequency ticks at
  fixed angles — only length/brightness animate; bass at the ring bottom,
  highs at top, mirrored left/right), `drawTitleBeatRipples`.
- Front layer = moving: `drawTitleOrbitGlyphs` — all glyphs share ONE slow
  formation rotation (`time * 0.00016`) while each spins on its own axis
  (`time * 0.0011`, neighbours counter-rotate). Tuning knobs are those two
  constants plus tick `reach` in the crown.

Audio sampling: `titleBandLevel(fraction, time, seed)` reads the analyser and
falls back to a sine "idle shimmer" when music is off — every visual must stay
alive when muted, so always route levels through it rather than reading
`introFrequencyData` raw. `updateTitleBeat()` smooths band levels and exports
them as CSS vars (`--title-beat`, `--music-bass/mid/high`) that `index.css`
animations consume — reuse those vars for new reactive CSS instead of new JS.

## 6. Audio chain: gain is applied exactly once

`applyMusicVolume()` (see comment in source): once the WebAudio analyser chain
exists, per-domain gain lives in the WebAudio gain node and element volume is
`getMusicVolume() * 1`. Only when there is **no** WebAudio chain does the
domain gain multiply into `introAudio.volume`. Multiplying both was a real bug
(music half as loud as intended). If you add another gain stage, decide which
side owns it.

## 7. Draggable windows pattern

`wireCaitCodecDrag` / the title window drag use pointer capture on a drag bar,
store the offset in a module variable, and apply it via CSS custom properties
(`--cait-codec-x/y`) so re-renders can restore position. Notes:

- Guard the drag bar's pointerdown with
  `if (event.target.closest('button')) return;` or buttons in the bar
  (CENTER, close) start drags.
- "CENTER" resets the offset to `{x:0, y:0}` — it looks like a no-op if the
  window is already home.

## 8. Verifying visual changes headlessly

Playwright MCP here is pinned to system Chrome (not installed); use the CLI
chromium instead. Working recipe:

```bash
npx vite --port 5199 --strictPort &   # dev server
npx playwright install chromium        # once
node check.mjs                         # script below
```

```js
// check.mjs — import playwright from the npx cache, point at the shell binary
import { chromium } from '/home/asiphyx/.npm/_npx/<hash>/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath:
  '/home/asiphyx/.cache/ms-playwright/chromium_headless_shell-<ver>/chrome-headless-shell-linux64/chrome-headless-shell' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', e.message)); // catches TDZ crashes
await page.goto('http://localhost:5199');
await page.screenshot({ path: '/tmp/shot.png' });
```

Always wire `pageerror` — a black screenshot with no error log is
indistinguishable from a slow load. To check art alignment, crop screenshots
with ImageMagick (`convert shot.png -crop WxH+X+Y out.png`) and compare against
the same crop of the source PNG.

## 9. Asset + state docs

- `README.md` — public-facing project entry, play link, GitHub link, and setup.
- `docs/roadmap.md` — planned combat-fun and Budder Cat genre-breach direction.
- `docs/asset-pipeline.md` — current asset layout and replacement rules.
- `docs/character-direction.md` — character identity and assistant route notes.
