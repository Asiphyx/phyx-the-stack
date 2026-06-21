// ============================================================
// FloorManager.js — Floor progression & map generation
// ============================================================
// Manages the run structure. The jam demo uses an 11-floor linear map:
//   Floors  1-4   — normal encounters
//   Floor   5     — elite encounter
//   Floors  6-9   — normal encounters
//   Floor  10     — elite encounter
//   Floor  11     — boss encounter
//
// For the MVP the map is linear: one node per floor.
// A future version can branch into Slay-the-Spire-style paths.
// ============================================================

import bus from './EventBus.js';

// ── Node types ──────────────────────────────────────────────
export const NODE_TYPE = Object.freeze({
  COMBAT:   'combat',
  ELITE:    'elite',
  BOSS:     'boss',
  REST:     'rest',
  SHOP:     'shop',
});

// ── Floor Manager ───────────────────────────────────────────

export class FloorManager {
  /**
   * @param {import('./GameState.js').GameState} gameState
   */
  constructor(gameState) {
    /** @type {import('./GameState.js').GameState} */
    this.gs = gameState;

    /**
     * The generated map — an array of floor nodes.
     * @type {{ floor: number, type: string }[]}
     */
    this.map = [];
  }

  // ──────────────────────────────────────────────────────────
  //  Map generation
  // ──────────────────────────────────────────────────────────

  /**
   * Generate the full run map (called once at run start).
   * @param {number} [totalFloors=15]
   */
  generateMap(totalFloors = 15) {
    this.map = [];
    const s = this.gs.state;
    s.maxFloor = totalFloors;

    for (let f = 1; f <= totalFloors; f++) {
      this.map.push({ floor: f, type: this._nodeTypeForFloor(f, totalFloors) });
    }

    bus.emit('mapGenerated', { map: [...this.map] });
  }

  /**
   * Decide what type of node a given floor should be.
   * @param {number} floor
   * @param {number} total
   * @returns {string}
   */
  _nodeTypeForFloor(floor, total) {
    // Final floor is always the boss
    if (floor === total) return NODE_TYPE.BOSS;

    // Jam-demo runs use ten fight rounds, then the boss. Keep this direct
    // and readable instead of spending demo time on rest/shop filler.
    if (total <= 11) {
      if (floor === 5 || floor === 10) return NODE_TYPE.ELITE;
      return NODE_TYPE.COMBAT;
    }

    // Elites at floors 5 and 10
    if (floor === 5 || floor === 10) return NODE_TYPE.ELITE;

    // Offer a rest site before elites / boss
    if (floor === 4 || floor === 9 || floor === 14) {
      // 50 % chance rest, 50 % shop — keeps things interesting
      return Math.random() < 0.5 ? NODE_TYPE.REST : NODE_TYPE.SHOP;
    }

    // Everything else is a normal combat
    return NODE_TYPE.COMBAT;
  }

  // ──────────────────────────────────────────────────────────
  //  Current floor helpers
  // ──────────────────────────────────────────────────────────

  /**
   * Get the node for the player's current floor.
   * @returns {{ floor: number, type: string } | null}
   */
  getCurrentNode() {
    return this.map.find(n => n.floor === this.gs.state.floor) ?? null;
  }

  /**
   * Get the difficulty tier for enemy scaling.
   * Returns 1 (easy), 2 (medium), or 3 (hard/boss).
   * @param {number} [floor]
   * @returns {number}
   */
  getDifficulty(floor) {
    const f = floor ?? this.gs.state.floor;
    if (f <= 4) return 1;
    if (f <= 9) return 2;
    return 3;
  }

  // ──────────────────────────────────────────────────────────
  //  Enemy encounter generation
  // ──────────────────────────────────────────────────────────

