#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

const NUMERIC_FIELDS = new Set([
  'width',
  'height',
  'seed',
  'steps',
  'cfg',
  'start_at_step',
  'end_at_step',
  'denoise',
]);

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      opts._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts[key] = true;
      continue;
    }
    opts[key] = argv[i + 1];
    i += 1;
  }
  return opts;
}

function expandHome(input) {
  if (!input) return input;
  if (input === '~') return process.env.HOME;
  if (input.startsWith('~/')) return path.join(process.env.HOME, input.slice(2));
  return input;
}

function usage() {
  console.log(`Phyx ComfyUI sprite batch runner

Usage:
  node scripts/comfy-generate.mjs \\
    --workflow <path> \\
    --prompts <path> \\
    --out-dir <path>

Options:
  --workflow <file>          Workflow template with placeholders (required).
  --prompts <file>           JSON or JSONL prompt sheet (required).
  --out-dir <dir>            Output directory (default: tmp/comfy-output)
  --host <url>               ComfyUI base URL (default: http://127.0.0.1:8188)
  --checkpoint <name>        Default checkpoint name placeholder.
  --width <n>                Default render width.
  --height <n>               Default render height.
  --steps <n>                Default sampler steps.
  --cfg <n>                  Default CFG value.
  --sampler <name>           Sampler name (default: euler)
  --scheduler <name>         Scheduler name (default: normal)
  --denoise <n>              Default denoise value.
  --seed <n>                 Default seed (optional).
  --negative <text>          Default negative prompt.
  --return-leftover-noise     Enable return_with_leftover_noise option.
  --timeout-ms <n>           Polling timeout for each job (default: 180000)
  --poll-ms <n>              Poll interval (default: 1200)
  --dry-run                  Generate and print each rendered workflow without queueing.
  --continue-on-error        Keep rendering remaining jobs when one fails.
  --help                     Show usage.
`);
}

