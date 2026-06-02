import './index.css';
import { GameState } from './engine/GameState.js';
import { HEROES } from './data/heroes.js';
import { ENEMIES, ENCOUNTERS } from './data/enemies.js';
import { CARDS } from './data/cards.js';
import bus from './engine/EventBus.js';

const cardPool = Object.values(CARDS);
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
bus.on('enemyAction', () => {
  root.classList.add('screen-shake');
  setTimeout(() => root.classList.remove('screen-shake'), 300);
});

render();

function render() {
  const snapshot = game.getSnapshot();
  root.innerHTML = '';

  switch (snapshot.phase) {
    case 'title':
      renderTitle();
      return;
    case 'heroSelect':
      renderHeroSelect();
      return;
    case 'map':
      renderMap();
      return;
    case 'combat':
      renderCombat();
      return;
    case 'draft':
      renderDraft();
      return;
    case 'gameOver':
      renderGameOver();
      return;
    case 'victory':
      renderVictory();
      return;
    default:
      renderTitle();
  }
}

// ──────────────────────────────────────────────────────────
// Title
// ──────────────────────────────────────────────────────────

function renderTitle() {
  const title = document.createElement('section');
  title.className = 'title-screen';
  title.innerHTML = `
    <div class="title-logo">
      <div class="title-subtitle">Phyxian / Phyx the Stack</div>
      <h1>Phyx the Stack</h1>
      <p class="title-cta">A dev roguelike: fix bugs, clear the board, craft better drafts</p>
    </div>
    <button class="btn btn-primary" id="start-btn">Start New Run</button>
  `;
  root.appendChild(title);

  title.querySelector('#start-btn').addEventListener('click', () => {
    game.state.phase = 'heroSelect';
    game.setPhase('heroSelect');
  });
}

// ──────────────────────────────────────────────────────────
// Hero select
// ──────────────────────────────────────────────────────────

function renderHeroSelect() {
  const section = document.createElement('section');
  section.className = 'hero-select-screen';

  const heading = document.createElement('div');
  heading.className = 'hero-select-title';
  heading.textContent = 'Choose your hero';
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'hero-grid';

  for (const hero of Object.values(HEROES)) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'hero-card';
    card.style.setProperty('--hero-color', hero.color);
    card.style.setProperty('--hero-glow', `${hero.color}55`);
    card.innerHTML = `
      <img class="hero-portrait" src="${hero.portrait}" alt="${hero.name}" />
      <div class="hero-name">${hero.name}</div>
      <div class="hero-title-text">${hero.title}</div>
      <div class="hero-passive"><strong>${hero.passive.name}</strong><br/>${hero.passive.description}</div>
      <div class="hero-hp">${hero.maxHp} HP</div>
      <div class="text-small">${hero.signatureCardId ? `Signature: ${CARDS[hero.signatureCardId]?.name ?? 'None'}` : ''}</div>
    `;
    card.addEventListener('click', () => {
      game.selectHero(hero);
      game.startRun(15, cardPool, enemyCatalogue);
      render();
    });
    grid.appendChild(card);
  }

  section.appendChild(grid);
  root.appendChild(section);
}

// ──────────────────────────────────────────────────────────
// Map / floor flow
// ──────────────────────────────────────────────────────────

