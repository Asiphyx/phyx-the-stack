import './index.css';
import { inject } from '@vercel/analytics';
import { GameState } from './engine/GameState.js';
import { HEROES } from './data/heroes.js';
import { getHeroTheme } from './data/heroThemes.js';
import { CAIT_IDOL, buildCaitCompanion } from './data/caitModules.js';
import { ENEMIES, ENCOUNTERS } from './data/enemies.js';
import { CARDS } from './data/cards.js';
import { SOUNDTRACK_TRACKS, tracksForDomain } from './data/soundtrack.js';
import { TUTORIAL_GUIDE } from './data/tutorialGuide.js';
import bus from './engine/EventBus.js';
import { initPhaserGame, destroyPhaserGame } from './phaser/PhaserGame.js';

// Initialize Vercel Web Analytics
inject();

const cardPool = Object.values(CARDS).filter(c => c.rarity !== 'starter');
const game = new GameState();
const SAVE_STORAGE_KEY = 'phyx-the-stack:saves:v1';
const SAVE_SLOT_COUNT = 3;
const CAIT_LABS_ICON = '/assets/brand/cait-labs-icon.png';
const DEFAULT_TRACK = SOUNDTRACK_TRACKS.find(track => track.id === 'cait-intro') ?? SOUNDTRACK_TRACKS[0];
const JAM_RUN_FLOORS = 11;
const PLAYABLE_HERO_IDS = new Set(['asiphyx']);
const MUSIC_DOMAIN_FILTERS = {
  title: { lowpass: 6200, highpass: 24, peakFrequency: 880, peakGain: 1.8, gain: 0.72, threshold: -24, ratio: 4.5 },
  heroSelect: { lowpass: 7800, highpass: 32, peakFrequency: 1400, peakGain: 2.6, gain: 0.76, threshold: -26, ratio: 5.2 },
  map: { lowpass: 6800, highpass: 28, peakFrequency: 720, peakGain: 1.4, gain: 0.66, threshold: -22, ratio: 4 },
  combat: { lowpass: 10800, highpass: 46, peakFrequency: 2400, peakGain: 3.4, gain: 0.82, threshold: -31, ratio: 7.5 },
  boss: { lowpass: 11800, highpass: 54, peakFrequency: 2600, peakGain: 3.8, gain: 0.86, threshold: -32, ratio: 8 },
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
let stagedCommands = [];
let stagedCommandSequence = 0;
const MODULE_SIDE_LIMIT = 3;
const COMBAT_TOP_MODULE_PREVIEW = 10;
let battleLog = [];
let introAudio = null;
let introMusicEnabled = false;
// Set when the user explicitly pauses. The pointerdown autoplay-unlock below
// must never override a deliberate pause, or the toggle button fights itself
// (pointerdown resumes, then click re-pauses).
let musicUserPaused = false;
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
// Declared before the initial render() below — prepareMusicForPhase touches it
// via updateMusicControlBar, and `vite dev` enforces the TDZ that esbuild relaxes.
let musicCtrlBar = null;

const engineMode = 'phaser';
let persistentPhaserContainer = null;
let phaserCombatBooted = false;

function getPhaserContainer() {
  if (!persistentPhaserContainer) {
    persistentPhaserContainer = document.createElement('div');
    persistentPhaserContainer.id = 'phaser-game-container';
    persistentPhaserContainer.style.width = '100%';
    persistentPhaserContainer.style.height = '300px';
    persistentPhaserContainer.style.position = 'absolute';
    persistentPhaserContainer.style.top = '0';
    persistentPhaserContainer.style.left = '0';
    persistentPhaserContainer.style.zIndex = '2';
  }
  return persistentPhaserContainer;
}

root.addEventListener('pointerdown', (event) => {
  const interactive = event.target.closest('button, .game-card, .hero-card, .map-node, .terminal-opt-btn, .save-slot');
  if (!interactive) return;
  triggerInteractionPulse(event.clientX, event.clientY, interactive.matches('.btn-primary, .ult-btn-ready') ? 1 : 0.72);
  if (!introMusicEnabled && !musicUserPaused && game.getSnapshot().phase !== 'title') startIntroMusic();
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

window.addEventListener('phaserSelectTarget', (event) => {
  selectedTarget = event.detail.index;
  render();
});

bus.on('stateChange', () => render());
bus.on('combatUpdate', () => render());
bus.on('draftOffered', ({ cards }) => {
  activeDraft = cards ?? [];
  render();
});
bus.on('damageDealt', onDamageEvent);
bus.on('caitAttackWindup', ({ targetId, targetIndex, amount, attackCount = 1, actionIndex = 0 }) => {
  const snap = game.getSnapshot();
  const enemy = snap.enemies?.find(enemy => enemy.id === targetId) ?? snap.enemies?.[targetIndex];
  const enemyName = enemy?.name ?? 'Enemy';
  const value = Math.max(1, Math.round(amount || 0));
  logBattleEvent(
    `CAIT WINDUP // ${enemyName} // ${actionIndex + 1}/${attackCount} :: ${value}`,
    'command'
  );
});
bus.on('toast', ({ text, type = 'info' }) => emitToast(text, type));
bus.on('cardPlayed', ({ card, targetIndex }) => {
  const target = game.state.enemies[targetIndex];
  logBattleEvent(`SENT ${card.name} ${target ? `-> ${target.name}` : ''} // ${speedLabel(card)} PATH`, 'command');
});
bus.on('enemyAction', ({ enemy, action }) => {
  logBattleEvent(`${enemy?.name ?? 'Enemy'} :: ${action?.description ?? action?.type ?? 'action'}`, 'enemy');
  root.classList.add('screen-shake');
  setTimeout(() => root.classList.remove('screen-shake'), 300);
});

render();

function render() {
  const snapshot = game.getSnapshot();
  root.innerHTML = '';
  prepareMusicForPhase(snapshot.phase);

  if (snapshot.phase !== 'combat') {
    destroyPhaserGame();
    phaserCombatBooted = false;
    stagedCommands = [];
  }

  switch (snapshot.phase) {
    case 'title': renderTitle(); return;
    case 'heroSelect': renderHeroSelect(); break;
    case 'caitdex': renderCaitdex(); return;
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

function pruneStagedCommands() {
  const handIds = new Set(game.state.hand.map(card => card.instanceId));
  stagedCommands = stagedCommands.filter(command => handIds.has(command.instanceId));
}

function commandTargetName(command) {
  const target = game.state.enemies[command.targetIndex];
  return target?.name ?? 'Auto Target';
}

function commandTargetSide(card) {
  return classifyCardTarget(card) === 'enemy' ? 'enemy' : 'self';
}

function firstOpenCommandSlot(side) {
  for (let slotIndex = 0; slotIndex < MODULE_SIDE_LIMIT; slotIndex++) {
    if (!stagedCommands.some(command => (command.side ?? 'enemy') === side && command.slotIndex === slotIndex)) {
      return slotIndex;
    }
  }
  return -1;
}

function commandVerb(card) {
  if (card.tags?.includes('cait')) return 'SYNC';
  if (card.tags?.includes('gravity')) return 'BEND';
  if (card.tags?.includes('defensive')) return 'BRACE';
  if (card.tags?.includes('control')) return 'FLIP';
  if (card.rarity === 'debt' || card.tags?.includes('curse')) return 'FAULT';
  if (card.type === 'attack') return 'STRIKE';
  return 'PATCH';
}

function stageCommand(instanceId, targetIndex = selectedTarget ?? 0, requestedSide = null, requestedSlotIndex = null) {
  const card = game.state.hand.find(c => c.instanceId === instanceId);
  if (!card || card.tags?.includes('curse') || card.id === 'memory_leak') {
    logBattleEvent(`${card?.name ?? 'Command'} rejected // unplayable fault`, 'danger');
    return;
  }
  if (stagedCommands.some(command => command.instanceId === instanceId)) return;

  const side = requestedSide ?? commandTargetSide(card);
  const requiredSide = commandTargetSide(card);
  if (side !== requiredSide) {
    logBattleEvent(`${card.name} rejected // wrong socket target`, 'danger');
    return;
  }

  const slotIndex = requestedSlotIndex ?? firstOpenCommandSlot(side);
  if (slotIndex < 0 || slotIndex >= MODULE_SIDE_LIMIT) {
    logBattleEvent(`${side === 'self' ? 'Cait' : 'User'} path full // three modules max`, 'danger');
    return;
  }
  if (stagedCommands.some(command => (command.side ?? 'enemy') === side && command.slotIndex === slotIndex)) {
    logBattleEvent('Socket occupied // choose an open slot', 'danger');
    return;
  }
  const finalTargetIndex = side === 'enemy' ? targetIndex : selectedTarget ?? 0;
  stagedCommands.push({ instanceId, targetIndex: finalTargetIndex, side, slotIndex, order: stagedCommandSequence++ });
  logBattleEvent(`PLUGGED ${commandVerb(card)} :: ${card.name} -> ${side === 'self' ? 'Cait' : 'User Path'} ${slotIndex + 1}`, 'info');
  render();
}

function unstageCommand(instanceId) {
  const card = game.state.hand.find(c => c.instanceId === instanceId);
  stagedCommands = stagedCommands.filter(command => command.instanceId !== instanceId);
  if (card) logBattleEvent(`UNSLOTTED ${card.name}`, 'info');
  render();
}

function clearStagedCommands() {
  if (stagedCommands.length > 0) logBattleEvent('COMMAND STACK CLEARED', 'info');
  stagedCommands = [];
  stagedCommandSequence = 0;
  render();
}

function executeStagedCommands() {
  pruneStagedCommands();
  if (stagedCommands.length === 0) {
    logBattleEvent('NO MODULES PLUGGED', 'danger');
    return;
  }

  const queue = [...stagedCommands].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  stagedCommands = [];
  stagedCommandSequence = 0;
  logBattleEvent(`SIMULATING ${queue.length}-MODULE EXCHANGE`, 'command');

  game.combat.resolveModuleStack(queue);
  render();
}

function logBattleEvent(text, type = 'info') {
  const clean = String(text ?? '').trim();
  if (!clean) return;
  battleLog.unshift({
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    text: clean,
    type,
    ts: new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
  });
  battleLog = battleLog.slice(0, 10);
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
        <img class="title-labs-medallion" src="${CAIT_LABS_ICON}" alt="Cait Labs seal" />
        <div class="title-cat-menu-title">Phyx Launch</div>
      <div class="title-actions">
        <button class="btn btn-primary" id="start-btn">New Run</button>
        <button class="btn title-music-btn" id="music-btn">${introMusicEnabled ? 'Mute Score' : 'Play Score'}</button>
      </div>
      <button class="btn title-caitdex-btn" id="title-caitdex-btn" type="button">📖 Caitdex</button>
      <button class="btn title-save-menu-btn" id="title-save-menu-btn">Save States</button>
      <button class="btn title-debug-btn" id="title-debug-boss-btn" type="button" title="Skip to floor 11 boss fight">🐛 BOSS TEST</button>
    </div>
      <button class="title-cat-button" id="title-cat-button" type="button" aria-expanded="${titleLauncherOpen ? 'true' : 'false'}" aria-label="Boop the cat's nose to open CaitOS launch controls"></button>
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
  section.querySelector('#title-caitdex-btn').onclick = () => { game.setPhase('caitdex'); };
  section.querySelector('#title-save-menu-btn').onclick = () => openSystemMenu(false);
  section.querySelector('#title-debug-boss-btn').onclick = () => {
    const hero = { ...HEROES.asiphyx };
    const normalIds = new Set([...ENCOUNTERS.easy.flat(), ...ENCOUNTERS.medium.flat()]);
    const catalogue = {
      normal: [...normalIds].map(id => ENEMIES[id]).filter(Boolean),
      elite: ['tech_debt','race_condition','legacy_codebase'].map(id => ENEMIES[id]).filter(Boolean),
      boss: ['budder_sphinx'].map(id => ENEMIES[id]).filter(Boolean),
    };
    const pool = Object.values(CARDS);
    game.selectHero(hero);
    game.startRun(11, pool, catalogue);
    game.state.floor = 11;
    game.enterFloor(game.state.enemyCatalogue, game.state.cardPool);
    startIntroMusic();
  };
  appendSystemMenuOverlay(section, false);
  applyTitleWindowOffset(section.querySelector('.title-cat-menu'));
  wireTitleWindowDrag(section);
}

function applyTitleWindowOffset(windowEl) {
  if (!windowEl) return;
  windowEl.style.setProperty('--title-window-x', `${Math.round(titleWindowOffset.x)}px`);
  windowEl.style.setProperty('--title-window-y', `${Math.round(titleWindowOffset.y)}px`);
}

function wireTitleWindowDrag(section) {
  const windowEl = section.querySelector('.title-cat-menu') ?? section.querySelector('.title-fold-anchor');
  const dragBar = section.querySelector('.title-terminal-top');
  if (!windowEl || !dragBar) return;

  let drag = null;
  dragBar.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    event.preventDefault();
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
  musicUserPaused = false;
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
    musicUserPaused = true;
  } else {
    musicUserPaused = false;
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
  if (phase === 'combat') {
    const hasBossEnemy = game.state.enemies?.some((enemy) => {
      const canonical = resolveEnemyTemplate(enemy);
      return (enemy.tier ?? canonical?.tier) === 'boss';
    });
    return hasBossEnemy ? 'boss' : 'combat';
  }
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
  // Ring geometry hugs the cat head in cait-labs-title.png (stretched 100%/100%,
  // so fractions of the canvas track the artwork at any window size).
  const cx = width * 0.499;
  const cy = height * 0.435;
  const ringX = width * 0.165;
  const ringY = height * 0.3;

  if (introAnalyser && introFrequencyData && introMusicEnabled) {
    introAnalyser.getByteFrequencyData(introFrequencyData);
  }
  updateTitleBeat();

  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  if (layer === 'back') {
    const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.max(ringX, ringY) * 1.4);
    halo.addColorStop(0, `rgba(255, 51, 153, ${0.05 + introBeatLevel * 0.05})`);
    halo.addColorStop(0.45, `rgba(255, 111, 31, ${0.03 + introBeatLevel * 0.035})`);
    halo.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ringX * 1.5, ringY * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    drawTitleEqCrown(ctx, cx + width * 0.005, cy, ringX * 1.12, ringY * 1.01, time);
    drawTitleBeatRipples(ctx, cx, cy, ringX, ringY, time);
  } else {
    drawTitleOrbitGlyphs(ctx, cx, cy, ringX, ringY, time);
  }
}

function titleBandLevel(fraction, time, seed = 0) {
  if (introMusicEnabled && introFrequencyData) {
    const index = Math.min(introFrequencyData.length - 1, Math.floor(fraction * introFrequencyData.length * 0.7));
    return introFrequencyData[index] / 255;
  }
  // Idle shimmer when muted so the title never looks frozen.
  return 0.12 + Math.sin(time * 0.0014 + seed * 1.9) * 0.07 + Math.sin(time * 0.0008 + seed * 0.7) * 0.05;
}

// Stationary frequency crown: ticks at fixed angles around the cat's head.
// Only their length/brightness move — this is the anchor of the composition.
// Bands mirror left/right with bass at the bottom of the ring, highs at the top.
function drawTitleEqCrown(ctx, cx, cy, ringX, ringY, time) {
  const ticks = 56;
  const glowPulse = 0.72 + Math.sin(time * 0.00145) * 0.18 + introBeatLevel * 0.28;
  for (let i = 0; i < ticks; i += 1) {
    const angle = (i / ticks) * Math.PI * 2 - Math.PI / 2;
    const fraction = Math.abs(((i + ticks / 2) % ticks) - ticks / 2) / (ticks / 2);
    const level = titleBandLevel(1 - fraction, time, i);
    const signal = Math.min(1, level * 1.25 + introBeatLevel * 0.2);

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const reach = 7 + signal * (37 + introBeatLevel * 20);
    const innerX = cx + cos * ringX;
    const innerY = cy + sin * ringY;
    const outerX = cx + cos * (ringX + reach);
    const outerY = cy + sin * (ringY + reach);

    ctx.strokeStyle = i % 2 === 0
      ? `rgba(255, 51, 153, ${(0.14 + signal * 0.55) * glowPulse})`
      : `rgba(255, 111, 31, ${(0.1 + signal * 0.46) * glowPulse})`;
    ctx.lineWidth = 1.6 + signal * 2.2;
    ctx.beginPath();
    ctx.moveTo(innerX, innerY);
    ctx.lineTo(outerX, outerY);
    ctx.stroke();

    if (signal > 0.55) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(signal - 0.55) * 0.95 * glowPulse})`;
      ctx.beginPath();
      ctx.arc(outerX, outerY, 1.4 + signal * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Moving layer: module glyphs ride one slow shared orbit around the cat while
// each spins on its own axis — one coherent rotation instead of scattered drift.
function drawTitleOrbitGlyphs(ctx, cx, cy, ringX, ringY, time) {
  const glyphs = 10;
  const orbitX = ringX * 1.27;
  const orbitY = ringY * 1.24;
  const formation = time * 0.00016;
  const breathe = 1 + musicBassLevel * 0.05 + introBeatLevel * 0.03;

  // Stationary orbit track so the moving part has something to move against.
  ctx.strokeStyle = `rgba(255, 51, 153, ${0.07 + musicMidLevel * 0.2})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, orbitX, orbitY, 0, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < glyphs; i += 1) {
    const angle = (i / glyphs) * Math.PI * 2 + formation;
    const shape = TITLE_MODULE_SHAPES[i % TITLE_MODULE_SHAPES.length];
    const level = titleBandLevel(i / glyphs, time, i * 3);
    const signal = Math.min(1, level * 1.1 + introBeatLevel * 0.35 + musicBassLevel * 0.15);

    const x = cx + Math.cos(angle) * orbitX * breathe;
    const y = cy + Math.sin(angle) * orbitY * breathe;
    const spin = time * 0.0011 * (i % 2 ? 1 : -1) + i * 0.7;
    const radius = (13 + signal * 18) * (i % 3 === 0 ? 1.15 : 1);

    // Short trailing streak along the orbit makes the direction readable.
    const trail = angle - 0.085;
    ctx.strokeStyle = `rgba(255, 111, 31, ${0.05 + signal * 0.3})`;
    ctx.lineWidth = 1.3 + signal * 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(trail) * orbitX * breathe, cy + Math.sin(trail) * orbitY * breathe);
    ctx.lineTo(x, y);
    ctx.stroke();

    drawTitleModuleGlyph(ctx, x, y, radius, spin, signal, shape, 'front', 0.3 + signal * 0.6);
    if (signal > 0.62) {
      drawTitleModulePulse(ctx, x, y, radius * 1.6, signal, time, i);
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
  const baseY = h * 0.64;
  const centroidY = (-h + baseY + baseY) / 3;
  ctx.beginPath();
  ctx.moveTo(0, -h - centroidY);
  ctx.lineTo(w, baseY - centroidY);
  ctx.lineTo(-w, baseY - centroidY);
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
  const heroes = Object.values(HEROES);
  const asiphyx = heroes.find(hero => hero.id === 'asiphyx') ?? heroes[0];
  const roster = [
    asiphyx,
    ...heroes.filter(hero => hero.id !== asiphyx.id && hero.id !== 'cait'),
    ...heroes.filter(hero => hero.id === 'cait'),
  ].slice(0, 6);
  const theme = getHeroTheme(asiphyx.id);
  const cait = buildCaitCompanion(asiphyx.id);
  const slots = [
    { left: 18.8, top: 74.0 },
    { left: 29.9, top: 74.0 },
    { left: 41.0, top: 74.0 },
    { left: 52.1, top: 74.0 },
    { left: 63.2, top: 74.0 },
    { left: 74.4, top: 74.0 },
  ];

  section.dataset.selectedHero = asiphyx.id;
  section.style.setProperty('--selected-hero-color', theme.accent ?? asiphyx.color);
  section.style.setProperty('--selected-hero-accent-2', theme.accent2 ?? '#00e5ff');
  section.style.setProperty('--selected-hero-danger', theme.danger ?? '#ff3344');
  section.style.setProperty('--selected-hero-glow', `${theme.accent ?? asiphyx.color}55`);

  const board = el('div', 'hero-select-board');
  board.innerHTML = `
    <div class="hero-preview-panel" aria-label="Selected hero preview">
      <img src="${asiphyx.selectionPortrait ?? asiphyx.portrait}" alt="${escapeHtml(asiphyx.name)} hero select card" />
    </div>
    <aside class="cait-variant-summary" aria-label="Selected Cait variant summary">
      <span>Cait Variant</span>
      <strong>${escapeHtml(cait.bondName)}</strong>
      <p>${escapeHtml(cait.bondLine)}</p>
      <dl>
        <div><dt>Mask</dt><dd>Heart Regent</dd></div>
        <div><dt>Vector</dt><dd>Gravity Lock</dd></div>
        <div><dt>Output</dt><dd>${Math.round(cait.reliability * 100)}% Sync</dd></div>
      </dl>
      <small>${escapeHtml(cait.role)}</small>
    </aside>
    <div class="hero-roster-slots" aria-label="Hero roster">
      ${roster.map((hero, index) => {
        const isPlayable = PLAYABLE_HERO_IDS.has(hero.id);
        const heroTheme = getHeroTheme(hero.id);
        const previewSrc = hero.id === 'asiphyx'
          ? (hero.selectionPortrait ?? hero.portrait ?? hero.avatar)
          : (hero.avatar ?? hero.portrait ?? hero.selectionPortrait);
        const slot = slots[index] ?? slots[slots.length - 1];
        return `
          <button
            class="hero-select-slot ${isPlayable ? 'is-open' : 'is-locked'}"
            type="button"
            data-start-hero="${escapeHtml(hero.id)}"
            style="--slot-left:${slot.left}%; --slot-top:${slot.top}%; --slot-color:${heroTheme.accent ?? hero.color ?? '#9933ff'};"
            aria-disabled="${isPlayable ? 'false' : 'true'}"
            aria-label="${escapeHtml(hero.name)} ${isPlayable ? 'available' : 'locked'}"
          >
            <img src="${previewSrc}" alt="" />
            <b>${escapeHtml(hero.name)}</b>
            <i>${isPlayable ? 'OPEN' : 'LOCKED'}</i>
            <span class="hero-lock-mark">${isPlayable ? 'RUN' : 'LOCK'}</span>
            <span class="hero-hover-panel">
              <strong>${escapeHtml(hero.name)}</strong>
              <small>${escapeHtml(hero.title)}</small>
              <em>${isPlayable ? escapeHtml(cait.bondName) : 'Locked for jam build'}</em>
              <span>${escapeHtml(hero.passive?.name ?? 'Variant pending')}</span>
            </span>
          </button>
        `;
      }).join('')}
    </div>
    <button class="hero-board-start" type="button" data-start-hero="${escapeHtml(asiphyx.id)}">
      Start Duo Run
    </button>
  `;

  board.querySelectorAll('[data-start-hero]').forEach((button) => {
    button.onclick = () => {
      if (button.dataset.startHero !== asiphyx.id) return;
      game.selectHero(asiphyx);
      game.startRun(JAM_RUN_FLOORS, cardPool, enemyCatalogue);
    };
  });

  section.appendChild(board);
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
  const combatSnapshot = game.combat && typeof game.combat._snapshot === 'function' ? game.combat._snapshot() : null;
  pruneStagedCommands();
  const selectedEnemyState = state.enemies[selectedTarget] ?? state.enemies[0];
  const selectedEnemy = hydrateEnemyDisplay(selectedEnemyState);
  const targetIntent = selectedEnemyState
    ? (selectedEnemyState.pattern?.[selectedEnemyState.patternIndex] ?? selectedEnemyState.intent ?? null)
    : null;
  const caitIntent = cait?.intent ?? {
    name: 'Regent Priority',
    description: 'Cait acts from the locked duo protocol.',
  };
  const selfCommands = stagedCommands.filter(command => (command.side ?? 'enemy') === 'self').length;
  const userCommands = stagedCommands.filter(command => (command.side ?? 'enemy') === 'enemy').length;
  const selfCards = [];
  const enemyCards = [];
  for (const [i, card] of state.hand.entries()) {
    const isStaged = stagedCommands.some(command => command.instanceId === card.instanceId);
    const canPlay = !isStaged && state.hp > 0;
    const entry = { card, i, isStaged, canPlay };
    if (classifyCardTarget(card) === 'enemy') enemyCards.push(entry);
    else selfCards.push(entry);
  }

  const section = el('section', `combat-screen technomancy-combat theme-${theme.id} shell-${theme.shell}`);
  section.style.setProperty('--hero-color', theme.accent ?? hero?.color ?? '#9933ff');
  section.style.setProperty('--hero-accent-2', theme.accent2 ?? '#00e5ff');
  section.style.setProperty('--hero-danger', theme.danger ?? '#ff3344');
  section.style.setProperty('--battlefield-bg', `url('${theme.background}')`);

  const enemyPct = selectedEnemyState ? pct(selectedEnemyState.hp, selectedEnemyState.maxHp) : 0;
  const caitPct = cait ? pct(cait.hp, cait.maxHp) : 0;
  const battleLogRows = (battleLog.length ? battleLog.slice(0, 5) : [
    { type: 'info', text: 'Awaiting module stack input.', ts: '--:--' },
  ]).map(entry => `
    <p class="tech-log-line ${escapeHtml(entry.type ?? 'info')}">
      <span>[${escapeHtml(entry.type ?? 'SYS')}]</span>
      ${escapeHtml(entry.text ?? '')}
    </p>
  `).join('');
  const leftRailLogRows = (battleLog.length ? battleLog.slice(0, 5) : [
    { type: 'info', text: 'No combat log entries yet.', ts: '--:--' },
  ]).map(entry => `
    <p class="tech-log-line ${escapeHtml(entry.type ?? 'info')}">
      <span>[${escapeHtml(entry.type ?? 'SYS')}]</span>
      ${escapeHtml(entry.text ?? '')}
    </p>
  `).join('');

  const moduleTypeEntries = Object.entries(state.hand.reduce((acc, card) => {
    const type = commandVerb(card);
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {}));
  const itemTypeChips = moduleTypeEntries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([type, count]) => `
      <span class="combat-top-chip">
        <b>${escapeHtml(type)}</b>
        <small>${count}</small>
      </span>
    `).join('');
  const artifactChips = (cait?.modules ?? []).map(module => `
    <span class="combat-top-chip artifact" title="${escapeHtml(module.text ?? '')}">
      ${escapeHtml(module.name)} <small>· ${escapeHtml(module.slot ?? 'MODULE')}</small>
    </span>
  `).join('');
  const statusChips = [];
  if ((combatSnapshot?.paradoxChain ?? 0) > 0) {
    statusChips.push(`PARADOX ${combatSnapshot.paradoxChain}/3`);
  }
  if (combatSnapshot?.gravityWellActive) {
    statusChips.push('GRAVITY WELL');
  }
  if ((combatSnapshot?.caitExtraActions ?? 0) > 0) {
    statusChips.push(`CAIT +${combatSnapshot.caitExtraActions} FOLLOWUP${combatSnapshot.caitExtraActions > 1 ? 'S' : ''}`);
  }
  if ((combatSnapshot?.kineticComboStacks ?? 0) > 0) {
    statusChips.push(`COMBO ${combatSnapshot.kineticComboStacks}`);
  }
  if ((combatSnapshot?.caitDamageMult ?? 1) > 1) {
    statusChips.push(`FOLLOWUP x${Number(combatSnapshot.caitDamageMult).toFixed(2)}`);
  }
  if ((combatSnapshot?.markedTargetIndex ?? null) != null) {
    const markedTargetName = state.enemies[combatSnapshot.markedTargetIndex]?.name;
    statusChips.push(`MARK ${markedTargetName ?? 'ENEMY'}`);
  }
  const statusChipMarkup = statusChips.length > 0
    ? statusChips.map(effect => `<span class="combat-top-chip">${escapeHtml(effect)}</span>`).join('')
    : '<span class="combat-top-chip empty">STATUS STABLE</span>';
  const combatHintLines = [
    `Target: ${escapeHtml(selectedEnemy?.name ?? 'No target')}`,
    `Player intent: ${combatSnapshot?.lastPlayerIntent ? escapeHtml(combatSnapshot.lastPlayerIntent) : 'Stable'}`,
    `Active effects: ${statusChipMarkup.includes('STATUS STABLE') ? 'None' : statusChipMarkup.replace(/<[^>]+>/g, '').slice(0, 72)}`,
  ];

  const appendModuleGroup = (tray, label, entries, className) => {
    if (entries.length === 0) return;
    const group = el('div', `hud-module-group ${className}`);
    group.innerHTML = `<div class="hud-module-group-label">${label}</div>`;
    const row = el('div', 'hud-module-row');
    const visibleEntries = entries.slice(0, COMBAT_TOP_MODULE_PREVIEW);
    for (const { card, i, canPlay, isStaged } of visibleEntries) {
      row.appendChild(renderCard(card, i, canPlay, isStaged, true));
    }
    if (entries.length > COMBAT_TOP_MODULE_PREVIEW) {
      const overflow = el('span', 'combat-top-module-overflow');
      overflow.textContent = `+${entries.length - visibleEntries.length} more`;
      row.appendChild(overflow);
    }
    group.appendChild(row);
    tray.appendChild(group);
  };

  const topModuleTray = el('div', 'hud-module-tray combat-top-module-tray');
  appendModuleGroup(topModuleTray, 'USER PATH', enemyCards, 'enemy');
  appendModuleGroup(topModuleTray, 'CAIT PATH', selfCards, 'self');
  if (!topModuleTray.hasChildNodes()) {
    topModuleTray.innerHTML = '<span class="combat-top-empty-modules">NO MODULES IN HAND</span>';
  }

  // ─── 1. TOP STATS BAR ───
  const topBar = el('div', 'combat-top-bar');
  topBar.style.setProperty('--hero-color', hero?.color ?? '#9933ff');
  topBar.innerHTML = `
    <div class="combat-top-hero-identity tech-os-title">
      <span class="combat-top-hero-name glitch-text" data-text="PHYX_HUD_V1.0">PHYX_HUD_V1.0</span>
      <span class="combat-top-hero-title">${escapeHtml(hero?.name ?? 'HERO')} // ${escapeHtml(hero?.title ?? '')}</span>
      <span class="combat-top-duo">${escapeHtml(cait?.bondName ?? theme.duo)} // SESSION ACTIVE</span>
    </div>

    <div class="combat-top-content">
      <div class="combat-top-chips">
        <div class="combat-top-chip-cluster">
          <span class="combat-top-chip-title">ITEM TYPES</span>
          <div class="combat-top-chip-row">
            ${itemTypeChips || '<span class="combat-top-chip empty">NO MODULES</span>'}
          </div>
        </div>
        <div class="combat-top-chip-cluster">
          <span class="combat-top-chip-title">ARTIFACTS</span>
          <div class="combat-top-chip-row">
            ${artifactChips || '<span class="combat-top-chip empty">NONE</span>'}
          </div>
        </div>
        <div class="combat-top-chip-cluster">
          <span class="combat-top-chip-title">STATUS</span>
          <div class="combat-top-chip-row">
            ${statusChipMarkup}
          </div>
        </div>
      </div>
      <div class="combat-top-metrics">
        <span>DRAW <b>${snap.drawPileCount}</b></span>
        <span>DISCARD <b>${snap.discardPileCount}</b></span>
        <span>VOID <b>${snap.exhaustPileCount}</b></span>
        <span>USER PATH ${userCommands}/${MODULE_SIDE_LIMIT}</span>
        <span>CAIT PATH ${selfCommands}/${MODULE_SIDE_LIMIT}</span>
        <span>HAND <b>${state.hand.length}</b></span>
        <span>ENEMIES <b>${state.enemies.length}</b></span>
      </div>
      <div class="combat-top-module-section">
        <div class="combat-top-module-section-label">MODULES IN HAND</div>
      </div>
      <div class="combat-top-actions">
        <button class="btn command-send-btn tech-cast-button" type="button" ${stagedCommands.length === 0 ? 'disabled' : ''}>SEND STACK</button>
        <button class="btn command-clear-btn" type="button" ${stagedCommands.length === 0 ? 'disabled' : ''}>CLEAR</button>
        <button class="btn ult-btn ${ultReady ? 'ult-ready' : ''}" ${ultReady ? '' : 'disabled'}>${hero?.ultimate?.emoji ?? '💥'} ULT</button>
        <button class="btn btn-end-turn" id="end-turn-btn" ${state.hp <= 0 ? 'disabled' : ''}>WAIT</button>
      </div>
    </div>
  `;
  const topModuleSection = topBar.querySelector('.combat-top-module-section');
  if (topModuleSection) {
    topModuleSection.appendChild(topModuleTray);
  }
  section.appendChild(topBar);

  const leftRail = el('aside', 'combat-left-rail tech-hud-panel');
  leftRail.innerHTML = `
    <div class="tech-portrait-frame">
      <img src="${escapeHtml(heroBattlePortrait)}" alt="${escapeHtml(hero?.name ?? 'Hero')}" />
    </div>
    <h2>${escapeHtml(hero?.name ?? 'HERO').toUpperCase()}</h2>
    <p>${escapeHtml(hero?.title ?? 'VOID OPERATOR').toUpperCase()}</p>
    <div class="tech-left-log">
      <b>PLAYER NOTES</b>
      <div class="tech-left-log-body">
        ${combatHintLines.map(line => `<p class="tech-left-log-line">${line}</p>`).join('')}
      </div>
      <div class="tech-left-log-loglines">
        ${leftRailLogRows}
      </div>
    </div>
  `;
  section.appendChild(leftRail);

  // ─── 2. MIDDLE BATTLEFIELD ───
  const battlefield = el('div', 'combat-battlefield');
  battlefield.style.setProperty('--battlefield-bg', `url('${theme.background}')`);
  
  if (engineMode === 'phaser') {
    battlefield.classList.add('phaser-active');
    const phaserContainer = getPhaserContainer();
    if (phaserContainer.parentNode) {
      phaserContainer.parentNode.removeChild(phaserContainer);
    }
    battlefield.appendChild(phaserContainer);
  } else {
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
  }

  const presenceArt = hero?.selectionPortrait ?? hero?.battlePortrait ?? cait?.battlePortrait ?? CAIT_IDOL.battlePortrait;
  const presenceLayer = el('div', 'character-presence-layer');
  presenceLayer.innerHTML = `
    <img class="character-presence-art" src="${presenceArt}" alt="${escapeHtml(hero?.selectionPortraitLabel ?? `${cait?.name ?? 'Cait'} + ${hero?.name ?? 'Assistant'}`)}" />
    <div class="character-presence-copy">
      <b>${escapeHtml(cait?.name ?? 'Cait')} × ${escapeHtml(hero?.name ?? 'Assistant')}</b>
      <span>${escapeHtml(hero?.passive?.name ?? 'Locked Duo Protocol')}</span>
    </div>
  `;
  battlefield.appendChild(presenceLayer);

  const caitSprite = cait?.sprite;
    const caitCodecVisual = `<img class="cait-codec-image" src="${cait?.battlePortrait ?? CAIT_IDOL.battlePortrait}" alt="Cait companion" />`;
  const caitCodecWindow = el('div', 'cait-codec-window');
  caitCodecWindow.innerHTML = `
    <div class="cait-codec-top">
      <span>CAIT_CODEC://PEON_QUEEN</span>
      <button class="cait-codec-center" type="button" aria-label="Center Cait codec window">CENTER</button>
    </div>
    <div class="cait-codec-body">
      ${caitCodecVisual}
      <div class="cait-codec-copy">
        <span>CAIT BROADCAST ONLINE</span>
        <strong>${escapeHtml(caitIntent.name)}</strong>
        <p>${escapeHtml(caitIntent.description)}</p>
        <div class="cait-codec-health" aria-label="Cait health">
          <b>Cait HP</b>
          <i><em style="width:${cait ? pct(cait.hp, cait.maxHp) : 0}%"></em></i>
          <strong>${cait ? `${cait.hp}/${cait.maxHp}` : '--/--'}</strong>
        </div>
        <small>${escapeHtml(cait?.bondName ?? theme.duo)} // ${cait ? 'SYNCED' : 'SYNCING'}</small>
      </div>
    </div>
  `;
  applyCaitCodecOffset(caitCodecWindow);
  battlefield.appendChild(caitCodecWindow);

  if (engineMode === 'phaser') {
    // Phaser owns the arena surface; HUD labels stay outside the playfield.
  } else {
    // Right Side: Enemy Area
    const enemyArea = el('div', 'combat-enemy-area');
    for (const [i, rawEnemy] of state.enemies.entries()) {
      const enemy = hydrateEnemyDisplay(rawEnemy);
      const intent = enemy.pattern?.[enemy.patternIndex] ?? { type: 'none', description: '...' };
      const nextIntent = enemy.pattern?.[(enemy.patternIndex + 1) % Math.max(1, enemy.pattern.length)];
      const isSelected = selectedTarget === i;
      const enemySprite = enemy.sprite ?? '';
      const enemySpriteMarkup = enemy.idleSprite
        ? `<div class="enemy-sprite enemy-sprite-animated enemy-sprite-animated-${enemy.idleFrames ?? 4}" role="img" aria-label="${escapeHtml(enemy.name)}" style="--enemy-idle-sprite: url(${escapeHtml(enemy.idleSprite)});"></div>`
        : `${enemySprite ? `<img class="enemy-sprite" src="${enemySprite}" alt="${escapeHtml(enemy.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />` : ''}`;

      const slot = el('div', `enemy-slot type-${enemy.tier || enemy.type || 'normal'} enemy-${enemy.id}`);
      slot.innerHTML = `
        <div class="enemy-intent ${intent.type}">
          <span class="enemy-intent-kicker">Next enemy action</span>
          <strong>${intentIcon(intent.type)} ${intentLabel(intent)}</strong>
          ${hero?.id === 'xadnib' && nextIntent ? `<span class="intent-next">→ ${intentLabel(nextIntent)}</span>` : ''}
        </div>
        <div class="enemy-body ${isSelected ? 'targeted' : ''}" data-enemy="${i}">
          ${enemy.block > 0 ? `<div class="enemy-block-badge">${enemy.block}</div>` : ''}
          ${enemySpriteMarkup}
          <div class="enemy-emoji ${enemySprite || enemy.idleSprite ? 'enemy-emoji-fallback' : ''}">${enemy.emoji ?? '👾'}</div>
          <div class="enemy-name">${enemy.name}</div>
          <div class="enemy-hp-bar"><div class="enemy-hp-fill" style="width:${pct(enemy.hp, enemy.maxHp)}%"></div></div>
          <div class="enemy-hp-text">${enemy.hp} / ${enemy.maxHp}</div>
        </div>
      `;
      slot.querySelector('.enemy-body').onclick = () => { selectedTarget = i; render(); };
      enemyArea.appendChild(slot);
    }
    battlefield.appendChild(enemyArea);
  }
  section.appendChild(battlefield);

  const rightRail = el('aside', 'combat-right-rail tech-hud-panel');
  rightRail.innerHTML = `
    <div class="tech-status-title">
      <strong>BATTLE NOTES</strong>
      <span>LIVE</span>
    </div>
    <div class="tech-right-log">
      <b>TACTICAL READOUT</b>
      <span>${escapeHtml(selectedEnemy?.name ?? 'NO TARGET')} is about to ${escapeHtml(targetIntent ? intentLabel(targetIntent) : 'wait').toLowerCase()}.</span>
      <span>Hint: ${escapeHtml(battleLog[0]?.text ?? 'Play modules to build your stack, then execute on WAIT or ULT when ready.')}</span>
      <span>${escapeHtml(cait?.name ?? 'Cait')} status: ${cait ? `${cait.hp}/${cait.maxHp} HP` : 'syncing'}</span>
      <div class="tech-right-log-entries">
        ${battleLogRows}
      </div>
    </div>
    <div class="tech-right-log">
      <b>${escapeHtml(cait?.name ?? 'Cait')} BROADCAST</b>
      <span>${escapeHtml(caitIntent.name)}</span>
      <span>${escapeHtml(caitIntent.description)}</span>
    </div>
  `;
  section.appendChild(rightRail);

  // ─── 3. CLEAN BOTTOM HUD (dialogue/lore only) ───
  const bottomDashboard = el('div', 'combat-bottom-dashboard clean-combat-hud');
  const recentLog = battleLog[0]?.text ?? 'Route up to three User modules and three Cait modules, then send the stack from the top command rail.';
  const pluggedSummary = stagedCommands.length
    ? [...stagedCommands].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(command => {
      const card = state.hand.find(c => c.instanceId === command.instanceId);
      if (!card) return '';
      return `<span class="hud-plug-chip"><b>${command.side === 'self' ? 'CAIT' : 'USER'} ${Number(command.slotIndex ?? 0) + 1}</b><span>${escapeHtml(card.name)}</span></span>`;
    }).join('')
    : '<span class="hud-empty-stack">No modules routed yet.</span>';

  bottomDashboard.innerHTML = `
    <div class="hud-dialogue-speaker">
      <span>CAIT_BROADCAST</span>
      <b>${escapeHtml(cait?.name ?? 'Cait')}</b>
    </div>
    <div class="hud-stack-readout">
      <div class="hud-stack-topline">
        <strong>${escapeHtml(caitIntent.name)}</strong>
        <span>FLOOR ${snap.floor}/${snap.maxFloor} // ${escapeHtml(cait?.bondName ?? theme.duo)}</span>
      </div>
      <div class="hud-plugged-row">${pluggedSummary}</div>
      <div class="hud-log-line">${escapeHtml(recentLog)}</div>
    </div>
    <div class="hud-lore-thread">
      <b>${escapeHtml(hero?.passive?.name ?? 'Duo Protocol')}</b>
      <span>${escapeHtml(caitIntent.description)}</span>
    </div>
  `;
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
    if (!section.isConnected || game.state.phase !== 'combat') return;

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
        clearStagedCommands();
        game.combat.endPlayerTurn();
      };
    }

    const sendBtn = section.querySelector('.command-send-btn');
    if (sendBtn) {
      sendBtn.onclick = () => executeStagedCommands();
    }

    const castBtn = section.querySelector('.tech-cast-button');
    if (castBtn) {
      castBtn.onclick = () => executeStagedCommands();
    }

    const clearBtn = section.querySelector('.command-clear-btn');
    if (clearBtn) {
      clearBtn.onclick = () => clearStagedCommands();
    }

    section.querySelectorAll('[data-unstage]').forEach(slot => {
      slot.onclick = () => unstageCommand(slot.dataset.unstage);
    });

    section.querySelectorAll('[data-module-slot-side]').forEach(slot => {
      slot.ondragover = (event) => {
        event.preventDefault();
        slot.classList.add('drag-over');
      };
      slot.ondragleave = () => slot.classList.remove('drag-over');
      slot.ondrop = (event) => {
        event.preventDefault();
        slot.classList.remove('drag-over');
        const instanceId = event.dataTransfer.getData('text/plain');
        if (!instanceId) return;
        const card = game.state.hand.find(item => item.instanceId === instanceId);
        const side = slot.dataset.moduleSlotSide;
        const slotIndex = Number(slot.dataset.moduleSlotIndex ?? 0);
        if (card && commandTargetSide(card) !== side) {
          logBattleEvent(`${card.name} rejected // ${side === 'self' ? 'Cait' : 'target'} socket mismatch`, 'danger');
          render();
          return;
        }
        stageCommand(instanceId, selectedTarget ?? 0, side, slotIndex);
      };
    });

    if (engineMode === 'phaser') {
      if (!phaserCombatBooted) {
        initPhaserGame('phaser-game-container', game, selectedTarget);
        phaserCombatBooted = true;
      }
      bus.emit('targetChanged', selectedTarget);
    }
  }, 0);
}