function slug(value) {
  return String(value || 'sprite')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readJSONOrJSONL(filePath) {
  const data = (await fs.readFile(filePath, 'utf8')).trim();
  if (!data) return [];

  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch {
    const lines = data.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL line ${index + 1} in ${filePath}: ${error.message}`);
      }
    });
  }
}

function normalizeJobs(rawJobs, fallbackNegative) {
  const jobs = Array.isArray(rawJobs) ? rawJobs : [];
  return jobs
    .map((entry, index) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        return {
          name: `sprite-${String(index + 1).padStart(2, '0')}`,
          positive: entry,
          negative: fallbackNegative,
        };
      }
      return {
        name: entry.name || `sprite-${String(index + 1).padStart(2, '0')}`,
        positive: entry.positive || entry.prompt || '',
        negative: entry.negative || fallbackNegative,
        output: entry.output || entry.name,
        checkpoint: entry.checkpoint,
        width: toNumber(entry.width, null),
        height: toNumber(entry.height, null),
        seed: toNumber(entry.seed, null),
        steps: toNumber(entry.steps, null),
        cfg: toNumber(entry.cfg, null),
        sampler: entry.sampler,
        scheduler: entry.scheduler,
        denoise: toNumber(entry.denoise, null),
      };
    })
    .filter((job) => job && typeof job.positive === 'string' && job.positive.trim().length > 0);
}

function renderValue(value, context, key = '') {
  if (value == null) return value;
  if (typeof value === 'string') {
    let rendered = value;
    for (const [placeholder, replacement] of Object.entries(context)) {
      rendered = rendered.split(`{{${placeholder}}}`).join(String(replacement));
    }
    const trimmed = rendered.trim();
    if (NUMERIC_FIELDS.has(key)) {
      const n = Number(trimmed);
      if (trimmed.length > 0 && Number.isFinite(n)) return n;
    }
    if (key === 'return_with_leftover_noise') {
      if (/^(true|false)$/i.test(trimmed)) return /^true$/i.test(trimmed);
    }
    return rendered;
  }
  if (Array.isArray(value)) return value.map((item) => renderValue(item, context));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = renderValue(v, context, k);
    }
    return out;
  }
  return value;
}

function buildWorkflow(template, job, defaults) {
  const ctx = {
    POSITIVE_PROMPT: job.positive,
    NEGATIVE_PROMPT: job.negative,
    CHECKPOINT: job.checkpoint || defaults.checkpoint,
    WIDTH: job.width ?? defaults.width,
    HEIGHT: job.height ?? defaults.height,
    SEED: job.seed ?? defaults.seed ?? Math.floor(Math.random() * 2_000_000_000),
    STEPS: job.steps ?? defaults.steps,
    CFG: job.cfg ?? defaults.cfg,
    SAMPLER: job.sampler || defaults.sampler,
    SCHEDULER: job.scheduler || defaults.scheduler,
    DENOISE: job.denoise ?? defaults.denoise,
    RETURN_LEFTOVER_NOISE: defaults.returnLeftoverNoise,
    OUTPUT_PREFIX: slug(job.output || job.name),
  };
  return renderValue(JSON.parse(JSON.stringify(template)), ctx);
}

async function queuePrompt(host, workflow, clientId) {
  const response = await fetch(`${host}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ComfyUI /prompt failed (${response.status}): ${body}`);
  }
  const result = await response.json();
  return result.prompt_id;
}

async function getHistory(host, promptId) {
  const response = await fetch(`${host}/history/${encodeURIComponent(promptId)}`);
  if (!response.ok) {
    if (response.status === 404) return null;
    const body = await response.text();
    throw new Error(`ComfyUI /history failed (${response.status}): ${body}`);
  }
  return response.json();
}

function collectImageItems(outputs) {
  if (!outputs || typeof outputs !== 'object') return [];
  return Object.entries(outputs).flatMap(([, output]) => {
    if (!output || !Array.isArray(output.images)) return [];
    return output.images;
  });
}

async function waitForOutputs(host, promptId, { timeoutMs, pollMs }) {
  const expires = Date.now() + timeoutMs;
  while (Date.now() < expires) {
    const history = await getHistory(host, promptId);
    const entry = history?.[promptId] || history?.data?.[promptId] || null;
    if (!entry) {
      await sleep(pollMs);
      continue;
    }

    const outputs = entry.outputs || {};
    const imageItems = collectImageItems(outputs);
    const status = String(entry.status?.status || '').toLowerCase();
    const completed = status && !['running', 'queued', 'starting', 'processing', 'scheduled'].includes(status);

    if (imageItems.length > 0) return outputs;
    if (completed) {
      throw new Error(`ComfyUI run failed for ${promptId}: ${entry.status?.text || status || 'unknown status'}`);
    }

    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for ComfyUI result ${promptId} after ${timeoutMs}ms`);
}

async function fetchImage(host, item, destination) {
  const query = new URLSearchParams({
    filename: item.filename,
    subfolder: item.subfolder || '',
    type: item.type || 'output',
  });
  const response = await fetch(`${host}/view?${query}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ComfyUI /view failed for ${item.filename}: ${body}`);
  }
  const buffer = await response.arrayBuffer();
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, Buffer.from(buffer));
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    usage();
    return;
  }

  const workflowPath = args.workflow;
  const promptsPath = args.prompts;
  if (!workflowPath || !promptsPath) {
    usage();
    throw new Error('workflow and prompts are required.');
  }

  const host = (args.host || process.env.COMFYUI_HOST || 'http://127.0.0.1:8188').replace(/\/$/, '');
  const outDir = path.resolve(ROOT, expandHome(args['out-dir'] || 'tmp/comfy-output'));
  const workflow = JSON.parse(await fs.readFile(path.resolve(ROOT, expandHome(workflowPath)), 'utf8'));
  const rawJobs = normalizeJobs(
    await readJSONOrJSONL(path.resolve(ROOT, expandHome(promptsPath)),
    args.negative || 'low quality, blurry, artifacts, watermark, text'
  );

  if (!rawJobs.length) throw new Error('No prompt jobs found in prompt sheet.');

  const defaults = {
    checkpoint: args.checkpoint || 'CHECKPOINT_NAME',
    width: toNumber(args.width, 512),
    height: toNumber(args.height, 512),
    steps: toNumber(args.steps, 24),
    cfg: toNumber(args.cfg, 6),
    sampler: args.sampler || 'euler',
    scheduler: args.scheduler || 'normal',
    denoise: toNumber(args.denoise, 1),
    returnLeftoverNoise: Boolean(args['return-leftover-noise']),
    seed: toNumber(args.seed, null),
  };

  const timeoutMs = toNumber(args['timeout-ms'], 180000);
  const pollMs = toNumber(args['poll-ms'], 1200);
  const continueOnError = Boolean(args['continue-on-error']);
  const dryRun = Boolean(args['dry-run']);

  let failures = 0;
  const clientId = `phyx-${Date.now()}`;

  for (const [index, job] of rawJobs.entries()) {
    const safeName = slug(job.output || job.name || `sprite-${index + 1}`);
    const workflowForJob = buildWorkflow(workflow, job, defaults);
    console.log(`\n[${index + 1}/${rawJobs.length}] ${safeName}`);

    if (dryRun) {
      console.log(JSON.stringify({ name: safeName, workflow: workflowForJob }, null, 2));
      continue;
    }

    try {
      const promptId = await queuePrompt(host, workflowForJob, clientId);
      console.log(`Queued prompt ${promptId}`);

      const outputs = await waitForOutputs(host, promptId, { timeoutMs, pollMs });
      const imageItems = collectImageItems(outputs);
      if (!imageItems.length) throw new Error(`No images found in outputs for ${promptId}`);

      for (const [imageIndex, item] of imageItems.entries()) {
        const filename = `${safeName}-${String(index + 1).padStart(2, '0')}-${String(imageIndex + 1).padStart(2, '0')}-${promptId.slice(0, 8)}.png`;
        await fetchImage(host, item, path.join(outDir, filename));
        console.log(`Saved ${path.join(outDir, filename)}`);
      }
    } catch (err) {
      failures += 1;
      console.error(`Failed ${safeName}: ${err.message}`);
      if (!continueOnError) throw err;
    }
  }

  if (failures > 0) {
    console.error(`Completed with ${failures} failed job(s).`);
    process.exitCode = 1;
  } else {
    console.log(`\nWrote outputs to ${outDir}`);
  }
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
