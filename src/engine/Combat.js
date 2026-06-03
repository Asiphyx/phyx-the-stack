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
      endOfTurnBlock: 0,
      retainPlayerBlock: false,
      doubleNextCard: false,

      // Turn flags
      isFirstCardThisTurn: true,
      asiphyxShuffleThisTurn: false,
      endTurnExhaustIds: new Set(),

      // Combo tracking
      combatPlayCounts: new Map(),
      frequentCardBonus: 0,
      removedFromDeckThisCombat: 0,
      lastParadoxCategory: null,
      paradoxChain: 0,

      // Last attack copy/paste
      lastAttackCard: null,
    };
  }

  _newTurnState() {
    return {
      ...this._newCombatState(),
      isFirstCardThisTurn: true,
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
      name: e.name,
      emoji: e.emoji,
      sprite: e.sprite,
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
  startPlayerTurn() {
    const s = this.gs.state;

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

    this.drawCards(5);
    bus.emit('combatUpdate', this._snapshot());
  }

  /**
   * Draw N cards from draw pile into hand.
   * If draw pile is empty, reshuffle discard into draw pile.
   * @param {number} n
   */
  drawCards(n) {
    const s = this.gs.state;
    for (let i = 0; i < n; i++) {
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
          s.energy = Math.max(0, s.energy - 1);
          bus.emit('toast', { text: 'Memory Leak: -1 Energy!', type: 'danger' });
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
   * @returns {boolean}
   */
  playCard(handIndex, targetIndex = 0) {
    const s = this.gs.state;
    const card = s.hand[handIndex];
    if (!card) return false;

    if (card.tags?.includes('curse') || card.id === 'memory_leak') {
      bus.emit('toast', { text: `${card.name} is unplayable!`, type: 'danger' });
      return false;
    }

    const effectiveCost = this.getCardCost(card);
    if (effectiveCost > s.energy) return false;

    // Hero-only checks
    if (card.heroOnly && card.heroOnly !== s.hero?.id) {
      bus.emit('combatUpdate', this._snapshot());
      return false;
    }

    s.energy -= effectiveCost;
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

    // Resolve destination pile
    this._finalizeCard(card, resolveState);

    // Purge dead enemies and win-check
    s.enemies = s.enemies.filter(e => e.hp > 0);
    bus.emit('combatUpdate', this._snapshot());
    if (s.enemies.length === 0) {
      this._combatWon();
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
          const val = toDisplayInt(effect.value ?? 0);
          s.energy = Math.max(0, s.energy - val);
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
  endPlayerTurn() {
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
    this._executeEnemyTurn();
  }

  // ────────────────────────────────────────────────────────
  //  Enemy turn logic
  // ────────────────────────────────────────────────────────

  /** Each enemy performs its current intent, then advances the pattern. */
  _executeEnemyTurn() {
    const s = this.gs.state;

    for (const enemy of s.enemies) {
      const intent = enemy.pattern[enemy.patternIndex];
      if (!intent) continue;

      switch (intent.type) {
        case 'attack': {
          const amount = toDisplayInt((intent.value ?? 0) * (1 + (enemy.strength ?? 0) / 100));
          this._dealDamageToPlayer(amount, enemy);
          break;
        }
        case 'attackAll': {
          const amount = toDisplayInt(intent.value ?? 0);
          this._dealDamageToPlayer(amount, enemy);
          break;
        }
        case 'block': {
          enemy.block += toDisplayInt(intent.value ?? 0);
          break;
        }
        case 'buff': {
          // Current data uses this as basic self-scaling.
          enemy.strength = (enemy.strength ?? 0) + toDisplayInt(intent.value ?? 0);
          break;
        }
        case 'debuff': {
          // Simple fallback: mild energy suppression to represent a debuff to the player.
          if (intent.value) {
            s.maxEnergy = Math.max(0, s.maxEnergy - toDisplayInt(intent.value));
            s.energy = Math.min(s.energy, s.maxEnergy);
          }
          break;
        }
        case 'summon': {
          const summonName = intent.summonId ?? this._summonIdFromIntent(intent);
          if (summonName) {
            const template = this._resolveEnemyTemplate(summonName);
            if (template) {
              s.enemies.push({
                id: `${template.id ?? summonName}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                name: template.name ?? summonName,
                emoji: template.emoji,
                sprite: template.sprite,
                tier: template.tier,
                flavor: template.flavor,
                hp: Math.max(1, template.maxHp ?? template.baseHp ?? 1),
                maxHp: Math.max(1, template.maxHp ?? template.baseHp ?? 1),
                block: 0,
                pattern: (template.pattern ?? [{ type: 'attack', value: 0 }]).map(p => ({ ...p })),
                patternIndex: 0,
                summon: true,
              });
            } else {
              bus.emit('toast', {
                text: `Summon failed: ${summonName} is missing`,
                type: 'danger',
              });
            }
          }
          break;
        }
        default:
          console.warn(`[Combat] Unknown enemy intent: "${intent.type}"`);
      }

      bus.emit('enemyAction', { enemy: { ...enemy }, action: intent });
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
  _dealDamageToEnemy(enemy, rawDamage) {
    const s = this.gs.state;
    const strengthMultiplier = 1 + (enemy.strength ?? 0) / 100;
    const raw = Math.max(0, rawDamage * strengthMultiplier);
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
      amount: raw,
      blocked: absorbed,
      hpAfter: enemy.hp,
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

    const absorbed = Math.min(s.block, remaining);
    s.block -= absorbed;
    remaining -= absorbed;

    if (remaining > 0) {
      s.hp = Math.max(0, s.hp - remaining);
    }

    bus.emit('damageDealt', {
      target: 'player',
      sourceId: source.id,
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

    this.gs.startDraft(this.gs.state.cardPool);
    this.gs.setPhase('draft');
  }

  _summonIdFromIntent(intent) {
    const description = intent.description ?? '';
    const match = description.match(/Summon (?:a|an) (.+)\.?/i);
    if (!match || !match[1]) return null;
    return match[1].trim().toLowerCase();
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
      paradoxChain: this.combatState.paradoxChain,
    };
  }
}