function classifyCardTarget(card) {
  const effects = card.effects ?? [];
  const hasEnemy = effects.some(e =>
    e.target === 'enemy' || e.target === 'all_enemies' ||
    ['damage', 'damageAll', 'mark_target', 'mark_target_crit', 'swap_intent'].includes(e.type)
  );
  return hasEnemy ? 'enemy' : 'self';
}

function moduleSpeedLane(card) {
  if (card.speed) return card.speed;
  if (card.tags?.includes('speed') || card.tags?.includes('interrupt')) return 'fast';
  if (card.tags?.includes('slow') || card.tags?.includes('heavy')) return 'slow';
  if ((card.effects ?? []).some(e => ['block', 'cait_block', 'mark_target', 'mark_target_crit', 'swap_intent'].includes(e.type))) return 'fast';
  if (card.type === 'attack') return 'normal';
  return 'normal';
}

function speedLabel(card) {
  const lane = moduleSpeedLane(card);
  return lane === 'fast' ? 'FAST' : lane === 'slow' ? 'SLOW' : 'NORM';
}

function renderCard(card, index, canPlay, isStaged = false, compact = false) {
  const target = classifyCardTarget(card);
  const cardEl = el('button', `module-icon ${canPlay ? '' : 'unplayable'} ${isStaged ? 'staged' : ''} target-${target}`);
  cardEl.type = 'button';
  if (compact) cardEl.classList.add('module-top-compact');
  cardEl.dataset.rarity = card.rarity ?? 'common';
  cardEl.dataset.instanceId = card.instanceId ?? '';
  cardEl.draggable = canPlay;
  cardEl.disabled = !canPlay && !isStaged;
  const commandName = card.name ?? 'MODULE';
  const commandVerbText = commandVerb(card);
  const speedText = speedLabel(card);
  const detailText = card.description ?? '';
  const targetLabel = target === 'enemy' ? 'USER PATH' : 'CAIT SLOT';
  cardEl.title = `${commandName} (${commandVerbText}/${speedText}) — ${detailText}`;

  let typeLabel = card.type ?? 'skill';
  if (card.rarity === 'debt' || card.tags?.includes('curse')) typeLabel = 'bug';

  const cardArt = `
    <img src="/assets/cards/cardicon_${card.id}.png" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt="${escapeHtml(card.name ?? '')}" />
    <span class="module-icon-emoji" style="display:none">${card.emoji ?? '🧪'}</span>
  `;
  cardEl.innerHTML = compact
    ? `
    <div class="module-icon-art">
      ${cardArt}
    </div>
    <div class="module-icon-cost">${commandVerbText}</div>
    <div class="module-icon-speed">${speedText}</div>
    <div class="module-icon-detail">
      <b>${escapeHtml(commandName)}</b>
      <span>${escapeHtml(detailText || 'No description available.')}</span>
      <small>${targetLabel} · ${commandVerbText} · ${speedText}</small>
    </div>
    ${isStaged ? '<div class="module-icon-locked">🔒</div>' : ''}
  `
    : `
    <div class="module-icon-cost">${commandVerbText}</div>
    <div class="module-icon-speed">${speedText}</div>
    <div class="module-icon-art">
      ${cardArt}
    </div>
    <div class="module-icon-name">${escapeHtml(commandName)}</div>
    <div class="module-icon-target-label">${target === 'enemy' ? 'USER PATH' : 'CAIT SLOT'}</div>
    ${isStaged ? '<div class="module-icon-locked">🔒</div>' : ''}
  `;
  cardEl.onclick = () => {
    if (isStaged) {
      unstageCommand(card.instanceId);
      return;
    }
    if (!canPlay) return;
    stageCommand(card.instanceId, selectedTarget ?? 0);
  };
  cardEl.ondragstart = (event) => {
    if (!canPlay) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData('text/plain', card.instanceId);
    event.dataTransfer.effectAllowed = 'copy';
  };
  return cardEl;
}

