// ============================================================
// GameState.js — Core state machine & central orchestrator
// ============================================================
// Single source of truth for the entire game.
//
// Phase flow:
//   TITLE → HERO_SELECT → MAP → COMBAT → DRAFT → MAP → … → VICTORY
//                                                    ↘ GAME_OVER
//
// The subsystems (Combat, DraftSystem, FloorManager) receive a
// reference to this GameState so they can read/write the shared
// state object and call setPhase() to drive transitions.
// ============================================================

import bus from './EventBus.js';
import { Combat } from './Combat.js';
import { DraftSystem } from './DraftSystem.js';
import { FloorManager, NODE_TYPE } from './FloorManager.js';
import { CARDS } from '../data/cards.js';
import { buildCaitCompanion } from '../data/caitModules.js';

const SAVE_VERSION = 1;

// ── Valid phases ─────────────────────────────────────────────
export const PHASES = Object.freeze([
  'title',
  'caitdex',
  'heroSelect',
  'map',
  'combat',
  'draft',
  'gameOver',
  'victory',
]);

const DIRECT_DAMAGE_EFFECTS = new Set([
  'damage',
  'damageAll',
  'damage_equal_to_block',
  'damage_per_removed_card',
  'damageAllEqualBlock',
]);

function isDirectDamageCard(card) {
  return card?.type === 'attack' || (card?.effects ?? []).some(effect => DIRECT_DAMAGE_EFFECTS.has(effect.type));
}

function isCardAllowedForHero(card, heroId) {
  if (!card) return false;
  if (card.heroOnly && card.heroOnly !== heroId) return false;
  if (heroId === 'asiphyx' && isDirectDamageCard(card)) return false;
  return true;
}

// ── Default state factory ───────────────────────────────────

