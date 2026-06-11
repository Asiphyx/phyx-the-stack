# Phyx the Stack — Working TODO

Updated: 2026-06-11. Pick up at the **BREADCRUMB** line at the bottom.

## Tasks (this pass)
- [x] 1. Clean stale/dupe assets — deleted: heroes/{6,antigrav,asiphyx}.png (+avatars/battle), backgrounds/{mushroom-dream,hero-select-background}.png, cards/agy*, cards/slices/, src/assets/ (vite leftovers), output/, tmp_asset_contact contents. Moved module raw sources → comfy/refs/modules/
- [x] 2. Verified: every static /assets/* ref AND every dynamic cardicon_<card.id> resolves on disk
- [x] 3. Renamed 12 soundtrack mp3s (git mv) + rewrote src/data/soundtrack.js (ids/titles/srcs; domains+intensity unchanged)
- [x] 4. Music player fixed: double-gain (element volume × WebAudio output gain), ended-handler now just advances track, control bar updates in place (no full render), track name stays live, prev/next buttons added
- [x] 5. Hotkeys live: M = play/pause, Shift+< / Shift+> = prev/next (skipped when typing in inputs)
- [x] 6. asset-guide/index.html — 18 copy-pastable prompt bricks (style core, Cait ×9, Bindax ×3, Xadnib ×2, UI ×2), each with target path + size
- [x] 7. asset-guide/checklist.html — 17 assets, agent-editable ASSET_STATUS JSON in-file, status ladder todo→generated→cleaned→wired, progress bar
- [x] 8. Final npm run build: PASSED (135ms, 16 modules)
- [x] 9. progress.md entry added

## Track rename map (old → new)
queen-circuit-concept→queen-circuit · track-concept→stack-trace-daydream · bindax-concept-2→big-top-mainframe · bindax-music-concept→jester-subroutine · clown-track-concept→honk-protocol · clownworld-track-concept→clownworld-kernel-panic · concept-20320→sector-20320 · city-night-chase-concept→neon-chase-exception · concept-sea→sea-of-static · concept-ss→segfault-serenade · concept-track-4→heartcore-compiler · concept-track-7→phyx-anthem

## Asset facts discovered (save re-derivation)
- Used module art: only `/assets/modules/cait-audio-modules-sheet.png` (5×512px frames, indexByShape in main.js:26)
- Heroes in play: cait, bindax, codex, xadnib, asiphyx2, antigrav-v2 (each ×3: root/avatars/battle)
- Unreferenced: heroes/{6,antigrav,asiphyx}.png (+avatar/battle copies), backgrounds/{mushroom-dream,hero-select-background}.png, cards/agy*.png, cards/slices/*, src/assets/*
- Music code lives in src/main.js (~lines 15-495); no keyboard handlers existed before this pass

## BREADCRUMB
> ALL TASKS DONE (2026-06-11), build green, nothing committed yet.
> Next person picks up here:
> 1. `git add -A && git commit` the cleanup/renames/player-fix pass (review `git status` first — renames staged via git mv, deletions unstaged).
> 2. Generate assets: open asset-guide/index.html, paste bricks into image-gen, save to listed comfy/refs/ paths, flip status in asset-guide/checklist.html (edit the ASSET_STATUS JSON in-file).
> 3. First production target per docs/character-direction.md: Cait master neutral sprite (96×128 in 128×160 cell), redrawn clean from the generated reference — do NOT just downscale.
> 4. Runtime smoke test still worth doing in a browser: M / Shift+< / Shift+> hotkeys, control bar prev/next, track-end auto-advance (only build-level verification was run this pass).
