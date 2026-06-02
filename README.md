# Phyx the Stack

Dev-bug roguelike inspired by Slay the Spire, built as a fast-hands, high-feedback prototype.

Play as one of six Phyxian heroes and clear 15 floors of bug encounters.  
Core loop: **Draft → Fight → Draft → Fight → ...**, with concise visible stats and big, readable combat feedback.

## Features (Prototype)

- 6 heroes with unique passives and signature cards
- Enemy encounters with bosses, elites, and normal floors
- Hand/energy/block/HP flow with visible numbers
- Drafts between fights with permanent deck growth
- Summons and reactive enemy intents
- Paradox hero: alternating attack/defense combos with visible bonus toasting
- Mobile-friendly card layout and compact HUD

## Quick start

```bash
cd /home/asiphyx/phyx-the-stack
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
- `src/engine/*` – combat, draft, floors, and global state management
- `src/data/*` – hero, card, and enemy definitions
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

