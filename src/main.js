import './index.css';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { GameState } from './engine/GameState.js';
import { HEROES } from './data/heroes.js';
import { getHeroTheme } from './data/heroThemes.js';
import { CAIT_IDOL, buildCaitCompanion, getCaitLoadout } from './data/caitModules.js';
import { ENEMIES, ENCOUNTERS } from './data/enemies.js';
import { CARDS } from './data/cards.js';
import { SOUNDTRACK_TRACKS, tracksForDomain } from './data/soundtrack.js';
import bus from './engine/EventBus.js';

// Initialize Vercel Speed Insights
injectSpeedInsights();

const cardPool = Object.values(CARDS).filter(c => c.rarity !== 'starter');
const game = new GameState();
const SAVE_STORAGE_KEY = 'phyx-the-stack:saves:v1';
const SAVE_SLOT_COUNT = 3;
const DEFAULT_TRACK = SOUNDTRACK_TRACKS.find(track => track.id === 'cait-intro') ?? SOUNDTRACK_TRACKS[0];
const MUSIC_DOMAIN_FILTERS = {
  title: { lowpass: 6200, highpass: 24, peakFrequency: 880, peakGain: 1.8, gain: 0.72, threshold: -24, ratio: 4.5 },
  heroSelect: { lowpass: 7800, highpass: 32, peakFrequency: 1400, peakGain: 2.6, gain: 0.76, threshold: -26, ratio: 5.2 },
  map: { lowpass: 6800, highpass: 28, peakFrequency: 720, peakGain: 1.4, gain: 0.66, threshold: -22, ratio: 4 },
  combat: { lowpass: 10800, highpass: 46, peakFrequency: 2400, peakGain: 3.4, gain: 0.82, threshold: -31, ratio: 7.5 },
  draft: { lowpass: 5200, highpass: 38, peakFrequency: 1100, peakGain: 2.1, gain: 0.7, threshold: -27, ratio: 5.8 },
  gameOver: { lowpass: 4200, highpass: 22, peakFrequency: 520, peakGain: -0.8, gain: 0.62, threshold: -25, ratio: 6 },
  victory: { lowpass: 9000, highpass: 26, peakFrequency: 1700, peakGain: 2.8, gain: 0.78, threshold: -24, ratio: 4.8 },
};

const root = document.querySelector('#screen-container');
const damageLayer = document.querySelector('#damage-numbers-layer');
const toastLayer = document.querySelector('#toast-layer');

const enemyCatalogue = buildEnemyCatalogue();
let activeDraft = [];
let selectedTarget = 0;
let introAudio = null;
let introMusicEnabled = false;
let introAudioContext = null;
let introAnalyser = null;
let introFrequencyData = null;
let introVisualizerFrame = null;
let musicUiFrame = null;
let introBeatLevel = 0;
let musicBassLevel = 0;
let musicMidLevel = 0;
let musicHighLevel = 0;
let currentMusicTrack = DEFAULT_TRACK;
let currentMusicDomain = 'title';
let musicDomainCursor = {};
let musicNodes = null;
let musicBlockedToastShown = false;
let interactionPulse = 0;
let interactionPulseTimer = null;
let systemMenuOpen = false;
let titleWindowOffset = { x: 0, y: 0 };
let titleLauncherOpen = false;
let caitCodecOffset = { x: 0, y: 0 };

root.addEventListener('pointerdown', (event) => {
  const interactive = event.target.closest('button, .game-card, .hero-card, .map-node, .terminal-opt-btn, .save-slot');
  if (!interactive) return;
  triggerInteractionPulse(event.clientX, event.clientY, interactive.matches('.btn-primary, .ult-btn-ready') ? 1 : 0.72);
  if (!introMusicEnabled && game.getSnapshot().phase !== 'title') startIntroMusic();
}, { capture: true });

bus.on('stateChange', () => render());
bus.on('combatUpdate', () => render());
bus.on('draftOffered', ({ cards }) => {
  activeDraft = cards ?? [];
  render();
});
bus.on('damageDealt', onDamageEvent);
bus.on('toast', ({ text, type = 'info' }) => emitToast(text, type));
bus.on('enemyAction', ({ enemy, action }) => {
  root.classList.add('screen-shake');
  setTimeout(() => root.classList.remove('screen-shake'), 300);
});

render();

function render() {
  const snapshot = game.getSnapshot();
  root.innerHTML = '';
  prepareMusicForPhase(snapshot.phase);

  switch (snapshot.phase) {
    case 'title': renderTitle(); return;
    case 'heroSelect': renderHeroSelect(); return;
    case 'map': renderMap(); return;
    case 'combat': renderCombat(); return;
    case 'draft': renderDraft(); return;
    case 'gameOver': renderGameOver(); return;
    case 'victory': renderVictory(); return;
    default: renderTitle();
  }
}

// ──────────────────────────────────────────────────────────
// Title
// ──────────────────────────────────────────────────────────

function renderTitle() {
  const section = el('section', 'title-screen');
  if (titleLauncherOpen) section.classList.add('launcher-open');
  section.innerHTML = `
    <div class="title-cait-lab-backdrop" aria-hidden="true"></div>
    <canvas class="title-spectrum title-spectrum-back" id="title-spectrum" width="960" height="360" aria-hidden="true"></canvas>
    <canvas class="title-spectrum title-spectrum-front" id="title-spectrum-front" width="960" height="360" aria-hidden="true"></canvas>
    <div class="title-top-wordmark">
      <span>CAIT LABS // PEON QUEEN ROUTE</span>
      <h1 class="glitch-text" data-text="Phyx the Stack">Phyx the Stack</h1>
      <i aria-hidden="true"></i>
    </div>
    <div class="title-cat-launcher">
      <div class="title-cat-menu" aria-label="Title controls">
      <div class="title-terminal-top">
          <span class="title-window-grip">CaitOS://Controls</span>
        <span>READY</span>
      </div>
        <div class="title-cat-menu-title">Phyx Launch</div>
      <div class="title-actions">
        <button class="btn btn-primary" id="start-btn">New Run</button>
        <button class="btn title-music-btn" id="music-btn">${introMusicEnabled ? 'Mute Score' : 'Play Score'}</button>
      </div>
      <button class="btn title-save-menu-btn" id="title-save-menu-btn">Save States</button>
    </div>
      <button class="title-cat-button" id="title-cat-button" type="button" aria-expanded="${titleLauncherOpen ? 'true' : 'false'}" aria-label="Open CaitOS launch controls">
        <span>CAIT</span>
      </button>
    </div>
    <div class="title-version">v0.1.0 · Cait Labs</div>
  `;
  root.appendChild(section);
  startTitleVisualizer(section);
  section.querySelector('#title-cat-button').onclick = () => {
    titleLauncherOpen = !titleLauncherOpen;
    section.classList.toggle('launcher-open', titleLauncherOpen);
    section.querySelector('#title-cat-button').setAttribute('aria-expanded', titleLauncherOpen ? 'true' : 'false');
  };
  section.querySelector('#start-btn').onclick = () => {
    game.setPhase('heroSelect');
    startIntroMusic();
  };
  section.querySelector('#music-btn').onclick = () => toggleIntroMusic(section);
  section.querySelector('#title-save-menu-btn').onclick = () => openSystemMenu(false);
  appendSystemMenuOverlay(section, false);
}

function applyTitleWindowOffset(windowEl) {
  if (!windowEl) return;
  windowEl.style.setProperty('--title-window-x', `${Math.round(titleWindowOffset.x)}px`);
  windowEl.style.setProperty('--title-window-y', `${Math.round(titleWindowOffset.y)}px`);
}

function wireTitleWindowDrag(section) {
  const windowEl = section.querySelector('.title-fold-anchor');
  const dragBar = section.querySelector('.title-terminal-top');
  if (!windowEl || !dragBar) return;

  let drag = null;
  dragBar.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: titleWindowOffset.x,
      originY: titleWindowOffset.y,
    };
    dragBar.setPointerCapture(event.pointerId);
    windowEl.classList.add('dragging');
  });

  dragBar.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = windowEl.getBoundingClientRect();
    const maxX = Math.max(80, window.innerWidth / 2 - Math.min(140, rect.width * 0.22));
    const maxY = Math.max(80, window.innerHeight / 2 - Math.min(120, rect.height * 0.36));
    titleWindowOffset = {
      x: clampNumber(drag.originX + event.clientX - drag.startX, -maxX, maxX),
      y: clampNumber(drag.originY + event.clientY - drag.startY, -maxY, maxY),
    };
    applyTitleWindowOffset(windowEl);
  });

  const endDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    windowEl.classList.remove('dragging');
  };
  dragBar.addEventListener('pointerup', endDrag);
  dragBar.addEventListener('pointercancel', endDrag);
}

function applyCaitCodecOffset(windowEl) {
  if (!windowEl) return;
  windowEl.style.setProperty('--cait-codec-x', `${Math.round(caitCodecOffset.x)}px`);
  windowEl.style.setProperty('--cait-codec-y', `${Math.round(caitCodecOffset.y)}px`);
}

function wireCaitCodecDrag(windowEl) {
  const dragBar = windowEl?.querySelector('.cait-codec-top');
  if (!windowEl || !dragBar) return;

  let drag = null;
  dragBar.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: caitCodecOffset.x,
      originY: caitCodecOffset.y,
    };
    dragBar.setPointerCapture(event.pointerId);
    windowEl.classList.add('dragging');
  });

  dragBar.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = windowEl.getBoundingClientRect();
    const maxX = Math.max(120, window.innerWidth - rect.width - 90);
    const maxY = Math.max(90, window.innerHeight - rect.height - 100);
    caitCodecOffset = {
      x: clampNumber(drag.originX + event.clientX - drag.startX, -maxX * 0.55, maxX),
      y: clampNumber(drag.originY + event.clientY - drag.startY, -maxY, maxY * 0.62),
    };
    applyCaitCodecOffset(windowEl);
  });

  const endDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    windowEl.classList.remove('dragging');
  };
  dragBar.addEventListener('pointerup', endDrag);
  dragBar.addEventListener('pointercancel', endDrag);
}

