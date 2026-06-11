import './index.css';
import { GameState } from './engine/GameState.js';
import { HEROES } from './data/heroes.js';
import { getHeroTheme } from './data/heroThemes.js';
import { CAIT_IDOL, buildCaitCompanion, getCaitLoadout } from './data/caitModules.js';
import { ENEMIES, ENCOUNTERS } from './data/enemies.js';
import { CARDS } from './data/cards.js';
import { SOUNDTRACK_TRACKS, tracksForDomain } from './data/soundtrack.js';
import bus from './engine/EventBus.js';

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
const TITLE_MODULE_SHAPES = ['dodeca', 'tri', 'astra', 'crown', 'spike', 'sigil'];
const AUDIO_MODULE_SPRITE = {
  src: '/assets/modules/cait-audio-modules-sheet.png',
  count: 5,
  indexByShape: { dodeca: 0, tri: 1, astra: 2, sigil: 2, crown: 3, spike: 4 },
};
const audioModuleSprite = typeof Image !== 'undefined' ? new Image() : null;
let audioModuleSpriteReady = false;
if (audioModuleSprite) {
  audioModuleSprite.onload = () => { audioModuleSpriteReady = true; };
  audioModuleSprite.src = AUDIO_MODULE_SPRITE.src;
}

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

// Music hotkeys: M toggles play/pause, Shift+< / Shift+> skip tracks.
window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const target = event.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if (!event.shiftKey && (event.key === 'm' || event.key === 'M')) {
    event.preventDefault();
    toggleIntroMusic();
  } else if (event.shiftKey && (event.key === '>' || event.key === '.')) {
    event.preventDefault();
    switchMusicTrack(1);
  } else if (event.shiftKey && (event.key === '<' || event.key === ',')) {
    event.preventDefault();
    switchMusicTrack(-1);
  }
});

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
    case 'heroSelect': renderHeroSelect(); break;
    case 'map': renderMap(); break;
    case 'combat': renderCombat(); break;
    case 'draft': renderDraft(); break;
    case 'gameOver': renderGameOver(); break;
    case 'victory': renderVictory(); break;
    default: renderTitle(); return;
  }

  // Attach persistent music controls for non-title phases
  appendMusicControlBar();
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
        ♥
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
  introAudio.preload = 'auto';
  applyMusicVolume();
  introAudio.addEventListener('ended', () => {
    if (introMusicEnabled) switchMusicTrack(1);
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
  updateMusicControlBar();
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
  const shouldSwitch = forceTrack || currentMusicTrack?.id !== nextTrack.id;
  if (introAudio && shouldSwitch) {
    loadTrack(nextTrack, { autoplay: introMusicEnabled && !introAudio.paused });
  } else {
    currentMusicTrack = nextTrack;
  }
  applyMusicVolume();
  applyMusicDomainFilter(domain);
  syncIntroMusicButtons(document);
}

function loadTrack(track, { autoplay = false } = {}) {
  currentMusicTrack = track;
  const audio = ensureIntroAudio();
  audio.src = track.src;
  audio.currentTime = 0;
  audio.load();
  applyMusicVolume();
  if (autoplay) {
    const playAttempt = audio.play();
    if (playAttempt?.catch) playAttempt.catch(() => {});
  }
  syncIntroMusicButtons(document);
}

function switchMusicTrack(direction) {
  const domainTracks = tracksForDomain(currentMusicDomain);
  const list = domainTracks.length ? domainTracks : SOUNDTRACK_TRACKS;
  const index = list.findIndex(track => track.id === currentMusicTrack?.id);
  const next = list[(index + direction + list.length) % list.length];
  loadTrack(next, { autoplay: introMusicEnabled });
  emitToast(`♪ ${next.title}`, 'info');
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

// ──────────────────────────────────────────────────────────
// Music Control Bar — persistent in-game audio controls
// ──────────────────────────────────────────────────────────

function getMusicVolume() {
  try { return parseFloat(localStorage.getItem('phyx-music-volume') ?? '0.75'); }
  catch { return 0.75; }
}

function setMusicVolume(value) {
  const clamped = Math.max(0, Math.min(1, value));
  try { localStorage.setItem('phyx-music-volume', String(clamped)); } catch {}
  applyMusicVolume();
  document.documentElement.style.setProperty('--music-volume', clamped.toFixed(3));
  return clamped;
}

// Domain gain lives in the WebAudio output node once the analyser chain exists;
// only multiply it into element volume when there is no WebAudio chain,
// otherwise the gain is applied twice.
function applyMusicVolume() {
  if (!introAudio) return;
  const domainGain = MUSIC_DOMAIN_FILTERS[currentMusicDomain]?.gain ?? 0.72;
  introAudio.volume = getMusicVolume() * (musicNodes ? 1 : domainGain);
}

let musicCtrlBar = null;

function appendMusicControlBar() {
  const old = root.querySelector('.music-control-bar');
  if (old) old.remove();

  const bar = el('div', 'music-control-bar');
  bar.dataset.musicActive = introMusicEnabled ? 'true' : 'false';

  const trackName = el('span', 'music-ctrl-track-name');
  bar.appendChild(trackName);

  const prevBtn = el('button', 'music-ctrl-btn music-ctrl-skip');
  prevBtn.type = 'button';
  prevBtn.textContent = '⏮';
  prevBtn.title = 'Previous track (Shift+<)';
  prevBtn.onclick = () => switchMusicTrack(-1);
  bar.appendChild(prevBtn);

  const toggleBtn = el('button', 'music-ctrl-btn music-ctrl-toggle');
  toggleBtn.type = 'button';
  toggleBtn.onclick = () => toggleIntroMusic();
  bar.appendChild(toggleBtn);

  const nextBtn = el('button', 'music-ctrl-btn music-ctrl-skip');
  nextBtn.type = 'button';
  nextBtn.textContent = '⏭';
  nextBtn.title = 'Next track (Shift+>)';
  nextBtn.onclick = () => switchMusicTrack(1);
  bar.appendChild(nextBtn);

  const vol = el('span', 'music-ctrl-volume-icon');
  const volVal = getMusicVolume();
  vol.textContent = volVal === 0 ? '🔇' : volVal < 0.4 ? '🔉' : '🔊';
  bar.appendChild(vol);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'music-ctrl-slider';
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.05;
  slider.value = volVal;
  slider.oninput = () => {
    const v = parseFloat(slider.value);
    setMusicVolume(v);
    vol.textContent = v === 0 ? '🔇' : v < 0.4 ? '🔉' : '🔊';
  };
  bar.appendChild(slider);

  root.appendChild(bar);
  musicCtrlBar = bar;
  updateMusicControlBar();
}

// In-place refresh so play/pause and track skips never trigger a full screen re-render.
function updateMusicControlBar() {
  if (!musicCtrlBar || !musicCtrlBar.isConnected) return;
  musicCtrlBar.dataset.musicActive = introMusicEnabled ? 'true' : 'false';
  const trackName = musicCtrlBar.querySelector('.music-ctrl-track-name');
  if (trackName) {
    trackName.replaceChildren(
      Object.assign(document.createElement('strong'), { textContent: '♪ ' }),
      document.createTextNode(introMusicEnabled ? (currentMusicTrack?.title ?? 'No Track') : 'Paused'),
    );
  }
  const toggleBtn = musicCtrlBar.querySelector('.music-ctrl-toggle');
  if (toggleBtn) {
    toggleBtn.classList.toggle('muted', !introMusicEnabled);
    toggleBtn.textContent = introMusicEnabled ? '❚❚' : '▶';
    toggleBtn.title = introMusicEnabled ? 'Pause music (M)' : 'Play music (M)';
  }
}

// Apply stored volume on init
const _initVolume = getMusicVolume();
setMusicVolume(_initVolume);

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
      const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
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
  drawTitleModuleArcNet(ctx, cx, cy, loopX * 0.62, loopY * 0.7, time, layer);
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
  const layers = layer === 'front' ? 14 : 8;
  const nodeList = [];
  const orbitScale = layer === 'front' ? 1.02 : 0.85;
  const drift = time * (layer === 'front' ? 0.00052 : -0.00028);

  for (let i = 0; i < layers; i += 1) {
    const shape = TITLE_MODULE_SHAPES[i % TITLE_MODULE_SHAPES.length];
    const shapeIndex = i + (layer === 'front' ? bands : 0);
    const t = (i / layers) * Math.PI * 2 + drift + shapeIndex * 0.17;
    const point = lemniscatePoint(cx, cy, loopX * orbitScale, loopY * orbitScale, t, 0);
    const sampleIndex = introFrequencyData ? Math.floor((i / layers) * introFrequencyData.length) : 0;
    const raw = introMusicEnabled && introFrequencyData ? introFrequencyData[sampleIndex] / 255 : 0;
    const bassBias = shapeIndex % 2 === 0 ? musicBassLevel : musicMidLevel;
    const highBias = shapeIndex % 3 === 0 ? musicHighLevel : 0;
    const oscillation = 0.12 + Math.sin(time * 0.0021 + shapeIndex * 0.34) * 0.04;
    const signal = Math.min(1, introMusicEnabled
      ? raw * 1.15 + introBeatLevel * 0.42 + bassBias * 0.2 + highBias * 0.2 + oscillation
      : oscillation);
    const foldDepth = Math.sin(t) * Math.cos(t);
    const visible = layer === 'front'
      ? (foldDepth < 0.08 || (i % 2 === 0))
      : (foldDepth > -0.08 || (i % 2 === 1));
    if (!visible) continue;

    const baseRadius = (layer === 'front' ? 16 : 11) + (signal * 24);
    const spin = time * (layer === 'front' ? 0.00135 : -0.0011) * (i % 2 ? 1 : -1)
      + shapeIndex * 0.17;
    const jitter = (signal * 11) + introBeatLevel * 14;
    const x = point.x + Math.cos(time * 0.0008 + i) * jitter * 0.28;
    const y = point.y + Math.sin(time * 0.0009 + i * 1.2) * jitter * 0.28;

    const intensity = layer === 'front' ? 0.25 + signal * 0.68 : 0.11 + signal * 0.34;
    drawTitleModuleGlyph(ctx, x, y, baseRadius * (0.74 + signal * 0.42), spin, signal, shape, layer, intensity);
    nodeList.push({ x, y, signal: Math.min(1, signal), shape });

    if (signal > 0.58 && layer === 'front') {
      drawTitleModulePulse(ctx, x, y, baseRadius * 1.7, signal, time, i);
    }
  }
  if (layer === 'front' && nodeList.length > 4) {
    for (let i = 0; i < nodeList.length; i += 1) {
      const current = nodeList[i];
      const next = nodeList[(i + 3) % nodeList.length];
      const pairSignal = (current.signal + next.signal) * 0.5;
      if (pairSignal < 0.56) continue;
      const orbit = 5 + pairSignal * 14;
      const stroke = pairSignal * 0.22 + 0.04;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 + pairSignal * 0.24})`;
      ctx.lineWidth = 1 + stroke;
      ctx.beginPath();
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.moveTo(current.x, current.y);
      ctx.quadraticCurveTo(midX + Math.sin(time * 0.001 + i) * orbit, midY + Math.cos(time * 0.0012 + i) * orbit, next.x, next.y);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 111, 31, ${0.12 + pairSignal * 0.18})`;
      ctx.lineWidth = Math.max(0.4, stroke * 0.62);
      ctx.beginPath();
      ctx.arc(midX, midY, orbit + 2 + pairSignal * 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawTitleModuleArcNet(ctx, cx, cy, ringX, ringY, time, layer = 'back') {
  const phase = time * (layer === 'front' ? 0.00035 : -0.0002);
  const ringCount = layer === 'front' ? 3 : 2;
  const drift = 1 + introBeatLevel * 0.5;
  for (let i = 0; i < ringCount; i += 1) {
    const spin = phase + i * Math.PI * 0.92;
    const radiusX = ringX * (1 + i * 0.3 + introBeatLevel * 0.14) * drift;
    const radiusY = ringY * (1 + i * 0.3 + introBeatLevel * 0.16) * (layer === 'front' ? 1 : 0.94);
    const alpha = layer === 'front' ? 0.1 + introBeatLevel * 0.24 : 0.055 + introBeatLevel * 0.17;
    const sweep = Math.PI * 0.98 + Math.sin(time * 0.0003 + i) * 0.28;

    ctx.strokeStyle = `rgba(255, 51, 153, ${alpha})`;
    ctx.lineWidth = layer === 'front' ? 1.4 : 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX, radiusY, spin, spin, spin + sweep);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 111, 31, ${alpha * 0.68})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX * 0.86, radiusY * 0.86, -spin * 0.6, spin * 0.3, spin + sweep * 0.74);
    ctx.stroke();

    for (let j = 0; j < 2; j += 1) {
      const cxOffset = cx + Math.cos(phase * 1.9 + i * 1.45 + j * 2.1) * radiusX;
      const cyOffset = cy + Math.sin(phase * 1.7 + i * 1.22 + j * 2.3) * radiusY * 0.6;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.06 + alpha * 1.25})`;
      ctx.beginPath();
      ctx.arc(cxOffset, cyOffset, 1.2 + i * 0.45 + (layer === 'front' ? introBeatLevel * 1.9 : 0), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTitleModuleGlyph(ctx, x, y, radius, spin, signal, shape, layer, intensity = 0.45) {
  const baseAlpha = layer === 'front' ? 1 : 0.76;
  const glowRadius = radius * 1.8 + signal * 22;
  const glow = ctx.createRadialGradient(x, y, radius * 0.18, x, y, glowRadius);
  glow.addColorStop(0, `rgba(255, 255, 255, ${0.03 + intensity * 0.32 * baseAlpha})`);
  glow.addColorStop(0.45, `rgba(255, 111, 31, ${0.05 + intensity * 0.18 * baseAlpha})`);
  glow.addColorStop(1, 'rgba(255, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius * 0.62, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);

  const drewSprite = drawTitleModuleSprite(ctx, radius, signal, shape, layer, intensity);
  if (!drewSprite) {
    switch (shape) {
      case 'dodeca':
        drawTitleDodecaGlyph(ctx, radius, signal, intensity);
        break;
      case 'tri':
        drawTitleTriangleGlyph(ctx, radius, signal, intensity);
        break;
      case 'sigil':
        drawTitleSigilGlyph(ctx, radius, signal, intensity);
        break;
      case 'spike':
        drawTitleSpikeGlyph(ctx, radius, signal, intensity);
        break;
      case 'astra':
        drawTitleAstroGlyph(ctx, radius, signal, intensity);
        break;
      case 'crown':
        drawTitleSpikeGlyph(ctx, radius, signal, intensity);
        break;
      default:
        drawTitleTriangleGlyph(ctx, radius, signal, intensity);
    }
  }

  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + signal * 0.35})`;
  ctx.arc(x, y, Math.max(1.2, radius * 0.06), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTitleModuleSprite(ctx, radius, signal, shape, layer, intensity) {
  if (!audioModuleSpriteReady || !audioModuleSprite?.naturalWidth) return false;
  const spriteIndex = AUDIO_MODULE_SPRITE.indexByShape[shape] ?? 0;
  const cellSize = audioModuleSprite.naturalWidth / AUDIO_MODULE_SPRITE.count;
  const drawSize = radius * (layer === 'front' ? 4.6 : 3.9) * (0.9 + signal * 0.22);

  ctx.save();
  ctx.globalAlpha = layer === 'front'
    ? Math.min(0.92, 0.52 + signal * 0.36 + intensity * 0.12)
    : Math.min(0.46, 0.24 + signal * 0.2 + intensity * 0.05);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    audioModuleSprite,
    spriteIndex * cellSize,
    0,
    cellSize,
    audioModuleSprite.naturalHeight,
    -drawSize / 2,
    -drawSize / 2,
    drawSize,
    drawSize,
  );
  ctx.restore();
  return true;
}

function drawTitleDodecaGlyph(ctx, radius, signal, intensity) {
  const outerRadius = radius * 0.95;
  const innerRadius = radius * 0.56;
  const innerShift = signal * 0.34;
  const outer = [];
  const inner = [];

  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    outer.push({
      x: Math.cos(a) * outerRadius,
      y: Math.sin(a) * outerRadius,
    });
    inner.push({
      x: Math.cos(a + Math.PI / 5) * innerRadius,
      y: Math.sin(a + Math.PI / 5 + innerShift * 0.2) * innerRadius,
    });
  }

  ctx.globalAlpha = 0.74 + intensity * 0.24;
  ctx.lineWidth = 1.25 + signal * 1.3;
  ctx.strokeStyle = `rgba(255, 51, 153, ${0.44 + signal * 0.46})`;
  ctx.beginPath();
  outer.forEach((point, i) => {
    const next = outer[(i + 1) % outer.length];
    const inPoint = inner[(i + 2) % inner.length];
    const nextIn = inner[(i + 3) % inner.length];
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(inPoint.x, inPoint.y);
    ctx.lineTo(next.x, next.y);
    ctx.lineTo(nextIn.x, nextIn.y);
    ctx.closePath();
  });
  ctx.stroke();

  ctx.beginPath();
  outer.forEach((point, i) => {
    const next = outer[(i + 1) % outer.length];
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(next.x, next.y);
  });
  inner.forEach((point, i) => {
    const next = inner[(i + 1) % inner.length];
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(next.x, next.y);
  });
  ctx.strokeStyle = `rgba(226, 255, 255, ${0.18 + intensity * 0.2})`;
  ctx.stroke();

  outer.forEach((point) => {
    ctx.fillStyle = `rgba(255, 191, 255, ${0.25 + intensity * 0.22})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1 + signal * 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawTitleTriangleGlyph(ctx, radius, signal, intensity) {
  const w = radius * (0.8 + signal * 0.24);
  const h = radius * (1.02 + signal * 0.35);
  const ring = radius * 1.25;
  const spin = signal * 1.4;
  ctx.lineWidth = 1.1 + signal * 1.4;
  ctx.globalAlpha = 0.8 + intensity * 0.2;
  ctx.strokeStyle = `rgba(0, 229, 255, ${0.46 + intensity * 0.28})`;
  ctx.fillStyle = `rgba(0, 229, 255, ${0.07 + signal * 0.05})`;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w, h * 0.64);
  ctx.lineTo(-w, h * 0.64);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  for (let i = 0; i < 5; i += 1) {
    const lineR = ring + (i * 2.5);
    const a = spin + (i * Math.PI * 2 / 5);
    const b = spin + ((i + 2) * Math.PI * 2 / 5);
    ctx.strokeStyle = `rgba(0, 229, 255, ${0.11 + signal * 0.15})`;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * lineR, Math.sin(a) * lineR * 0.56);
    ctx.lineTo(Math.cos(b) * (lineR + 1), Math.sin(b) * (lineR + 1) * 0.56);
    ctx.stroke();
  }
}

function drawTitleSigilGlyph(ctx, radius, signal, intensity) {
  const spikes = 6;
  const inner = radius * 0.45;
  const outer = radius * 1.05;
  ctx.lineWidth = 1 + signal * 1.4;
  ctx.strokeStyle = `rgba(255, 111, 31, ${0.5 + intensity * 0.3})`;
  ctx.fillStyle = `rgba(255, 111, 31, ${0.04 + signal * 0.06})`;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const step = Math.PI * 2 / (spikes * 2);
    const rr = i % 2 === 0 ? outer : inner;
    const px = Math.cos(i * step) * rr;
    const py = Math.sin(i * step) * rr * 0.9;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  for (let ring = 1; ring <= 3; ring += 1) {
    const orbit = radius * (0.26 * ring + 0.5);
    const alpha = 0.05 + intensity * 0.14 / ring;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(0, 0, orbit, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawTitleSpikeGlyph(ctx, radius, signal, intensity) {
  const r = radius * 0.88;
  const spikes = 7;
  const tip = Math.PI * 2 / spikes;
  ctx.lineWidth = 1 + signal * 1.2;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.34 + intensity * 0.4})`;
  ctx.beginPath();
  for (let i = 0; i <= spikes; i += 1) {
    const a = i * tip;
    const rr = i % 2 === 0 ? r : r * 0.36;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr * 0.87;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  for (let i = 0; i < spikes; i += 1) {
    const a = i * tip + tip * 0.5;
    const bx = Math.cos(a) * (r * 0.52);
    const by = Math.sin(a) * (r * 0.52 * 0.87);
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 51, 153, ${0.08 + signal * 0.15})`;
    ctx.arc(bx, by, 1 + signal * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTitleAstroGlyph(ctx, radius, signal, intensity) {
  const arc = radius * 1.12;
  const orbit = radius * 0.7;
  ctx.lineWidth = 1.1 + signal * 1.6;
  ctx.strokeStyle = `rgba(200, 255, 255, ${0.28 + intensity * 0.24})`;
  for (let i = 0; i < 2; i += 1) {
    const phase = i * Math.PI + (signal * 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, arc + i * 2.4, phase, phase + Math.PI * 1.1);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, orbit * 0.74, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(226, 210, 255, ${0.14 + signal * 0.22})`;
  ctx.stroke();
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + signal * 0.8;
    ctx.fillStyle = `rgba(226, 210, 255, ${0.24 + signal * 0.34})`;
    ctx.beginPath();
    ctx.arc(
      Math.cos(a) * orbit * 0.9,
      Math.sin(a) * orbit * 0.9 * 0.72,
      0.9 + signal * 1.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawTitleModulePulse(ctx, x, y, radius, signal, time, seed) {
  const ring = Math.max(1, radius + signal * 16 + 2);
  const sweep = Math.sin((time * 0.004) + seed) * 0.8;
  const hue = (signal * 280 + seed * 23) % 360;
  const c1 = `hsla(${hue}, 95%, 82%, ${0.12 + signal * 0.18})`;
  const c2 = `hsla(${hue}, 90%, 64%, 0)`;
  const burst = ctx.createRadialGradient(x, y, 0, x, y, ring * 1.35);
  burst.addColorStop(0, c1);
  burst.addColorStop(1, c2);
  ctx.fillStyle = burst;
  ctx.beginPath();
  ctx.arc(x, y, ring * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + signal * 0.2})`;
  ctx.lineWidth = 1.15;
  for (let i = 0; i < 4; i += 1) {
    const rr = ring * (0.5 + i * 0.15 + sweep * 0.02);
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
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
          ${cait.modules.map((module, index) => `
            <article class="cait-module-chip" style="--module-index:${moduleSpriteIndex(module, index)}">
              <i class="cait-module-icon" aria-hidden="true"></i>
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
        ${(cait?.modules ?? []).slice(0, 3).map((module, index) => `
          <span style="--module-index:${moduleSpriteIndex(module, index)}"><i class="cait-module-icon" aria-hidden="true"></i><b>${escapeHtml(module.slot)}</b>${escapeHtml(module.name)}</span>
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

function moduleSpriteIndex(module, fallbackIndex = 0) {
  const bySlot = {
    crown: 3,
    heart: 0,
    voice: 2,
    glitch: 4,
  };
  return bySlot[String(module?.slot ?? '').toLowerCase()] ?? (fallbackIndex % AUDIO_MODULE_SPRITE.count);
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