function createDefaultState() {
  return {
    // Phase
    phase: 'title',

    // Hero
    hero: null,
    cait: null,

    // Player vitals
    hp: 0,
    maxHp: 0,
    block: 0,

    // Energy
    energy: 3,
    maxEnergy: 3,

    // Module piles. Historical property names stay card/deck-shaped for save compatibility.
    deck: [],         // master module list — persists across combats
    drawPile: [],     // shuffled into the active stack at combat start
    discardPile: [],
    hand: [],
    exhaustPile: [],  // removed for THIS combat only

    // Progression
    floor: 1,
    maxFloor: 15,

    // Enemies (populated during combat)
    enemies: [],

    // Economy
    gold: 0,

    // Ultimate ability
    ultCharge: 0,
    ultMaxCharge: 5,

    // Run configuration
    cardPool: [],
    enemyCatalogue: null,

    // Analytics for run-level passives
    cardPlayCounts: {},
  };
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

// ── GameState class ─────────────────────────────────────────

export class GameState {
  constructor() {
    /** The mutable game state object. */
    this.state = createDefaultState();

    /** Sub-systems — they hold a back-reference to `this`. */
    this.combat = new Combat(this);
    this.draft = new DraftSystem(this);
    this.floors = new FloorManager(this);
  }

  // ──────────────────────────────────────────────────────────
  //  Phase management
  // ──────────────────────────────────────────────────────────

  /**
   * Transition to a new phase.
   * Emits 'stateChange' so the UI can react.
   * @param {string} newPhase — must be one of PHASES
   */
  setPhase(newPhase) {
    if (!PHASES.includes(newPhase)) {
      console.error(`[GameState] Invalid phase: "${newPhase}"`);
      return;
    }
    const prev = this.state.phase;
    this.state.phase = newPhase;
    bus.emit('stateChange', { from: prev, to: newPhase, state: this.getSnapshot() });
  }

  /**
   * @returns {string} current phase
   */
  getPhase() {
    return this.state.phase;
  }

  // ──────────────────────────────────────────────────────────
  //  Game lifecycle
  // ──────────────────────────────────────────────────────────

  /**
   * Select a hero and initialise their starting stats + deck.
   * @param {object} heroDef — { id, name, maxHp, startingDeck: [] }
   */
  selectHero(heroDef) {
    const s = this.state;
    s.hero = heroDef;
    s.cait = buildCaitCompanion(heroDef.id);
    s.hp = heroDef.maxHp;
    s.maxHp = heroDef.maxHp;
    s.gold = 0;
    s.floor = 1;
    s.block = 0;
    s.ultCharge = 0;
    s.ultMaxCharge = heroDef.ultimate?.chargeCost ?? 5;
    s.cardPlayCounts = {};
    s.cardPool = [];
    s.enemyCatalogue = null;

    // Deep-copy the starter stack so each module has its own identity.
    // Definitions still use card IDs internally for compatibility.
    s.deck = (heroDef.startingDeck ?? [])
      .map((cardId, i) => {
        const card = CARDS[cardId];
        if (!card) {
          console.warn(`[GameState] Unknown starting card id "${cardId}" in ${heroDef.id}`);
          return null;
        }
        return {
          ...card,
          instanceId: `${card.id}_start_${i}`,
          _source: cardId,
        };
      })
      .filter(Boolean);

    // Add technical debt modules to bloat starting stack.
    const debtCards = ['spaghetti_code', 'deprecated_api', 'merge_conflict', 'memory_leak']
      .filter(debtId => isCardAllowedForHero(CARDS[debtId], heroDef.id));
    debtCards.forEach((debtId, i) => {
      const card = CARDS[debtId];
      if (card) {
        s.deck.push({
          ...card,
          instanceId: `${card.id}_debt_${i}`,
          _source: debtId,
        });
      }
    });

    // reset combat piles
    s.drawPile = [];
    s.discardPile = [];
    s.hand = [];
    s.exhaustPile = [];
    s.energy = s.maxEnergy;

    this.setPhase('heroSelect'); // confirm selection
  }

  /**
   * Start a new run after hero selection.
   * Generates the map and transitions to the map phase.
   * Also stores run resources so combat + draft can pull from stable pools.
   * @param {number} [totalFloors=15]
   * @param {object[]} [cardPool=[]]
   * @param {{ normal: object[], elite: object[], boss: object[] }} [enemyCatalogue=null]
   */
  startRun(totalFloors = 15, cardPool = [], enemyCatalogue = null) {
    const s = this.state;
    const heroId = s.hero?.id ?? null;
    s.cardPool = cardPool.filter(card => isCardAllowedForHero(card, heroId));
    s.enemyCatalogue = enemyCatalogue;
    s.cardPlayCounts = {};
    s.floor = 1;
    s.gold = 0;
    s.drawPile = [];
    s.discardPile = [];
    s.hand = [];
    s.exhaustPile = [];
    this.floors.generateMap(totalFloors);
    this.setPhase('map');
  }

  /**
   * Record card play count across the current run.
   * Used for Codex-style repeat-bonus mechanics.
   * @param {string} cardId
   */
  recordCardPlay(cardId) {
    const s = this.state;
    s.cardPlayCounts[cardId] = (s.cardPlayCounts[cardId] ?? 0) + 1;
  }

  /**
   * Get raw card def by ID.
   * @param {string} cardId
   * @returns {object|null}
   */
  getCardDefinition(cardId) {
    return CARDS[cardId] ?? null;
  }

  /**
   * Advance to next floor without side effects (used for rest / shop / draft transitions).
   */
  advanceFloor() {
    this.state.floor += 1;
    this.setPhase('map');
  }

  /**
   * Enter the current floor's encounter.
   * Reads the map node and either starts combat, offers rest, etc.
   * @param {object} catalogue — enemy catalogue { normal, elite, boss }
   * @param {object} [cardPool] — for draft + shop fallback
   */
  enterFloor(catalogue, cardPool) {
    const node = this.floors.getCurrentNode();
    if (!node) {
      console.error('[GameState] No map node for floor', this.state.floor);
      return;
    }

    switch (node.type) {
      case NODE_TYPE.COMBAT:
      case NODE_TYPE.ELITE:
      case NODE_TYPE.BOSS: {
        const effectiveCatalogue = catalogue ?? this.state.enemyCatalogue;
        const activeCardPool = cardPool ?? this.state.cardPool;
        if (!effectiveCatalogue) {
          console.error('[GameState] Missing enemy catalogue for this run');
          return;
        }
        const heroId = this.state.hero?.id ?? null;
        this.state.cardPool = activeCardPool.filter(card => isCardAllowedForHero(card, heroId));
        const enemies = this.floors.generateEncounter(effectiveCatalogue);
        this.combat.startCombat(enemies);
        break;
      }
      case NODE_TYPE.REST:
      case NODE_TYPE.SHOP: {
        this.setPhase('map');
        break;
      }
      default:
        console.warn(`[GameState] Unhandled node type: "${node.type}"`);
    }
  }

  /**
   * Start the draft after combat ends.
   * @param {object[]} cardPool — full reward module pool
   */
  startDraft(cardPool) {
    const heroId = this.state.hero?.id ?? null;
    this.draft.generateDraft((cardPool ?? this.state.cardPool).filter(card => isCardAllowedForHero(card, heroId)));
  }

  /**
   * Reset everything back to the title screen.
   */
  reset() {
    this.state = createDefaultState();
    this.combat = new Combat(this);
    this.draft = new DraftSystem(this);
    this.floors = new FloorManager(this);
    this.setPhase('title');
  }

  // ──────────────────────────────────────────────────────────
  //  Save states
  // ──────────────────────────────────────────────────────────

  createSaveState(label = '') {
    return {
      version: SAVE_VERSION,
      label,
      savedAt: new Date().toISOString(),
      state: cloneData(this.state),
      floorMap: cloneData(this.floors.map ?? []),
      combatState: this.combat.exportState(),
      draftState: this.draft.exportState(),
    };
  }

  restoreSaveState(saveState) {
    if (!saveState || saveState.version !== SAVE_VERSION || !saveState.state) {
      return false;
    }

    const restored = {
      ...createDefaultState(),
      ...cloneData(saveState.state),
    };

    if (!PHASES.includes(restored.phase)) {
      restored.phase = 'title';
    }

    this.state = restored;
    this.combat = new Combat(this);
    this.draft = new DraftSystem(this);
    this.floors = new FloorManager(this);
    this.floors.map = cloneData(saveState.floorMap ?? []);
    this.combat.importState(saveState.combatState ?? {});
    this.draft.importState(saveState.draftState ?? {});

    bus.emit('stateChange', { from: 'saveState', to: this.state.phase, state: this.getSnapshot() });
    return true;
  }

  // ──────────────────────────────────────────────────────────
  //  Ultimate ability
  // ──────────────────────────────────────────────────────────

  /**
   * Use the hero's ultimate ability (if fully charged and in combat).
   * @returns {boolean} true if ult was used
   */
  useUltimate() {
    const s = this.state;
    if (s.phase !== 'combat') return false;
    if (s.ultCharge < s.ultMaxCharge) return false;
    if (!s.hero?.ultimate) return false;

    s.ultCharge = 0;
    const ult = s.hero.ultimate;

    for (const effect of ult.effects) {
      switch (effect.type) {
        case 'damageAll': {
          const val = effect.value ?? 0;
          s.enemies.forEach(e => {
            const absorbed = Math.min(e.block, val);
            e.block -= absorbed;
            const remaining = val - absorbed;
            if (remaining > 0) e.hp = Math.max(0, e.hp - remaining);
            bus.emit('damageDealt', { target: 'enemy', targetId: e.id, amount: val, blocked: absorbed, hpAfter: e.hp });
          });
          break;
        }
        case 'damageAllEqualBlock': {
          const val = s.block;
          s.enemies.forEach(e => {
            const absorbed = Math.min(e.block, val);
            e.block -= absorbed;
            const remaining = val - absorbed;
            if (remaining > 0) e.hp = Math.max(0, e.hp - remaining);
            bus.emit('damageDealt', { target: 'enemy', targetId: e.id, amount: val, blocked: absorbed, hpAfter: e.hp });
          });
          break;
        }
        case 'block': {
          s.block += effect.value ?? 0;
          break;
        }
        case 'draw': {
          this.combat.drawCards(effect.value ?? 0);
          break;
        }
        case 'energy': {
          s.energy = Math.max(0, s.energy + (effect.value ?? 0));
          break;
        }
        case 'zeroCostTurn': {
          this.combat.combatState.costReduction = 99;
          break;
        }
        case 'add_random_rares_to_hand': {
          for (let i = 0; i < (effect.value ?? 1); i++) {
            const pool = s.cardPool.filter(c => c.rarity === 'rare');
            if (pool.length > 0) {
              const pick = pool[Math.floor(Math.random() * pool.length)];
              s.hand.push({ ...pick, instanceId: `ult_${pick.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` });
            }
          }
          break;
        }
        case 'removeRandomStarters': {
          for (let i = 0; i < (effect.value ?? 1); i++) {
            const starters = s.deck.filter(c => c.rarity === 'starter');
            if (starters.length > 0) {
              const pick = starters[Math.floor(Math.random() * starters.length)];
              const idx = s.deck.indexOf(pick);
              if (idx >= 0) s.deck.splice(idx, 1);
            }
          }
          break;
        }
      }
    }

    // Purge dead enemies
    s.enemies = s.enemies.filter(e => e.hp > 0);

    bus.emit('toast', { text: `${ult.emoji} ${ult.name}!`, type: 'passive' });
    bus.emit('combatUpdate', this.combat._snapshot());

    if (s.enemies.length === 0) {
      this.combat._combatWon();
    }

    return true;
  }

  // ──────────────────────────────────────────────────────────
  //  Snapshot for UI
  // ──────────────────────────────────────────────────────────

  /**
   * Return a shallow copy of the state for safe UI reads.
   * @returns {object}
   */
  getSnapshot() {
    const s = this.state;
    return {
      phase: s.phase,
      hero: s.hero,
      cait: s.cait,
      hp: s.hp,
      maxHp: s.maxHp,
      block: s.block,
      energy: s.energy,
      maxEnergy: s.maxEnergy,
      ultCharge: s.ultCharge,
      ultMaxCharge: s.ultMaxCharge,
      deckSize: s.deck.length,
      drawPileCount: s.drawPile.length,
      discardPileCount: s.discardPile.length,
      handSize: s.hand.length,
      exhaustPileCount: s.exhaustPile.length,
      floor: s.floor,
      maxFloor: s.maxFloor,
      enemies: s.enemies.map(e => ({
        id: e.id,
        name: e.name,
        emoji: e.emoji,
        hp: e.hp,
        maxHp: e.maxHp,
        block: e.block,
        intent: e.pattern?.[e.patternIndex] ?? null,
      })),
      gold: s.gold,
      cardPlayCounts: { ...s.cardPlayCounts },
    };
  }
}