function ensureIntroAudio() {
  if (introAudio) return introAudio;
  introAudio = new Audio(currentMusicTrack?.src ?? DEFAULT_TRACK.src);
  introAudio.loop = false;
  introAudio.volume = MUSIC_DOMAIN_FILTERS.title.gain;
  introAudio.preload = 'auto';
  introAudio.addEventListener('ended', () => {
    currentMusicTrack = null;
    prepareMusicForPhase(currentMusicDomain, { forceTrack: true });
    if (introMusicEnabled) startIntroMusic();
  });
  return introAudio;
}

function ensureIntroAnalyser() {
  const audio = ensureIntroAudio();
  if (introAnalyser) return introAnalyser;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  introAudioContext = new AudioContext();
  const source = introAudioContext.createMediaElementSource(audio);
  introAnalyser = introAudioContext.createAnalyser();
  introAnalyser.fftSize = 256;
  introAnalyser.smoothingTimeConstant = 0.62;
  introFrequencyData = new Uint8Array(introAnalyser.frequencyBinCount);
  const highpass = introAudioContext.createBiquadFilter();
  highpass.type = 'highpass';
  const lowpass = introAudioContext.createBiquadFilter();
  lowpass.type = 'lowpass';
  const presence = introAudioContext.createBiquadFilter();
  presence.type = 'peaking';
  presence.Q.value = 0.72;
  const compressor = introAudioContext.createDynamicsCompressor();
  const output = introAudioContext.createGain();

  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(presence);
  presence.connect(compressor);
  compressor.connect(introAnalyser);
  introAnalyser.connect(output);
  output.connect(introAudioContext.destination);
  musicNodes = { source, highpass, lowpass, presence, compressor, output };
  applyMusicDomainFilter(currentMusicDomain);
  return introAnalyser;
}

function startIntroMusic() {
  prepareMusicForPhase(game.getSnapshot().phase);
  const audio = ensureIntroAudio();
  const analyser = ensureIntroAnalyser();
  if (introAudioContext?.state === 'suspended') {
    introAudioContext.resume();
  }
  if (analyser) startTitleVisualizer(document);
  startMusicReactiveUi();
  introMusicEnabled = true;
  const playAttempt = audio.play();
  if (playAttempt?.catch) {
    playAttempt.catch(() => {
      introMusicEnabled = false;
      if (!musicBlockedToastShown) {
        musicBlockedToastShown = true;
        emitToast('Browser blocked score audio. Press Play Score.', 'warning');
      }
      syncIntroMusicButtons(document);
    });
  }
  if (playAttempt?.then) playAttempt.then(() => { musicBlockedToastShown = false; });
  syncIntroMusicButtons(document);
}

function toggleIntroMusic(scope = document) {
  const audio = ensureIntroAudio();
  if (introMusicEnabled && !audio.paused) {
    audio.pause();
    introMusicEnabled = false;
  } else {
    startIntroMusic();
  }
  syncIntroMusicButtons(scope);
}

function syncIntroMusicButtons(scope = document) {
  scope.querySelectorAll('#music-btn').forEach(button => {
    button.textContent = introMusicEnabled ? 'Mute Score' : 'Play Score';
    button.title = currentMusicTrack ? currentMusicTrack.title : 'Game soundtrack';
  });
}

function musicDomainForPhase(phase) {
  if (phase === 'boss') return 'combat';
  return MUSIC_DOMAIN_FILTERS[phase] ? phase : 'map';
}

function prepareMusicForPhase(phase = 'title', { forceTrack = false } = {}) {
  const domain = musicDomainForPhase(phase);
  currentMusicDomain = domain;
  root.dataset.musicDomain = domain;
  document.documentElement.dataset.musicDomain = domain;
  const nextTrack = chooseTrackForDomain(domain, forceTrack);
  if (!nextTrack) return;
  const audio = introAudio;
  const shouldSwitch = forceTrack || currentMusicTrack?.id !== nextTrack.id;
  currentMusicTrack = nextTrack;
  if (audio && shouldSwitch) {
    const wasPlaying = introMusicEnabled && !audio.paused;
    audio.src = nextTrack.src;
    audio.currentTime = 0;
    audio.load();
    if (wasPlaying) {
      const playAttempt = audio.play();
      if (playAttempt?.catch) playAttempt.catch(() => {});
    }
  }
  applyMusicDomainFilter(domain);
  syncIntroMusicButtons(document);
}

function chooseTrackForDomain(domain, forceTrack = false) {
  const options = tracksForDomain(domain);
  if (!options.length) return DEFAULT_TRACK;
  if (!forceTrack && currentMusicTrack?.domains?.includes(domain)) return currentMusicTrack;
  const cursor = musicDomainCursor[domain] ?? 0;
  const next = options[cursor % options.length];
  musicDomainCursor = { ...musicDomainCursor, [domain]: cursor + 1 };
  return next;
}

function applyMusicDomainFilter(domain) {
  if (!musicNodes || !introAudioContext) return;
  const preset = MUSIC_DOMAIN_FILTERS[domain] ?? MUSIC_DOMAIN_FILTERS.map;
  const now = introAudioContext.currentTime;
  rampAudioParam(musicNodes.highpass.frequency, preset.highpass, now);
  rampAudioParam(musicNodes.lowpass.frequency, preset.lowpass, now);
  rampAudioParam(musicNodes.presence.frequency, preset.peakFrequency, now);
  rampAudioParam(musicNodes.presence.gain, preset.peakGain, now);
  rampAudioParam(musicNodes.output.gain, preset.gain, now);
  rampAudioParam(musicNodes.compressor.threshold, preset.threshold, now);
  rampAudioParam(musicNodes.compressor.ratio, preset.ratio, now);
}

function rampAudioParam(param, value, now) {
  param.cancelScheduledValues(now);
  param.linearRampToValueAtTime(value, now + 0.36);
}

function startMusicReactiveUi() {
  if (musicUiFrame) return;
  const tick = () => {
    updateTitleBeat(document);
    interactionPulse = Math.max(0, interactionPulse * 0.9 - 0.006);
    document.documentElement.style.setProperty('--choice-pulse', interactionPulse.toFixed(3));
    root.style.setProperty('--choice-pulse', interactionPulse.toFixed(3));
    musicUiFrame = requestAnimationFrame(tick);
  };
  tick();
}

function triggerInteractionPulse(x = window.innerWidth / 2, y = window.innerHeight / 2, strength = 0.7) {
  interactionPulse = Math.min(1, Math.max(interactionPulse, strength));
  const px = Number.isFinite(x) ? x : window.innerWidth / 2;
  const py = Number.isFinite(y) ? y : window.innerHeight / 2;
  document.documentElement.style.setProperty('--choice-x', `${Math.round(px)}px`);
  document.documentElement.style.setProperty('--choice-y', `${Math.round(py)}px`);
  root.style.setProperty('--choice-x', `${Math.round(px)}px`);
  root.style.setProperty('--choice-y', `${Math.round(py)}px`);
  root.classList.add('choice-reacting');
  clearTimeout(interactionPulseTimer);
  interactionPulseTimer = setTimeout(() => root.classList.remove('choice-reacting'), 260);
}

function startTitleVisualizer(scope = document) {
  const canvases = [
    scope.querySelector?.('#title-spectrum') ?? document.querySelector('#title-spectrum'),
    scope.querySelector?.('#title-spectrum-front') ?? document.querySelector('#title-spectrum-front'),
  ].filter(Boolean);
  if (!canvases.length) return;
  const contexts = canvases.map(canvas => canvas.getContext('2d'));
  if (contexts.some(ctx => !ctx)) return;
  if (introVisualizerFrame) cancelAnimationFrame(introVisualizerFrame);

  const draw = (time = 0) => {
    canvases.forEach((canvas, index) => {
      const ctx = contexts[index];
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.scale(dpr, dpr);
      drawTitleSpectrum(ctx, rect.width, rect.height, time, index === 0 ? 'back' : 'front');
      ctx.restore();
    });

    introVisualizerFrame = requestAnimationFrame(draw);
  };
  draw();
}

function drawTitleSpectrum(ctx, width, height, time, layer = 'back') {
  const cx = width / 2;
  const cy = height * 0.405;
  const loopX = width * 0.315;
  const loopY = height * 0.16;
  const pulse = 0.5 + Math.sin(time * 0.0012) * 0.5;
  const bands = 96;

  if (introAnalyser && introFrequencyData && introMusicEnabled) {
    introAnalyser.getByteFrequencyData(introFrequencyData);
  }
  updateTitleBeat();

  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2 + introBeatLevel * 2;

  if (layer === 'back') {
    const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.max(loopX, loopY) * 1.45);
    halo.addColorStop(0, `rgba(255, 51, 153, ${0.055 + pulse * 0.025 + introBeatLevel * 0.045})`);
    halo.addColorStop(0.42, `rgba(255, 111, 31, ${0.035 + introBeatLevel * 0.04})`);
    halo.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(cx, cy, loopX * 1.72, loopY * 1.72, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawTitleLemniscateField(ctx, cx, cy, loopX, loopY, time, bands, layer);
  if (layer === 'front') drawTitleReverseNodes(ctx, cx, cy, loopX, loopY, time);
  if (layer === 'front') {
    drawTitleFoldCore(ctx, cx, cy, loopX, loopY, time);
  }
}

function lemniscatePoint(cx, cy, loopX, loopY, t, rotation) {
  const x = loopX * Math.sin(t);
  const y = loopY * Math.sin(t) * Math.cos(t);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  };
}

