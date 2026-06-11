# Phyx the Stack

Vite + vanilla JS roguelike deckbuilder. UI lives in `src/main.js` (single-file
render functions) and `src/index.css`; game state in `src/` modules; static art
in `public/assets/`.

**Before changing `src/main.js` or `src/index.css`, read
`docs/agent-patterns.md`** — it documents the load-bearing gotchas (artwork-
anchored positioning, the mid-module `render()` TDZ trap, the global
pointerdown music handler, the full re-render model, visualizer design rules).

Quick rules:

- Verify with `npm run dev` in a real browser; `npm run build` passing does
  not prove the dev server runs (esbuild relaxes TDZ that vite dev enforces).
- Declare module-level state in the top declarations block of `main.js`, never
  below the initial `render()` call.
- Anchor UI to background art with bare CSS percentages (backgrounds stretch
  `100% 100%`), not `vw`/`px`.
- Project state and next steps live in `TODO.md`.
