// ============================================================
// DraftSystem.js — Card draft / reward system after combat
// ============================================================
// Modified for Phyx the Stack: Legacy Refactoring Terminal
// ============================================================

import bus from './EventBus.js';

export class DraftSystem {
  /**
   * @param {import('./GameState.js').GameState} gameState
   */
  constructor(gameState) {
    /** @type {import('./GameState.js').GameState} */
    this.gs = gameState;

    /** Current phase type: 'choice', 'deprecate_select', 'refactor_select', 'compile_select' */
    this.draftType = 'choice';

    /** Cards currently offered to the player for drafting (Option 3: Compile) */
    this.offeredCards = [];
    
    /** Saved full card pool for feature compiling */
    this.cardPool = [];
  }

  // ──────────────────────────────────────────────────────────
  //  Generate draft options
  // ──────────────────────────────────────────────────────────

  /**
   * Enter the refactoring terminal after combat.
   * Called by GameState when entering the 'draft' phase.
   *
   * @param {object[]} cardPool — full array of possible reward cards
   */
  generateDraft(cardPool) {
    this.cardPool = cardPool;
    this.draftType = 'choice';
    this.offeredCards = [];

    bus.emit('draftOffered', {
      type: this.draftType,
      cards: [],
      gold: this.gs.state.gold,
    });
  }

  exportState() {
    return {
      draftType: this.draftType,
      offeredCards: this.offeredCards.map(c => ({ ...c })),
      cardPool: this.cardPool.map(c => ({ ...c })),
    };
  }

  importState(rawState = {}) {
    this.draftType = rawState.draftType ?? 'choice';
    this.offeredCards = (rawState.offeredCards ?? []).map(c => ({ ...c }));
    this.cardPool = (rawState.cardPool ?? []).map(c => ({ ...c }));
  }

  /**
   * Choose a refactoring mode in the terminal.
   * @param {string} mode — 'deprecate', 'refactor', 'compile'
   */
  chooseMode(mode) {
    if (mode === 'deprecate') {
      this.draftType = 'deprecate_select';
    } else if (mode === 'refactor') {
      this.draftType = 'refactor_select';
    } else if (mode === 'compile') {
      this.draftType = 'compile_select';
      // Pick 3 random cards to show
      const owned = new Set(this.gs.state.deck.map(c => c.id));
      const eligible = this.cardPool.filter(c => !c.unique || !owned.has(c.id));
      const shuffled = [...eligible].sort(() => Math.random() - 0.5);
      this.offeredCards = shuffled.slice(0, 3).map(c => ({ ...c }));
    }

    bus.emit('draftOffered', {
      type: this.draftType,
      cards: this.offeredCards.map(c => ({ ...c })),
      gold: this.gs.state.gold,
    });
  }

  // ──────────────────────────────────────────────────────────
  //  Refactoring Actions
  // ──────────────────────────────────────────────────────────

  /**
   * Deprecate: Delete a card by instance ID.
   */
  deprecateCard(instanceId) {
    const s = this.gs.state;
    const idx = s.deck.findIndex(c => c.instanceId === instanceId);
    if (idx === -1) return false;

    const card = s.deck.splice(idx, 1)[0];
    bus.emit('toast', { text: `DEPRECATED: ${card.name}!`, type: 'danger' });
    this._advanceAfterDraft();
    return true;
  }

  /**
   * Refactor: Upgrade a card's parameters.
   */
  refactorCard(instanceId) {
    const s = this.gs.state;
    const card = s.deck.find(c => c.instanceId === instanceId);
    if (!card) return false;

    card.upgraded = (card.upgraded ?? 0) + 1;
    card.name = `${card.name.replace(/\++/g, '')}++`;

    // Upgrade numeric values in effects
    for (const effect of card.effects ?? []) {
      if (effect.value !== undefined) {
        if (effect.type === 'damage' || effect.type === 'damageAll') {
          effect.value = Math.round(effect.value * 1.5) + 3;
        } else if (effect.type === 'block') {
          effect.value = Math.round(effect.value * 1.5) + 3;
        } else if (effect.type === 'heal' || effect.type === 'draw' || effect.type === 'energy') {
          effect.value += 1;
        }
      }
    }

    // Rewrite description text
    if (card.description) {
      card.description = card.description.replace(/\d+/g, (val) => {
        const num = parseInt(val, 10);
        return Math.round(num * 1.5) + (num > 2 ? 3 : 1);
      });
    }

    bus.emit('toast', { text: `REFACTORED: ${card.name}!`, type: 'passive' });
    this._advanceAfterDraft();
    return true;
  }

  /**
   * Compile Feature: Add a card to the deck.
   */
  pickCard(index) {
    const card = this.offeredCards[index];
    if (!card) return false;

    const instance = {
      ...card,
      instanceId: `${card.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };

    this.gs.state.deck.push(instance);
    this.offeredCards = [];
    bus.emit('toast', { text: `COMPILED: ${card.name}!`, type: 'info' });
    this._advanceAfterDraft();
    return true;
  }

  /**
   * Skip refactoring.
   */
  skip() {
    this.offeredCards = [];
    this._advanceAfterDraft();
  }

  // ──────────────────────────────────────────────────────────
  //  Post-draft progression
  // ──────────────────────────────────────────────────────────

  _advanceAfterDraft() {
    const s = this.gs.state;
    if (s.floor >= s.maxFloor) {
      this.gs.setPhase('victory');
    } else {
      s.floor += 1;
      this.gs.setPhase('map');
    }
  }
}
