#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'public', 'assets', 'source', 'heroes', 'kinetic_regent_cait');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'heroes', 'kinetic-regent-cait');

const sheets = [
  {
    src: 'original_idle_strip.png',
    out: 'cait_kinetic_regent_idle_strip.png',
    frameWidth: 46,
    frameHeight: 55,
  },
  {
    src: 'original_walk_sheet.png',
    out: 'cait_kinetic_regent_walk_sheet.png',
    frameWidth: 45,
    frameHeight: 58,
  },
  {
    src: 'original_from_idle.png',
    out: 'cait_kinetic_regent_from_idle.png',
    frameWidth: 45,
    frameHeight: 58,
  },
];

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function isHeadRegion(localX, localY, frameWidth) {
  return localY >= 5 && localY <= 25 && localX >= frameWidth * 0.18 && localX <= frameWidth * 0.72;
}

function mapPixel(r, g, b, a, localX, localY, frameWidth) {
  if (a < 8) return [r, g, b, a];

  const luma = r * 0.299 + g * 0.587 + b * 0.114;
  const head = isHeadRegion(localX, localY, frameWidth);

  if (luma < 42) {
    return [clamp(3 + luma * 0.08), clamp(2 + luma * 0.05), clamp(14 + luma * 0.22), a];
  }

  if (head && r > 120 && g > 70 && b < 120) {
    return [8, 3, 18, a];
  }

  if (r > 180 && g > 125 && b > 120) {
    return [255, clamp(78 + luma * 0.18), clamp(156 + luma * 0.22), a];
  }

  if (b > r + 18 && b > g + 12) {
    return [clamp(42 + luma * 0.14), clamp(14 + luma * 0.08), clamp(86 + luma * 0.34), a];
  }

  if (r > 150 && g < 115 && b < 135) {
    return [clamp(204 + luma * 0.1), clamp(26 + luma * 0.08), clamp(122 + luma * 0.28), a];
  }

  if (r > 145 && g > 85 && b < 125) {
    return [clamp(235 + luma * 0.05), clamp(130 + luma * 0.12), clamp(36 + luma * 0.05), a];
  }

  return [
    clamp(r * 0.88 + 34),
    clamp(g * 0.68),
    clamp(b * 1.08 + 22),
    a,
  ];
}

function setPixel(data, info, x, y, color) {
  if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
  const offset = (y * info.width + x) * info.channels;
  data[offset] = color[0];
  data[offset + 1] = color[1];
  data[offset + 2] = color[2];
  data[offset + 3] = color[3];
}

function hasVisibleNear(data, info, x, y, radius = 4) {
  for (let yy = y - radius; yy <= y + radius; yy += 1) {
    for (let xx = x - radius; xx <= x + radius; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= info.width || yy >= info.height) continue;
      if (data[(yy * info.width + xx) * info.channels + 3] > 24) return true;
    }
  }
  return false;
}

function paintHeart(data, info, x, y, color) {
  if (!hasVisibleNear(data, info, x, y)) return;
  const points = [
    [0, 0], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2],
  ];
  for (const [dx, dy] of points) setPixel(data, info, x + dx, y + dy, color);
}

function paintFrameAccents(data, info, frameWidth, frameHeight) {
  const cols = Math.max(1, Math.floor(info.width / frameWidth));
  const rows = Math.max(1, Math.floor(info.height / frameHeight));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const left = col * frameWidth;
      const top = row * frameHeight;
      paintHeart(data, info, left + Math.round(frameWidth * 0.43), top + 15, [255, 36, 166, 255]);
      paintHeart(data, info, left + Math.round(frameWidth * 0.55), top + 15, [255, 104, 204, 255]);
      paintHeart(data, info, left + Math.round(frameWidth * 0.50), top + 31, [0, 229, 255, 230]);
    }
  }
}

async function recolorSheet(sheet) {
  const input = path.join(SOURCE_DIR, sheet.src);
  const output = path.join(OUT_DIR, sheet.out);
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const localX = x % sheet.frameWidth;
      const localY = y % sheet.frameHeight;
      const [r, g, b, a] = mapPixel(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
        localX,
        localY,
        sheet.frameWidth,
      );
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }

  paintFrameAccents(data, info, sheet.frameWidth, sheet.frameHeight);

  await fs.mkdir(path.dirname(output), { recursive: true });
  await sharp(data, { raw: info })
    .png({ compressionLevel: 9, palette: false })
    .toFile(output);

  return output;
}

async function run() {
  const generated = [];
  for (const sheet of sheets) generated.push(await recolorSheet(sheet));
  console.log(`Generated ${generated.length} Kinetic Regent Cait sheets:`);
  for (const file of generated) console.log(`- ${path.relative(ROOT, file)}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
