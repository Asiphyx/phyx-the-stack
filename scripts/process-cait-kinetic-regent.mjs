#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'public', 'assets', 'source', 'heroes', 'kinetic_regent_cait');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'heroes', 'kinetic-regent-cait');
const STREAM_PACK_DIR = path.join(SOURCE_DIR, 'stream_avatar_pack');
const STREAM_SHEET = path.join(SOURCE_DIR, 'stream_avatar_sheet', 'streamavatarscaitformat.png');

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

function pickEvenly(items, targetCount) {
  if (items.length <= targetCount) return items;
  return Array.from({ length: targetCount }, (_, index) => {
    const sourceIndex = Math.round(index * (items.length - 1) / (targetCount - 1));
    return items[sourceIndex];
  });
}

function frameEntriesFromAtlas(atlas) {
  return Object.entries(atlas.frames ?? {})
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([name, frame]) => ({ name, ...frame }));
}

async function buildAtlasStrip(config) {
  const atlasPath = path.join(STREAM_PACK_DIR, config.source, 'atlas.json');
  const sheetPath = path.join(STREAM_PACK_DIR, config.source, 'spritesheet.png');
  const atlas = JSON.parse(await fs.readFile(atlasPath, 'utf8'));
  const sourceFrames = pickEvenly(frameEntriesFromAtlas(atlas), config.frames);
  const frameWidth = config.frameWidth;
  const frameHeight = config.frameHeight;
  const cellBuffers = await Promise.all(sourceFrames.map((frame) =>
    sharp(sheetPath)
      .extract({ left: frame.x, top: frame.y, width: frame.w, height: frame.h })
      .resize(frameWidth, frameHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  ));

  const output = path.join(OUT_DIR, config.out);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await sharp({
    create: {
      width: frameWidth * cellBuffers.length,
      height: frameHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(cellBuffers.map((input, index) => ({ input, left: index * frameWidth, top: 0 })))
    .png({ compressionLevel: 9, palette: false })
    .toFile(output);

  return {
    key: config.key,
    source: config.source,
    path: `/assets/heroes/kinetic-regent-cait/${config.out}`,
    frames: cellBuffers.length,
    frameWidth,
    frameHeight,
    frameRate: config.frameRate,
    repeat: config.repeat,
  };
}

async function buildGridStrip() {
  try {
    await fs.access(STREAM_SHEET);
  } catch {
    return null;
  }

  const columns = 10;
  const rows = 4;
  const sourceFrameWidth = 640;
  const sourceFrameHeight = 512;
  const frameWidth = 160;
  const frameHeight = 128;
  const cells = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      cells.push(
        sharp(STREAM_SHEET)
          .extract({
            left: col * sourceFrameWidth,
            top: row * sourceFrameHeight,
            width: sourceFrameWidth,
            height: sourceFrameHeight,
          })
          .resize(frameWidth, frameHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer()
      );
    }
  }

  const cellBuffers = await Promise.all(cells);
  const out = 'stream-avatar-grid-strip.png';
  const output = path.join(OUT_DIR, out);
  await sharp({
    create: {
      width: frameWidth * cellBuffers.length,
      height: frameHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(cellBuffers.map((input, index) => ({ input, left: index * frameWidth, top: 0 })))
    .png({ compressionLevel: 9, palette: false })
    .toFile(output);

  return {
    key: 'streamGrid',
    source: 'streamavatarscaitformat.png',
    path: `/assets/heroes/kinetic-regent-cait/${out}`,
    frames: cellBuffers.length,
    frameWidth,
    frameHeight,
    frameRate: 10,
    repeat: -1,
  };
}

async function buildStreamAvatarAnimations() {
  const configs = [
    { key: 'idle', source: 'idle_right', out: 'stream-cait-idle-strip.png', frames: 16, frameWidth: 160, frameHeight: 160, frameRate: 8, repeat: -1 },
    { key: 'isoIdle', source: 'iso_idle_right_right', out: 'stream-cait-iso-idle-strip.png', frames: 16, frameWidth: 160, frameHeight: 160, frameRate: 8, repeat: -1 },
    { key: 'attack', source: 'attack_right', out: 'stream-cait-attack-strip.png', frames: 18, frameWidth: 176, frameHeight: 176, frameRate: 18, repeat: 0 },
    { key: 'dash', source: 'Dash', out: 'stream-cait-dash-strip.png', frames: 18, frameWidth: 176, frameHeight: 176, frameRate: 20, repeat: 0 },
    { key: 'jump', source: 'jump_right', out: 'stream-cait-jump-strip.png', frames: 18, frameWidth: 160, frameHeight: 160, frameRate: 16, repeat: 0 },
    { key: 'run', source: 'run_right', out: 'stream-cait-run-strip.png', frames: 16, frameWidth: 160, frameHeight: 160, frameRate: 14, repeat: -1 },
  ];

  const generated = [];
  for (const config of configs) generated.push(await buildAtlasStrip(config));
  const grid = await buildGridStrip();
  if (grid) generated.push(grid);

  const manifestPath = path.join(OUT_DIR, 'stream-avatar-animations.json');
  await fs.writeFile(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), animations: generated }, null, 2)}\n`);
  return { generated, manifestPath };
}

async function run() {
  const generated = [];
  for (const sheet of sheets) generated.push(await recolorSheet(sheet));
  const streamAnimations = await buildStreamAvatarAnimations();
  console.log(`Generated ${generated.length} Kinetic Regent Cait sheets:`);
  for (const file of generated) console.log(`- ${path.relative(ROOT, file)}`);
  console.log(`Generated ${streamAnimations.generated.length} stream avatar animation strips:`);
  for (const animation of streamAnimations.generated) console.log(`- ${animation.key}: ${animation.path}`);
  console.log(`- manifest: ${path.relative(ROOT, streamAnimations.manifestPath)}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
