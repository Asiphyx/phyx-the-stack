#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const DEFAULT_SRC = '~/Downloads/reaction-and-other/needsprocessing.png';
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const crop = (left, top, width, height) => ({ left, top, width, height });

const crops = {
  base: crop(25, 100, 260, 345),
  idle: [
    crop(316, 132, 95, 195),
    crop(430, 132, 95, 195),
    crop(542, 132, 95, 195),
    crop(648, 132, 92, 195),
  ],
  headRoll: [
    crop(758, 108, 72, 120),
    crop(837, 120, 87, 110),
    crop(926, 130, 72, 92),
    crop(1018, 130, 65, 100),
    crop(1092, 128, 80, 100),
    crop(1182, 108, 80, 120),
    crop(1258, 108, 80, 120),
    crop(1350, 105, 86, 125),
  ],
  toastWobble: [
    crop(307, 392, 75, 88),
    crop(382, 392, 75, 88),
    crop(458, 392, 75, 88),
    crop(535, 392, 75, 88),
  ],
  wingFlap: [
    crop(632, 390, 55, 105),
    crop(728, 390, 55, 105),
    crop(812, 390, 58, 105),
    crop(908, 390, 58, 105),
  ],
  expression: [
    crop(990, 395, 86, 105),
    crop(1090, 395, 86, 105),
    crop(1191, 394, 86, 105),
    crop(1295, 394, 90, 105),
  ],
  aura: [
    crop(36, 571, 92, 160),
    crop(153, 571, 92, 160),
    crop(272, 571, 92, 160),
    crop(374, 568, 80, 166),
  ],
  parts: {
    base_body_no_head: crop(475, 560, 120, 110),
    head_front: crop(620, 568, 70, 96),
    left_wing: crop(1237, 570, 58, 95),
    right_wing: crop(1338, 570, 60, 95),
    tail: crop(486, 690, 50, 62),
    toast_slice: crop(555, 690, 65, 58),
    gold_ingot: crop(646, 690, 75, 55),
    halo_eye: crop(895, 688, 75, 58),
    shadow_glow_base: crop(1270, 690, 140, 60),
  },
};

function parseArgs(argv) {
  const opts = { src: DEFAULT_SRC };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    opts[key] = next && !next.startsWith('--') ? argv[++i] : true;
  }
  return opts;
}

function expandHome(input) {
  if (input === '~') return process.env.HOME;
  if (input?.startsWith('~/')) return path.join(process.env.HOME, input.slice(2));
  return input;
}

function outPath(...parts) {
  return path.join(ROOT, 'public', 'assets', 'source', 'enemies', 'budder_sphinx_sheet_pack', 'generated', ...parts);
}

function rel(file) {
  return path.relative(ROOT, file);
}

function isBlackBackground(data, offset, threshold) {
  return data[offset + 3] > 0
    && data[offset] <= threshold
    && data[offset + 1] <= threshold
    && data[offset + 2] <= threshold;
}

function floodClearBackground(data, info, threshold = 10) {
  const { width, height, channels } = info;
  const seen = new Uint8Array(width * height);
  const stack = [];

  function maybePush(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (seen[index]) return;
    const offset = index * channels;
    if (!isBlackBackground(data, offset, threshold)) return;
    seen[index] = 1;
    stack.push(index);
  }

  for (let x = 0; x < width; x += 1) {
    maybePush(x, 0);
    maybePush(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    maybePush(0, y);
    maybePush(width - 1, y);
  }

  while (stack.length) {
    const index = stack.pop();
    const offset = index * channels;
    data[offset + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    maybePush(x + 1, y);
    maybePush(x - 1, y);
    maybePush(x, y + 1);
    maybePush(x, y - 1);
  }
}

async function cropToBuffer(src, area) {
  const { data, info } = await sharp(src)
    .extract(area)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  floodClearBackground(data, info);

  return sharp(data, { raw: info })
    .trim({ background: TRANSPARENT, threshold: 1 })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function squareBuffer(src, area, size = 512, max = 440) {
  const cropped = await cropToBuffer(src, area);
  const resized = await sharp(cropped)
    .resize({ width: max, height: max, fit: 'inside', kernel: 'nearest' })
    .png()
    .toBuffer();
  const meta = await sharp(resized).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background: TRANSPARENT } })
    .composite([{
      input: resized,
      left: Math.floor((size - meta.width) / 2),
      top: Math.floor((size - meta.height) / 2),
    }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function writeBuffer(buffer, file, generated) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buffer);
  generated.push(file);
}

async function writeCrop(src, area, file, generated) {
  await writeBuffer(await cropToBuffer(src, area), file, generated);
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  const src = path.resolve(ROOT, expandHome(opts.src));
  const generated = [];

  await fs.mkdir(outPath('budder_sphinx', 'frames'), { recursive: true });
  await fs.mkdir(outPath('budder_sphinx', 'fx'), { recursive: true });
  await fs.mkdir(outPath('budder_sphinx', 'parts'), { recursive: true });

  await sharp(src).png({ compressionLevel: 9, palette: false }).toFile(outPath('budder_sphinx', 'sheet.png'));
  generated.push(outPath('budder_sphinx', 'sheet.png'));

  await writeBuffer(await squareBuffer(src, crops.base, 512, 470), outPath('budder_sphinx.png'), generated);
  await writeCrop(src, crops.base, outPath('budder_sphinx', 'base_sprite.png'), generated);

  const idleSquares = [];
  for (const [index, area] of crops.idle.entries()) {
    const frame = await squareBuffer(src, area, 512, 430);
    idleSquares.push(frame);
    await writeBuffer(frame, outPath('budder_sphinx', 'frames', `body_idle_${String(index + 1).padStart(2, '0')}.png`), generated);
  }

  await sharp({ create: { width: 512 * idleSquares.length, height: 512, channels: 4, background: TRANSPARENT } })
    .composite(idleSquares.map((input, index) => ({ input, left: index * 512, top: 0 })))
    .png({ compressionLevel: 9, palette: false })
    .toFile(outPath('budder_sphinx_idle_strip.png'));
  generated.push(outPath('budder_sphinx_idle_strip.png'));

  for (const [index, area] of crops.headRoll.entries()) {
    await writeCrop(src, area, outPath('budder_sphinx', 'frames', `head_roll_${String(index + 1).padStart(2, '0')}.png`), generated);
  }

  for (const [index, area] of crops.toastWobble.entries()) {
    await writeCrop(src, area, outPath('budder_sphinx', 'frames', `toast_wobble_${String(index + 1).padStart(2, '0')}.png`), generated);
  }

  for (const [index, area] of crops.wingFlap.entries()) {
    await writeCrop(src, area, outPath('budder_sphinx', 'frames', `wing_flap_${String(index + 1).padStart(2, '0')}.png`), generated);
  }

  for (const [index, area] of crops.expression.entries()) {
    await writeCrop(src, area, outPath('budder_sphinx', 'frames', `expression_${String(index + 1).padStart(2, '0')}.png`), generated);
  }

  for (const [index, area] of crops.aura.entries()) {
    await writeCrop(src, area, outPath('budder_sphinx', 'fx', `aura_helix_${String(index + 1).padStart(2, '0')}.png`), generated);
  }

  for (const [name, area] of Object.entries(crops.parts)) {
    await writeCrop(src, area, outPath('budder_sphinx', 'parts', `${name}.png`), generated);
  }

  console.log(`Processed Budder Sphinx sheet from ${src}`);
  for (const file of generated) console.log(`- ${rel(file)}`);
}

run().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
