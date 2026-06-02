// ============================================================
// DraftSystem.js — Card draft / reward system after combat
// ============================================================
// After each combat victory the player is offered 3 cards to
// choose from (or they may skip).  The selected card is added
// to their permanent deck.
//
// The card pool passed in should come from game data; this
// module is pool-agnostic — it just samples and adds.
// ============================================================

import bus from './EventBus.js';

export class DraftSystem {
  /**
   * @param {import('./GameState.js').GameState} gameState
   */
  constructor(gameState) {
    /** @type {import('./GameState.js').GameState} */
    this.gs = gameState;

    /** Cards currently offered to the player (3 choices). */
    this.offeredCards = [];
  }

  // ──────────────────────────────────────────────────────────
  //  Generate draft options
  // ──────────────────────────────────────────────────────────

  /**
   * Offer a draft of N cards from the given pool.
   * Called by GameState when entering the 'draft' phase.
   *
   * @param {object[]} cardPool — full array of possible reward cards
   * @param {number}   [count=3] — how many choices to show
   */
  generateDraft(cardPool, count = 3) {
    // Filter out cards the player already owns if they're flagged unique
    const owned = new Set(this.gs.state.deck.map(c => c.id));
    const eligible = cardPool.filter(c => !c.unique || !owned.has(c.id));

    // Sample without replacement
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    this.offeredCards = shuffled.slice(0, count).map(c => ({ ...c }));

    bus.emit('draftOffered', {
      cards: this.offeredCards.map(c => ({ ...c })),
      gold: this.gs.state.gold,
    });
  }

  // ──────────────────────────────────────────────────────────
  //  Player picks a card (or skips)
  // ──────────────────────────────────────────────────────────

  /**
   * Player selects one of the offered cards.
   * @param {number} index — index in offeredCards (0-based)
   * @returns {boolean} true if the pick was valid
   */
  pickCard(index) {
    const card = this.offeredCards[index];
    if (!card) return false;

    // Give the card a unique instance id so the deck can hold duplicates
    const instance = {
      ...card,
      instanceId: `${card.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };

    this.gs.state.deck.push(instance);
    this.offeredCards = [];

    bus.emit('combatUpdate', { deckSize: this.gs.state.deck.length });
    this._advanceAfterDraft();
    return true;
  }

  /**
   * Player skips the draft — takes no card.
   */
  skip() {
    this.offeredCards = [];
    this._advanceAfterDraft();
  }

  // ──────────────────────────────────────────────────────────
  //  Post-draft progression
  // ──────────────────────────────────────────────────────────

  /** Move to the next floor (via map) or declare victory. */
  _advanceAfterDraft() {
    const s = this.gs.state;

    // If we just beat the final floor → victory!
    if (s.floor >= s.maxFloor) {
      this.gs.setPhase('victory');
    } else {
      // Advance floor counter and go back to the map
      s.floor += 1;
      this.gs.setPhase('map');
    }
  }
}
