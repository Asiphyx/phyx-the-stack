// ============================================================
// EventBus.js — Singleton pub/sub event emitter
// ============================================================
// Every engine system emits events through this single bus so
// the UI layer can subscribe without tight coupling.
//
// Events emitted across the engine:
//   'stateChange'   — game phase changed
//   'combatUpdate'  — HP, block, energy, piles changed
//   'damageDealt'   — { target, amount } for floating numbers
//   'cardPlayed'    — { card, target } for animations
//   'caitAttackWindup' — { targetId, targetIndex, amount } before Cait strike lands
//   'enemyAction'   — { enemy, action } for enemy turn FX
//   'draftOffered'  — { cards } pick-one-of-three screen
// ============================================================

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} unsubscribe helper
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    // Return a handy unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) this._listeners.delete(event);
    }
  }

  /**
   * Subscribe to an event, but only fire once then auto-unsubscribe.
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} unsubscribe helper (in case you cancel early)
   */
  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback(...args);
    };
    return this.on(event, wrapper);
  }

  /**
   * Emit an event to all subscribers.
   * @param {string} event
   * @param  {...any} args  — payload data
   */
  emit(event, ...args) {
    const set = this._listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(...args);
        } catch (err) {
          console.error(`[EventBus] Error in listener for "${event}":`, err);
        }
      }
    }
  }

  /**
   * Remove ALL listeners (useful for test teardown / full reset).
   */
  clear() {
    this._listeners.clear();
  }
}

// ── Singleton export ────────────────────────────────────────
const bus = new EventBus();
export default bus;