function drawTitleLemniscateField(ctx, cx, cy, loopX, loopY, time, bands, layer = 'back') {
  const rotation = 0;
  const ribbonCount = 3;

  for (let r = 0; r < ribbonCount; r += 1) {
    drawLemniscateRibbonSegment(ctx, {
      cx,
      cy,
      loopX: loopX + r * 18,
      loopY: loopY + r * 8,
      rotation,
      layer,
      lineWidth: r === 0
        ? (layer === 'front' ? 5 + introBeatLevel * 6 : 4 + introBeatLevel * 4)
        : (layer === 'front' ? 1.4 : 1),
      strokeStyle: r === 0
        ? `rgba(255, 51, 153, ${layer === 'front' ? 0.13 + introBeatLevel * 0.1 : 0.055 + introBeatLevel * 0.06})`
        : r % 2 === 0
          ? `rgba(255, 111, 31, ${layer === 'front' ? 0.1 + introBeatLevel * 0.08 : 0.035 + introBeatLevel * 0.04})`
          : `rgba(255, 51, 153, ${layer === 'front' ? 0.1 + introBeatLevel * 0.08 : 0.035 + introBeatLevel * 0.04})`,
      offset: r * 0.015,
    });
  }

  for (let i = 0; i < bands; i += 1) {
    const t = (i / bands) * Math.PI * 2 + time * 0.00072;
    const foldDepth = Math.sin(t) * Math.cos(t);
    const isFront = foldDepth > 0.035 || Math.abs(Math.sin(t)) < 0.14;
    if ((layer === 'back' && isFront) || (layer === 'front' && !isFront)) continue;
    const sampleIndex = introFrequencyData ? Math.floor((i / bands) * introFrequencyData.length) : 0;
    const raw = introMusicEnabled && introFrequencyData ? introFrequencyData[sampleIndex] / 255 : 0;
    const idle = 0.1 + Math.sin(time * 0.0016 + i * 0.35) * 0.035;
    const signal = Math.min(1, introMusicEnabled ? raw * 1.25 + introBeatLevel * 0.35 + idle : idle);
    const center = lemniscatePoint(cx, cy, loopX, loopY, t, rotation);
    const ahead = lemniscatePoint(cx, cy, loopX, loopY, t + 0.012, rotation);
    const tangentX = ahead.x - center.x;
    const tangentY = ahead.y - center.y;
    const length = Math.hypot(tangentX, tangentY) || 1;
    const normalX = -tangentY / length;
    const normalY = tangentX / length;
    const innerGap = 10 + signal * 8;
    const barLength = 20 + Math.pow(signal, 1.18) * 80;
    const hue = i % 3;

    ctx.lineWidth = layer === 'front' ? 4 + signal * 6.2 : 2 + signal * 3;
    ctx.globalAlpha = layer === 'front' ? 0.76 : 0.24;
    ctx.strokeStyle = hue === 0
      ? `rgba(255, 51, 153, ${0.16 + signal * 0.36})`
      : hue === 1
        ? `rgba(255, 111, 31, ${0.14 + signal * 0.34})`
        : `rgba(0, 229, 255, ${0.08 + signal * 0.22})`;

    ctx.beginPath();
    ctx.moveTo(center.x - normalX * (innerGap + barLength * 0.78), center.y - normalY * (innerGap + barLength * 0.78));
    ctx.lineTo(center.x - normalX * innerGap, center.y - normalY * innerGap);
    ctx.moveTo(center.x + normalX * innerGap, center.y + normalY * innerGap);
    ctx.lineTo(center.x + normalX * (innerGap + barLength), center.y + normalY * (innerGap + barLength));
    ctx.stroke();

    if (signal > 0.52) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.42, (signal - 0.45) * 0.56)})`;
      ctx.beginPath();
      ctx.arc(center.x + normalX * (innerGap + barLength), center.y + normalY * (innerGap + barLength), 1.4 + signal * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawLemniscateRibbonSegment(ctx, { cx, cy, loopX, loopY, rotation, layer, lineWidth, strokeStyle, offset }) {
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.globalAlpha = layer === 'front' ? 1 : 0.5;
  let drawing = false;
  for (let i = 0; i <= 360; i += 1) {
    const t = (i / 360) * Math.PI * 2 + offset;
    const foldDepth = Math.sin(t) * Math.cos(t);
    const isFront = foldDepth > 0.035 || Math.abs(Math.sin(t)) < 0.14;
    const shouldDraw = layer === 'front' ? isFront : !isFront;
    const point = lemniscatePoint(cx, cy, loopX, loopY, t, rotation);
    if (!shouldDraw) {
      if (drawing) {
        ctx.stroke();
        drawing = false;
      }
      continue;
    }
    if (!drawing) {
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      drawing = true;
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  if (drawing) ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawTitleFoldLatches(ctx, cx, cy, loopX, loopY, time) {
  const pulse = 0.5 + Math.sin(time * 0.003) * 0.5;
  const latchPoints = [-0.09, 0.09, Math.PI - 0.09, Math.PI + 0.09];

  latchPoints.forEach((t, index) => {
    const point = lemniscatePoint(cx, cy, loopX, loopY, t, 0);
    const side = index < 2 ? 1 : -1;
    const alpha = 0.18 + introBeatLevel * 0.3 + pulse * 0.08;

    ctx.strokeStyle = index % 2 === 0
      ? `rgba(0, 229, 255, ${alpha})`
      : `rgba(255, 51, 153, ${alpha})`;
    ctx.lineWidth = 1.6 + introBeatLevel * 2.8;
    ctx.beginPath();
    ctx.moveTo(point.x - side * 70, point.y - 8);
    ctx.lineTo(point.x - side * 18, point.y - 2);
    ctx.lineTo(point.x + side * 18, point.y + 2);
    ctx.lineTo(point.x + side * 70, point.y + 8);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 255, 255, ${0.12 + introBeatLevel * 0.28})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.8 + introBeatLevel * 3.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawTitleReverseNodes(ctx, cx, cy, loopX, loopY, time) {
  const nodes = 18;
  const reverseDrift = -time * 0.00105;

  for (let i = 0; i < nodes; i += 1) {
    const t = (i / nodes) * Math.PI * 2 + reverseDrift;
    const point = lemniscatePoint(cx, cy, loopX + 22, loopY + 11, t, 0);
    const sampleIndex = introFrequencyData ? Math.floor((i / nodes) * introFrequencyData.length) : 0;
    const raw = introMusicEnabled && introFrequencyData ? introFrequencyData[sampleIndex] / 255 : 0.14;
    const signal = Math.min(1, raw * 0.7 + introBeatLevel * 0.55 + 0.08);
    const radius = 2.6 + signal * 4.8;
    const hue = i % 3;

    const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 6);
    if (hue === 0) {
      glow.addColorStop(0, `rgba(255, 225, 255, ${0.44 + signal * 0.34})`);
      glow.addColorStop(0.38, `rgba(255, 51, 153, ${0.18 + signal * 0.24})`);
    } else if (hue === 1) {
      glow.addColorStop(0, `rgba(226, 210, 255, ${0.38 + signal * 0.3})`);
      glow.addColorStop(0.38, `rgba(255, 111, 31, ${0.14 + signal * 0.2})`);
    } else {
      glow.addColorStop(0, `rgba(210, 255, 255, ${0.38 + signal * 0.3})`);
      glow.addColorStop(0.38, `rgba(0, 229, 255, ${0.16 + signal * 0.22})`);
    }
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTitleFoldCore(ctx, cx, cy, loopX, loopY, time) {
  const corePulse = 0.5 + Math.sin(time * 0.002) * 0.5;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(loopX, loopY) * 0.48);
  core.addColorStop(0, `rgba(255, 255, 255, ${0.08 + introBeatLevel * 0.16})`);
  core.addColorStop(0.28, `rgba(255, 111, 31, ${0.075 + corePulse * 0.035})`);
  core.addColorStop(0.62, `rgba(255, 51, 153, ${0.06 + introBeatLevel * 0.08})`);
  core.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(cx, cy, loopX * 0.18 + introBeatLevel * 16, loopY * 0.36 + introBeatLevel * 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 + introBeatLevel * 0.2})`;
  ctx.lineWidth = 1.4 + introBeatLevel * 2;
  ctx.beginPath();
  ctx.moveTo(cx - loopX * 0.08, cy);
  ctx.lineTo(cx + loopX * 0.08, cy);
  ctx.stroke();
}

