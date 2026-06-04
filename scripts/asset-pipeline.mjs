#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

function usage() {
  console.log(`Phyx asset pipeline

Commands:
  inspect [paths...]                         Print image metadata table.
  contact [paths...] --out <file>            Build a labeled contact sheet.
  optimize --src <path> --dest <dir>         Optimize image(s) into a destination directory.
  variants --src <file> --dest <dir> --base <name>
                                             Create portrait/avatar/battle variants from one source.

Examples:
  npm run assets:inspect -- ~/Downloads/Downloads/back.png public/assets/heroes
  npm run assets:contact -- ~/Downloads/Downloads/back.png ~/Downloads/Downloads/back2.png --out tmp/contact.png
  npm run assets:optimize -- --src ~/Downloads/Downloads --dest public/assets/inbox --format webp --quality 88
  npm run assets:variants -- --src ~/Downloads/Downloads/antigravv2.png --dest public/assets/heroes --base antigrav
`);
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      opts._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) opts[key] = true;
    else opts[key] = argv[++i];
  }
  return opts;
}

function expandHome(input) {
  if (!input) return input;
  if (input === '~') return process.env.HOME;
  if (input.startsWith('~/')) return path.join(process.env.HOME, input.slice(2));
  return input;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function collectImages(inputs) {
  const seeds = inputs.length ? inputs : ['public/assets'];
  const found = [];
  for (const raw of seeds) {
    const p = path.resolve(ROOT, expandHome(raw));
    if (!(await exists(p))) continue;
    const stat = await fs.stat(p);
    if (stat.isDirectory()) await walk(p, found);
    else if (isImage(p)) found.push(p);
  }
  return [...new Set(found)].sort();
}

async function walk(dir, found) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(p, found);
    else if (entry.isFile() && isImage(p)) found.push(p);
  }
}

function isImage(p) {
  return IMAGE_EXTS.has(path.extname(p).toLowerCase());
}

function rel(p) {
  const r = path.relative(ROOT, p);
  return r.startsWith('..') ? p : r;
}

function shortName(p, max = 38) {
  const r = rel(p);
  return r.length <= max ? r : `...${r.slice(-(max - 3))}`;
}

async function inspect(inputs) {
  const files = await collectImages(inputs);
  if (!files.length) {
    console.log('No images found.');
    return;
  }

  const rows = [];
  for (const file of files) {
    try {
      const meta = await sharp(file).metadata();
      const stat = await fs.stat(file);
      rows.push({
        file: rel(file),
        size: `${meta.width}x${meta.height}`,
        format: meta.format,
        alpha: meta.hasAlpha ? 'alpha' : '-',
        bytes: stat.size,
      });
    } catch (err) {
      rows.push({ file: rel(file), size: 'ERR', format: err.message, alpha: '-', bytes: 0 });
    }
  }

  const fileW = Math.min(70, Math.max(4, ...rows.map(r => r.file.length)));
  console.log(`${'file'.padEnd(fileW)}  ${'size'.padEnd(12)}  ${'format'.padEnd(8)}  ${'alpha'.padEnd(6)}  bytes`);
  console.log(`${'-'.repeat(fileW)}  ${'-'.repeat(12)}  ${'-'.repeat(8)}  ${'-'.repeat(6)}  -----`);
  for (const row of rows) {
    console.log(`${row.file.padEnd(fileW)}  ${row.size.padEnd(12)}  ${String(row.format).padEnd(8)}  ${row.alpha.padEnd(6)}  ${row.bytes}`);
  }
}