  /**
   * Build an array of enemy definitions for the current floor.
   * Pulls from the provided enemy catalogue, scaling to difficulty.
   *
   * @param {object} catalogue — { normal: [], elite: [], boss: [] }
   *   Each entry: { name, baseHp, pattern: [] }
   * @returns {object[]} enemies ready for Combat.startCombat()
   */
  generateEncounter(catalogue) {
    const node = this.getCurrentNode();
    if (!node) return [];

    const difficulty = this.getDifficulty();
    const hpScale = 0.8 + difficulty * 0.2; // 1.0 / 1.2 / 1.4

    switch (node.type) {
      case NODE_TYPE.BOSS: {
        const template = this._pick(catalogue.boss);
        return [this._instantiateEnemy(template, hpScale * 1.5, 0)];
      }

      case NODE_TYPE.ELITE: {
        const template = this._pick(catalogue.elite);
        return [this._instantiateEnemy(template, hpScale * 1.2, 0)];
      }

      case NODE_TYPE.COMBAT:
      default: {
        const groupPool = this._normalGroupPoolForDifficulty(catalogue, difficulty);
        if (groupPool.length > 0) {
          const group = this._pick(groupPool);
          return group
            .map(id => this._resolveTemplate(catalogue, id))
            .filter(Boolean)
            .map((template, index) => this._instantiateEnemy(template, hpScale, index))
            .filter(Boolean);
        }

        // 1-3 normal enemies depending on difficulty
        const pool = this._normalPoolForDifficulty(catalogue, difficulty);
        const count = Math.min(difficulty, pool.length);
        const enemies = [];
        for (let i = 0; i < count; i++) {
          const template = this._pick(pool);
          enemies.push(this._instantiateEnemy(template, hpScale, i));
        }
        return enemies;
      }
    }
  }

  _normalGroupPoolForDifficulty(catalogue, difficulty) {
    if (difficulty <= 1 && catalogue.easyGroups?.length) return catalogue.easyGroups;
    if (difficulty === 2 && catalogue.mediumGroups?.length) return catalogue.mediumGroups;
    if (difficulty >= 3 && catalogue.hardGroups?.length) return catalogue.hardGroups;
    return [];
  }

  _normalPoolForDifficulty(catalogue, difficulty) {
    if (difficulty <= 1 && catalogue.easy?.length) return catalogue.easy;
    if (difficulty === 2 && catalogue.medium?.length) return catalogue.medium;
    if (difficulty >= 3 && catalogue.hard?.length) return catalogue.hard;
    return catalogue.normal ?? [];
  }

  _resolveTemplate(catalogue, id) {
    if (!id) return null;
    if (catalogue.byId?.[id]) return catalogue.byId[id];
    const all = [
      ...(catalogue.easy ?? []),
      ...(catalogue.medium ?? []),
      ...(catalogue.hard ?? []),
      ...(catalogue.normal ?? []),
      ...(catalogue.elite ?? []),
      ...(catalogue.boss ?? []),
    ];
    return all.find(template => template?.id === id || template?.templateId === id) ?? null;
  }


  /**
   * Create a concrete enemy instance from a template.
   * @param {object} template
   * @param {number} hpMultiplier
   * @param {number} index
   * @returns {object}
   */
  _instantiateEnemy(template, hpMultiplier, index) {
    const baseHp = template.baseHp ?? template.maxHp ?? 0;
    const scaledHp = Math.max(1, Math.round(baseHp * hpMultiplier));
    const templateId = template.id ?? template.name.toLowerCase().replace(/\s+/g, '_');
    return {
      id: `${templateId}_${index}`,
      templateId,
      name: template.name,
      emoji: template.emoji,
      sprite: template.sprite,
      idleSprite: template.idleSprite,
      idleFrames: template.idleFrames,
      tier: template.tier,
      flavor: template.flavor,
      hp: scaledHp,
      maxHp: scaledHp,
      block: 0,
      pattern: template.pattern.map(p => ({ ...p })),
      patternIndex: 0,
    };
  }

  // ──────────────────────────────────────────────────────────
  //  Rest & Shop helpers
  // ──────────────────────────────────────────────────────────

  /**
   * Rest at a campfire — heal 30 % of max HP.
   */
  rest() {
    const s = this.gs.state;
    const healAmount = Math.floor(s.maxHp * 0.3);
    s.hp = Math.min(s.hp + healAmount, s.maxHp);

    bus.emit('combatUpdate', { hp: s.hp, maxHp: s.maxHp });

    // After resting, advance to next floor
    s.floor += 1;
    this.gs.setPhase('map');
  }

  // ──────────────────────────────────────────────────────────
  //  Utility
  // ──────────────────────────────────────────────────────────

  /**
   * Pick a random element from an array.
   * @template T
   * @param {T[]} arr
   * @returns {T}
   */
  _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