function drawTitleBeatRipples(ctx, cx, cy, ringX, ringY, time) {
  for (let i = 0; i < 4; i += 1) {
    const phase = ((time * 0.00022) + i * 0.24) % 1;
    const intensity = Math.max(0, 1 - phase);
    const beatPush = introBeatLevel * 0.22;
    const alpha = (0.035 + introBeatLevel * 0.12) * intensity;
    ctx.strokeStyle = i % 2 === 0
      ? `rgba(255, 51, 153, ${alpha})`
      : `rgba(0, 229, 255, ${alpha})`;
    ctx.lineWidth = 1 + introBeatLevel * 1.4;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      ringX * (0.68 + phase * 0.62 + beatPush),
      ringY * (0.68 + phase * 0.62 + beatPush * 0.7),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
}

function drawTitleOrbitNodes(ctx, cx, cy, ringX, ringY, time) {
  const nodes = 14;
  const nodePositions = [];
  for (let i = 0; i < nodes; i += 1) {
    const drift = time * 0.00012 * (i % 2 === 0 ? 1 : -1);
    const angle = (i / nodes) * Math.PI * 2 + drift;
    const sampleIndex = introFrequencyData ? Math.floor((i / nodes) * introFrequencyData.length) : 0;
    const raw = introMusicEnabled && introFrequencyData ? introFrequencyData[sampleIndex] / 255 : 0.18;
    const signal = raw * 0.55 + introBeatLevel * 0.45;
    const x = cx + Math.cos(angle) * (ringX + 18 + signal * 36);
    const y = cy + Math.sin(angle) * (ringY + 10 + signal * 22);
    nodePositions.push({ x, y, signal });

    const radius = 2.4 + signal * 5.8;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 5);
    glow.addColorStop(0, i % 3 === 0 ? 'rgba(255, 51, 153, 0.85)' : 'rgba(0, 229, 255, 0.75)');
    glow.addColorStop(0.45, 'rgba(153, 51, 255, 0.22)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = i % 3 === 0 ? 'rgba(255, 190, 235, 0.86)' : 'rgba(180, 250, 255, 0.82)';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineWidth = 1;
  for (let i = 0; i < nodePositions.length; i += 1) {
    const current = nodePositions[i];
    const next = nodePositions[(i + 3) % nodePositions.length];
    const alpha = 0.035 + (current.signal + next.signal) * 0.045;
    ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(current.x, current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
  }
}

function drawTitleCornerMeters(ctx, width, height, time) {
  const marginX = width * 0.065;
  const marginY = height * 0.1;
  const meterWidth = width * 0.13;
  const meterHeight = height * 0.09;
  const corners = [
    [marginX, marginY, 1, 1],
    [width - marginX, marginY, -1, 1],
    [marginX, height - marginY, 1, -1],
    [width - marginX, height - marginY, -1, -1],
  ];

  for (const [x, y, sx, sy] of corners) {
    ctx.strokeStyle = `rgba(0, 229, 255, ${0.13 + introBeatLevel * 0.2})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + sy * meterHeight);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * meterWidth, y);
    ctx.stroke();

    for (let i = 0; i < 7; i += 1) {
      const wave = 0.5 + Math.sin(time * 0.004 + i * 0.9 + sx) * 0.5;
      const lit = introBeatLevel * 0.8 + wave * 0.2;
      ctx.strokeStyle = i % 2
        ? `rgba(255, 51, 153, ${0.08 + lit * 0.2})`
        : `rgba(0, 229, 255, ${0.08 + lit * 0.22})`;
      const tickX = x + sx * (14 + i * 13);
      ctx.beginPath();
      ctx.moveTo(tickX, y + sy * 8);
      ctx.lineTo(tickX + sx * (8 + lit * 16), y + sy * 8);
      ctx.stroke();
    }
  }
}

function updateTitleBeat(scope = document) {
  let lowAverage = 0;
  let midAverage = 0;
  let highAverage = 0;
  if (introMusicEnabled && introFrequencyData) {
    if (introAnalyser) introAnalyser.getByteFrequencyData(introFrequencyData);
    const lowCount = Math.min(18, introFrequencyData.length);
    const midStart = Math.min(18, introFrequencyData.length - 1);
    const midEnd = Math.min(54, introFrequencyData.length);
    const highStart = Math.min(54, introFrequencyData.length - 1);
    const highEnd = introFrequencyData.length;
    for (let i = 0; i < lowCount; i += 1) lowAverage += introFrequencyData[i] / 255;
    for (let i = midStart; i < midEnd; i += 1) midAverage += introFrequencyData[i] / 255;
    for (let i = highStart; i < highEnd; i += 1) highAverage += introFrequencyData[i] / 255;
    lowAverage /= lowCount || 1;
    midAverage /= Math.max(1, midEnd - midStart);
    highAverage /= Math.max(1, highEnd - highStart);
  } else {
    lowAverage = 0.12 + Math.sin(performance.now() * 0.0014) * 0.04;
    midAverage = 0.08 + Math.sin(performance.now() * 0.0019) * 0.035;
    highAverage = 0.06 + Math.sin(performance.now() * 0.0026) * 0.025;
  }
  const target = Math.max(0, Math.min(1, (lowAverage - 0.14) * 1.55));
  introBeatLevel = introBeatLevel * 0.82 + target * 0.18;
  musicBassLevel = musicBassLevel * 0.78 + lowAverage * 0.22;
  musicMidLevel = musicMidLevel * 0.8 + midAverage * 0.2;
  musicHighLevel = musicHighLevel * 0.84 + highAverage * 0.16;
  document.documentElement.style.setProperty('--music-beat', introBeatLevel.toFixed(3));
  document.documentElement.style.setProperty('--music-bass', musicBassLevel.toFixed(3));
  document.documentElement.style.setProperty('--music-mid', musicMidLevel.toFixed(3));
  document.documentElement.style.setProperty('--music-high', musicHighLevel.toFixed(3));
  document.documentElement.style.setProperty('--music-intensity', (currentMusicTrack?.intensity ?? 0.72).toFixed(2));
  root.dataset.musicActive = introMusicEnabled ? 'true' : 'false';
  root.style.setProperty('--music-beat', introBeatLevel.toFixed(3));
  root.style.setProperty('--music-bass', musicBassLevel.toFixed(3));
  root.style.setProperty('--music-mid', musicMidLevel.toFixed(3));
  root.style.setProperty('--music-high', musicHighLevel.toFixed(3));
  const titleScreen = scope.querySelector?.('.title-screen') ?? document.querySelector('.title-screen');
  if (titleScreen) titleScreen.style.setProperty('--title-beat', introBeatLevel.toFixed(3));
}

// ──────────────────────────────────────────────────────────
// Hero Select
// ──────────────────────────────────────────────────────────

function renderHeroSelect() {
  const section = el('section', 'hero-select-screen');
  const heroes = Object.values(HEROES).filter(hero => hero.id !== 'cait');
  const initialHero = heroes.find(hero => hero.id === 'asiphyx') ?? heroes[0];
  let selectedHero = initialHero;
  const setHeroSelectTheme = (hero) => {
    const theme = getHeroTheme(hero.id);
    section.dataset.selectedHero = hero.id;
    section.style.setProperty('--selected-hero-color', theme.accent ?? hero.color);
    section.style.setProperty('--selected-hero-accent-2', theme.accent2 ?? '#00e5ff');
    section.style.setProperty('--selected-hero-danger', theme.danger ?? '#ff3344');
    section.style.setProperty('--selected-hero-glow', `${theme.accent ?? hero.color}55`);
  };
  setHeroSelectTheme(initialHero);

  const heading = el('div', 'hero-select-title glitch-text');
  heading.dataset.text = 'CHOOSE YOUR BOND';
  heading.textContent = 'CHOOSE YOUR BOND';
  section.appendChild(heading);

  const showcase = el('div', 'hero-select-showcase');
  const renderShowcase = (hero) => {
    const theme = getHeroTheme(hero.id);
    const cait = buildCaitCompanion(hero.id);
    const portraitSrc = hero.portrait ?? hero.avatar;
    showcase.innerHTML = `
      <div class="hero-feature-copy">
        <span class="hero-select-kicker">Forced Duo Protocol</span>
        <h2 class="hero-feature-name">${escapeHtml(hero.name)}</h2>
        <p class="hero-feature-title">${escapeHtml(hero.title)} + ${escapeHtml(CAIT_IDOL.title)}</p>
        <p class="hero-feature-quote">"${escapeHtml(hero.quote)}"</p>
        <div class="hero-feature-stats">
          <span>${hero.maxHp} HP</span>
          <span>Cait ${cait.maxHp} HP</span>
          <span>${escapeHtml(cait.bondName)}</span>
        </div>
        <div class="duo-balance-panel">
          <span>QUEEN VALUE RATIO</span>
          <strong>${Math.round(cait.reliability * 100)}% RELIABLE // ${escapeHtml(cait.risk)} RISK</strong>
          <div class="duo-meter"><i style="width:${Math.round(cait.reliability * 100)}%"></i></div>
          <p>${escapeHtml(cait.role)}</p>
        </div>
        <button class="btn btn-primary hero-feature-start" data-start-hero="${hero.id}">Start Duo Run</button>
      </div>
      <div class="duo-feature-stage">
        <div class="duo-portrait-shell hero-duo-shell">
          <span>${escapeHtml(hero.name)}</span>
          <img class="duo-feature-art hero-feature-art" src="${portraitSrc}" alt="${escapeHtml(hero.name)} profile art" />
        </div>
        <div class="duo-link-core">
          <span>+</span>
          <strong>${escapeHtml(cait.bondName)}</strong>
        </div>
        <div class="duo-portrait-shell cait-duo-shell">
          <span>CAIT // PEON QUEEN</span>
          <img class="duo-feature-art cait-feature-art" src="${CAIT_IDOL.portrait}" alt="Cait Peon Queen profile art" />
        </div>
      </div>
      <div class="hero-feature-kit">
        <div>
          <span>HERO PASSIVE</span>
          <strong>${escapeHtml(hero.passive.name)}</strong>
          <p>${escapeHtml(hero.passive.description)}</p>
        </div>
        <div>
          <span>CAIT BOND</span>
          <strong>${escapeHtml(cait.bondName)}</strong>
          <p>${escapeHtml(cait.bondLine)}</p>
        </div>
        <div class="cait-module-stack">
          <span>STARTING CAIT MODULES</span>
          ${cait.modules.map(module => `
            <article class="cait-module-chip">
              <b>${escapeHtml(module.slot)} // ${escapeHtml(module.name)}</b>
              <small>${escapeHtml(module.text)}</small>
            </article>
          `).join('')}
        </div>
      </div>
    `;
    showcase.querySelector('[data-start-hero]').onclick = () => {
      game.selectHero(hero);
      game.startRun(15, cardPool, enemyCatalogue);
    };
  };
  renderShowcase(initialHero);
  section.appendChild(showcase);

  const grid = el('div', 'hero-grid');
  for (const hero of heroes) {
    const card = el('button', 'hero-card');
    const avatarSrc = hero.portrait ?? hero.avatar;
    card.type = 'button';
    card.dataset.heroId = hero.id;
    card.style.setProperty('--hero-color', hero.color);
    card.style.setProperty('--hero-glow', `${hero.color}55`);
    if (hero.id === initialHero.id) card.classList.add('selected');
    card.innerHTML = `
      <img class="hero-portrait" src="${avatarSrc}" alt="${hero.name}" />
      <div class="hero-card-copy">
        <div class="hero-name">${hero.name}</div>
        <div class="hero-title-text">${hero.title}</div>
        <div class="hero-passive"><strong>${getCaitLoadout(hero.id).bondName}</strong><br/>${getCaitLoadout(hero.id).role}</div>
        <div class="hero-hp">${hero.maxHp} HP · Cait ${CAIT_IDOL.maxHp} HP</div>
      </div>
    `;
    const previewHero = () => {
      selectedHero = hero;
      setHeroSelectTheme(hero);
      renderShowcase(hero);
      grid.querySelectorAll('.hero-card').forEach(candidate => {
        candidate.classList.toggle('selected', candidate === card);
      });
    };
    card.onmouseenter = previewHero;
    card.onfocus = previewHero;
    card.onclick = () => {
      selectedHero = hero;
      previewHero();
    };
    grid.appendChild(card);
  }
  section.appendChild(grid);
  root.appendChild(section);
}

// ──────────────────────────────────────────────────────────
// Map
// ──────────────────────────────────────────────────────────

function renderMap() {
  const snap = game.getSnapshot();
  const state = game.state;
  const cait = state.cait ?? (state.hero ? buildCaitCompanion(state.hero.id) : null);
  const currentNode = game.floors.getCurrentNode();

  const section = el('section', 'map-screen');
  section.innerHTML = `
    <div class="map-title">Floor ${snap.floor} of ${snap.maxFloor} · ${snap.gold} Gold</div>
    <div class="run-stats">
      <div class="run-stat"><div class="run-stat-value">${snap.hp}/${snap.maxHp}</div><div class="run-stat-label">HP</div></div>
      <div class="run-stat"><div class="run-stat-value">${cait ? `${cait.hp}/${cait.maxHp}` : '--'}</div><div class="run-stat-label">Cait</div></div>
      <div class="run-stat"><div class="run-stat-value">${state.deck.length}</div><div class="run-stat-label">Deck</div></div>
      <div class="run-stat"><div class="run-stat-value">${snap.floor - 1}</div><div class="run-stat-label">Cleared</div></div>
      <div class="run-stat"><div class="run-stat-value">${snap.gold}</div><div class="run-stat-label">Gold</div></div>
    </div>
    <div class="map-nodes"></div>
  `;

  const nodes = section.querySelector('.map-nodes');
  for (const node of game.floors.map ?? []) {
    const isCurrent = node.floor === snap.floor;
    const isCompleted = node.floor < snap.floor;
    const info = nodeLabel(node.type);
    const btn = el('button', `map-node ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''}`);
    btn.type = 'button';
    btn.innerHTML = `
      <div class="map-node-icon">${info.icon}</div>
      <div class="map-node-label">Floor ${node.floor}</div>
      <div class="map-node-type">${info.label}</div>
    `;
    btn.disabled = !isCurrent || isCompleted;
    if (isCurrent && !isCompleted) btn.onclick = () => handleMapNode(node);
    nodes.appendChild(btn);
  }

  if (currentNode) {
    const actions = el('div');
    actions.style.cssText = 'margin-top:var(--space-lg);display:flex;gap:var(--space-md);flex-wrap:wrap;justify-content:center';
    if (['combat', 'elite', 'boss'].includes(currentNode.type)) {
      actions.appendChild(btn('Enter Encounter', 'btn btn-primary', () => game.enterFloor(enemyCatalogue, cardPool)));
    } else if (currentNode.type === 'rest') {
      actions.appendChild(btn('Rest (+30% HP)', 'btn', () => game.floors.rest()));
      actions.appendChild(btn('Push Forward', 'btn btn-primary', () => game.advanceFloor()));
    } else if (currentNode.type === 'shop') {
      actions.appendChild(btn('Buy Random Card', 'btn', () => buyShopCard()));
      actions.appendChild(btn('Skip Shop', 'btn btn-primary', () => game.advanceFloor()));
    }
    section.appendChild(actions);
  }
  appendSystemMenuButton(section, true);
  root.appendChild(section);
  appendSystemMenuOverlay(section, true);
}

function handleMapNode(node) {
  if (['combat', 'elite', 'boss'].includes(node.type)) game.enterFloor(enemyCatalogue, cardPool);
  else if (node.type === 'rest') game.floors.rest();
  else game.advanceFloor();
}

function buyShopCard() {
  const s = game.state;
  const pool = (s.cardPool ?? []).filter(c => c.rarity === 'common' || c.rarity === 'uncommon');
  if (!pool.length) { emitToast('Shop empty!', 'danger'); game.advanceFloor(); return; }
  const card = pool[Math.floor(Math.random() * pool.length)];
  s.deck.push({ ...card, instanceId: `shop_${card.id}_${Date.now()}` });
  emitToast(`Bought ${card.emoji} ${card.name}`, 'info');
  game.advanceFloor();
}

// ──────────────────────────────────────────────────────────
// COMBAT — The big one
// ──────────────────────────────────────────────────────────

function renderCombat() {
  const snap = game.getSnapshot();
  const state = game.state;
  const hero = hydrateHeroDisplay(state.hero);
  const cait = state.cait ?? (hero ? buildCaitCompanion(hero.id) : null);
  const theme = getHeroTheme(hero?.id);
  const heroBattlePortrait = hero?.battlePortrait ?? hero?.avatar ?? hero?.portrait ?? '';
  const ultReady = snap.ultCharge >= snap.ultMaxCharge;
  const selectedEnemyState = state.enemies[selectedTarget] ?? state.enemies[0];
  const selectedEnemy = hydrateEnemyDisplay(selectedEnemyState);
  const targetIntent = selectedEnemyState
    ? (selectedEnemyState.pattern?.[selectedEnemyState.patternIndex] ?? selectedEnemyState.intent ?? null)
    : null;
  const caitIntent = cait?.intent ?? {
    name: 'Royal Autoplay',
    description: 'Cait acts after you.',
  };

  const section = el('section', `combat-screen theme-${theme.id} shell-${theme.shell}`);
  section.style.setProperty('--hero-color', theme.accent ?? hero?.color ?? '#9933ff');
  section.style.setProperty('--hero-accent-2', theme.accent2 ?? '#00e5ff');
  section.style.setProperty('--hero-danger', theme.danger ?? '#ff3344');
  section.style.setProperty('--battlefield-bg', `url('${theme.background}')`);

  // ─── 1. TOP STATS BAR ───
  const topBar = el('div', 'combat-top-bar');
  topBar.style.setProperty('--hero-color', hero?.color ?? '#9933ff');
  topBar.innerHTML = `
    <div class="combat-top-hero-identity">
      <span class="combat-top-hero-name glitch-text" data-text="${hero?.name ?? 'HERO'}">${hero?.name ?? 'HERO'}</span>
      <span class="combat-top-hero-title">${hero?.title ?? ''}</span>
      <span class="combat-top-duo">CAIT DUO // ${cait?.bondName ?? theme.duo}</span>
    </div>
    
    <div class="combat-top-stats-group">
      <!-- HP Stat -->
      <div class="top-stat-item hp-stat">
        <span class="top-stat-icon">❤️</span>
        <div class="top-stat-bar-outer">
          <div class="top-stat-bar-fill ${hpClass(snap.hp, snap.maxHp)}" style="width:${pct(snap.hp, snap.maxHp)}%"></div>
        </div>
        <span class="top-stat-val">${snap.hp}/${snap.maxHp}</span>
      </div>
      <div class="top-stat-item cait-stat">
        <span class="top-stat-icon">👑</span>
        <div class="top-stat-bar-outer">
          <div class="top-stat-bar-fill cait" style="width:${cait ? pct(cait.hp, cait.maxHp) : 0}%"></div>
        </div>
        <span class="top-stat-val">Cait ${cait ? `${cait.hp}/${cait.maxHp}` : '--'}</span>
      </div>
      
      <!-- Block Stat -->
      <div class="top-stat-item block-stat ${snap.block > 0 ? 'has-block' : 'no-block'}">
        <span class="top-stat-icon">🛡️</span>
        <span class="top-stat-val">${snap.block} Block</span>
      </div>
      
      <!-- Energy Stat -->
      <div class="top-stat-item energy-stat">
        <span class="top-stat-icon">⚡</span>
        <span class="top-stat-val">${snap.energy}/${snap.maxEnergy} Energy</span>
      </div>
    </div>
    
    <div class="combat-top-run-info">
      <span class="top-run-val">💰 ${snap.gold} Gold</span>
      <span class="top-run-divider">|</span>
      <span class="top-run-val">Floor ${snap.floor}/${snap.maxFloor}</span>
    </div>
  `;
  section.appendChild(topBar);

  // ─── 2. MIDDLE BATTLEFIELD ───
  const battlefield = el('div', 'combat-battlefield');
  battlefield.style.setProperty('--battlefield-bg', `url('${theme.background}')`);
  
  // High-fidelity low-opacity terminal background diagnostic logs
  const matrixBg = el('div', 'battlefield-matrix-bg');
  const terminalLogs = [
    `SYS_CORE_INIT // RESOLVED`,
    `STACK_POINTER // PTR: 0x7FFA8F`,
    `MEMORY_LIMIT // CAP: 2048MB`,
    `REF_COUNT_GC // ACTIVE`,
    `VITE_COMPILER_V8 // RUNNING`,
    `HEAP_POOL_ALLOC // 142KB`,
    `DAEMON_THREAD // ACTIVE`,
    `DEBUG_LEVEL_LOG // VERBOSE`,
    `ERR_TRACE // EXITED_CODE_0`,
    `CACHE_SECTOR // SYNCED`,
    `PORT_LISTENER_8080 // OK`,
    `STACK_FRAME_COUNT // CLN`
  ];
  matrixBg.innerHTML = terminalLogs.map(log => `<div>&gt; ${log}</div>`).join('');
  battlefield.appendChild(matrixBg);

  // Neon territorial divider between hero and enemy columns
  const divider = el('div', 'battlefield-divider');
  battlefield.appendChild(divider);
  
  // Left Side: Hero Sprite Platform
  const heroSpriteContainer = el('div', 'hero-sprite-container');
  heroSpriteContainer.style.setProperty('--hero-color', hero?.color ?? '#9933ff');
  heroSpriteContainer.innerHTML = `
    <div class="hero-sprite-platform">
      <div class="hero-sprite-glow"></div>
      <div class="hero-sprite-matrix">
        <div class="holo-sprite-avatar">
          <img class="holo-avatar-image" src="${heroBattlePortrait}" alt="${hero?.name ?? ''}" />
          <div class="holo-glitch-overlay"></div>
        </div>
      </div>
      <div class="hero-sprite-tag" style="background-color: rgba(0,0,0,0.6); border-color: ${hero?.color}">
        <span class="hero-tag-indicator" style="background-color: ${hero?.color ?? 'var(--neon-purple)'}"></span>
        ${hero?.name?.toUpperCase() ?? 'SYS'} : READY
      </div>
      <div class="assistant-motto">${theme.motto}</div>
      <div class="hero-sprite-stats">
        ${snap.block > 0 ? `<div class="hero-battle-block">🛡️ ${snap.block}</div>` : ''}
      </div>
    </div>
  `;
  battlefield.appendChild(heroSpriteContainer);

  const caitCodecWindow = el('div', 'cait-codec-window');
  caitCodecWindow.innerHTML = `
    <div class="cait-codec-top">
      <span>CAIT_CODEC://PEON_QUEEN</span>
      <button class="cait-codec-center" type="button" aria-label="Center Cait codec window">CENTER</button>
    </div>
    <div class="cait-codec-body">
      <img class="cait-codec-image" src="${cait?.battlePortrait ?? CAIT_IDOL.battlePortrait}" alt="Cait companion" />
      <div class="cait-codec-copy">
        <span>CAIT AUTOPLAY</span>
        <strong>${escapeHtml(caitIntent.name)}</strong>
        <p>${escapeHtml(caitIntent.description)}</p>
        <small>${escapeHtml(cait?.bondName ?? theme.duo)} // ${cait ? `${cait.hp}/${cait.maxHp} HP` : 'SYNCING'}</small>
      </div>
    </div>
  `;
  applyCaitCodecOffset(caitCodecWindow);
  battlefield.appendChild(caitCodecWindow);

  // Right Side: Enemy Area
  const enemyArea = el('div', 'combat-enemy-area');
  const arenaHeader = el('div', 'arena-header');
  arenaHeader.innerHTML = `
    <span class="arena-cait">CAIT BROADCAST ONLINE</span>
    <span class="arena-theme">${theme.label}</span>
  `;
  battlefield.appendChild(arenaHeader);
  for (const [i, rawEnemy] of state.enemies.entries()) {
    const enemy = hydrateEnemyDisplay(rawEnemy);
    const intent = enemy.pattern?.[enemy.patternIndex] ?? { type: 'none', description: '...' };
    const nextIntent = enemy.pattern?.[(enemy.patternIndex + 1) % Math.max(1, enemy.pattern.length)];
    const isSelected = selectedTarget === i;
    const enemySprite = enemy.sprite ?? '';

    const slot = el('div', `enemy-slot type-${enemy.tier || enemy.type || 'normal'} enemy-${enemy.id}`);
    slot.innerHTML = `
      <div class="enemy-intent ${intent.type}">
        ${intentIcon(intent.type)} ${intentLabel(intent)}
        ${hero?.id === 'xadnib' && nextIntent ? `<span class="intent-next">→ ${intentLabel(nextIntent)}</span>` : ''}
      </div>
      <div class="enemy-body ${isSelected ? 'targeted' : ''}" data-enemy="${i}">
        ${enemy.block > 0 ? `<div class="enemy-block-badge">${enemy.block}</div>` : ''}
        ${enemySprite ? `<img class="enemy-sprite" src="${enemySprite}" alt="${enemy.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />` : ''}
        <div class="enemy-emoji ${enemySprite ? 'enemy-emoji-fallback' : ''}">${enemy.emoji ?? '👾'}</div>
        <div class="enemy-name">${enemy.name}</div>
        <div class="enemy-hp-bar"><div class="enemy-hp-fill" style="width:${pct(enemy.hp, enemy.maxHp)}%"></div></div>
        <div class="enemy-hp-text">${enemy.hp} / ${enemy.maxHp}</div>
      </div>
    `;
    slot.querySelector('.enemy-body').onclick = () => { selectedTarget = i; render(); };
    enemyArea.appendChild(slot);
  }
  battlefield.appendChild(enemyArea);
  section.appendChild(battlefield);

  // ─── 3. BOTTOM PANEL (DASHBOARD CONSOLE) ───
  const bottomDashboard = el('div', 'combat-bottom-dashboard');
  
  // Bottom Left: Hero Portrait Console
  const heroPortraitConsole = el('div', 'hero-portrait-console');
  heroPortraitConsole.style.setProperty('--hero-color', hero?.color ?? '#9933ff');
  heroPortraitConsole.innerHTML = `
    <div class="console-hero-console">
      <div class="console-hero-header">
        <div class="console-hero-name">CAIT + ${hero?.name ?? 'ASSISTANT'}</div>
        <div class="console-hero-passive-label">DUO: ${cait?.bondName ?? theme.duo} // PASSIVE: ${hero?.passive?.name ?? ''}</div>
      </div>
      <div class="console-hero-metrics">
        <div class="console-metric">
          <span class="metric-label">HP</span>
          <span class="metric-value">${snap.hp} / ${snap.maxHp}</span>
          <div class="console-mini-bar">
            <div class="console-mini-fill hp" style="width:${pct(snap.hp, snap.maxHp)}%"></div>
          </div>
        </div>
        <div class="console-metric">
          <span class="metric-label">BLOCK</span>
          <span class="metric-value">${snap.block}</span>
          <div class="console-mini-bar">
            <div class="console-mini-fill block" style="width:${Math.min(100, Math.max(0, snap.block * 4))}%"></div>
          </div>
        </div>
        <div class="console-metric">
          <span class="metric-label">ENERGY</span>
          <span class="metric-value">${snap.energy} / ${snap.maxEnergy}</span>
          <div class="console-mini-bar">
            <div class="console-mini-fill energy" style="width:${pct(snap.energy, snap.maxEnergy)}%"></div>
          </div>
        </div>
        <div class="console-metric">
          <span class="metric-label">ULT</span>
          <span class="metric-value">${snap.ultCharge} / ${snap.ultMaxCharge}</span>
          <div class="console-mini-bar">
            <div class="console-mini-fill ult ${ultReady ? 'ult-ready' : ''}" style="width:${pct(snap.ultCharge, snap.ultMaxCharge)}%"></div>
          </div>
        </div>
      </div>
      <div class="console-target-readout">
        <span class="target-label">${selectedEnemy ? `${selectedEnemy.name}` : 'NO TARGET'}</span>
        <span class="target-intent">${selectedEnemy ? `${intentIcon(targetIntent?.type)} ${intentLabel(targetIntent)}` : 'Awaiting target'}</span>
        <div class="console-target-stats">
          <span>HP ${selectedEnemy ? selectedEnemy.hp : 0}/${selectedEnemy ? selectedEnemy.maxHp : 0}</span>
          <span>🛡 ${selectedEnemy ? selectedEnemy.block : 0}</span>
        </div>
      </div>
      <div class="console-cait-module-readout">
        ${(cait?.modules ?? []).slice(0, 3).map(module => `
          <span><b>${escapeHtml(module.slot)}</b>${escapeHtml(module.name)}</span>
        `).join('')}
      </div>
      
      <!-- Ultimate Control inside Portrait Console -->
      <div class="console-ult-control">
        <button class="ult-btn ${ultReady ? 'ult-btn-ready' : ''}" ${ultReady ? '' : 'disabled'}>
          ${hero?.ultimate?.emoji ?? '💥'} ${hero?.ultimate?.name ?? 'Ultimate'}
        </button>
        <div class="console-ult-bar-outer">
          <div class="console-ult-bar-fill ${ultReady ? 'ult-ready' : ''}" style="width:${pct(snap.ultCharge, snap.ultMaxCharge)}%"></div>
        </div>
        <div class="console-ult-desc" title="${hero?.ultimate?.description ?? ''}">${hero?.ultimate?.description ?? ''}</div>
      </div>
    </div>
  `;
  bottomDashboard.appendChild(heroPortraitConsole);

  // Bottom Center: Hand Area
  const handConsole = el('div', 'combat-hand-console');
  handConsole.innerHTML = `
    <div class="combat-hand-console-header">
      <span>// CARD CONSOLE</span>
      <span>${snap.handSize} / 10 INSTALLED</span>
    </div>
  `;
  const handArea = el('div', 'combat-hand-area');
  for (const [i, card] of state.hand.entries()) {
    const cost = game.combat.getCardCost(card);
    const canPlay = cost <= state.energy && state.hp > 0;
    handArea.appendChild(renderCard(card, i, canPlay));
  }
  handConsole.appendChild(handArea);
  bottomDashboard.appendChild(handConsole);

  // Bottom Right: Deck & Control Console
  const deckControlConsole = el('div', 'deck-control-console');
  deckControlConsole.innerHTML = `
    <div class="deck-control-header">
      <span class="deck-control-title">// DECK / TURN CONTROL</span>
      <span class="deck-control-sub">FLOOR ${snap.floor}/${snap.maxFloor}</span>
    </div>
    <div class="deck-control-metrics">
      <div class="deck-metric">
        <span class="deck-metric-label">HAND</span>
        <span class="deck-metric-value">${snap.handSize}</span>
      </div>
      <div class="deck-metric">
        <span class="deck-metric-label">STACK</span>
        <span class="deck-metric-value">${snap.drawPileCount}</span>
      </div>
      <div class="deck-metric">
        <span class="deck-metric-label">ENEMIES</span>
        <span class="deck-metric-value">${state.enemies.length}</span>
      </div>
    </div>
    <div class="deck-piles-grid">
      <div class="deck-pile-badge draw-pile" title="Draw Pile (STACK)">
        <span class="pile-icon">📥</span>
        <span class="pile-count">${snap.drawPileCount}</span>
        <span class="pile-label">STACK</span>
      </div>
      <div class="deck-pile-badge discard-pile" title="Discard Pile (HEAP)">
        <span class="pile-icon">📤</span>
        <span class="pile-count">${snap.discardPileCount}</span>
        <span class="pile-label">HEAP</span>
      </div>
      <div class="deck-pile-badge exhaust-pile" title="Exhaust Pile (VOID)">
        <span class="pile-icon">🗑️</span>
        <span class="pile-count">${snap.exhaustPileCount}</span>
        <span class="pile-label">VOID</span>
      </div>
    </div>
    <button class="btn btn-end-turn" id="end-turn-btn" ${state.hp <= 0 ? 'disabled' : ''}>
      END TURN
      <span class="btn-subtext">// COMPILE STACK</span>
    </button>
  `;
  bottomDashboard.appendChild(deckControlConsole);
  section.appendChild(bottomDashboard);
  appendSystemMenuButton(section, true);

  root.appendChild(section);
  appendSystemMenuOverlay(section, true);
  wireCaitCodecDrag(caitCodecWindow);
  const caitCodecCenter = caitCodecWindow.querySelector('.cait-codec-center');
  if (caitCodecCenter) {
    caitCodecCenter.onclick = () => {
      caitCodecOffset = { x: 0, y: 0 };
      applyCaitCodecOffset(caitCodecWindow);
    };
  }

  // Wire event handlers asynchronously to ensure DOM availability
  setTimeout(() => {
    const ultBtn = section.querySelector('.ult-btn');
    if (ultBtn && ultReady) {
      ultBtn.onclick = () => {
        game.useUltimate();
        root.classList.add('screen-shake-big');
        setTimeout(() => root.classList.remove('screen-shake-big'), 500);
      };
    }

    const endTurnBtn = section.querySelector('#end-turn-btn');
    if (endTurnBtn) {
      endTurnBtn.onclick = () => {
        if (state.hp <= 0) return;
        game.combat.endPlayerTurn();
      };
    }
  }, 0);
}

function renderCard(card, index, canPlay) {
  const cost = game.combat.getCardCost(card);
  const cardEl = el('button', `game-card ${canPlay ? '' : 'unplayable'}`);
  cardEl.type = 'button';
  cardEl.dataset.rarity = card.rarity ?? 'common';
  cardEl.dataset.type = card.type ?? 'skill';
  cardEl.disabled = !canPlay;

  let typeLabel = card.type ?? 'skill';
  if (card.rarity === 'debt' || card.tags?.includes('curse')) {
    typeLabel = 'bug';
  }

  cardEl.innerHTML = `
    <div class="card-header">
      <div class="card-cost">${cost}</div>
      <div class="card-name">${card.name ?? '?'}</div>
    </div>
    <div class="card-illustration">
      <img class="card-art" src="/assets/cards/cardicon_${card.id}.png" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" alt="" />
      <div class="card-emoji" style="display:none">${card.emoji ?? '🧪'}</div>
    </div>
    <div class="card-description">${card.description ?? ''}</div>
    <div class="card-footer">// ${typeLabel.toUpperCase()}</div>
  `;
  cardEl.onclick = () => {
    if (!canPlay) return;
    cardEl.classList.add('playing');
    setTimeout(() => game.combat.playCard(index, selectedTarget ?? 0), 150);
  };
  return cardEl;
}

// ──────────────────────────────────────────────────────────
// Draft
// ──────────────────────────────────────────────────────────

function renderDraft() {
  const snap = game.getSnapshot();
  const draft = game.draft;
  const section = el('section', 'draft-screen');

  if (draft.draftType === 'choice') {
    section.innerHTML = `
      <div class="draft-title glitch-text" data-text="REFACTORING TERMINAL">REFACTORING TERMINAL</div>
      <div class="text-small" style="color:var(--text-secondary); margin-bottom: 20px;">Initialize a codebase refactoring directive to fix technical debt.</div>
      <div class="terminal-options">
        <button class="terminal-opt-btn btn-deprecate" data-mode="deprecate">
          <span class="terminal-opt-code">[01]</span>
          <span class="terminal-opt-name">DEPRECATE LINE</span>
          <span class="terminal-opt-desc">Remove a card permanently from your stack.</span>
        </button>
        <button class="terminal-opt-btn btn-refactor" data-mode="refactor">
          <span class="terminal-opt-code">[02]</span>
          <span class="terminal-opt-name">REFACTOR FUNCTION</span>
          <span class="terminal-opt-desc">Upgrade a card in your stack to higher performance.</span>
        </button>
        <button class="terminal-opt-btn btn-compile" data-mode="compile">
          <span class="terminal-opt-code">[03]</span>
          <span class="terminal-opt-name">COMPILE FEATURE</span>
          <span class="terminal-opt-desc">Draft a new advanced library feature card.</span>
        </button>
      </div>
      <button class="btn" id="skip-draft" style="margin-top: 20px;">Skip Refactoring</button>
    `;

    setTimeout(() => {
      section.querySelectorAll('.terminal-opt-btn').forEach(btn => {
        btn.onclick = () => {
          draft.chooseMode(btn.dataset.mode);
          render();
        };
      });
      section.querySelector('#skip-draft').onclick = () => {
        draft.skip();
        render();
      };
    }, 0);

  } else if (draft.draftType === 'deprecate_select') {
    section.innerHTML = `
      <div class="draft-title glitch-text" data-text="DEPRECATE: SELECT SOURCE LINE">DEPRECATE: SELECT SOURCE LINE</div>
      <div class="text-small" style="color:var(--text-secondary); margin-bottom: 20px;">Click a card in your deck to permanently wipe it from the codebase.</div>
      <div class="deck-select-grid"></div>
      <button class="btn" id="cancel-refactor" style="margin-top: 20px;">Cancel</button>
    `;

    setTimeout(() => {
      const grid = section.querySelector('.deck-select-grid');
      for (const card of game.state.deck) {
        const cardEl = renderCard(card, 0, true);
        cardEl.onclick = (e) => {
          e.stopPropagation();
          draft.deprecateCard(card.instanceId);
          render();
        };
        grid.appendChild(cardEl);
      }
      section.querySelector('#cancel-refactor').onclick = () => {
        draft.generateDraft(game.state.cardPool);
        render();
      };
    }, 0);

  } else if (draft.draftType === 'refactor_select') {
    section.innerHTML = `
      <div class="draft-title glitch-text" data-text="REFACTOR: UPGRADE DEPENDENCY">REFACTOR: UPGRADE DEPENDENCY</div>
      <div class="text-small" style="color:var(--text-secondary); margin-bottom: 20px;">Click a card in your deck to optimize its performance stats (damage/block values ++).</div>
      <div class="deck-select-grid"></div>
      <button class="btn" id="cancel-refactor" style="margin-top: 20px;">Cancel</button>
    `;

    setTimeout(() => {
      const grid = section.querySelector('.deck-select-grid');
      for (const card of game.state.deck) {
        const cardEl = renderCard(card, 0, true);
        cardEl.onclick = (e) => {
          e.stopPropagation();
          draft.refactorCard(card.instanceId);
          render();
        };
        grid.appendChild(cardEl);
      }
      section.querySelector('#cancel-refactor').onclick = () => {
        draft.generateDraft(game.state.cardPool);
        render();
      };
    }, 0);

  } else if (draft.draftType === 'compile_select') {
    section.innerHTML = `
      <div class="draft-title glitch-text" data-text="COMPILE FEATURE: SELECT FEATURE">COMPILE FEATURE: SELECT FEATURE</div>
      <div class="text-small" style="color:var(--text-secondary); margin-bottom: 20px;">Select a new library feature to add to your stack.</div>
      <div class="draft-cards"></div>
      <button class="btn" id="cancel-refactor" style="margin-top: 20px;">Cancel</button>
    `;

    setTimeout(() => {
      const list = section.querySelector('.draft-cards');
      for (const [i, card] of draft.offeredCards.entries()) {
        const wrap = el('div', 'draft-card-wrapper');
        const cardEl = renderCard(card, i, true);
        cardEl.onclick = (e) => {
          e.stopPropagation();
          draft.pickCard(i);
          render();
        };
        wrap.appendChild(cardEl);
        list.appendChild(wrap);
      }
      section.querySelector('#cancel-refactor').onclick = () => {
        draft.generateDraft(game.state.cardPool);
        render();
      };
    }, 0);
  }

  appendSystemMenuButton(section, true);
  root.appendChild(section);
  appendSystemMenuOverlay(section, true);
}

// ──────────────────────────────────────────────────────────
// End States
// ──────────────────────────────────────────────────────────

function renderGameOver() {
  const snap = game.getSnapshot();
  const section = el('section', 'gameover-screen');
  section.innerHTML = `
    <div class="gameover-title glitch-text" data-text="Stack Overflow">Stack Overflow</div>
    <div class="text-subheading">Your process has been killed.</div>
    <div class="run-stats">
      <div class="run-stat"><div class="run-stat-value">${snap.floor}</div><div class="run-stat-label">Floor Reached</div></div>
      <div class="run-stat"><div class="run-stat-value">${snap.gold}</div><div class="run-stat-label">Gold</div></div>
      <div class="run-stat"><div class="run-stat-value">${game.state.deck.length}</div><div class="run-stat-label">Deck Size</div></div>
      <div class="run-stat"><div class="run-stat-value">${Object.keys(snap.cardPlayCounts).length}</div><div class="run-stat-label">Unique Cards</div></div>
    </div>
    <button class="btn btn-primary" id="reset-btn">Try Again</button>
  `;
  section.querySelector('#reset-btn').onclick = () => game.reset();
  root.appendChild(section);
}

function renderVictory() {
  const snap = game.getSnapshot();
  const section = el('section', 'victory-screen');
  section.innerHTML = `
    <div class="victory-title glitch-text" data-text="Stack Phyxed">Stack Phyxed</div>
    <div class="text-subheading">Process exited with code 0. Clean run.</div>
    <div class="run-stats">
      <div class="run-stat"><div class="run-stat-value">${snap.floor}</div><div class="run-stat-label">Floors Cleared</div></div>
      <div class="run-stat"><div class="run-stat-value">${snap.gold}</div><div class="run-stat-label">Gold</div></div>
      <div class="run-stat"><div class="run-stat-value">${game.state.deck.length}</div><div class="run-stat-label">Final Deck</div></div>
      <div class="run-stat"><div class="run-stat-value">${snap.hero?.name ?? '?'}</div><div class="run-stat-label">Hero</div></div>
    </div>
    <button class="btn btn-primary" id="reset-btn">Main Menu</button>
  `;
  section.querySelector('#reset-btn').onclick = () => game.reset();
  root.appendChild(section);
}

// ──────────────────────────────────────────────────────────
// Save States
// ──────────────────────────────────────────────────────────

function renderSaveStatesPanel({ canSave = true, compact = false } = {}) {
  const saves = readSaveSlots();
  const rows = saves.map((save, index) => {
    const slot = index + 1;
    const hasSave = Boolean(save);
    const label = hasSave ? save.label : 'Empty Slot';
    const savedAt = hasSave ? formatSaveTime(save.savedAt) : 'No save data';
    return `
      <div class="save-slot ${hasSave ? 'has-save' : 'empty'}">
        <div class="save-slot-meta">
          <span class="save-slot-title">STATE ${slot}</span>
          <span class="save-slot-label">${escapeHtml(label)}</span>
          <span class="save-slot-time">${savedAt}</span>
        </div>
        <div class="save-slot-actions">
          ${canSave ? `<button class="btn save-btn" data-save-slot="${index}">Save</button>` : ''}
          <button class="btn load-btn" data-load-slot="${index}" ${hasSave ? '' : 'disabled'}>Load</button>
          <button class="btn delete-save-btn" data-delete-slot="${index}" ${hasSave ? '' : 'disabled'}>Delete</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="save-state-panel ${compact ? 'compact' : ''}">
      <div class="save-state-header">
        <span>// SAVE STATES</span>
        <span>LOCAL CACHE</span>
      </div>
      <div class="save-state-slots">${rows}</div>
    </div>
  `;
}

function appendSystemMenuButton(section, canSave = true) {
  const button = el('button', 'system-menu-button');
  button.type = 'button';
  button.innerHTML = '<span>MENU</span><strong>Save</strong>';
  button.onclick = () => openSystemMenu(canSave);
  section.appendChild(button);
}

function appendSystemMenuOverlay(section, canSave = true) {
  if (!systemMenuOpen) return;
  section.insertAdjacentHTML('beforeend', `
    <div class="system-menu-overlay" role="dialog" aria-modal="true" aria-label="Save states menu">
      <div class="system-menu-backdrop" data-close-system-menu></div>
      <div class="system-menu-panel">
        <div class="system-menu-header">
          <span>// SYSTEM MENU</span>
          <button class="system-menu-close" data-close-system-menu aria-label="Close menu">x</button>
        </div>
        ${renderSaveStatesPanel({ canSave })}
      </div>
    </div>
  `);
  section.querySelectorAll('[data-close-system-menu]').forEach(button => {
    button.onclick = () => closeSystemMenu();
  });
  wireSaveStateControls(section);
}

function openSystemMenu(canSave = true) {
  systemMenuOpen = true;
  render();
}

function closeSystemMenu() {
  systemMenuOpen = false;
  render();
}

function wireSaveStateControls(scope) {
  scope.querySelectorAll('[data-save-slot]').forEach(button => {
    button.onclick = () => saveSlot(Number(button.dataset.saveSlot));
  });

  scope.querySelectorAll('[data-load-slot]').forEach(button => {
    button.onclick = () => loadSlot(Number(button.dataset.loadSlot));
  });

  scope.querySelectorAll('[data-delete-slot]').forEach(button => {
    button.onclick = () => deleteSlot(Number(button.dataset.deleteSlot));
  });
}

function readSaveSlots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_STORAGE_KEY) ?? '[]');
    return Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => parsed[i] ?? null);
  } catch {
    return Array.from({ length: SAVE_SLOT_COUNT }, () => null);
  }
}

function writeSaveSlots(slots) {
  localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(slots.slice(0, SAVE_SLOT_COUNT)));
}

function saveSlot(index) {
  if (!Number.isInteger(index) || index < 0 || index >= SAVE_SLOT_COUNT) return;
  const slots = readSaveSlots();
  const saveState = game.createSaveState(buildSaveLabel());
  slots[index] = saveState;
  writeSaveSlots(slots);
  emitToast(`Saved State ${index + 1}`, 'passive');
  render();
}

function loadSlot(index) {
  const saveState = readSaveSlots()[index];
  if (!saveState) return;
  const restored = game.restoreSaveState(saveState);
  if (!restored) {
    emitToast('Save state is incompatible.', 'danger');
    return;
  }
  activeDraft = game.draft.offeredCards ?? [];
  selectedTarget = 0;
  systemMenuOpen = false;
  emitToast(`Loaded State ${index + 1}`, 'info');
  render();
}

function deleteSlot(index) {
  const slots = readSaveSlots();
  if (!slots[index]) return;
  slots[index] = null;
  writeSaveSlots(slots);
  emitToast(`Deleted State ${index + 1}`, 'danger');
  render();
}

function buildSaveLabel() {
  const snap = game.getSnapshot();
  const heroName = snap.hero?.name ?? 'No Hero';
  const phase = String(snap.phase ?? 'title').toUpperCase();
  return `${heroName} · Floor ${snap.floor}/${snap.maxFloor} · ${phase}`;
}

function formatSaveTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ──────────────────────────────────────────────────────────
// Damage & Toast FX
// ──────────────────────────────────────────────────────────

function onDamageEvent(event) {
  const isPlayer = event.target === 'player';
  const value = Math.round(event.amount ?? 0);
  if (value <= 0) return;
  let x = window.innerWidth / 2, y = window.innerHeight / 2;

  if (isPlayer) {
    const hp = root.querySelector('.console-portrait-image') || root.querySelector('.holo-sprite-avatar');
    if (hp) { const r = hp.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  } else {
    const en = root.querySelector(`[data-enemy-id="${event.targetId}"], [data-enemy="${event.targetId}"]`);
    if (en) { const r = en.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
  }

  const num = el('div', `damage-number ${isPlayer ? 'damage' : 'damage'} ${value >= 15 ? 'big' : ''}`);
  num.textContent = `-${value}`;
  num.style.left = `${x}px`;
  num.style.top = `${y}px`;
  damageLayer.appendChild(num);
  setTimeout(() => num.remove(), 1100);
}

function emitToast(text, type = 'info') {
  const t = el('div', `toast ${type}`);
  t.textContent = text;
  toastLayer.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function el(tag, className = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function btn(label, className, onClick) {
  const b = el('button', className);
  b.type = 'button';
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pct(cur, max) { return Math.max(1, Math.min(100, (cur / Math.max(1, max)) * 100)); }

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hpClass(cur, max) {
  const r = cur / Math.max(1, max);
  if (r <= 0.35) return 'critical';
  if (r <= 0.7) return 'hurt';
  return 'healthy';
}

function intentIcon(type) {
  switch (type) {
    case 'attack': return '⚔️';
    case 'block': return '🛡️';
    case 'buff': return '💪';
    case 'debuff': return '💀';
    case 'summon': return '📦';
    case 'heal': return '💚';
    default: return '❓';
  }
}

function intentLabel(intent) {
  if (!intent) return '...';
  if (intent.description) return intent.description;
  switch (intent.type) {
    case 'attack': return `Attack ${intent.value}`;
    case 'block': return `Block +${intent.value}`;
    case 'buff': return `Buff +${intent.value ?? 0}`;
    case 'debuff': return `Debuff${intent.value ? ` -${intent.value}` : ''}`;
    case 'summon': return 'Summon';
    default: return intent.type;
  }
}

function nodeLabel(type) {
  const map = { combat: { label: 'Combat', icon: '⚔️' }, elite: { label: 'Elite', icon: '🩸' }, boss: { label: 'BOSS', icon: '👑' }, rest: { label: 'Rest', icon: '🛌' }, shop: { label: 'Shop', icon: '🛒' } };
  return map[type] ?? { label: 'Unknown', icon: '?' };
}

function buildEnemyCatalogue() {
  const normalIds = new Set([...ENCOUNTERS.easy.flat(), ...ENCOUNTERS.medium.flat(), ...ENCOUNTERS.hard.flat()]);
  const eliteIds = ['tech_debt', 'race_condition'];
  const bossIds = ['production_outage', 'legacy_codebase', 'the_product_manager'];
  return {
    normal: [...normalIds].map(id => ENEMIES[id]).filter(Boolean),
    elite: eliteIds.map(id => ENEMIES[id]).filter(Boolean),
    boss: bossIds.map(id => ENEMIES[id]).filter(Boolean),
  };
}

function hydrateHeroDisplay(hero) {
  if (!hero?.id) return hero;
  const canonical = HEROES[hero.id];
  return canonical ? { ...hero, ...canonical } : hero;
}

function hydrateEnemyDisplay(enemy) {
  if (!enemy) return enemy;
  const canonical = resolveEnemyTemplate(enemy);
  if (!canonical) return enemy;
  return {
    ...canonical,
    ...enemy,
    emoji: enemy.emoji ?? canonical.emoji,
    sprite: enemy.sprite ?? canonical.sprite,
    tier: enemy.tier ?? canonical.tier,
    flavor: enemy.flavor ?? canonical.flavor,
  };
}

function resolveEnemyTemplate(enemy) {
  const rawId = String(enemy.id ?? '').trim();
  const candidates = [
    rawId,
    rawId.replace(/_\d+_\d+$/, ''),
    rawId.replace(/_\d+$/, ''),
    String(enemy.name ?? '').trim().toLowerCase().replace(/\s+/g, '_'),
  ].filter(Boolean);

  for (const id of candidates) {
    if (ENEMIES[id]) return ENEMIES[id];
  }

  const normalizedName = String(enemy.name ?? '').trim().toLowerCase();
  return Object.values(ENEMIES).find(template => template.name?.toLowerCase() === normalizedName);
}

function renderGameToText() {
  const snap = game.getSnapshot();
  const state = game.state;
  const selectedCard = root.querySelector('.hero-card.selected');
  const selectedHeroId = selectedCard?.dataset?.heroId ?? state.hero?.id ?? 'asiphyx';
  const selectedHero = HEROES[selectedHeroId] ?? HEROES.asiphyx;
  const cait = state.cait ?? buildCaitCompanion(selectedHeroId);
  const payload = {
    mode: snap.phase,
    selectedHero: selectedHero ? {
      id: selectedHero.id,
      name: selectedHero.name,
      title: selectedHero.title,
    } : null,
    cait: {
      hp: cait.hp,
      maxHp: cait.maxHp,
      bondName: cait.bondName,
      reliability: cait.reliability,
      risk: cait.risk,
      modules: (cait.modules ?? []).map(module => `${module.slot}:${module.name}`),
      intent: cait.intent?.name ?? 'Royal Autoplay',
    },
    run: {
      floor: snap.floor,
      maxFloor: snap.maxFloor,
      hp: snap.hp,
      maxHp: snap.maxHp,
      energy: snap.energy,
      deckSize: snap.deckSize,
    },
    combat: {
      enemies: snap.enemies.map(enemy => ({
        id: enemy.id,
        name: enemy.name,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        intent: enemy.intent?.type ?? null,
      })),
      handSize: snap.handSize,
    },
    soundtrack: {
      enabled: introMusicEnabled,
      domain: currentMusicDomain,
      trackId: currentMusicTrack?.id ?? null,
      trackTitle: currentMusicTrack?.title ?? null,
      beat: Number(introBeatLevel.toFixed(3)),
      bass: Number(musicBassLevel.toFixed(3)),
      mid: Number(musicMidLevel.toFixed(3)),
      high: Number(musicHighLevel.toFixed(3)),
    },
    coordinateSystem: 'DOM UI, origin top-left, x right, y down',
  };
  return JSON.stringify(payload);
}

window.render_game_to_text = renderGameToText;
window.advanceTime = () => {
  render();
};