function renderMap() {
  const snapshot = game.getSnapshot();
  const currentNode = game.floors.getCurrentNode();
  const state = game.state;

  const section = document.createElement('section');
  section.className = 'map-screen';
  section.innerHTML = `
    <div class="map-title">Run Floor ${snapshot.floor} of ${snapshot.maxFloor} · Gold: ${snapshot.gold}</div>
    <div class="run-stats">
      <div class="run-stat"><div class="run-stat-value">${snapshot.hp}/${snapshot.maxHp}</div><div class="run-stat-label">HP</div></div>
      <div class="run-stat"><div class="run-stat-value">${state.deck.length}</div><div class="run-stat-label">Deck</div></div>
      <div class="run-stat"><div class="run-stat-value">${state.cardPlayCounts ? Object.keys(state.cardPlayCounts).length : 0}</div><div class="run-stat-label">Cards Tracked</div></div>
      <div class="run-stat"><div class="run-stat-value">${snapshot.floor - 1}</div><div class="run-stat-label">Floors Cleared</div></div>
    </div>
    <div class="map-nodes"></div>
  `;

  const nodes = section.querySelector('.map-nodes');
  const map = game.floors.map ?? [];
  for (const node of map) {
    const nodeType = labelForNodeType(node.type);
    const isCurrent = node.floor === snapshot.floor;
    const isCompleted = node.floor < snapshot.floor;
    const nodeBtn = document.createElement('button');
    nodeBtn.type = 'button';
    nodeBtn.className = `map-node ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''}`;
    nodeBtn.innerHTML = `
      <div class="map-node-icon">${nodeType.icon}</div>
      <div class="map-node-label">Floor ${node.floor}</div>
      <div class="map-node-type">${nodeType.label}</div>
    `;
    if (!isCurrent && !isCompleted) {
      nodeBtn.disabled = true;
    }
    if (isCurrent && !isCompleted) {
      nodeBtn.addEventListener('click', () => handleMapNode(node));
    }
    nodes.appendChild(nodeBtn);
  }

  if (currentNode) {
    const actions = document.createElement('div');
    actions.style.marginTop = 'var(--space-lg)';
    if (currentNode.type === 'combat' || currentNode.type === 'elite' || currentNode.type === 'boss') {
      actions.appendChild(buttonEl('Enter Encounter', 'btn btn-primary', () => game.enterFloor(enemyCatalogue, cardPool)));
    } else if (currentNode.type === 'rest') {
      actions.appendChild(buttonEl('Take a Rest (+30% HP)', 'btn', () => {
        game.floors.rest();
      }));
      actions.appendChild(buttonEl('Push Forward', 'btn btn-primary', () => {
        game.advanceFloor();
      }));
    } else if (currentNode.type === 'shop') {
      actions.appendChild(buttonEl('Grab random common card +', 'btn', () => buyShopCard('common')));
      actions.appendChild(buttonEl('Skip shop', 'btn btn-primary', () => {
        game.advanceFloor();
      }));
    }
    section.appendChild(actions);
  }

  root.appendChild(section);
}

function handleMapNode(node) {
  if (node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
    game.enterFloor(enemyCatalogue, cardPool);
  } else if (node.type === 'rest') {
    game.floors.rest();
  } else if (node.type === 'shop') {
    game.advanceFloor();
  }
}

function buyShopCard(rarity = 'common') {
  const state = game.state;
  const candidates = (state.cardPool ?? []).filter(c => c.rarity === rarity);
  if (candidates.length === 0) {
    emitToast('Shop is out of stock for that tier.', 'danger');
    game.advanceFloor();
    return;
  }
  const card = candidates[Math.floor(Math.random() * candidates.length)];
  state.deck.push({ ...card, instanceId: `${card.id}_shop_${Date.now()}_${Math.random().toString(36).slice(2, 5)}` });
  emitToast(`Shop added ${card.name}`, 'info');
  game.advanceFloor();
}

// ──────────────────────────────────────────────────────────
// Combat
// ──────────────────────────────────────────────────────────

