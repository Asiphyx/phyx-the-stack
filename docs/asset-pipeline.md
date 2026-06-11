# Asset Pipeline

This repo uses a project-local `sharp` toolchain so asset work does not depend on global ImageMagick or OS image utilities.

## Commands

Inspect dimensions, format, alpha, and byte size:

```bash
npm run assets:inspect -- public/assets/heroes public/assets/enemies
npm run assets:inspect -- ~/Downloads/Downloads/back.png ~/Downloads/Downloads/antigravv2.png
```

Build a contact sheet:

```bash
npm run assets:contact -- ~/Downloads/Downloads/back.png ~/Downloads/Downloads/back2.png ~/Downloads/Downloads/back3.png --out tmp/background-contact.png
```

Optimize a folder of dropped images into a project folder:

```bash
npm run assets:optimize -- --src ~/Downloads/Downloads --dest public/assets/inbox --format webp --quality 88
```

Create hero portrait/avatar/battle crops from one source image:

```bash
npm run assets:variants -- --src ~/Downloads/Downloads/antigravv2.png --dest public/assets/heroes --base antigrav --position center
```

## Default Variant Outputs

`assets:variants` writes:

- `public/assets/heroes/<base>.png` at `1024x1024`
- `public/assets/heroes/avatars/<base>.png` at `384x384`
- `public/assets/heroes/battle/<base>.png` at `384x512`

Use this for manual/icon drops first, then only use image generation for missing animation frames or backgrounds that do not exist yet.

## Local ComfyUI sprite batch workflow

Use ComfyUI for fully local sprite generation without external APIs.

1. Run ComfyUI with the API enabled (default `http://127.0.0.1:8188`).
2. Copy a working workflow into `comfy/workflows/` and replace placeholder tokens using the batch runner.
3. Render a batch into your asset workspace.

```bash
# one-shot starter batch for Cait frames
npm run assets:comfy \
  -- --workflow comfy/workflows/pixel-sprite-workflow.json \
  --prompts comfy/prompts/cait-sprite-batch.jsonl \
  --out-dir tmp_asset_contact/cait_sprites_raw \
  --checkpoint "YourModelName.safetensors" \
  --width 512 \
  --height 512 \
  --steps 24 \
  --cfg 6 \
  --seed 42069
```

When you are ready, run `npm run assets:inspect -- tmp_asset_contact/cait_sprites_raw` and then
`npm run assets:optimize -- --src tmp_asset_contact/cait_sprites_raw --dest public/assets/heroes --format png`.

If you want a short command, use:

```bash
npm run assets:comfy:cait -- --checkpoint "YourModelName.safetensors"
```

Use `--dry-run` to print each rendered workflow before queueing, and `--continue-on-error` to keep going on failures.

Tip for consistency: keep `--seed` constant across the batch if you want a coherent sprite family look across all Cait variants.

## Current Art Direction Notes

- Cait should remain the star and global brand gravity.
- Assistants should be themed overlays and duo mechanics around Cait.
- Antigrav has a strong current reference in `~/Downloads/Downloads/antigravv2.png`; future work should crop and animate it rather than regenerating from scratch unless the style changes.
