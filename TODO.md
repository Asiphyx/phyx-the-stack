# Phyx the Stack — Working TODO

Updated: 2026-06-17. Pick up at the **BREADCRUMB** line at the bottom.

## Jam Direction

- Cait is always the main character and the locked duo protocol.
- Selectable assistants are Cait duo-locked variants, not equal protagonists.
- Current jam scope is **Cait, Kinetic Regent // Locked Duo: Asiphyx**.
- Asiphyx does not fight directly. He locks gravity/control modules into the stack so Cait can inherit the momentum.

## Already In Progress

- [x] Asiphyx is jam-playable; other assistant pages are visible but WIP-locked.
- [x] Jam route is 11 floors, ending with Budder Sphinx.
- [x] Asiphyx direct-damage rewards and debt injections are filtered out.
- [x] Combat hand is now a staged command stack with `SEND STACK`.
- [x] Asiphyx module icons exist under `public/assets/cards/cardicon_*.png`.
- [x] Asset gallery tooling exists as `npm run assets:gallery`.

## Next Work

- [x] Clean naming away from generic card/deck/hero copy where it confuses the jam direction.
- [ ] Add Kinetic Regent state to combat: `kineticComboStacks`, `latentKineticPotential`.
- [ ] Trigger Cait free follow-up strikes when Asiphyx gravity modules target enemies.
- [ ] Store latent kinetic potential when Asiphyx gravity modules defend Asiphyx/Cait.
- [ ] Add command-stack preview hints: Kinetic Combo, Latent Potential, Cait follow-up tier.
- [ ] Verify with `npm run build` and a real Vite dev-server browser smoke test.

## BREADCRUMB

Current cleanup goal: make the existing dirty jam work less mistakable before adding more mechanics. Preserve existing `CARDS`/`deck` identifiers for compatibility unless doing a deliberate engine-wide migration.