function renderCombat() {
  const snapshot = game.getSnapshot();
  const state = game.state;
  const section = document.createElement('section');
  section.className = 'combat-screen';

  const hero = state.hero;
  const combatHeroesHint = hero?.id === 'xadnib' ? ' · Xadnib sees the next 2 intents' : '';
  const paradoxHint = hero?.id === 'paradox' ? ` · Backwards chain x${snapshot.paradoxChain ?? 0}` : '';
  section.innerHTML = `
    <div class="combat-top-bar">
      <div class="combat-floor-info">${hero?.name ?? 'Hero'} · Floor ${snapshot.floor}/${snapshot.maxFloor}${combatHeroesHint}${paradoxHint}</div>
      <div class="combat-player-stats">
        <div class="stat-badge hp">
          <span class="stat-icon">❤</span>
          <span>${snapshot.hp}</span>/<span>${snapshot.maxHp}</span>
        </div>
        <div class="stat-badge block">
          <span class="stat-icon">▦</span>
          <span>${snapshot.block}</span>
        </div>
        <div class="stat-badge energy">
          <span class="stat-icon">⚡</span>
          <span>${snapshot.energy}</span>/<span>${snapshot.maxEnergy}</span>
        </div>
      </div>
      <div class="player-hp-bar-container">
        <div class="player-hp-bar">
          <div class="player-hp-fill ${hpClass(snapshot.hp, snapshot.maxHp)}" style="width: ${Math.max(1, (snapshot.hp / snapshot.maxHp) * 100)}%"></div>
        </div>
      </div>
    </div>

    <div class="combat-enemy-area"></div>
    <div class="combat-action-bar">
      <div class="combat-pile-info">Draw: ${snapshot.drawPileCount} · Discard: ${snapshot.discardPileCount} · Exhaust: ${snapshot.exhaustPileCount} · Gold: ${snapshot.gold}</div>
      <button class="btn btn-end-turn" id="end-turn-btn">End Turn</button>
    </div>
    <div class="combat-hand-area"></div>
  `;

  const enemiesArea = section.querySelector('.combat-enemy-area');
  for (const [i, enemy] of state.enemies.entries()) {
    const intent = enemy.pattern?.[enemy.patternIndex] ?? { type: 'none', description: 'Waiting' };
    const nextIntent = enemy.pattern?.[(enemy.patternIndex + 1) % Math.max(1, enemy.pattern.length)];
    const secondText = hero?.id === 'xadnib' && nextIntent
      ? ` / then ${intentLabel(nextIntent)}`
      : '';

    const enemyCard = document.createElement('div');
    enemyCard.className = `enemy-slot ${selectedTarget === i ? 'targeted' : ''}`;
    enemyCard.innerHTML = `
      <div class="enemy-body" data-enemy="${i}">
        <div class="enemy-emoji">${enemy.emoji ?? '👾'}</div>
        <div class="enemy-name">${enemy.name}</div>
        <div class="enemy-hp-text">${enemy.hp}/${enemy.maxHp}</div>
        <div class="enemy-hp-bar"><div class="enemy-hp-fill" style="width:${Math.max(1, (enemy.hp / enemy.maxHp) * 100)}%"></div></div>
      </div>
      <div class="enemy-intent attack">
        <span>▶</span><span>${intentLabel(intent)}${secondText}</span>
      </div>
    `;
    enemyCard.querySelector('.enemy-body').addEventListener('click', () => {
      selectedTarget = i;
      render();
    });
    const body = enemyCard.querySelector('.enemy-body');
    body.setAttribute('data-enemy-id', enemy.id);
    body.style.position = 'relative';
    const hpEl = body.querySelector('.enemy-hp-text');
    if (enemy.block > 0) {
      const badge = document.createElement('div');
      badge.className = 'enemy-block-badge';
      badge.textContent = enemy.block;
      body.appendChild(badge);
    }
    enemiesArea.appendChild(enemyCard);
  }

  const handArea = section.querySelector('.combat-hand-area');
  for (const [i, card] of state.hand.entries()) {
    const cost = game.combat.getCardCost(card);
    const canPlay = card && cost <= state.energy && state.hp > 0;
    const cardEl = renderCard(card, i, canPlay);
    cardEl.classList.toggle('unplayable', !canPlay);
    handArea.appendChild(cardEl);
  }

  section.querySelector('#end-turn-btn').addEventListener('click', () => {
    if (state.hp <= 0) return;
    game.combat.endPlayerTurn();
  });

  root.appendChild(section);
}