async function contact(inputs, opts) {
  const out = opts.out ? path.resolve(ROOT, expandHome(opts.out)) : path.resolve(ROOT, 'tmp/asset-contact.png');
  const files = await collectImages(inputs.filter(v => v !== opts.out));
  if (!files.length) throw new Error('No images found for contact sheet.');

  const thumbW = Number(opts.thumbWidth ?? 360);
  const thumbH = Number(opts.thumbHeight ?? 220);
  const cols = Number(opts.cols ?? 3);
  const pad = 18;
  const labelH = 48;
  const rows = Math.ceil(files.length / cols);
  const width = cols * (thumbW + pad) + pad;
  const height = rows * (thumbH + labelH + pad) + pad;

  const composites = [];
  const svgLabels = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const x = pad + (i % cols) * (thumbW + pad);
    const y = pad + Math.floor(i / cols) * (thumbH + labelH + pad);
    const meta = await sharp(file).metadata();
    const img = await sharp(file)
      .resize({ width: thumbW, height: thumbH, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#11111a' })
      .png()
      .toBuffer();
    const resized = await sharp(img).metadata();
    composites.push({ input: img, left: x + Math.floor((thumbW - resized.width) / 2), top: y + Math.floor((thumbH - resized.height) / 2) });
    svgLabels.push(`<rect x="${x}" y="${y}" width="${thumbW}" height="${thumbH}" fill="none" stroke="#343456"/>`);
    svgLabels.push(`<text x="${x}" y="${y + thumbH + 23}" fill="#ff33aa" font-size="18" font-family="monospace">${escapeXml(path.basename(file))}</text>`);
    svgLabels.push(`<text x="${x + 170}" y="${y + thumbH + 23}" fill="#9fefff" font-size="13" font-family="monospace">${meta.width}x${meta.height}</text>`);
    svgLabels.push(`<text x="${x}" y="${y + thumbH + 41}" fill="#9b9bbb" font-size="12" font-family="monospace">${escapeXml(shortName(file, 48))}</text>`);
  }

  const labels = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svgLabels.join('')}</svg>`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await sharp({ create: { width, height, channels: 3, background: '#07070b' } })
    .composite([...composites, { input: labels, left: 0, top: 0 }])
    .png()
    .toFile(out);
  console.log(out);
}

function escapeXml(str) {
  return str.replace(/[<>&"']/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[ch]));
}

async function optimize(opts) {
  if (!opts.src || !opts.dest) throw new Error('optimize requires --src and --dest.');
  const src = path.resolve(ROOT, expandHome(opts.src));
  const dest = path.resolve(ROOT, expandHome(opts.dest));
  const format = String(opts.format ?? 'webp').toLowerCase();
  const quality = Number(opts.quality ?? 88);
  const width = opts.width ? Number(opts.width) : null;
  const files = await collectImages([src]);
  await fs.mkdir(dest, { recursive: true });

  for (const file of files) {
    const parsed = path.parse(file);
    const outName = `${parsed.name}.${format === 'png' ? 'png' : 'webp'}`;
    const out = path.join(dest, outName);
    let pipe = sharp(file).rotate();
    if (width) pipe = pipe.resize({ width, withoutEnlargement: true });
    if (format === 'png') pipe = pipe.png({ compressionLevel: 9, palette: false });
    else pipe = pipe.webp({ quality, effort: 6 });
    await pipe.toFile(out);
    console.log(`${rel(file)} -> ${rel(out)}`);
  }
}

async function variants(opts) {
  if (!opts.src || !opts.dest || !opts.base) throw new Error('variants requires --src, --dest, and --base.');
  const src = path.resolve(ROOT, expandHome(opts.src));
  const dest = path.resolve(ROOT, expandHome(opts.dest));
  const base = opts.base;
  const quality = Number(opts.quality ?? 92);
  await fs.mkdir(dest, { recursive: true });
  await fs.mkdir(path.join(dest, 'avatars'), { recursive: true });
  await fs.mkdir(path.join(dest, 'battle'), { recursive: true });

  const jobs = [
    { out: path.join(dest, `${base}.png`), width: Number(opts.portrait ?? 1024), height: Number(opts.portrait ?? 1024), fit: 'cover' },
    { out: path.join(dest, 'avatars', `${base}.png`), width: Number(opts.avatar ?? 384), height: Number(opts.avatar ?? 384), fit: 'cover' },
    { out: path.join(dest, 'battle', `${base}.png`), width: Number(opts.battleWidth ?? 384), height: Number(opts.battleHeight ?? 512), fit: 'cover' },
  ];

  for (const job of jobs) {
    await sharp(src)
      .rotate()
      .resize({ width: job.width, height: job.height, fit: job.fit, position: opts.position ?? 'center' })
      .png({ compressionLevel: 9, quality })
      .toFile(job.out);
    console.log(`${rel(src)} -> ${rel(job.out)}`);
  }
}

const [command, ...rest] = process.argv.slice(2);
const opts = parseArgs(rest);

try {
  if (!command || command === 'help' || command === '--help') usage();
  else if (command === 'inspect') await inspect(opts._);
  else if (command === 'contact') await contact(opts._, opts);
  else if (command === 'optimize') await optimize(opts);
  else if (command === 'variants') await variants(opts);
  else throw new Error(`Unknown command: ${command}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
