#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const ROOT = process.cwd();
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);
const execFileAsync = promisify(execFile);

function usage() {
  console.log(`Phyx asset pipeline

Commands:
  inspect [paths...]                         Print image metadata table.
  contact [paths...] --out <file>            Build a labeled contact sheet.
  gallery [paths...] --out <file>            Build a browser visual asset index.
  optimize --src <path> --dest <dir>         Optimize image(s) into a destination directory.
  variants --src <file> --dest <dir> --base <name>
                                             Create portrait/avatar/battle variants from one source.

Examples:
  npm run assets:inspect -- ~/Downloads/Downloads/back.png public/assets/heroes
  npm run assets:contact -- ~/Downloads/Downloads/back.png ~/Downloads/Downloads/back2.png --out tmp/contact.png
  npm run assets:gallery -- public/assets/heroes public/assets/backgrounds
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
  const out = opts.out ? path.resolve(ROOT, expandHome(opts.out)) : path.resolve(ROOT, 'tmp_asset_contact/asset-contact.png');
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

async function gallery(inputs, opts) {
  const out = opts.out
    ? path.resolve(ROOT, expandHome(opts.out))
    : path.resolve(ROOT, 'tmp_asset_contact/asset-gallery.html');
  const files = await collectImages(inputs.filter(v => v !== opts.out));
  if (!files.length) throw new Error('No images found for gallery.');

  const [references, gitState] = await Promise.all([
    buildReferenceIndex(),
    getGitState(),
  ]);
  const outDir = path.dirname(out);
  const assets = [];

  for (const file of files) {
    const meta = await sharp(file).metadata();
    const stat = await fs.stat(file);
    const hash = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
    const relative = rel(file);
    const publicUrl = relative.startsWith('public/') ? `/${relative.slice('public/'.length)}` : null;
    const refs = references.get(relative) ?? (publicUrl ? references.get(publicUrl) : null) ?? [];
    const thumbSrc = await buildThumbnailDataUri(file);
    assets.push({
      file: relative,
      name: path.basename(file),
      folder: path.dirname(relative),
      src: path.relative(outDir, file).split(path.sep).join('/'),
      thumbSrc,
      width: meta.width,
      height: meta.height,
      format: meta.format,
      alpha: Boolean(meta.hasAlpha),
      bytes: stat.size,
      hash,
      refs,
      git: gitState.get(relative) ?? '',
    });
  }

  const hashGroups = Map.groupBy(assets, asset => asset.hash);
  for (const asset of assets) {
    asset.duplicates = (hashGroups.get(asset.hash) ?? [])
      .filter(other => other.file !== asset.file)
      .map(other => other.file);
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(out, renderGalleryHtml(assets), 'utf8');
  console.log(out);
}

async function buildThumbnailDataUri(file) {
  const buffer = await sharp(file)
    .resize({ width: 440, height: 320, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

async function buildReferenceIndex() {
  const files = await collectTextFiles(['src', 'public', 'index.html', 'package.json']);
  const references = new Map();
  for (const file of files) {
    const body = await fs.readFile(file, 'utf8');
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const match of line.matchAll(/['"`(]([^'"`)]*\.(?:png|jpe?g|webp|avif|gif))['"`)]/gi)) {
        const raw = match[1];
        const keys = referenceKeys(raw);
        for (const key of keys) {
          if (!references.has(key)) references.set(key, []);
          references.get(key).push(`${rel(file)}:${i + 1}`);
        }
      }
    }
  }
  return references;
}

function referenceKeys(raw) {
  const clean = raw.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
  const keys = new Set([clean]);
  if (clean.startsWith('/assets/')) keys.add(`public${clean}`);
  if (clean.startsWith('assets/')) {
    keys.add(`/${clean}`);
    keys.add(`public/${clean}`);
  }
  if (clean.startsWith('./') || clean.startsWith('../')) keys.add(clean.replace(/^\.\//, ''));
  return [...keys];
}

async function collectTextFiles(inputs) {
  const found = [];
  for (const input of inputs) {
    const p = path.resolve(ROOT, input);
    if (!(await exists(p))) continue;
    const stat = await fs.stat(p);
    if (stat.isDirectory()) await walkText(p, found);
    else if (isTextCandidate(p)) found.push(p);
  }
  return found;
}

async function walkText(dir, found) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkText(p, found);
    else if (entry.isFile() && isTextCandidate(p)) found.push(p);
  }
}