function renderCard(card, index, canPlay) {
  const el = document.createElement('button');
  el.className = 'game-card';
  el.type = 'button';
  el.dataset.rarity = card.rarity ?? 'common';
  el.dataset.type = card.type ?? 'skill';
  el.disabled = !canPlay;
  el.innerHTML = `
    <div class="card-header">
      <div class="card-name">${card.name ?? 'Unnamed Card'}</div>
      <div class="card-cost">${game.combat.getCardCost(card)}</div>
    </div>
    <div class="card-emoji">${card.emoji ?? '🧪'}</div>
    <div class="card-description">${card.description ?? ''}</div>
    <div class="card-flavor">${card.flavor ?? ''}</div>
    <div class="card-type-badge">${card.type ?? 'skill'}</div>
  `;
  el.addEventListener('click', () => {
    const target = selectedTarget ?? 0;
    game.combat.playCard(index, target);
  });
  return el;
}

// ──────────────────────────────────────────────────────────
// Draft phase
// ──────────────────────────────────────────────────────────

function renderDraft() {
  const state = game.getSnapshot();
  const section = document.createElement('section');
  section.className = 'draft-screen';

  section.innerHTML = `
    <div class="draft-title">Draft: choose one card</div>
    <div class="draft-title text-small">Current gold: ${state.gold}</div>
    <div class="draft-cards"></div>
    <div style="display:flex;gap:12px;justify-content:center">
      <button class="btn" id="skip-draft">Skip</button>
    </div>
  `;

  const list = section.querySelector('.draft-cards');
  if (activeDraft.length === 0) {
    activeDraft = activeDraftFallback();
  }
  for (const [i, card] of activeDraft.entries()) {
    const wrap = document.createElement('button');
    wrap.type = 'button';
    wrap.className = 'draft-card-wrapper';
    const cardEl = document.createElement('div');
    cardEl.className = 'game-card';
    cardEl.dataset.rarity = card.rarity ?? 'common';
    cardEl.dataset.type = card.type ?? 'skill';
    cardEl.innerHTML = `
      <div class="card-header"><div class="card-name">${card.name ?? ''}</div><div class="card-cost">${card.cost ?? 0}</div></div>
      <div class="card-emoji">${card.emoji ?? '🧪'}</div>
      <div class="card-description">${card.description ?? ''}</div>
      <div class="card-flavor">${card.flavor ?? ''}</div>
    `;
    wrap.appendChild(cardEl);
    wrap.addEventListener('click', () => {
      game.draft.pickCard(i);
      activeDraft = [];
    });
    list.appendChild(wrap);
  }

  section.querySelector('#skip-draft').addEventListener('click', () => {
    game.draft.skip();
    activeDraft = [];
  });

  root.appendChild(section);
}

function activeDraftFallback() {
  const state = game.state;
  return (state.cardPool ?? cardPool)
    .filter(c => !state.deck.some(d => c.id === d.id && d.unique))
    .slice(0, 3);
}

// ──────────────────────────────────────────────────────────
// End states
// ──────────────────────────────────────────────────────────

function renderGameOver() {
  const section = document.createElement('section');
  section.className = 'gameover-screen';
  section.innerHTML = `
    <div class="gameover-title">Run failed</div>
    <div class="run-stats">
      <div class="run-stat"><div class="run-stat-value">${game.getSnapshot().floor}</div><div class="run-stat-label">Floor reached</div></div>
      <div class="run-stat"><div class="run-stat-value">${game.getSnapshot().gold}</div><div class="run-stat-label">Gold</div></div>
      <div class="run-stat"><div class="run-stat-value">${game.state.deck.length}</div><div class="run-stat-label">Cards in deck</div></div>
      <div class="run-stat"><div class="run-stat-value">${game.state.maxFloor}</div><div class="run-stat-label">Target floor</div></div>
    </div>
    <button class="btn btn-primary" id="reset-btn">Return to Title</button>
  `;
  section.querySelector('#reset-btn').addEventListener('click', () => {
    game.reset();
  });
  root.appendChild(section);
}

