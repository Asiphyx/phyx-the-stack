import './index.css';
import { GameState } from './engine/GameState.js';
import { HEROES } from './data/heroes.js';
import { ENEMIES, ENCOUNTERS } from './data/enemies.js';
import { CARDS } from './data/cards.js';
import bus from './engine/EventBus.js';

const cardPool = Object.values(CARDS).filter(c => c.rarity !== 'starter');
const game = new GameState();

const root = document.querySelector('#screen-container');
const damageLayer = document.querySelector('#damage-numbers-layer');
const toastLayer = document.querySelector('#toast-layer');

const enemyCatalogue = buildEnemyCatalogue();
let activeDraft = [];
let selectedTarget = 0;

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
  section.innerHTML = `
    <div class="title-logo">
      <div class="title-subtitle">A Phyxian Roguelike Deckbuilder</div>
      <h1>Phyx the Stack</h1>
      <p class="title-cta">Click to begin</p>
    </div>
    <button class="btn btn-primary" id="start-btn">New Run</button>
    <div class="title-version">v0.1.0 · CaitOS</div>
  `;
  root.appendChild(section);
  section.querySelector('#start-btn').onclick = () => {
    game.state.phase = 'heroSelect';
    game.setPhase('heroSelect');
  };
}

// ──────────────────────────────────────────────────────────
// Hero Select
// ──────────────────────────────────────────────────────────