function isTextCandidate(file) {
  return /\.(html|css|js|mjs|json|md)$/i.test(file);
}

async function getGitState() {
  const state = new Map();
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: ROOT });
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const status = line.slice(0, 2).trim();
      const file = line.slice(3).replace(/^"|"$/g, '');
      state.set(file, status);
    }
  } catch {
    // Git state is helpful but non-essential for standalone asset folders.
  }
  return state;
}

function renderGalleryHtml(assets) {
  const grouped = Map.groupBy(assets, asset => asset.folder);
  const total = assets.length;
  const used = assets.filter(asset => asset.refs.length).length;
  const dirty = assets.filter(asset => asset.git).length;
  const duplicateAssets = assets.filter(asset => asset.duplicates.length).length;
  const groupsHtml = [...grouped.entries()].map(([folder, group]) => `
    <section class="group" data-folder="${escapeAttr(folder)}">
      <h2>${escapeHtml(folder)} <span>${group.length}</span></h2>
      <div class="grid">
        ${group.map(renderAssetCard).join('')}
      </div>
    </section>
  `).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Phyx Asset Gallery</title>
  <style>
    :root {
      color-scheme: dark;
      background: #08080c;
      color: #f4eefa;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #08080c; }
    header {
      position: sticky;
      top: 0;
      z-index: 5;
      display: grid;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid #2b2940;
      background: rgba(8, 8, 12, 0.95);
      backdrop-filter: blur(14px);
    }
    h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0; }
    .summary { display: flex; flex-wrap: wrap; gap: 8px; color: #b8b2c8; font-size: 13px; }
    .pill { border: 1px solid #38354d; border-radius: 999px; padding: 4px 9px; background: #12121a; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    input, select {
      border: 1px solid #39364d;
      border-radius: 6px;
      background: #11111a;
      color: #f4eefa;
      min-height: 36px;
      padding: 0 10px;
      font: inherit;
    }
    input { min-width: min(440px, 100%); flex: 1; }
    main { padding: 18px 20px 42px; }
    .group { margin: 0 0 34px; }
    h2 {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 800;
      color: #9fefff;
      letter-spacing: 0;
    }
    h2 span { color: #77728b; font-weight: 700; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 14px;
    }
    .asset {
      display: grid;
      grid-template-rows: 190px auto;
      min-width: 0;
      border: 1px solid #2d2a3f;
      border-radius: 8px;
      overflow: hidden;
      background: #101018;
    }
    .preview {
      display: grid;
      place-items: center;
      min-width: 0;
      background:
        linear-gradient(45deg, #151520 25%, transparent 25%),
        linear-gradient(-45deg, #151520 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #151520 75%),
        linear-gradient(-45deg, transparent 75%, #151520 75%),
        #0b0b11;
      background-size: 28px 28px;
      background-position: 0 0, 0 14px, 14px -14px, -14px 0;
    }
    .preview img {
      display: block;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .meta { display: grid; gap: 8px; padding: 11px; min-width: 0; }
    .name { color: #ff53b7; font: 700 13px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
    .path { color: #aaa4ba; font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
    .facts { display: flex; flex-wrap: wrap; gap: 5px; font-size: 11px; color: #d5d1df; }
    .fact { border: 1px solid #39364d; border-radius: 5px; padding: 2px 6px; background: #171723; }
    .git { border-color: #ffbd4a; color: #ffcf78; }
    .unused { border-color: #673447; color: #ff8dba; }
    .refs { color: #8edbea; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <header>
    <h1>Phyx Asset Gallery</h1>
    <div class="summary">
      <span class="pill">${total} images</span>
      <span class="pill">${used} referenced</span>
      <span class="pill">${total - used} no exact source reference</span>
      <span class="pill">${dirty} dirty/untracked</span>
      <span class="pill">${duplicateAssets} exact duplicate assets</span>
    </div>
    <div class="toolbar">
      <input id="search" type="search" placeholder="Search filename, folder, or source reference">
      <select id="filter">
        <option value="all">All assets</option>
        <option value="used">Referenced only</option>
        <option value="unused">No exact reference</option>
        <option value="dirty">Dirty/untracked only</option>
        <option value="dupes">Exact duplicates only</option>
      </select>
    </div>
  </header>
  <main>
    ${groupsHtml}
  </main>
  <script>
    const search = document.querySelector('#search');
    const filter = document.querySelector('#filter');
    const cards = [...document.querySelectorAll('.asset')];
    function applyFilters() {
      const q = search.value.trim().toLowerCase();
      const mode = filter.value;
      for (const card of cards) {
        const haystack = card.dataset.search;
        const refs = Number(card.dataset.refs);
        const dirty = card.dataset.git !== '';
        const dupes = Number(card.dataset.dupes);
        const modeOk =
          mode === 'all' ||
          (mode === 'used' && refs > 0) ||
          (mode === 'unused' && refs === 0) ||
          (mode === 'dirty' && dirty) ||
          (mode === 'dupes' && dupes > 0);
        card.classList.toggle('hidden', !(modeOk && haystack.includes(q)));
      }
      for (const group of document.querySelectorAll('.group')) {
        group.classList.toggle('hidden', !group.querySelector('.asset:not(.hidden)'));
      }
    }
    search.addEventListener('input', applyFilters);
    filter.addEventListener('change', applyFilters);
  </script>
</body>
</html>
`;
}

function renderAssetCard(asset) {
  const refsText = asset.refs.length ? asset.refs.slice(0, 4).join(' | ') : 'No exact source reference found';
  const moreRefs = asset.refs.length > 4 ? ` +${asset.refs.length - 4} more` : '';
  const duplicateText = asset.duplicates.length ? `Duplicate of ${asset.duplicates.join(' | ')}` : '';
  const searchText = `${asset.file} ${asset.refs.join(' ')} ${duplicateText}`.toLowerCase();
  return `<article class="asset" data-search="${escapeAttr(searchText)}" data-refs="${asset.refs.length}" data-git="${escapeAttr(asset.git)}" data-dupes="${asset.duplicates.length}">
    <a class="preview" href="${escapeAttr(asset.src)}" target="_blank" rel="noreferrer">
      <img src="${escapeAttr(asset.thumbSrc)}" loading="lazy" alt="${escapeAttr(asset.name)}">
    </a>
    <div class="meta">
      <div class="name">${escapeHtml(asset.name)}</div>
      <div class="path">${escapeHtml(asset.file)}</div>
      <div class="facts">
        <span class="fact">${asset.width}x${asset.height}</span>
        <span class="fact">${escapeHtml(String(asset.format))}</span>
        <span class="fact">${formatBytes(asset.bytes)}</span>
        ${asset.alpha ? '<span class="fact">alpha</span>' : ''}
        ${asset.git ? `<span class="fact git">${escapeHtml(asset.git)}</span>` : ''}
        ${asset.refs.length ? '' : '<span class="fact unused">no exact ref</span>'}
        ${asset.duplicates.length ? '<span class="fact git">exact duplicate</span>' : ''}
      </div>
      <div class="refs">${escapeHtml(refsText)}${escapeHtml(moreRefs)}</div>
      ${asset.duplicates.length ? `<div class="refs">${escapeHtml(duplicateText)}</div>` : ''}
    </div>
  </article>`;
}

function formatBytes(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function escapeXml(str) {
  return str.replace(/[<>&"']/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[ch]));
}

function escapeHtml(str) {
  return String(str).replace(/[<>&"']/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, '&#96;');
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
  else if (command === 'gallery') await gallery(opts._, opts);
  else if (command === 'optimize') await optimize(opts);
  else if (command === 'variants') await variants(opts);
  else throw new Error(`Unknown command: ${command}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