function renderModuleSockets(side) {
  const rack = el('div', `target-module-sockets target-module-sockets-${side}`);
  const activeEnemy = game.state.enemies[selectedTarget] ?? game.state.enemies[0];
  const label = side === 'self'
    ? 'CAIT MODULE SLOTS'
    : `USER MODULE PATH -> ${activeEnemy?.name?.toUpperCase() ?? 'ENEMY'}`;
  rack.innerHTML = `<div class="target-module-socket-label">${label}</div>`;
  const row = el('div', 'target-module-socket-row');

  for (let slotIndex = 0; slotIndex < MODULE_SIDE_LIMIT; slotIndex++) {
    const command = stagedCommands.find(item => (item.side ?? 'enemy') === side && item.slotIndex === slotIndex);
    const card = command ? game.state.hand.find(c => c.instanceId === command.instanceId) : null;
    const slot = card
      ? el('button', `target-module-socket filled target-${side}`)
      : el('div', `target-module-socket empty target-${side}`);
    slot.dataset.moduleSlotSide = side;
    slot.dataset.moduleSlotIndex = String(slotIndex);

    if (card) {
      slot.type = 'button';
      slot.dataset.unstage = card.instanceId;
      slot.title = `${card.name} — click to unplug`;
      slot.innerHTML = `
        <b>${speedLabel(card)}</b>
        <span>${escapeHtml(card.name)}</span>
        <small>${commandVerb(card)}</small>
      `;
      slot.onclick = () => unstageCommand(card.instanceId);
    } else {
      slot.innerHTML = `
        <b>${slotIndex + 1}</b>
        <span>DROP</span>
      `;
    }

    row.appendChild(slot);
  }

  rack.appendChild(row);
  return rack;
}

