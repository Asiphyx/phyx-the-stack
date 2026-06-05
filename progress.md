Original prompt: Iterate the Phyx the Stack opening/title screen so the music-reactive infinity visual feels smooth, clean, and immediately draws the player in.

## 2026-06-04

- Continuing from the title visualizer pass: the lemniscate conveyor is working, but the central title anchor reads too much like a heavy plaque.
- Current goal: integrate the title into the fold with a lighter signal-plate treatment, clearer front/back wrap, and less blocky flicker.
- Implemented signal-plate title treatment: transparent title glitch layers, single-line desktop wordmark, responsive mobile wrap, side connector latches, stronger reactive bars, and a lighter fold anchor.
- Verified with `npm run build`, the web-game Playwright client, and screenshots at `tmp_asset_contact/title-signal-plate-v2.png` and `tmp_asset_contact/title-signal-plate-mobile.png`.
- Pivoted the center back into a terminal-style plaque per feedback: visualizer layers now sit behind the plaque/save panel, bars are split equalizer strokes instead of one-sided spikes, and reverse-moving light nodes orbit the infinity path.
- Verified with `npm run build`, the web-game Playwright client, and screenshots at `tmp_asset_contact/title-terminal-plaque.png` and `tmp_asset_contact/title-terminal-plaque-mobile.png`.
- Fixed hero select name splitting by widening the showcase identity column and removing arbitrary word breaks from the selected hero name. Verified all six hero names render as one line at desktop width, with proof at `tmp_asset_contact/hero-select-asiphyx-name-fixed.png`.
- Replaced the bundled intro audio with `/home/asiphyx/Downloads/Downloads/C.A.I.T.mp3` at `public/assets/audio/cait-intro.mp3` and updated the title label to `Intro signal: C.A.I.T`.
- Reframed character select as a forced duo run: Cait is now the fixed Peon Queen companion, selectable heroes change her starting bond/module loadout, and run state stores `state.cait` for visible map/combat UI. Added `src/data/caitModules.js`, Cait HP/intent/module readouts, and `window.render_game_to_text`/`window.advanceTime` hooks for web-game verification.
- Corrected the title backdrop to use the actual generated Cait Labs art from `/home/asiphyx/Downloads/Downloads/new title screen.png`, copied to `public/assets/backgrounds/cait-labs-title.png`; the previous CSS-built imitation is now hidden behind the real asset.
- Converted the title launcher into a movable OS-style window: the top bar drags the pink HUD, CENTER recenters it, and the extra decorative text overlays were removed so the real Cait Labs backdrop owns the screen.
- Adjusted title backdrop from `cover` to exact viewport fitting so the INSOLENCE footer is not cropped by browser chrome/sidebar layouts, and strengthened the translucent pink CaitOS border/window chrome so New Run feels like launching Phyx from CaitOS.
- Cleaned up the forced duo hero-select screen: removed the duplicate bottom deploy strip, moved Start Duo Run into the selected-duo command panel, changed the giant portrait wells into square duo frames, compacted the Cait module stack so it fits, and converted the hero choices into a horizontal selector rail. Verified build plus browser screenshots at `tmp_asset_contact/hero-select-refined-final-browserlike.png` and `tmp_asset_contact/hero-select-refined-final-userlike-bindax.png`.
