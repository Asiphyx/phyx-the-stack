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
      <h1 class="glitch-text" data-text="Phyx the Stack">Phyx the Stack</h1>
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
  const heading = el('div', 'hero-select-title glitch-text');
  heading.dataset.text = 'CHOOSE YOUR HERO';
  heading.textContent = 'CHOOSE YOUR HERO';
  section.appendChild(heading);

  const grid = el('div', 'hero-grid');
  for (const hero of Object.values(HEROES)) {
    const card = el('button', 'hero-card');
    const avatarSrc = hero.avatar ?? hero.portrait;
    card.type = 'button';
    card.style.setProperty('--hero-color', hero.color);
    card.style.setProperty('--hero-glow', `${hero.color}55`);
    card.innerHTML = `
      <img class="hero-portrait" src="${avatarSrc}" alt="${hero.name}" />
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
  const heroAvatar = hero?.avatar ?? hero?.portrait ?? '';
  const heroBattlePortrait = hero?.battlePortrait ?? heroAvatar;
  const ultReady = snap.ultCharge >= snap.ultMaxCharge;

  const section = el('section', 'combat-screen');

  // ─── 1. TOP STATS BAR ───
  const topBar = el('div', 'combat-top-bar');
  topBar.style.setProperty('--hero-color', hero?.color ?? '#9933ff');
  topBar.innerHTML = `
    <div class="combat-top-hero-identity">
      <span class="combat-top-hero-name glitch-text" data-text="${hero?.name ?? 'HERO'}">${hero?.name ?? 'HERO'}</span>
      <span class="combat-top-hero-title">${hero?.title ?? ''}</span>
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
      <div class="hero-sprite-stats">
        ${snap.block > 0 ? `<div class="hero-battle-block">🛡️ ${snap.block}</div>` : ''}
      </div>
    </div>
  `;
  battlefield.appendChild(heroSpriteContainer);

  // Right Side: Enemy Area
  const enemyArea = el('div', 'combat-enemy-area');
  for (const [i, enemy] of state.enemies.entries()) {
    const intent = enemy.pattern?.[enemy.patternIndex] ?? { type: 'none', description: '...' };
    const nextIntent = enemy.pattern?.[(enemy.patternIndex + 1) % Math.max(1, enemy.pattern.length)];
    const isSelected = selectedTarget === i;

    const slot = el('div', `enemy-slot type-${enemy.type || 'normal'} enemy-${enemy.id}`);
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
  battlefield.appendChild(enemyArea);
  section.appendChild(battlefield);

  // ─── 3. BOTTOM PANEL (DASHBOARD CONSOLE) ───
  const bottomDashboard = el('div', 'combat-bottom-dashboard');
  
  // Bottom Left: Hero Portrait Console
  const heroPortraitConsole = el('div', 'hero-portrait-console');
  heroPortraitConsole.style.setProperty('--hero-color', hero?.color ?? '#9933ff');
  heroPortraitConsole.innerHTML = `
    <div class="console-portrait-frame">
      <img class="console-portrait-image" src="${heroAvatar}" alt="${hero?.name ?? ''}" />
      <div class="console-portrait-glitch"></div>
    </div>
    <div class="console-hero-details">
      <div class="console-hero-header">
        <div class="console-hero-name">${hero?.name ?? 'Hero'}</div>
        <div class="console-hero-passive-label">PASSIVE: ${hero?.passive?.name ?? ''}</div>
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
  const handArea = el('div', 'combat-hand-area');
  for (const [i, card] of state.hand.entries()) {
    const cost = game.combat.getCardCost(card);
    const canPlay = cost <= state.energy && state.hp > 0;
    handArea.appendChild(renderCard(card, i, canPlay));
  }
  bottomDashboard.appendChild(handArea);

  // Bottom Right: Deck & Control Console
  const deckControlConsole = el('div', 'deck-control-console');
  deckControlConsole.innerHTML = `
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

  root.appendChild(section);

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