function renderVictory() {
  const section = document.createElement('section');
  section.className = 'victory-screen';
  const state = game.getSnapshot();
  section.innerHTML = `
    <div class="victory-title">A victory loop in the stack</div>
    <div class="run-stats">
      <div class="run-stat"><div class="run-stat-value">${state.floor}</div><div class="run-stat-label">Cleared Floors</div></div>
      <div class="run-stat"><div class="run-stat-value">${state.gold}</div><div class="run-stat-label">Gold</div></div>
      <div class="run-stat"><div class="run-stat-value">${game.state.maxFloor}</div><div class="run-stat-label">Target</div></div>
      <div class="run-stat"><div class="run-stat-value">${game.state.deck.length}</div><div class="run-stat-label">Final Deck</div></div>
    </div>
    <button class="btn btn-primary" id="reset-btn">Main Menu</button>
  `;
  section.querySelector('#reset-btn').addEventListener('click', () => {
    game.reset();
  });
  root.appendChild(section);
}

// ──────────────────────────────────────────────────────────
// Combat/visual effects
// ──────────────────────────────────────────────────────────

function onDamageEvent(event) {
  const isPlayer = event.target === 'player';
  const sign = isPlayer ? '-' : '-';
  const value = Math.round(event.amount ?? 0);
  const label = `${sign}${value}`;
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;

  if (isPlayer) {
    const hpEl = root.querySelector('.combat-player-stats');
    if (hpEl) {
      const rect = hpEl.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top;
    }
  } else {
    const enemyEl = root.querySelector(`[data-enemy-id="${event.targetId}"]`);
    if (enemyEl) {
      const rect = enemyEl.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top;
    }
  }

  const num = document.createElement('div');
  num.className = `damage-number ${isPlayer ? 'block' : 'damage'}`;
  num.textContent = label;
  num.style.left = `${x}px`;
  num.style.top = `${y}px`;
  damageLayer.appendChild(num);
  setTimeout(() => num.remove(), 1100);
}

function emitToast(text, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = text;
  toastLayer.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function intentLabel(intent) {
  if (!intent) return 'Waiting';
  if (intent.description) return intent.description;
  switch (intent.type) {
    case 'attack':
      return `Attack ${intent.value}`;
    case 'attackAll':
      return `Affects all for ${intent.value}`;
    case 'block':
      return `Block +${intent.value}`;
    case 'buff':
      return `Buff +${intent.value ?? 0}`;
    case 'debuff':
      return `Debuff ${intent.value ? `-${intent.value}` : ''}`;
    case 'summon':
      return 'Summon';
    default:
      return intent.type;
  }
}

function hpClass(cur, max) {
  const ratio = (cur / Math.max(1, max));
  if (ratio <= 0.35) return 'critical';
  if (ratio <= 0.7) return 'hurt';
  return 'healthy';
}

function labelForNodeType(type) {
  if (type === 'combat') return { label: 'Combat', icon: '⚔' };
  if (type === 'elite') return { label: 'Elite', icon: '🩸' };
  if (type === 'boss') return { label: 'Boss', icon: '👑' };
  if (type === 'rest') return { label: 'Rest', icon: '🛌' };
  return { label: 'Shop', icon: '🛒' };
}

function buttonEl(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function buildEnemyCatalogue() {
  const normalIds = new Set([
    ...ENCOUNTERS.easy.flat(),
    ...ENCOUNTERS.medium.flat(),
    ...ENCOUNTERS.hard.flat(),
  ]);
  const eliteIds = new Set(['tech_debt', 'race_condition']);
  const bossIds = ['production_outage', 'legacy_codebase', 'the_product_manager'];

  const normal = [...normalIds].map(id => ENEMIES[id]).filter(Boolean);
  const elite = [...eliteIds].map(id => ENEMIES[id]).filter(Boolean);
  const boss = bossIds.map(id => ENEMIES[id]).filter(Boolean);

  return { normal, elite, boss };
}
