// ============================================================
// Combat.js — Turn-based combat system
// ============================================================
// Manages the full combat loop:
//   1) start combat  -> shuffle deck into draw pile
//   2) player turns  -> draw, play cards, handle passives
//   3) enemy turns   -> execute intent script and advance
//   4) win/lose checks -> draft / game-over transitions
// ============================================================

import bus from './EventBus.js';
import { ENEMIES } from '../data/enemies.js';

const STARTING_CARDS_PER_TURN = 2;
const MAX_HAND_SIZE = 8;
const MAX_ACTIVE_ENEMIES = 3;
const SUMMON_HP_MULTIPLIER = 0.6;
const POST_COMBAT_REPAIR_RATIO = 0.05;

// ── Helpers ────────────────────────────────────────────────

/**
 * Fisher–Yates in-place shuffle.
 * @param {any[]} arr
 * @returns {any[]} same array, shuffled
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function toDisplayInt(num) {
  return Math.max(0, Math.round(num));
}

/**
 * Build a unique card instance.
 * @param {object} cardDef
 * @param {string} [prefix='card']
 * @returns {object}
 */
function cloneCard(cardDef, prefix = 'card') {
  return {
    ...cardDef,
    instanceId: `${prefix}_${cardDef.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

// ── Combat Manager ────────────────────────────────────────

export class Combat {
  /**
   * @param {import('./GameState.js').GameState} gameState
   */
  constructor(gameState) {
    /** @type {import('./GameState.js').GameState} */
    this.gs = gameState;

    /** Combat-local modifiers (resets every combat). */
    this.combatState = this._newCombatState();
  }

  _newCombatState() {
    return {
      // Costs / card flow
      costReduction: 0,
      startOfTurnBlock: 0,
      startOfTurnDraw: 0,
      endOfTurnBlock: 0,
      retainPlayerBlock: false,
      doubleNextCard: false,

      // Turn flags
      isFirstCardThisTurn: true,
      asiphyxShuffleThisTurn: false,
      asiphyxStunned: false,
      nextTurnDrawPenalty: 0,
      currentTurnDrawPenalty: 0,
      playerSpeedDelta: 0,
      enemySpeedDelta: 0,
      endTurnExhaustIds: new Set(),

      // Combo tracking
      combatPlayCounts: new Map(),
      frequentCardBonus: 0,
      removedFromDeckThisCombat: 0,
      lastParadoxCategory: null,
      paradoxChain: 0,

      // Last attack copy/paste
      lastAttackCard: null,

      // Gravity Well system (Asiphyx tank mechanic)
      gravityWellActive: false,       // when true, all enemy damage hits player instead of Cait
      markedTargetIndex: null,        // forces Cait to target a specific enemy
      markedTargetId: null,           // stable enemy id so stack target locks survive enemy deaths/reordering
      markedTargetCritMult: 1.0,      // one-shot Cait crit multiplier against the marked target
      caitDamageMult: 1.0,            // multiplier for Cait's next attack
      caitExtraActions: 0,            // extra Cait attacks queued by duo-control cards
      siphonRate: 0.0,                // 0.0 = no siphon. 0.3 = heal 30% of Cait's damage
      siphonBoostNextHit: 0.0,        // one-shot siphon rate for next Cait hit only
      caitBlockBonus: 0,              // block granted to Cait this turn

      // Kinetic Regent (Asiphyx duo system)
      kineticComboStacks: 0,          // per-combat — max 5, boosts Cait damage, decays slowly
      latentKineticPotential: 0,      // stored defensive energy consumed by Cait strikes
      kineticRegentFirstStrike: true, // Cait strikes before speed lanes unless Asiphyx is stunned

      // Control/Redirect system (Asiphyx control mage mechanic)
      counterDamage: 0,               // thorns — enemies take this much when they hit you
      reflectPercent: 0.0,            // reflect this fraction of incoming damage back
      passiveRedirectsLeft: 0,        // Gravitational Lens passive — first attack reduced
      passiveCaitBonus: 0,            // Cait damage bonus accumulated from passive redirects
      redirectEnemiesToEnemy: false,  // ultimate — enemies attack each other this turn
    };
  }

  _newTurnState() {
    return {
      ...this._newCombatState(),
      isFirstCardThisTurn: true,
    };
  }

  exportState() {
    return {
      ...this.combatState,
      endTurnExhaustIds: [...this.combatState.endTurnExhaustIds],
      combatPlayCounts: Object.fromEntries(this.combatState.combatPlayCounts),
      lastAttackCard: this.combatState.lastAttackCard ? { ...this.combatState.lastAttackCard } : null,
      gravityWellActive: this.combatState.gravityWellActive,
      markedTargetIndex: this.combatState.markedTargetIndex,
      markedTargetId: this.combatState.markedTargetId,
      markedTargetCritMult: this.combatState.markedTargetCritMult,
      caitDamageMult: this.combatState.caitDamageMult,
      caitExtraActions: this.combatState.caitExtraActions,
      siphonRate: this.combatState.siphonRate,
      siphonBoostNextHit: this.combatState.siphonBoostNextHit,
      caitBlockBonus: this.combatState.caitBlockBonus,
    };
  }

  importState(rawState = {}) {
    this.combatState = {
      ...this._newCombatState(),
      ...rawState,
      endTurnExhaustIds: new Set(rawState.endTurnExhaustIds ?? []),
      combatPlayCounts: new Map(Object.entries(rawState.combatPlayCounts ?? {})),
      lastAttackCard: rawState.lastAttackCard ? { ...rawState.lastAttackCard } : null,
    };
  }

  // ────────────────────────────────────────────────────────
  //  Start / setup
  // ────────────────────────────────────────────────────────

  /**
   * Begin a new combat encounter.
   * @param {object[]} enemies — each enemy instance or template-like object
   */
  startCombat(enemies) {
    const s = this.gs.state;

    // Copy enemies so encounter data is not mutated.
    s.enemies = enemies.map((e, i) => ({
      id: e.id ?? `enemy_${i}`,
      templateId: e.templateId ?? e.id,
      name: e.name,
      emoji: e.emoji,
      sprite: e.sprite,
      idleSprite: e.idleSprite,
      idleFrames: e.idleFrames,
      tier: e.tier,
      flavor: e.flavor,
      hp: e.hp ?? e.maxHp,
      maxHp: e.maxHp,
      block: 0,
      pattern: e.pattern ? e.pattern.map(p => ({ ...p })) : [],
      patternIndex: 0,
      strength: 0,
    }));

    // Build combat piles from the run deck.
    s.drawPile = shuffle([...s.deck]);
    s.discardPile = [];
    s.exhaustPile = [];
    s.hand = [];
    s.block = 0;

    this.combatState = this._newCombatState();
    this.gs.setPhase('combat');

    this.startPlayerTurn();
    bus.emit('combatUpdate', this._snapshot());
  }

  // ────────────────────────────────────────────────────────
  //  Player turn
  // ────────────────────────────────────────────────────────

  /** Begin a new player turn. */
  startPlayerTurn(options = {}) {
    const s = this.gs.state;
    bus.emit('turnPhase', { phase: 'player', delayMs: options.phaseDelayMs ?? 0 });

    // Apply block reset / retention rules
    if (!this.combatState.retainPlayerBlock) {
      s.block = 0;
    } else {
      this.combatState.retainPlayerBlock = false;
    }

    s.energy = s.maxEnergy;
    this.combatState.isFirstCardThisTurn = true;
    this.combatState.asiphyxShuffleThisTurn = false;
    this.combatState.lastParadoxCategory = null;
    this.combatState.paradoxChain = 0;

    // Reset gravity well flags (one-turn duration)
    this.combatState.gravityWellActive = false;
    this.combatState.markedTargetIndex = null;
    this.combatState.markedTargetId = null;
    this.combatState.markedTargetCritMult = 1.0;
    this.combatState.caitDamageMult = 1.0;
    this.combatState.caitExtraActions = 0;
    this.combatState.siphonBoostNextHit = 0.0;

    // Reset control flags (one-turn duration)
    this.combatState.counterDamage = 0;
    this.combatState.reflectPercent = 0.0;
    this.combatState.redirectEnemiesToEnemy = false;

    // Gravitational Lens passive: first attack each turn reduced
    if (s.hero?.id === 'asiphyx') {
      this.combatState.passiveRedirectsLeft = 1;
    }

    // Apply start-of-turn bonuses
    if (this.combatState.startOfTurnBlock > 0) {
      this._addBlock(this.combatState.startOfTurnBlock);
    }

    // Bindax helper: one drafted card starts in hand
    if (s.hero?.id === 'bindax') {
      const pool = (s.cardPool ?? []).filter(c => c && !s.discardPile.includes(c));
      if (pool.length > 0) {
        const drawn = cloneCard(pickRandom(pool), 'bindax');
        s.hand.push(drawn);
      }
    }

    const drawPenalty = Math.max(0, this.combatState.nextTurnDrawPenalty ?? 0);
    const drawBonus = Math.max(0, this.combatState.startOfTurnDraw ?? 0);
    const drawCount = Math.max(1, STARTING_CARDS_PER_TURN + drawBonus - drawPenalty);
    this.combatState.nextTurnDrawPenalty = 0;
    this.combatState.currentTurnDrawPenalty = drawPenalty;
    if (drawPenalty > 0) {
      bus.emit('toast', { text: `Stack jammed: -${drawPenalty} module draw.`, type: 'enemy' });
    }
    if (drawBonus > 0) {
      bus.emit('toast', { text: `Distributed stack: +${drawBonus} module draw.`, type: 'passive' });
    }
    this.drawCards(drawCount);
    bus.emit('combatUpdate', this._snapshot());
  }

  /**
   * Draw N cards from draw pile into hand.
   * If draw pile is empty, reshuffle discard into draw pile.
   * @param {number} n
   */
  drawCards(n) {
    const s = this.gs.state;
    let capWarningShown = false;
    for (let i = 0; i < n; i++) {
      if (s.hand.length >= MAX_HAND_SIZE) {
        if (!capWarningShown) {
          bus.emit('toast', { text: `HAND CAP // ${MAX_HAND_SIZE} modules max while active.`, type: 'danger' });
          capWarningShown = true;
        }
        break;
      }

      if (s.drawPile.length === 0) {
        if (s.discardPile.length === 0) break;
        if (s.hero?.id === 'asiphyx' && !this.combatState.asiphyxShuffleThisTurn) {
          this._addBlock(8);
          this.combatState.asiphyxShuffleThisTurn = true;
          bus.emit('combatUpdate', this._snapshot());
        }
        s.drawPile = shuffle([...s.discardPile]);
        s.discardPile = [];
      }

      if (s.drawPile.length > 0) {
        const card = s.drawPile.pop();
        s.hand.push(card);
        if (card.id === 'memory_leak') {
          bus.emit('toast', { text: 'Memory Leak surfaced!', type: 'danger' });
        }
      }
    }

    bus.emit('combatUpdate', this._snapshot());
  }

  /** Effective cost for a card, respecting passives/discounts. */
  getCardCost(card) {
    const base = card.cost ?? 0;
    const discounted = base - this.combatState.costReduction;
    if (this.gs.state.hero?.id === 'cait' && this.combatState.isFirstCardThisTurn) {
      return 0;
    }
    return Math.max(0, discounted);
  }

  /**
   * Attempt to play a card from hand.
   * @param {number} handIndex
   * @param {number|null} targetIndex
   * @param {{deferWinCheck?: boolean}} options
   * @returns {boolean}
   */
  playCard(handIndex, targetIndex = 0, options = {}) {
    const s = this.gs.state;
    const card = s.hand[handIndex];
    if (!card) return false;

    if (card.tags?.includes('curse') || card.id === 'memory_leak') {
      bus.emit('toast', { text: `${card.name} is unplayable!`, type: 'danger' });
      return false;
    }

    // Hero-only checks
    if (card.heroOnly && card.heroOnly !== s.hero?.id) {
      bus.emit('combatUpdate', this._snapshot());
      return false;
    }

    s.hand.splice(handIndex, 1);

    // Cait: first card this turn is always free
    if (this.combatState.isFirstCardThisTurn) {
      this.combatState.isFirstCardThisTurn = false;
    }

    // Resolve the card, then resolve duplicate if pair-programming is active.
    const shouldPlayTwice = this.combatState.doubleNextCard;
    this.combatState.doubleNextCard = false;

    let resolveState = this._applyCardEffects(card, targetIndex, { depth: 0 });
    if (shouldPlayTwice) {
      resolveState = this._applyCardEffects(card, targetIndex, { depth: 1, source: 'double' });
    }

    // Kinetic Regent: gravity modules build combo + queue Cait follow-ups
    const effects = card.effects ?? [];
    const hasGravityTarget = effects.some(e =>
      ['mark_target', 'mark_target_crit', 'swap_intent', 'redirectEnemiesToEnemy'].includes(e.type)
    );
    const hasDefense = effects.some(e =>
      ['block', 'cait_block'].includes(e.type)
    );

    if (hasGravityTarget) {
      this.combatState.kineticComboStacks = Math.min(5, this.combatState.kineticComboStacks + 1);
      const stacks = this.combatState.kineticComboStacks;
      const comboHype = stacks >= 5
        ? 'MAX COMBO — Cait payoff overcharged!!'
        : stacks >= 4
          ? 'Cait payoff surging!'
          : stacks >= 2
            ? 'Cait payoff primed.'
            : 'Cait payoff building.';
      bus.emit('toast', { text: `Kinetic Combo ${stacks}/5 — ${comboHype}`, type: stacks >= 4 ? 'crit' : 'passive' });
    }

    if (hasDefense) {
      const blockVal = effects.filter(e => e.type === 'block').reduce((sum, e) => sum + (e.value ?? 0), 0);
      if (blockVal > 0) {
        const stored = Math.floor(blockVal * 0.5);
        this.combatState.latentKineticPotential += stored;
        bus.emit('toast', { text: `Latent Potential stored: +${stored}.`, type: 'passive' });
      }
    }

    // Resolve destination pile
    this._finalizeCard(card, resolveState);

    // Purge dead enemies and win-check
    s.enemies = s.enemies.filter(e => e.hp > 0);
    bus.emit('combatUpdate', this._snapshot());
    if (s.enemies.length === 0) {
      if (!options.deferWinCheck) this._combatWon();
      return true;
    }

    bus.emit('cardPlayed', {
      card,
      targetIndex,
      energy: s.energy,
      doublePlayed: shouldPlayTwice,
    });

    // Charge ultimate
    s.ultCharge = Math.min(s.ultMaxCharge, (s.ultCharge ?? 0) + 1);

    return true;
  }

  /**
   * Resolve plugged module sockets as a simultaneous exchange with speed lanes.
   * @param {{instanceId:string,targetIndex?:number,side?:string,slotIndex?:number,order?:number}[]} commands
   */
  resolveModuleStack(commands = []) {
    const s = this.gs.state;
    if (s.phase !== 'combat' || s.hp <= 0 || s.enemies.length === 0) return false;

    for (const enemy of s.enemies) {
      enemy.block = 0;
    }

    const timeline = [];
    const heroIsKineticRegent = s.hero?.id === 'asiphyx' && this.combatState.kineticRegentFirstStrike;

    for (const command of commands) {
      const card = s.hand.find(c => c.instanceId === command.instanceId);
      if (!card) continue;
      const lane = this._speedLaneForModule(card);
      timeline.push({
        kind: 'module',
        lane,
        priority: this._speedPriority(lane, this.combatState.playerSpeedDelta),
        order: command.order ?? command.slotIndex ?? 0,
        command,
      });
    }

    if (heroIsKineticRegent && !this.combatState.asiphyxStunned && s.cait) {
      timeline.push({
        kind: 'cait',
        lane: 'payoff',
        priority: this._speedPriority('normal', this.combatState.playerSpeedDelta),
        order: 99,
      });
    }

    for (const [enemyIndex, enemy] of s.enemies.entries()) {
      const intent = enemy.pattern[enemy.patternIndex];
      if (!intent) continue;
      const lane = this._speedLaneForEnemyIntent(intent);
      timeline.push({
        kind: 'enemy',
        lane,
        priority: this._speedPriority(lane, this.combatState.enemySpeedDelta),
        order: 100 + enemyIndex,
        enemy,
        intent,
      });
    }

    timeline.sort((a, b) => (a.priority - b.priority) || (a.order - b.order));
    bus.emit('toast', { text: `STACK EXCHANGE // ${timeline.map(a => a.lane.toUpperCase()).join(' > ')}`, type: 'command' });

    let lastPhase = null;
    for (const action of timeline) {
      if (s.hp <= 0 || s.enemies.length === 0) break;
      if (action.kind !== lastPhase) {
        bus.emit('turnPhase', { phase: action.kind });
        lastPhase = action.kind;
      }
      if (action.kind === 'cait') {
        this._executeCaitTurn({ decayCombo: false, resetExtraActions: false, deferWinCheck: true });
        continue;
      }
      if (action.kind === 'module') {
        if (action.command.targetId) {
          const liveTargetIndex = s.enemies.findIndex(enemy => enemy.id === action.command.targetId);
          if (liveTargetIndex >= 0) action.command.targetIndex = liveTargetIndex;
        }
        const handIndex = s.hand.findIndex(card => card.instanceId === action.command.instanceId);
        if (handIndex >= 0) this.playCard(handIndex, action.command.targetIndex ?? 0, { deferWinCheck: true });
        continue;
      }
      if (action.kind === 'enemy') {
        if (!s.enemies.includes(action.enemy) || action.enemy.hp <= 0) continue;
        const liveIntent = action.enemy.pattern[action.enemy.patternIndex] ?? action.intent;
        this._executeEnemyIntent(action.enemy, liveIntent);
        action.enemy.patternIndex = (action.enemy.patternIndex + 1) % Math.max(1, action.enemy.pattern.length);
      }
    }

    s.enemies = s.enemies.filter(e => e.hp > 0);
    if (s.enemies.length === 0) {
      this._combatWon();
      return true;
    }
    if (s.hp <= 0) {
      this.gs.setPhase('gameOver');
      return true;
    }

    this.combatState.redirectEnemiesToEnemy = false;
    this.combatState.reflectPercent = 0.0;
    this.combatState.counterDamage = 0;
    this.combatState.playerSpeedDelta = 0;
    this.combatState.enemySpeedDelta = 0;
    this.combatState.asiphyxStunned = false;
    this.combatState.caitExtraActions = 0;
    this.combatState.kineticComboStacks = Math.max(0, this.combatState.kineticComboStacks - 1);
    bus.emit('combatUpdate', this._snapshot());
    this.startPlayerTurn({ phaseDelayMs: 3400 });
    return true;
  }

  _speedLaneForModule(card) {
    if (card.speed) return card.speed;
    if (card.tags?.includes('speed') || card.tags?.includes('interrupt')) return 'fast';
    if (card.tags?.includes('slow') || card.tags?.includes('heavy')) return 'slow';
    if (card.effects?.some(e => ['block', 'cait_block', 'mark_target', 'mark_target_crit', 'swap_intent'].includes(e.type))) return 'fast';
    if (card.type === 'attack') return 'normal';
    return 'normal';
  }

  _speedLaneForEnemyIntent(intent) {
    if (intent.speed) return intent.speed;
    if (intent.type === 'block' || intent.type === 'debuff') return 'fast';
    if (intent.type === 'buff' || intent.type === 'heal' || intent.type === 'summon') return 'slow';
    return 'normal';
  }

  _speedPriority(lane, delta = 0) {
    const base = lane === 'first' ? -100 : lane === 'fast' ? 0 : lane === 'normal' ? 10 : 20;
    return base - delta;
  }

  /**
   * Place card in discard/exhaust and apply card removal costs.
   * @param {object} card
   * @param {{ exhaust:boolean, removeFromDeck:boolean }} resolveState
   */
  _finalizeCard(card, resolveState) {
    const s = this.gs.state;

    if (resolveState.removeFromDeck) {
      const idx = s.deck.findIndex(c => c.instanceId === card.instanceId || c.id === card.id);
      if (idx !== -1) {
        const removed = s.deck[idx];
        s.deck.splice(idx, 1);
        this.combatState.removedFromDeckThisCombat += 1;
        this._removeCardFromPile(s.drawPile, removed);
        this._removeCardFromPile(s.discardPile, removed);
        this._removeCardFromPile(s.hand, removed);
      }
      s.exhaustPile.push(card);
      return;
    }

    if (resolveState.exhaust) {
      s.exhaustPile.push(card);
      return;
    }

    s.discardPile.push(card);
  }

  // ────────────────────────────────────────────────────────
  //  Card effects
  // ────────────────────────────────────────────────────────

  /**
   * Resolve a single play of a card.
   * @param {object} card
   * @param {number} targetIndex
   * @param {{ depth?: number, source?: string }} options
   * @returns {{exhaust:boolean,removeFromDeck:boolean}}
   */
  _applyCardEffects(card, targetIndex, options = {}) {
    const s = this.gs.state;

    this.gs.recordCardPlay(card.id);
    const runPlays = s.cardPlayCounts[card.id] ?? 0;
    const combatPlays = this._incrementCombatPlay(card.id);
    const cardCategory = this._resolveCardCategory(card);
    const bonus =
      this._cardStatBonus(card.id, runPlays, combatPlays) +
      this._maybeApplyParadoxCombo(cardCategory);

    const stats = {
      exhaust: false,
      removeFromDeck: false,
    };

    const isAttack = Array.isArray(card.effects) &&
      card.effects.some(e => e.type === 'damage' || e.type === 'damageAll' || e.type === 'damage_equal_to_block' || e.type === 'damage_per_removed_card');
    if (isAttack) {
      this.combatState.lastAttackCard = card;
    }

    for (const effect of card.effects ?? []) {
      switch (effect.type) {
        case 'damage': {
          const raw = toDisplayInt((effect.value ?? 0) + bonus);
          if (raw > 0) {
            if (effect.target === 'all_enemies') {
              s.enemies.forEach(e => this._dealDamageToEnemy(e, raw));
            } else {
              const enemy = s.enemies[targetIndex] ?? s.enemies[0];
              if (enemy) this._dealDamageToEnemy(enemy, raw);
            }
          }
          break;
        }
        case 'damageAll': {
          const raw = toDisplayInt((effect.value ?? 0) + bonus);
          if (raw > 0) {
            s.enemies.forEach(e => this._dealDamageToEnemy(e, raw));
          }
          break;
        }
        case 'block': {
          const raw = toDisplayInt((effect.value ?? 0) + bonus);
          this._addBlock(raw);
          break;
        }
        case 'heal': {
          s.hp = Math.min(s.maxHp, s.hp + toDisplayInt(effect.value ?? 0));
          break;
        }
        case 'draw': {
          this.drawCards(effect.value ?? 0);
          break;
        }
        case 'energy': {
          s.energy = Math.max(0, s.energy + toDisplayInt(effect.value ?? 0));
          break;
        }
        case 'exhaust': {
          stats.exhaust = true;
          break;
        }
        case 'remove_card_from_deck':
        case 'removeFromDeck': {
          stats.removeFromDeck = true;
          stats.exhaust = true;
          break;
        }
        case 'reveal_intent': {
          const enemy = s.enemies[targetIndex] ?? s.enemies[0];
          if (enemy) {
            const intent = enemy.pattern[enemy.patternIndex];
            if (intent) {
              bus.emit('toast', {
                text: `${card.name} reveals: ${intent.description ?? intent.type}`,
                type: 'info',
              });
            }
          }
          break;
        }
        case 'draw_if_block': {
          if (s.block > 0) this.drawCards(effect.value ?? 0);
          break;
        }
        case 'copy_last_attack': {
          if (options.depth && options.depth > 1) break;
          if (!this.combatState.lastAttackCard) {
            bus.emit('toast', { text: 'No prior attack to copy.', type: 'danger' });
            break;
          }
          this._applyCardEffects(
            cloneCard(this.combatState.lastAttackCard, `stack_overflow_depth_${(options.depth ?? 0) + 1}`),
            targetIndex,
            { depth: (options.depth ?? 0) + 1, source: 'copy' },
          );
          break;
        }
        case 'retain_block': {
          this.combatState.retainPlayerBlock = true;
          break;
        }
        case 'double_next_card': {
          this.combatState.doubleNextCard = true;
          break;
        }
        case 'start_of_turn_block': {
          this.combatState.startOfTurnBlock += toDisplayInt(effect.value ?? 0);
          break;
        }
        case 'start_of_turn_draw': {
          this.combatState.startOfTurnDraw += toDisplayInt(effect.value ?? 0);
          bus.emit('toast', { text: `${card.name}: +${toDisplayInt(effect.value ?? 0)} module draw each turn.`, type: 'passive' });
          break;
        }
        case 'end_of_turn_block': {
          this.combatState.endOfTurnBlock += toDisplayInt(effect.value ?? 0);
          break;
        }
        case 'damage_equal_to_block': {
          const raw = Math.max(0, s.block + bonus);
          if (raw > 0) {
            const enemy = s.enemies[targetIndex] ?? s.enemies[0];
            if (enemy) this._dealDamageToEnemy(enemy, raw);
          }
          break;
        }
        case 'damage_per_removed_card': {
          const removed = this.combatState.removedFromDeckThisCombat;
          const raw = toDisplayInt((effect.value ?? 0) * removed + bonus);
          if (raw > 0) {
            const enemy = s.enemies[targetIndex] ?? s.enemies[0];
            if (enemy) this._dealDamageToEnemy(enemy, raw);
          }
          break;
        }
        case 'reduce_all_costs': {
          this.combatState.costReduction = Math.min(9, this.combatState.costReduction + toDisplayInt(effect.value ?? 0));
          break;
        }
        case 'add_random_common_to_hand':
        case 'add_random_rares_to_hand': {
          const targetCount = toDisplayInt(effect.value ?? 1);
          const rarity = effect.type === 'add_random_common_to_hand' ? 'common' : 'rare';
          for (let i = 0; i < targetCount; i++) {
            const selected = this._pickCardFromLibrary(rarity, { allowHeroOnly: true });
            if (selected) {
              const drawn = cloneCard(selected, 'draw');
              s.hand.push(drawn);
            }
          }
          break;
        }
        case 'buff_frequent_cards': {
          this.combatState.frequentCardBonus += toDisplayInt(effect.value ?? 0);
          break;
        }
        case 'random_one_of': {
          const options = effect.options ?? [];
          const selected = pickRandom(options);
          if (selected) {
            this._applySingleEffect(
              selected,
              card,
              targetIndex,
              {
                bonus,
                cardCategory,
                depth: options.depth ?? 0,
              },
            );
          }
          break;
        }
        case 'scry': {
          const count = toDisplayInt(effect.value ?? 0);
          const topCount = Math.min(count, s.drawPile.length);
          if (topCount > 0) {
            const top = s.drawPile.slice(s.drawPile.length - topCount);
            s.drawPile = s.drawPile.slice(0, s.drawPile.length - topCount);
            this._shuffleInPlace(top);
            s.drawPile.push(...top);
            bus.emit('toast', { text: `You peeked at ${topCount} cards and refined your next draw.`, type: 'info' });
          }
          break;
        }
        case 'exhaust_added_end_of_turn': {
          // Used as a marker; paired "add random rare" effect handles list marking.
          break;
        }
        case 'unit_test': {
          this._addBlock(toDisplayInt(effect.value ?? 8));
          break;
        }
        case 'damageSelf': {
          const val = toDisplayInt(effect.value ?? 0);
          s.hp = Math.max(0, s.hp - val);
          bus.emit('damageDealt', { target: 'player', amount: val });
          break;
        }
        case 'discard': {
          const count = toDisplayInt(effect.value ?? 1);
          for (let i = 0; i < count; i++) {
            if (s.hand.length > 0) {
              const idx = Math.floor(Math.random() * s.hand.length);
              const cardDiscarded = s.hand.splice(idx, 1)[0];
              s.discardPile.push(cardDiscarded);
              bus.emit('toast', { text: `Discarded ${cardDiscarded.name}`, type: 'info' });
            }
          }
          break;
        }
        case 'loseEnergy': {
          bus.emit('toast', { text: 'Energy drain ignored // module pathing active', type: 'info' });
          break;
        }
        case 'gravity_well': {
          this.combatState.gravityWellActive = true;
          bus.emit('toast', { text: 'Gravity Well active — all attacks redirect to you.', type: 'passive' });
          break;
        }
        case 'cait_block': {
          const val = toDisplayInt(effect.value ?? 0);
          if (s.cait) {
            s.cait.block = (s.cait.block ?? 0) + val;
          }
          this.combatState.caitBlockBonus += val;
          break;
        }
        case 'mark_target': {
          this.combatState.markedTargetIndex = targetIndex;
          const enemy = s.enemies[targetIndex];
          if (enemy) {
            this.combatState.markedTargetId = enemy.id;
            bus.emit('toast', { text: `${enemy.name} marked for Cait.`, type: 'passive' });
          }
          break;
        }
        case 'mark_target_crit': {
          this.combatState.markedTargetIndex = targetIndex;
          this.combatState.markedTargetCritMult = Math.max(1, effect.value ?? 1.75);
          const enemy = s.enemies[targetIndex];
          if (enemy) {
            this.combatState.markedTargetId = enemy.id;
            const crit = Math.round(this.combatState.markedTargetCritMult * 100);
            bus.emit('toast', { text: `${enemy.name}'s center of gravity marked. Cait crit ${crit}%.`, type: 'passive' });
          }
          break;
        }
        case 'cait_damage_mult': {
          this.combatState.caitDamageMult = effect.value ?? 2.0;
          break;
        }
        case 'cait_extra_action': {
          const val = Math.max(0, toDisplayInt(effect.value ?? 1));
          this.combatState.caitExtraActions += val;
          bus.emit('toast', { text: `Cait momentum +${val}: extra strike queued.`, type: 'passive' });
          break;
        }
        case 'siphon_boost': {
          this.combatState.siphonBoostNextHit = effect.value ?? 0.5;
          break;
        }
        case 'counter': {
          this.combatState.counterDamage = toDisplayInt(effect.value ?? 3);
          bus.emit('toast', { text: `Counter set to ${this.combatState.counterDamage}.`, type: 'passive' });
          break;
        }
        case 'damage_reflect': {
          this.combatState.reflectPercent = effect.value ?? 0.5;
          bus.emit('toast', { text: `Gravity Mirror: reflecting ${Math.round((effect.value ?? 0.5) * 100)}% of damage.`, type: 'passive' });
          break;
        }
        case 'swap_intent': {
          const enemy = s.enemies[targetIndex];
          if (enemy) {
            const intent = enemy.pattern[enemy.patternIndex];
            if (intent) {
              switch (intent.type) {
                case 'attack':
                case 'attackAll':
                  enemy.pattern[enemy.patternIndex] = {
                    ...intent,
                    type: 'block',
                    description: `Redirected Guard — Gain ${toDisplayInt(intent.value ?? 0)} block.`,
                  };
                  break;
                case 'buff':
                  enemy.pattern[enemy.patternIndex] = {
                    ...intent,
                    type: 'debuff',
                    description: `Redirected Fault — Jam next draw by ${toDisplayInt(intent.value ?? 1)} module.`,
                  };
                  break;
                case 'debuff':
                  enemy.pattern[enemy.patternIndex] = {
                    ...intent,
                    type: 'block',
                    value: 0,
                    description: 'Redirected Null Guard — no effect.',
                  };
                  break;
                default:
                  break;
              }
              bus.emit('toast', { text: `${enemy.name}'s intent redirected.`, type: 'passive' });
            }
          }
          break;
        }
        case 'transmute_block_to_cait': {
          const blockVal = s.block;
          if (blockVal > 0) {
            s.block = 0;
            // Fire Cait damage immediately for the block amount
            const target = this.combatState.markedTargetIndex !== null
              ? s.enemies[this.combatState.markedTargetIndex]
              : pickRandom(s.enemies);
            if (target) {
              this._dealDamageToEnemy(target, blockVal, { source: 'cait' });
              bus.emit('toast', { text: `Transmute: Cait strikes for ${blockVal}!`, type: 'passive' });
            }
          }
          break;
        }
        case 'redirectEnemiesToEnemy': {
          this.combatState.redirectEnemiesToEnemy = true;
          bus.emit('toast', { text: 'Event Horizon: enemies turn on each other!', type: 'passive' });
          break;
        }
        case 'speed':
        case 'speed_self': {
          const value = toDisplayInt(effect.value ?? 1);
          this.combatState.playerSpeedDelta += value;
          bus.emit('toast', { text: `Speed +${value}: Asiphyx modules move earlier.`, type: 'passive' });
          break;
        }
        case 'slow':
        case 'slow_enemy': {
          const value = toDisplayInt(effect.value ?? 1);
          this.combatState.enemySpeedDelta -= value;
          bus.emit('toast', { text: `Slow ${value}: enemy intents move later.`, type: 'passive' });
          break;
        }
        case 'stun': {
          const enemy = s.enemies[targetIndex] ?? s.enemies[0];
          if (enemy) {
            enemy.skipNextIntent = true;
            bus.emit('toast', { text: `${enemy.name} stunned.`, type: 'passive' });
          }
          break;
        }
        default: {
          console.warn(`[Combat] Unknown effect type: "${effect.type}"`);
        }
      }
    }

    // Post-effect card-specific helper effects:
    if (card.id === 'open_source') {
      if (s.hand.length > 0) {
        const added = this._popRandomHandCardForHand();
        if (added) {
          s.hand.push(added);
        }
      }
    }

    // exhaust_added_end_of_turn is always treated as "newly added cards in this card use".
    if (card.id === 'party_trick') {
      const partyAdditions = Math.max(0, card.effects?.find(e => e.type === 'add_random_rares_to_hand')?.value ?? 0);
      if (partyAdditions > 0) {
        const idsToMark = [];
        for (const handCard of s.hand.slice(-partyAdditions)) {
          idsToMark.push(handCard.instanceId);
        }
        idsToMark.forEach(id => this.combatState.endTurnExhaustIds.add(id));
      }
    }

    return stats;
  }

  _applySingleEffect(effect, card, targetIndex, options = {}) {
    const s = this.gs.state;
    const sourceCardId = options.sourceCardId ?? card.id;
    const runPlays = s.cardPlayCounts[sourceCardId] ?? 0;
    const combatPlays = this._combatPlayCount(sourceCardId);
    const cardCategory = options.cardCategory ?? this._resolveCardCategory(card);
    const bonus = (options.bonus ?? 0)
      + this._cardStatBonus(sourceCardId, runPlays, combatPlays)
      + this._maybeApplyParadoxCombo(cardCategory, { sourceEffect: true });
    switch (effect.type) {
      case 'damage': {
        const raw = toDisplayInt((effect.value ?? 0) + bonus);
        const enemy = s.enemies[targetIndex] ?? s.enemies[0];
        if (enemy) this._dealDamageToEnemy(enemy, raw);
        break;
      }
      case 'block': {
        const raw = toDisplayInt((effect.value ?? 0) + bonus);
        this._addBlock(raw);
        break;
      }
      case 'draw': {
        this.drawCards(effect.value ?? 0);
        break;
      }
      case 'heal': {
        s.hp = Math.min(s.maxHp, s.hp + toDisplayInt(effect.value ?? 0));
        break;
      }
      case 'damage_per_removed_card': {
        const raw = toDisplayInt((effect.value ?? 0) * this.combatState.removedFromDeckThisCombat + bonus);
        if (raw > 0) {
          const enemy = s.enemies[targetIndex] ?? s.enemies[0];
          if (enemy) this._dealDamageToEnemy(enemy, raw);
        }
        break;
      }
      case 'add_random_rares_to_hand':
      case 'add_random_common_to_hand': {
        const rarity = effect.type === 'add_random_common_to_hand' ? 'common' : 'rare';
        const c = this._pickCardFromLibrary(rarity, { allowHeroOnly: true });
        if (c) {
          const drawn = cloneCard(c, 'scry');
          s.hand.push(drawn);
          if (effect.type === 'add_random_rares_to_hand' && card.id === 'party_trick') {
            this.combatState.endTurnExhaustIds.add(drawn.instanceId);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  _cardStatBonus(cardId, runPlays, combatPlays) {
    const s = this.gs.state;
    let bonus = 0;

    // Codex-style: cards played 3+ times over the full run gain +2 on both damage and block.
    if (s.hero?.id === 'codex' && runPlays >= 3) {
      bonus += 2;
    }

    // Clean architecture signature style: 3+ in combat + stack.
    if (combatPlays >= 3) {
      bonus += this.combatState.frequentCardBonus;
    }

    return bonus;
  }

  _maybeApplyParadoxCombo(cardCategory, options = {}) {
    const s = this.gs.state;
    if (s.hero?.id !== 'antigrav') return 0;
    if (options.sourceEffect) return 0;
    if (cardCategory === 'utility' || cardCategory === null) return 0;

    const previous = this.combatState.lastParadoxCategory;

    if (!previous || previous === 'utility') {
      this.combatState.lastParadoxCategory = cardCategory;
      this.combatState.paradoxChain = 0;
      return 0;
    }

    if (previous !== cardCategory) {
      this.combatState.paradoxChain = Math.min(3, this.combatState.paradoxChain + 1);
      this.combatState.lastParadoxCategory = cardCategory;

      const chain = this.combatState.paradoxChain;
      const comboBonus = chain === 1 ? 2 : chain === 2 ? 4 : 6;

      if (!options.sourceEffect) {
        bus.emit('toast', {
          text: `Backwards chain x${chain}: +${comboBonus} bonus`,
          type: 'passive',
        });
      }

      return comboBonus;
    }

    this.combatState.lastParadoxCategory = cardCategory;
    this.combatState.paradoxChain = 0;
    return 0;
  }

  _resolveCardCategory(card) {
    if (!card) return 'utility';

    const effects = card.effects ?? [];
    const hasDamage = effects.some(e =>
      e.type === 'damage' ||
      e.type === 'damageAll' ||
      e.type === 'damage_equal_to_block' ||
      e.type === 'damage_per_removed_card'
    );
    const hasDefense = effects.some(e =>
      e.type === 'block' ||
      e.type === 'start_of_turn_block' ||
      e.type === 'end_of_turn_block'
    );

    if (hasDamage && !hasDefense) return 'attack';
    if (hasDefense && !hasDamage) return 'defense';
    if (card.type === 'attack') return 'attack';
    if (card.type === 'skill') return 'defense';
    return 'utility';
  }

  _combatPlayCount(cardId) {
    return this.combatState.combatPlayCounts.get(cardId) ?? 0;
  }

  _incrementCombatPlay(cardId) {
    const count = this._combatPlayCount(cardId) + 1;
    this.combatState.combatPlayCounts.set(cardId, count);
    return count;
  }

  _pickCardFromLibrary(rarity, options = {}) {
    const { allowHeroOnly = false } = options;
    const s = this.gs.state;

    const cards = s.cardPool
      .filter(c => c.rarity === rarity)
      .filter(c => allowHeroOnly || !c.heroOnly)
      .filter(c => !c.heroOnly || c.heroOnly === s.hero?.id);

    if (cards.length === 0) return null;
    return pickRandom(cards);
  }

  _removeCardFromPile(pile, card) {
    const idx = pile.findIndex(c =>
      c.instanceId === card.instanceId ||
      (c.instanceId === undefined && c.id === card.id)
    );
    if (idx >= 0) pile.splice(idx, 1);
  }

  _shuffleInPlace(arr) {
    shuffle(arr);
  }

  _popRandomHandCardForHand() {
    const s = this.gs.state;
    if (s.hand.length === 0) return null;
    const idx = Math.floor(Math.random() * s.hand.length);
    const [card] = s.hand.splice(idx, 1);
    return card ? cloneCard(card, 'random_draw') : null;
  }

  _addBlock(amount) {
    const s = this.gs.state;
    s.block = Math.max(0, s.block + toDisplayInt(amount));
  }

  // ────────────────────────────────────────────────────────
  //  End player turn
  // ────────────────────────────────────────────────────────

  /** Player ends their turn voluntarily. */
  endPlayerTurn(options = {}) {
    const { allowCait = true, reason = 'end_turn' } = options;
    const s = this.gs.state;
    const handToExhaust = [];
    const handToDiscard = [];

    for (const card of s.hand) {
      if (this.combatState.endTurnExhaustIds.has(card.instanceId)) {
        handToExhaust.push(card);
      } else {
        handToDiscard.push(card);
      }
    }

    if (this.combatState.endOfTurnBlock > 0) {
      this._addBlock(this.combatState.endOfTurnBlock);
    }

    s.hand = [];
    s.exhaustPile.push(...handToExhaust);
    s.discardPile.push(...handToDiscard);
    this.combatState.endTurnExhaustIds.clear();

    bus.emit('combatUpdate', this._snapshot());

    if (allowCait) {
      // Cait acts autonomously between player and enemy turns only after a committed stack.
      bus.emit('turnPhase', { phase: 'cait' });
      const caitEndedCombat = this._executeCaitTurn();
      if (caitEndedCombat || s.phase !== 'combat' || s.enemies.length === 0 || s.hp <= 0) return;
    } else if (reason === 'wait') {
      bus.emit('toast', { text: 'WAIT // no routed modules, Cait holds fire.', type: 'enemy' });
    }

    bus.emit('turnPhase', { phase: 'enemy' });
    this._executeEnemyTurn();
  }

  // ────────────────────────────────────────────────────────
  //  Cait companion turn
  // ────────────────────────────────────────────────────────

  /**
   * Cait auto-pilots after the player ends their turn.
   * Reliability determines whether she lands her full hit or a partial one.
   * Siphon heals Asiphyx based on damage dealt.
   */
  _executeCaitTurn(options = {}) {
    const { decayCombo = true, resetExtraActions = true, deferWinCheck = false } = options;
    const s = this.gs.state;
    if (!s.cait || s.enemies.length === 0) return false;

    const reliability = Math.min(0.98, Math.max(0.75, s.cait.reliability ?? 0.6));
    const baseDamage = 6 + Math.floor(s.floor * 0.66);
    const attackCount = 1 + Math.max(0, this.combatState.caitExtraActions);
    let landedAny = false;

    for (let action = 0; action < attackCount && s.enemies.length > 0; action++) {
      const hitRoll = Math.random();

      // Kinetic Regent bonuses: combo stacks + stacked potential
      const kineticBonus = this.combatState.kineticComboStacks * 2;
      const potentialDrain = Math.min(this.combatState.latentKineticPotential, Math.round(baseDamage * 0.8));

      // Full hit, partial hit, or miss
      let damageDealt = 0;
      let fullHit = false;
      if (hitRoll < reliability) {
        fullHit = true;
        damageDealt = Math.round(baseDamage * this.combatState.caitDamageMult) + kineticBonus + potentialDrain;
      } else if (hitRoll < reliability + 0.15) {
        damageDealt = Math.round(baseDamage * 0.5) + Math.round(kineticBonus * 0.5);
      } else {
        damageDealt = Math.max(1, Math.round(baseDamage * 0.25));
      }

      if (damageDealt > 0 && (kineticBonus > 0 || potentialDrain > 0)) {
        this.combatState.latentKineticPotential -= potentialDrain;
        const strikeTag = attackCount > 1 ? ` (strike ${action + 1}/${attackCount})` : '';
        bus.emit('toast', { text: `Kinetic Regent: +${kineticBonus + potentialDrain} from combo (${this.combatState.kineticComboStacks}) & potential (${potentialDrain})${strikeTag}.`, type: 'passive' });
      }

      if (damageDealt <= 0) {
        bus.emit('toast', { text: action === 0 ? 'Cait hesitated...' : 'Cait momentum slipped...', type: 'info' });
        continue;
      }

      // Pick target: marked target first, else random
      let target;
      const markedIndex = this.combatState.markedTargetIndex;
      const markedTarget = this.combatState.markedTargetId
        ? s.enemies.find(enemy => enemy.id === this.combatState.markedTargetId)
        : (markedIndex !== null ? s.enemies[markedIndex] : null);
      if (markedTarget) {
        target = markedTarget;
      } else {
        target = pickRandom(s.enemies);
      }

      if (!target) continue;

      const critActive = fullHit && target === markedTarget && this.combatState.markedTargetCritMult > 1;
      if (critActive) {
        damageDealt = Math.round(damageDealt * this.combatState.markedTargetCritMult);
        bus.emit('toast', { text: `Center of Gravity: Cait crits for ${damageDealt}.`, type: 'passive' });
      }

      bus.emit('caitAttackWindup', {
        targetId: target.id,
        targetIndex: s.enemies.findIndex(enemy => enemy.id === target.id),
        amount: damageDealt,
        actionIndex: action,
        attackCount,
        crit: critActive,
        extraMomentum: action > 0,
      });

      this._dealDamageToEnemy(target, damageDealt, { source: 'cait', actionIndex: action, crit: critActive });
      landedAny = true;

      // Determine siphon rate (one-shot boost overrides persistent)
      const siphonRate = this.combatState.siphonBoostNextHit > 0
        ? this.combatState.siphonBoostNextHit
        : this.combatState.siphonRate;

      if (siphonRate > 0) {
        const heal = Math.max(1, Math.floor(damageDealt * siphonRate));
        s.hp = Math.min(s.maxHp, s.hp + heal);
        bus.emit('damageDealt', { target: 'siphon_heal', amount: heal, hpAfter: s.hp });
        bus.emit('toast', { text: `Siphon: +${heal} HP from Cait's strike.`, type: 'passive' });
      }

      // Cait's one-shot targeting and boost effects are consumed by her first landing strike.
      this.combatState.caitDamageMult = 1.0;
      this.combatState.siphonBoostNextHit = 0.0;
      this.combatState.markedTargetIndex = null;
      this.combatState.markedTargetId = null;
      this.combatState.markedTargetCritMult = 1.0;

      s.enemies = s.enemies.filter(e => e.hp > 0);
    }

    if (resetExtraActions) {
      this.combatState.caitExtraActions = 0;
    }

    // Kinetic Regent: decay combo by 1 per Cait turn, don't reset potential (it drains on use)
    if (decayCombo) {
      this.combatState.kineticComboStacks = Math.max(0, this.combatState.kineticComboStacks - 1);
    }

    // Cait's own block from cait_block effects
    this.combatState.caitBlockBonus = 0;

    bus.emit('combatUpdate', this._snapshot());

    // Purge dead enemies from Cait's attack
    s.enemies = s.enemies.filter(e => e.hp > 0);
    if (s.enemies.length === 0) {
      if (!deferWinCheck) this._combatWon();
      return true;
    }

    if (!landedAny && attackCount > 1) {
      bus.emit('toast', { text: 'Cait burned the extra vector but found no opening.', type: 'info' });
    }

    return false;
  }

  // ────────────────────────────────────────────────────────
  //  Enemy turn logic
  // ────────────────────────────────────────────────────────

  _executeEnemyIntent(enemy, intent) {
    const s = this.gs.state;
    if (!intent) return;
    if (enemy.skipNextIntent) {
      enemy.skipNextIntent = false;
      bus.emit('enemyAction', { enemy: { ...enemy }, action: { type: 'stunned', description: `${enemy.name} is stunned.` } });
      bus.emit('toast', { text: `${enemy.name} loses its action.`, type: 'passive' });
      return;
    }

    bus.emit('enemyAction', { enemy: { ...enemy }, action: intent });

    switch (intent.type) {
      case 'attack': {
        const amount = toDisplayInt((intent.value ?? 0) * (1 + (enemy.strength ?? 0) / 100));
        if (this.combatState.redirectEnemiesToEnemy) {
          const targets = s.enemies.filter(e => e !== enemy && e.hp > 0);
          if (targets.length > 0) {
            const victim = targets.reduce((a, b) => (b.hp > a.hp ? b : a));
            this._dealDamageToEnemy(victim, amount);
            break;
          }
        }
        this._dealDamageToPlayer(amount, enemy);
        break;
      }
      case 'attackAll': {
        const amount = toDisplayInt(intent.value ?? 0);
        if (this.combatState.redirectEnemiesToEnemy) {
          const targets = s.enemies.filter(e => enemy !== e && e.hp > 0);
          if (targets.length > 0) {
            targets.forEach(t => this._dealDamageToEnemy(t, amount));
            break;
          }
        }
        this._dealDamageToPlayer(amount, enemy);
        break;
      }
      case 'block': {
        enemy.block += toDisplayInt(intent.value ?? 0);
        break;
      }
      case 'buff': {
        enemy.strength = (enemy.strength ?? 0) + toDisplayInt(intent.value ?? 0);
        break;
      }
      case 'heal': {
        const heal = toDisplayInt(intent.value ?? 0);
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
        bus.emit('toast', { text: `${enemy.name} repairs ${heal} HP.`, type: 'enemy' });
        break;
      }
      case 'debuff': {
        const value = toDisplayInt(intent.value ?? 1);
        if (intent.value) {
          this.combatState.nextTurnDrawPenalty = Math.min(1, this.combatState.nextTurnDrawPenalty + value);
          bus.emit('toast', { text: `${enemy.name} jams next draw by ${Math.min(1, value)}.`, type: 'enemy' });
        }
        if (intent.status === 'stun' || intent.stun) {
          this.combatState.asiphyxStunned = true;
        }
        if (intent.status === 'slow' || intent.slow) {
          this.combatState.playerSpeedDelta -= toDisplayInt(intent.value ?? 1);
        }
        break;
      }
      case 'summon': {
        if (s.enemies.length >= MAX_ACTIVE_ENEMIES) {
          const block = toDisplayInt(intent.blockOnFail ?? 6);
          enemy.block += block;
          bus.emit('toast', { text: `${enemy.name}'s summon lane is full. It braces for ${block}.`, type: 'enemy' });
          break;
        }
        const summonName = intent.summonId ?? this._summonIdFromIntent(intent);
        if (summonName) {
          const template = this._resolveEnemyTemplate(summonName);
          if (template) {
            const summonMaxHp = Math.max(1, template.maxHp ?? template.baseHp ?? 1);
            const summonHp = Math.max(8, Math.round(summonMaxHp * SUMMON_HP_MULTIPLIER));
            s.enemies.push({
              id: `${template.id ?? summonName}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              templateId: template.templateId ?? template.id,
              name: template.name ?? summonName,
              emoji: template.emoji,
              sprite: template.sprite,
              idleSprite: template.idleSprite,
              idleFrames: template.idleFrames,
              tier: template.tier,
              flavor: template.flavor,
              hp: summonHp,
              maxHp: summonHp,
              block: 0,
              pattern: (template.pattern ?? [{ type: 'attack', value: 0 }]).map(p => ({ ...p })),
              patternIndex: 0,
              summon: true,
            });
          } else {
            bus.emit('toast', { text: `Summon failed: ${summonName} is missing`, type: 'danger' });
          }
        }
        break;
      }
      default:
        console.warn(`[Combat] Unknown enemy intent: "${intent.type}"`);
    }
  }

  /** Each enemy performs its current intent, then advances the pattern. */
  _executeEnemyTurn() {
    const s = this.gs.state;

    for (const enemy of s.enemies) {
      enemy.block = 0;
    }

    for (const enemy of s.enemies) {
      const intent = enemy.pattern[enemy.patternIndex];
      if (!intent) continue;
      this._executeEnemyIntent(enemy, intent);
      enemy.patternIndex = (enemy.patternIndex + 1) % Math.max(1, enemy.pattern.length);
    }

    bus.emit('combatUpdate', this._snapshot());

    if (s.hp <= 0) {
      this.gs.setPhase('gameOver');
      return;
    }

    // purge dead summons and continue
    s.enemies = s.enemies.filter(e => e.hp > 0);
    if (s.enemies.length === 0) {
      this._combatWon();
      return;
    }

    this.startPlayerTurn();
  }

  // ────────────────────────────────────────────────────────
  //  Damage helpers
  // ────────────────────────────────────────────────────────

  /**
   * Deal damage to an enemy, respecting its block.
   * @param {object} enemy
   * @param {number} rawDamage
   */
  _dealDamageToEnemy(enemy, rawDamage, meta = {}) {
    const s = this.gs.state;
    const source = meta.source ?? 'asiphyx';
    const raw = Math.max(0, rawDamage);
    let remaining = raw;

    const absorbed = Math.min(enemy.block, remaining);
    enemy.block -= absorbed;
    remaining -= absorbed;

    if (remaining > 0) {
      enemy.hp = Math.max(0, enemy.hp - remaining);
    }

    bus.emit('damageDealt', {
      target: 'enemy',
      targetId: enemy.id,
      source,
      amount: raw,
      blocked: absorbed,
      hpAfter: enemy.hp,
      ...meta,
    });

    if (enemy.hp <= 0) {
      s.enemies = s.enemies.filter(e => e.hp > 0);
      bus.emit('toast', { text: `${enemy.name} defeated`, type: 'passive' });
    }
  }

  /**
   * Deal damage to the player, respecting block.
   * @param {number} rawDamage
   * @param {object} source
   */
  _dealDamageToPlayer(rawDamage, source) {
    const s = this.gs.state;
    let remaining = toDisplayInt(rawDamage);

    // Gravitational Lens passive: reduce first attack each turn by 3
    if (this.combatState.passiveRedirectsLeft > 0 && remaining > 0) {
      const reduction = Math.min(3, remaining);
      remaining -= reduction;
      this.combatState.passiveRedirectsLeft -= 1;
      this.combatState.passiveCaitBonus += 2;
      bus.emit('toast', { text: `Gravitational Lens: -${reduction} damage. Cait +${this.combatState.passiveCaitBonus} next strike.`, type: 'passive' });
    }

    const absorbed = Math.min(s.block, remaining);
    s.block -= absorbed;
    remaining -= absorbed;

    // Calculate actual HP damage for counter/reflect (after block)
    const hpDamage = remaining;

    if (remaining > 0) {
      s.hp = Math.max(0, s.hp - remaining);
    }

    // Counter: deal flat damage back to the attacker
    if (this.combatState.counterDamage > 0 && source && hpDamage >= 0) {
      const counterDmg = this.combatState.counterDamage;
      // Source is an enemy object
      if (source && source.hp !== undefined) {
        this._dealDamageToEnemy(source, counterDmg, { source: source.id ?? source.name ?? 'enemy' });
        bus.emit('toast', { text: `Counter: ${counterDmg} damage back!`, type: 'passive' });
      }
    }

    // Reflect: bounce percentage of raw damage back to attacker
    if (this.combatState.reflectPercent > 0 && source && source.hp !== undefined && rawDamage > 0) {
      const reflectDmg = Math.max(1, Math.floor(rawDamage * this.combatState.reflectPercent));
      this._dealDamageToEnemy(source, reflectDmg, { source: source.id ?? source.name ?? 'enemy' });
      bus.emit('toast', { text: `Gravity Mirror: ${reflectDmg} reflected!`, type: 'passive' });
    }

    bus.emit('damageDealt', {
      target: 'player',
      sourceId: source?.id,
      amount: rawDamage,
      blocked: absorbed,
      hpAfter: s.hp,
    });
  }

  // ────────────────────────────────────────────────────────
  //  Win / snapshot
  // ────────────────────────────────────────────────────────

  /** Called when all enemies are dead. */
  _combatWon() {
    const s = this.gs.state;
    const goldReward = 10 + Math.floor(s.floor * 2.5);
    s.gold += goldReward;

    bus.emit('combatUpdate', this._snapshot());
    if (s.floor >= s.maxFloor) {
      this.gs.setPhase('victory');
      return;
    }

    const repair = Math.max(2, Math.floor(s.maxHp * POST_COMBAT_REPAIR_RATIO));
    const repaired = Math.min(repair, s.maxHp - s.hp);
    if (repaired > 0) {
      s.hp += repaired;
      bus.emit('toast', { text: `Cait sync repair: +${repaired} HP.`, type: 'passive' });
    }

    this.gs.startDraft(this.gs.state.cardPool);
    this.gs.setPhase('draft');
  }

  _summonIdFromIntent(intent) {
    const description = intent.description ?? '';
    const match = description.match(/Summon (?:a|an) (.+)\.?/i);
    if (!match || !match[1]) return null;
    return match[1].trim().replace(/[.!?]+$/, '').toLowerCase();
  }

  _resolveEnemyTemplate(rawId) {
    const id = String(rawId).trim().toLowerCase();
    const direct = ENEMIES[id];
    if (direct) return direct;

    const normalized = id.replace(/[\s_]+/g, '_');
    for (const enemy of Object.values(ENEMIES)) {
      if (enemy.id === normalized) return enemy;
      if (enemy.name?.toLowerCase() === id) return enemy;
      if (enemy.name?.toLowerCase() === id.replace(/[\s_]+/g, ' ')) return enemy;
    }

    return null;
  }

  /**
   * Return lightweight combat snapshot for the UI.
   */
  _snapshot() {
    const s = this.gs.state;
    return {
      hp: s.hp,
      maxHp: s.maxHp,
      block: s.block,
      energy: s.energy,
      maxEnergy: s.maxEnergy,
      hand: [...s.hand],
      drawPileCount: s.drawPile.length,
      discardPileCount: s.discardPile.length,
      exhaustPileCount: s.exhaustPile.length,
      enemies: s.enemies.map(e => ({ ...e, pattern: undefined })),
      floor: s.floor,
      gold: s.gold,
      hero: s.hero,
      cait: s.cait ? {
        name: s.cait.name,
        hp: s.cait.hp,
        maxHp: s.cait.maxHp,
        block: s.cait.block ?? 0,
        bondName: s.cait.bondName,
      } : null,
      paradoxChain: this.combatState.paradoxChain,
      gravityWellActive: this.combatState.gravityWellActive,
      markedTargetIndex: this.combatState.markedTargetIndex,
      markedTargetId: this.combatState.markedTargetId,
      markedTargetCritMult: this.combatState.markedTargetCritMult,
      caitDamageMult: this.combatState.caitDamageMult,
      caitExtraActions: this.combatState.caitExtraActions,
      kineticComboStacks: this.combatState.kineticComboStacks,
      latentKineticPotential: this.combatState.latentKineticPotential,
      nextTurnDrawPenalty: this.combatState.nextTurnDrawPenalty,
      currentTurnDrawPenalty: this.combatState.currentTurnDrawPenalty,
      startOfTurnDraw: this.combatState.startOfTurnDraw,
    };
  }
}