function renderHeroSelect() {
  const section = el('section', 'hero-select-screen');
  const heading = el('div', 'hero-select-title');
  heading.textContent = 'Choose Your Hero';
  section.appendChild(heading);

  const grid = el('div', 'hero-grid');
  for (const hero of Object.values(HEROES)) {
    const card = el('button', 'hero-card');
    card.type = 'button';
    card.style.setProperty('--hero-color', hero.color);
    card.style.setProperty('--hero-glow', `${hero.color}55`);
    card.innerHTML = `
      <img class="hero-portrait" src="${hero.portrait}" alt="${hero.name}" />
      <div class="hero-name">${hero.name}</div>
      <div class="hero-title-text">${hero.title}</div>
      <div class="hero-passive"><strong>${hero.passive.name}</strong><br/>${hero.passive.description}</div>
      <div class="hero-passive" style="color:var(--neon-gold)"><strong>${hero.ultimate.emoji} ${hero.ultimate.name}</strong><br/>${hero.ultimate.description}</div>
      <div class="hero-hp">${hero.maxHp} HP</div>
    `;
    card.onclick = () => {
      game.selectHero(hero);
      game.startRun(15, cardPool, enemyCatalogue);
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
  const currentNode = game.floors.getCurrentNode();

  const section = el('section', 'map-screen');
  section.innerHTML = `
    <div class="map-title">Floor ${snap.floor} of ${snap.maxFloor} · ${snap.gold} Gold</div>
    <div class="run-stats">
      <div class="run-stat"><div class="run-stat-value">${snap.hp}/${snap.maxHp}</div><div class="run-stat-label">HP</div></div>
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
  root.appendChild(section);
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
  const hero = state.hero;
  const ultReady = snap.ultCharge >= snap.ultMaxCharge;

  const section = el('section', 'combat-screen');

  // ─── HERO PANEL (left side) ───
  const heroPanel = el('div', 'hero-panel');
  heroPanel.style.setProperty('--hero-color', hero?.color ?? '#9933ff');
  heroPanel.innerHTML = `
    <img class="hero-panel-portrait" src="${hero?.portrait ?? ''}" alt="${hero?.name ?? ''}" />
    <div class="hero-panel-name">${hero?.name ?? 'Hero'}</div>
    <div class="hero-panel-title">${hero?.title ?? ''}</div>
    <div class="hero-panel-stats">
      <div class="hero-stat hp-stat">
        <span class="hero-stat-icon">❤️</span>
        <div class="hero-stat-bar">
          <div class="hero-stat-fill ${hpClass(snap.hp, snap.maxHp)}" style="width:${pct(snap.hp, snap.maxHp)}%"></div>
        </div>
        <span class="hero-stat-text">${snap.hp}/${snap.maxHp}</span>
      </div>
      ${snap.block > 0 ? `<div class="hero-stat block-stat"><span class="hero-stat-icon">🛡️</span><span class="hero-stat-text" style="color:var(--neon-cyan)">${snap.block} Block</span></div>` : ''}
      <div class="hero-stat energy-stat">
        <span class="hero-stat-icon">⚡</span>
        <span class="hero-stat-text" style="color:var(--neon-gold)">${snap.energy}/${snap.maxEnergy} Energy</span>
      </div>
    </div>
    <div class="ult-container">
      <div class="ult-bar">
        <div class="ult-fill ${ultReady ? 'ult-ready' : ''}" style="width:${pct(snap.ultCharge, snap.ultMaxCharge)}%"></div>
      </div>
      <button class="ult-btn ${ultReady ? 'ult-btn-ready' : ''}" ${ultReady ? '' : 'disabled'}>
        ${hero?.ultimate?.emoji ?? '💥'} ${hero?.ultimate?.name ?? 'Ultimate'}
      </button>
      <div class="ult-desc">${hero?.ultimate?.description ?? ''}</div>
      <div class="ult-charge-text">${snap.ultCharge}/${snap.ultMaxCharge}</div>
    </div>
    <div class="hero-panel-passive">
      <div class="passive-label">Passive</div>
      <div class="passive-name">${hero?.passive?.name ?? ''}</div>
      <div class="passive-desc">${hero?.passive?.description ?? ''}</div>
    </div>
  `;
  section.appendChild(heroPanel);

  // Ult button handler
  setTimeout(() => {
    const ultBtn = heroPanel.querySelector('.ult-btn');
    if (ultBtn && ultReady) {
      ultBtn.onclick = () => {
        game.useUltimate();
        root.classList.add('screen-shake-big');
        setTimeout(() => root.classList.remove('screen-shake-big'), 500);
      };
    }
  }, 0);

  // ─── MAIN COMBAT AREA ───
  const mainArea = el('div', 'combat-main');

  // Floor info bar
  const topBar = el('div', 'combat-top-bar');
  topBar.innerHTML = `
    <div class="combat-floor-info">Floor ${snap.floor}/${snap.maxFloor}</div>
    <div class="combat-pile-info">
      <span>📥 ${snap.drawPileCount}</span>
      <span>📤 ${snap.discardPileCount}</span>
      <span>🗑️ ${snap.exhaustPileCount}</span>
      <span>💰 ${snap.gold}</span>
    </div>
  `;
  mainArea.appendChild(topBar);

  // ─── ENEMY AREA ───
  const enemyArea = el('div', 'combat-enemy-area');
  for (const [i, enemy] of state.enemies.entries()) {
    const intent = enemy.pattern?.[enemy.patternIndex] ?? { type: 'none', description: '...' };
    const nextIntent = enemy.pattern?.[(enemy.patternIndex + 1) % Math.max(1, enemy.pattern.length)];
    const isSelected = selectedTarget === i;

    const slot = el('div', `enemy-slot ${isSelected ? '' : ''}`);
    slot.innerHTML = `
      <div class="enemy-intent ${intent.type}">
        ${intentIcon(intent.type)} ${intentLabel(intent)}
        ${hero?.id === 'xadnib' && nextIntent ? `<span class="intent-next">→ ${intentLabel(nextIntent)}</span>` : ''}
      </div>
      <div class="enemy-body ${isSelected ? 'targeted' : ''}" data-enemy="${i}">
        ${enemy.block > 0 ? `<div class="enemy-block-badge">${enemy.block}</div>` : ''}
        <div class="enemy-emoji">${enemy.emoji ?? '👾'}</div>
        <div class="enemy-name">${enemy.name}</div>
        <div class="enemy-hp-bar"><div class="enemy-hp-fill" style="width:${pct(enemy.hp, enemy.maxHp)}%"></div></div>
        <div class="enemy-hp-text">${enemy.hp} / ${enemy.maxHp}</div>
      </div>
    `;
    slot.querySelector('.enemy-body').onclick = () => { selectedTarget = i; render(); };
    enemyArea.appendChild(slot);
  }
  mainArea.appendChild(enemyArea);

  // ─── ACTION BAR ───
  const actionBar = el('div', 'combat-action-bar');
  actionBar.innerHTML = `<button class="btn btn-end-turn" id="end-turn-btn">End Turn</button>`;
  mainArea.appendChild(actionBar);

  // ─── HAND ───
  const handArea = el('div', 'combat-hand-area');
  for (const [i, card] of state.hand.entries()) {
    const cost = game.combat.getCardCost(card);
    const canPlay = cost <= state.energy && state.hp > 0;
    handArea.appendChild(renderCard(card, i, canPlay));
  }
  mainArea.appendChild(handArea);

  section.appendChild(mainArea);
  root.appendChild(section);

  // Wire end turn
  section.querySelector('#end-turn-btn').onclick = () => {
    if (state.hp <= 0) return;
    game.combat.endPlayerTurn();
  };
}

function renderCard(card, index, canPlay) {
  const cost = game.combat.getCardCost(card);
  const cardEl = el('button', `game-card ${canPlay ? '' : 'unplayable'}`);
  cardEl.type = 'button';
  cardEl.dataset.rarity = card.rarity ?? 'common';
  cardEl.dataset.type = card.type ?? 'skill';
  cardEl.disabled = !canPlay;
  cardEl.innerHTML = `
    <div class="card-header">
      <div class="card-name">${card.name ?? '?'}</div>
      <div class="card-cost">${cost}</div>
    </div>
    <div class="card-emoji">${card.emoji ?? '🧪'}</div>
    <div class="card-description">${card.description ?? ''}</div>
    <div class="card-flavor">${card.flavor ?? ''}</div>
    <div class="card-type-badge">${card.type ?? 'skill'}</div>
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
      <div class="draft-title">REFACTORING TERMINAL</div>
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
      <div class="draft-title">DEPRECATE: SELECT SOURCE LINE</div>
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
      <div class="draft-title">REFACTOR: UPGRADE DEPENDENCY</div>
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
      <div class="draft-title">COMPILE FEATURE: SELECT FEATURE</div>
      <div class="text-small" style="color:var(--text-secondary); margin-bottom: 20px;">Select a new library feature to add to your stack.</div>
      <div class="draft-cards"></div>
      <button class="btn" id="cancel-refactor" style="margin-top: 20px;">Cancel</button>
    `;

    setTimeout(() => {
      const list = section.querySelector('.draft-cards');
      for (const [i, card] of draft.offeredCards.entries()) {
        const wrap = el('button', 'draft-card-wrapper');
        wrap.type = 'button';
        const cardEl = renderCard(card, i, true);
        wrap.appendChild(cardEl);
        wrap.onclick = () => {
          draft.pickCard(i);
          render();
        };
        list.appendChild(wrap);
      }
      section.querySelector('#cancel-refactor').onclick = () => {
        draft.generateDraft(game.state.cardPool);
        render();
      };
    }, 0);
  }

  root.appendChild(section);
}

// ──────────────────────────────────────────────────────────
// End States
// ──────────────────────────────────────────────────────────

function renderGameOver() {
  const snap = game.getSnapshot();
  const section = el('section', 'gameover-screen');
  section.innerHTML = `
    <div class="gameover-title">Stack Overflow</div>
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
    <div class="victory-title">Stack Phyxed</div>
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
// Damage & Toast FX
// ──────────────────────────────────────────────────────────

function onDamageEvent(event) {
  const isPlayer = event.target === 'player';
  const value = Math.round(event.amount ?? 0);
  if (value <= 0) return;
  let x = window.innerWidth / 2, y = window.innerHeight / 2;

  if (isPlayer) {
    const hp = root.querySelector('.hero-panel-portrait');
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

function pct(cur, max) { return Math.max(1, Math.min(100, (cur / Math.max(1, max)) * 100)); }

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