function renderSegmentBar(value, tone = 'primary', segments = 10) {
  const active = Math.max(0, Math.min(segments, Math.round((Number(value) / 100) * segments)));
  return `
    <div class="tech-segment-bar tone-${escapeHtml(tone)}" aria-hidden="true">
      ${Array.from({ length: segments }, (_, index) => `<i class="${index < active ? 'active' : ''}"></i>`).join('')}
    </div>
  `;
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
          <span class="terminal-opt-desc">Remove a module permanently from your stack.</span>
        </button>
        <button class="terminal-opt-btn btn-refactor" data-mode="refactor">
          <span class="terminal-opt-code">[02]</span>
          <span class="terminal-opt-name">REFACTOR FUNCTION</span>
          <span class="terminal-opt-desc">Upgrade a module in your stack to higher performance.</span>
        </button>
        <button class="terminal-opt-btn btn-compile" data-mode="compile">
          <span class="terminal-opt-code">[03]</span>
          <span class="terminal-opt-name">COMPILE FEATURE</span>
          <span class="terminal-opt-desc">Compile a new advanced module into the stack.</span>
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
      <div class="text-small" style="color:var(--text-secondary); margin-bottom: 20px;">Click a module in your stack to permanently wipe it from the codebase.</div>
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
      <div class="text-small" style="color:var(--text-secondary); margin-bottom: 20px;">Click a module in your stack to optimize its performance stats (damage/block values ++).</div>
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
      <div class="run-stat"><div class="run-stat-value">${game.state.deck.length}</div><div class="run-stat-label">Stack Size</div></div>
      <div class="run-stat"><div class="run-stat-value">${Object.keys(snap.cardPlayCounts).length}</div><div class="run-stat-label">Unique Modules</div></div>
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
      <div class="run-stat"><div class="run-stat-value">${game.state.deck.length}</div><div class="run-stat-label">Final Stack</div></div>
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
  const sourceKey = event.source == null ? null : String(event.source);
  if (value <= 0) return;
  if (event.target === 'enemy') {
    const targetEnemy = event.targetId
      ? (game.getSnapshot()?.enemies ?? []).find(enemy => enemy.id === event.targetId)
      : null;
    const targetLabel = targetEnemy?.name ?? 'enemy';
    const sourceLabel = sourceKey === 'cait'
      ? 'CAIT'
      : sourceKey
        ? sourceKey.toUpperCase()
        : 'USER';
    logBattleEvent(`DAMAGE // ${sourceLabel} -> ${targetLabel} // ${value}${event.blocked ? ` (${event.blocked} blocked)` : ''}`, 'command');
  } else if (event.target === 'player') {
    const sourceLabel = sourceKey ? sourceKey.toUpperCase() : 'ENEMY';
    logBattleEvent(`DAMAGE // ${sourceLabel} -> ASIPHYX // ${value}${event.blocked ? ` (${event.blocked} blocked)` : ''}`, 'enemy');
  } else if (event.target === 'siphon_heal') {
    logBattleEvent(`SIPHON HEAL // +${value}`, 'passive');
  }
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
  logBattleEvent(text, type);
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
  const normalIds = new Set([...ENCOUNTERS.easy.flat(), ...ENCOUNTERS.medium.flat()]);
  const eliteIds = ['tech_debt', 'race_condition', 'legacy_codebase'];
  const bossIds = ['budder_sphinx'];
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
  const heroSelectScreen = root.querySelector('.hero-select-screen');
  const selectedHeroId = heroSelectScreen?.dataset?.selectedHero ?? state.hero?.id ?? 'asiphyx';
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
      sprite: cait.sprite?.idleStrip ?? null,
      modules: (cait.modules ?? []).map(module => `${module.slot}:${module.name}`),
      intent: cait.intent?.name ?? 'Regent Priority',
    },
    run: {
      floor: snap.floor,
      maxFloor: snap.maxFloor,
      hp: snap.hp,
      maxHp: snap.maxHp,
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
      moduleCaps: {
        user: `${stagedCommands.filter(command => (command.side ?? 'enemy') === 'enemy').length}/${MODULE_SIDE_LIMIT}`,
        cait: `${stagedCommands.filter(command => (command.side ?? 'enemy') === 'self').length}/${MODULE_SIDE_LIMIT}`,
      },
      stagedCommands: stagedCommands.map(command => {
        const card = state.hand.find(c => c.instanceId === command.instanceId);
        return {
          id: card?.id ?? null,
          name: card?.name ?? null,
          target: commandTargetName(command),
          path: card ? speedLabel(card) : null,
          side: (command.side ?? 'enemy') === 'self' ? 'cait' : 'user',
        };
      }),
      battleLog: battleLog.slice(0, 5).map(entry => entry.text),
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

// ──────────────────────────────────────────────────────────
//  Caitdex — Lore Encyclopedia
// ──────────────────────────────────────────────────────────

const CAITDEX_ENTRIES = [
  {
    id: 'void_mother',
    title: 'The Void Mother',
    subtitle: 'Primordial Essence',
    entry: `The Void Mother embodies the primordial essence from which all existence springs and to which it eventually returns. She represents the chaotic potential and unformed matter of the cosmos, shaping galaxies and realities from the boundless expanse of the void itself. Her presence signifies both creation and ultimate dissolution, a cycle fundamental to universal dynamics.`,
    stats: [
      { label: 'Cosmic Influence Radius', value: 'Infinite' },
      { label: 'Manifestation Energy', value: '~10^50 Joules (Conceptual)' },
      { label: 'Epochs of Existence', value: 'Primordial' },
    ],
    structureTitle: 'Cosmic Crystallization',
    structure: `These ethereal crystals suggest the emergence of order and complex structures from the raw chaos of the void. They might represent nascent forms of matter or energy, crystallizing into the foundational elements of a developing universe, potentially even relating to dark matter formation.`,
  },
  {
    id: 'galactic_genesis',
    title: 'Galactic Genesis',
    subtitle: 'Cosmic Birth',
    entry: `This swirling galaxy represents the birth of cosmic structures from the universe's initial state of near uniformity, driven by gravitational attraction of dark matter and hydrogen. It illustrates how gas and dust coalesce over billions of years, forming vast island universes teeming with stars and potential life.`,
    stats: [
      { label: 'Scale', value: 'Galactic' },
      { label: 'Primary Force', value: 'Gravity (Dark Matter)' },
      { label: 'Timescale', value: 'Billions of Years' },
    ],
    structureTitle: 'Spiral Dynamics',
    structure: `The spiral arms of a galaxy are not static structures but density waves — regions where gravitational compression triggers star formation. These waves propagate through the galactic disk, sweeping up gas and dust into fertile stellar nurseries that trace the galaxy's graceful shape across cosmic time.`,
  },
  {
    id: 'primordial_runes',
    title: 'Primordial Runes',
    subtitle: 'Ancient Truths',
    entry: `These ancient, cracked tablets bearing glowing symbols hint at foundational cosmic laws or primordial knowledge. They may represent fragments of universal truths, predating sentient life, or the forgotten wisdom of previous cosmic cycles, akin to Norse runes shaping destiny.`,
    stats: [
      { label: 'Origin', value: 'Pre-Sentient Epoch' },
      { label: 'Medium', value: 'Cracked Stone / Light' },
      { label: 'Knowledge Type', value: 'Universal Law Fragments' },
    ],
    structureTitle: 'Rune-Space Harmonics',
    structure: `Each symbol is not merely a character but a resonant frequency locked into the stone — a frozen instruction in the language of reality itself. When decoded in sequence, these runes describe the invariant laws that persist across cosmic cycles, surviving the death and rebirth of universes.`,
  },
  {
    id: 'quantum_blueprint',
    title: 'Quantum Blueprint',
    subtitle: 'Fundamental Architecture',
    entry: `These intricate geometric patterns symbolize the fundamental quantum mechanics that govern reality at its smallest scales. They represent the energetic blueprints and underlying probabilistic structures emerging from the void, orchestrating the very fabric of spacetime.`,
    stats: [
      { label: 'Scale', value: 'Planck Length (10⁻³⁵ m)' },
      { label: 'Domain', value: 'Quantum Foam / Spacetime Lattice' },
      { label: 'Core Principle', value: 'Probabilistic Emergence' },
    ],
    structureTitle: 'Geometric Phase Locks',
    structure: `The geometries are not decorative — they encode phase relationships between quantum fields that determine whether matter coalesces or disperses. These locking patterns are what differentiate a stable proton from a spray of ephemeral quarks, transforming raw quantum probability into persistent reality.`,
  },
  {
    id: 'omens_of_transformation',
    title: 'Omens of Transformation',
    subtitle: 'Harbingers of Change',
    entry: `The ravens, frequently depicted as messengers between worlds and symbols of prophecy or wisdom, perch upon a fragmented world, symbolizing the cyclical nature of destruction and rebirth. They hint at cosmic foresight and the inevitable changes that reshape universal structures.`,
    stats: [
      { label: 'Symbolism', value: 'Messenger Between Worlds' },
      { label: 'Cycle', value: 'Destruction → Rebirth' },
      { label: 'Domain', value: 'Cosmic Transition States' },
    ],
    structureTitle: 'Void-Space Cartography',
    structure: `Ravens do not merely observe change — they trace the fault lines where reality will fracture next. Their flight paths map the stress topology of spacetime, revealing where the next cycle of creation will break ground. Where a raven perches, the old world ends and the new one begins.`,
  },
];

let caitdexIndex = 0;

function renderCaitdex() {
  const section = el('section', 'caitdex-screen');

  const entry = CAITDEX_ENTRIES[caitdexIndex];
  const entryNum = caitdexIndex + 1;
  const hasPrev = caitdexIndex > 0;
  const hasNext = caitdexIndex < CAITDEX_ENTRIES.length - 1;

  section.innerHTML = `
    <div class="caitdex-header">
      <h1 class="caitdex-title glitch-text" data-text="CAITDEX">CAITDEX</h1>
      <span class="caitdex-entry-count">ENTRY ${String(entryNum).padStart(3, '0')} // ${CAITDEX_ENTRIES.length} TOTAL</span>
    </div>
    <div class="caitdex-entry">
      <div class="caitdex-entry-header">
        <h2 class="caitdex-entry-title">${escapeHtml(entry.title)}</h2>
        <span class="caitdex-entry-subtitle">${escapeHtml(entry.subtitle)}</span>
      </div>
      <div class="caitdex-entry-body">
        <p class="caitdex-entry-text">${entry.entry}</p>
        <div class="caitdex-stats">
          ${entry.stats.map(s => `
            <div class="caitdex-stat">
              <span class="caitdex-stat-label">${escapeHtml(s.label)}</span>
              <span class="caitdex-stat-value">${escapeHtml(s.value)}</span>
            </div>
          `).join('')}
        </div>
        <div class="caitdex-structure">
          <h3 class="caitdex-structure-title">${escapeHtml(entry.structureTitle)}</h3>
          <p class="caitdex-structure-text">${entry.structure}</p>
        </div>
      </div>
    </div>
    <div class="caitdex-nav">
      ${hasPrev ? '<button class="btn caitdex-nav-btn" id="caitdex-prev" type="button">← PREV</button>' : '<button class="btn caitdex-nav-btn" disabled>← PREV</button>'}
      <span class="caitdex-nav-index">${entryNum} / ${CAITDEX_ENTRIES.length}</span>
      ${hasNext ? '<button class="btn caitdex-nav-btn" id="caitdex-next" type="button">NEXT →</button>' : '<button class="btn caitdex-nav-btn" disabled>NEXT →</button>'}
    </div>
    <div class="caitdex-footer">
      <button class="btn btn-primary" id="caitdex-back-btn" type="button">← BACK TO TITLE</button>
    </div>
  `;

  root.appendChild(section);

  setTimeout(() => {
    const backBtn = section.querySelector('#caitdex-back-btn');
    if (backBtn) backBtn.onclick = () => { caitdexIndex = 0; game.setPhase('title'); };
    const prevBtn = section.querySelector('#caitdex-prev');
    if (prevBtn) prevBtn.onclick = () => { caitdexIndex = Math.max(0, caitdexIndex - 1); game.setPhase('caitdex'); };
    const nextBtn = section.querySelector('#caitdex-next');
    if (nextBtn) nextBtn.onclick = () => { caitdexIndex = Math.min(CAITDEX_ENTRIES.length - 1, caitdexIndex + 1); game.setPhase('caitdex'); };
  }, 0);
}

window.render_game_to_text = renderGameToText;
window.game = game;
window.advanceTime = () => {
  render();
};
