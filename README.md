# Phyx the Stack

Dev-bug module tactics prototype built around Cait's locked duo protocols.

For the jam slice, Cait is the main character and every selectable assistant is a duo-locked variant. Asiphyx is the playable lock: stage modules, preview the command stack, then send it.

Core loop: **Build stack → Lock in → Resolve → Refactor → Fight → ...**, with concise visible stats and big, readable combat feedback.

## Features (Prototype)

- Cait locked duo protocol with Asiphyx as the playable jam variant
- 11-floor jam route with fights, elites, and Budder Sphinx as final boss
- Module/energy/block/HP flow with visible numbers
- Refactoring between fights with permanent stack growth
- Summons and reactive enemy intents
- Command stack staging with `SEND STACK` execution
- Mobile-friendly module layout and compact HUD

## Quick start

```bash
cd /home/asiphyx/CaitLabs/phyx-the-stack
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`).

## Build

```bash
npm run build
```

## Project structure

- `src/main.js` – UI rendering and game flow wiring
- `src/engine/*` – combat, refactor, floors, and global state management
- `src/data/*` – duo, module, and enemy definitions
- `public/assets/heroes/` – portrait assets

## Vercel deploy (as a static site)

This project is SPA-compatible and can be deployed as a static Vite build.

1. Push to a GitHub repo.
2. In Vercel, import the repo:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
3. Keep the default SPA rewrite in `vercel.json` (already included).

## Suggested project name

Current working name in this repo: `phyx-the-stack`.
