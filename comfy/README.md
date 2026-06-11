# ComfyUI local sprite workflows

This folder stores local workflow templates and prompt sheets for image generation.

Current template:

- `workflows/pixel-sprite-workflow.json`
  - SD text-to-image pipeline with checkpoints, prompt encode, sampler, decode, and save nodes.
  - Uses placeholders like `{{POSITIVE_PROMPT}}`, `{{NEGATIVE_PROMPT}}`, `{{CHECKPOINT}}`.

- `prompts/cait-sprite-batch.jsonl`
  - Default Cait frame prompts for idle / attack / skill / hurt / ultimate and avatars.

Before running generation, make sure your ComfyUI install has a checkpoint with the
same name as `--checkpoint`. If your installation uses different node names,
edit the template and swap node types before rendering.

Quick run:

```bash
cd /home/asiphyx/phyx-the-stack
npm run assets:comfy -- \
  --workflow comfy/workflows/pixel-sprite-workflow.json \
  --prompts comfy/prompts/cait-sprite-batch.jsonl \
  --out-dir tmp_asset_contact/cait_sprites_raw \
  --checkpoint "YourModelName.safetensors" \
  --seed 42069 \
  --width 512 \
  --height 512 \
  --steps 24 \
  --cfg 6
```

If ComfyUI is not on localhost:8188, pass `--host http://127.0.0.1:8188`.
Use `--seed` once for the whole batch if you want stronger visual coherence between poses.

Shortcut:

```bash
cd /home/asiphyx/phyx-the-stack
npm run assets:comfy:cait -- --checkpoint "YourModelName.safetensors"
```
