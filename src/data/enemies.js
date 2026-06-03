/**
 * Phyx the Stack — Enemy & Encounter Definitions
 * Enemies keyed by ID, plus encounter tables mapping floor ranges to enemy groups.
 */

export const ENEMIES = {
  // ─────────────────────────────────────────────
  // COMMON ENEMIES
  // ─────────────────────────────────────────────

  null_pointer: {
    id: 'null_pointer',
    name: 'Null Pointer',
    emoji: '🐛',
    sprite: '/assets/enemies/null_pointer.png',
    maxHp: 28,
    pattern: [
      { type: 'attack', value: 6, description: 'Dereference — Deal 6 damage.' },
      { type: 'attack', value: 9, description: 'Segfault — Deal 9 damage.' },
    ],
    flavor: 'Crashes on contact.',
    tier: 'common',
  },

  todo_comment: {
    id: 'todo_comment',
    name: 'TODO Comment',
    emoji: '📝',
    sprite: '/assets/enemies/todo_comment.png',
    maxHp: 20,
    pattern: [
      { type: 'attack', value: 4, description: 'Nag — Deal 4 damage.' },
      { type: 'buff', value: 6, description: 'Procrastinate — Heal 6 HP.' },
    ],
    flavor: '// fix this later',
    tier: 'common',
  },

  type_error: {
    id: 'type_error',
    name: 'Type Error',
    emoji: '🔀',
    sprite: '/assets/enemies/type_error.png',
    maxHp: 25,
    pattern: [
      { type: 'attack', value: 5, description: 'Coerce — Deal 5 damage.' },
      { type: 'attack', value: 8, description: 'Implicit Cast — Deal 8 damage.' },
      { type: 'block', value: 6, description: 'Type Guard — Gain 6 block.' },
    ],
    flavor: 'Expected string, got chaos.',
    tier: 'common',
  },

  spaghetti_code: {
    id: 'spaghetti_code',
    name: 'Spaghetti Code',
    emoji: '🍝',
    sprite: '/assets/enemies/spaghetti_code.png',
    maxHp: 18,
    pattern: [
      { type: 'attack', value: 3, description: 'Tangle — Deal 3 damage.' },
      { type: 'summon', description: 'Fork — Summon a TODO Comment.' },
    ],
    flavor: 'Untangling is half the fight.',
    tier: 'common',
  },

  // ─────────────────────────────────────────────
  // UNCOMMON ENEMIES
  // ─────────────────────────────────────────────

  memory_leak: {
    id: 'memory_leak',
    name: 'Memory Leak',
    emoji: '🕳️',
    sprite: '/assets/enemies/memory_leak.png',
    maxHp: 35,
    pattern: [
      { type: 'attack', value: 7, description: 'Drip — Deal 7 damage.' },
      { type: 'buff', value: 2, description: 'Accumulate — Gain 2 strength.' },
      { type: 'attack', value: 9, description: 'Overflow — Deal 9 damage.' },
    ],
    flavor: 'Gets worse every turn.',
    tier: 'uncommon',
  },

  merge_conflict: {
    id: 'merge_conflict',
    name: 'Merge Conflict',
    emoji: '🔀',
    sprite: '/assets/enemies/merge_conflict.png',
    maxHp: 40,
    pattern: [
      { type: 'attack', value: 8, description: 'Diverge — Deal 8 damage.' },
      { type: 'block', value: 10, description: 'Stalemate — Gain 10 block.' },
      { type: 'attack', value: 12, description: 'Force Push — Deal 12 damage.' },
    ],
    flavor: '<<<< HEAD',
    tier: 'uncommon',
  },

  heisenbug: {
    id: 'heisenbug',
    name: 'Heisenbug',
    emoji: '👻',
    sprite: '/assets/enemies/heisenbug.png',
    maxHp: 30,
    pattern: [
      { type: 'attack', value: 10, description: 'Manifest — Deal 10 damage.' },
      { type: 'block', value: 8, description: 'Vanish — Gain 8 block.' },
      { type: 'attack', value: 4, description: 'Flicker — Deal 4 damage.' },
    ],
    flavor: 'Changes every time you look.',
    tier: 'uncommon',
  },

  dependency_hell: {
    id: 'dependency_hell',
    name: 'Dependency Hell',
    emoji: '📦',
    sprite: '/assets/enemies/dependency_hell.png',
    maxHp: 32,
    pattern: [
      { type: 'summon', description: 'npm install — Summon a Null Pointer.' },
      { type: 'attack', value: 8, description: 'Version Conflict — Deal 8 damage.' },
      { type: 'block', value: 6, description: 'Lock File — Gain 6 block.' },
    ],
    flavor: 'Brings friends.',
    tier: 'uncommon',
  },

  // ─────────────────────────────────────────────
  // ELITE ENEMIES
  // ─────────────────────────────────────────────

  tech_debt: {
    id: 'tech_debt',
    name: 'Tech Debt',
    emoji: '💳',
    sprite: '/assets/enemies/tech_debt.png',
    maxHp: 55,
    pattern: [
      { type: 'attack', value: 10, description: 'Interest — Deal 10 damage.' },
      { type: 'debuff', description: 'Compound — You lose 1 max energy next turn.' },
      { type: 'attack', value: 15, description: 'Collections — Deal 15 damage.' },
      { type: 'block', value: 12, description: 'Restructure — Gain 12 block.' },
    ],
    flavor: 'Accumulates interest.',
    tier: 'elite',
  },

  race_condition: {
    id: 'race_condition',
    name: 'Race Condition',
    emoji: '⚡',
    sprite: '/assets/enemies/race_condition.png',
    maxHp: 45,
    pattern: [
      { type: 'attack', value: 12, description: 'Thread A — Deal 12 damage.' },
      { type: 'attack', value: 12, description: 'Thread B — Deal 12 damage.' },
      { type: 'block', value: 8, description: 'Mutex — Gain 8 block.' },
    ],
    flavor: 'Acts twice sometimes.',
    tier: 'elite',
  },

  // ─────────────────────────────────────────────
  // BOSSES
  // ─────────────────────────────────────────────

  production_outage: {
    id: 'production_outage',
    name: 'Production Outage',
    emoji: '🔥',
    sprite: '/assets/enemies/production_outage.png',
    maxHp: 80,
    pattern: [
      { type: 'attack', value: 12, description: 'Alert Storm — Deal 12 damage.' },
      { type: 'buff', value: 3, description: 'Escalate — Gain 3 enrage (strength).' },
      { type: 'attack', value: 15, description: 'Cascade Failure — Deal 15 damage.' },
      { type: 'attack', value: 18, description: 'Total Meltdown — Deal 18 damage.' },
    ],
    flavor: 'THE SITE IS DOWN.',
    tier: 'boss',
  },

  legacy_codebase: {
    id: 'legacy_codebase',
    name: 'Legacy Codebase',
    emoji: '💀',
    sprite: '/assets/enemies/legacy_codebase.png',
    maxHp: 120,
    pattern: [
      { type: 'attack', value: 8, description: 'Rot — Deal 8 damage.' },
      { type: 'debuff', description: 'Complexity — Reduce hand size by 1.' },
      { type: 'block', value: 20, description: 'Scar Tissue — Gain 20 block.' },
      { type: 'attack', value: 15, description: 'Regression — Deal 15 damage.' },
      { type: 'attack', value: 15, description: 'Cascade — Deal 15 damage.' },
    ],
    flavor: 'Nobody knows how this works.',
    tier: 'boss',
  },

  the_product_manager: {
    id: 'the_product_manager',
    name: 'The Product Manager',
    emoji: '👔',
    sprite: '/assets/enemies/the_product_manager.png',
    maxHp: 100,
    pattern: [
      { type: 'debuff', description: 'Scope Creep — Randomize your hand.' },
      { type: 'attack', value: 10, description: 'Deadline — Deal 10 damage.' },
      { type: 'block', value: 15, description: 'Stakeholder Shield — Gain 15 block.' },
      { type: 'attack', value: 20, description: 'Priority Shift — Deal 20 damage.' },
      { type: 'buff', value: 15, description: 'Pivot — Heal 15 HP.' },
    ],
    flavor: 'Actually, can we pivot?',
    tier: 'boss',
  },
};

/**
 * Encounter tables mapping floor difficulty tiers to possible enemy groups.
 *
 * Floor structure (15 floors total):
 *   Floors 1–4:  easy encounters
 *   Floor 5:     Boss 1 — Production Outage
 *   Floors 6–9:  medium encounters
 *   Floor 10:    Boss 2 — Legacy Codebase
 *   Floors 11–14: hard encounters
 *   Floor 15:    Final Boss — The Product Manager
 *
 * Between combat floors, some nodes are rest sites
 * (heal 30% HP or remove a card from deck).
 */
export const ENCOUNTERS = {
  // Floors 1–4: common enemies, small groups
  easy: [
    ['null_pointer'],
    ['todo_comment', 'todo_comment'],
    ['type_error'],
    ['spaghetti_code'],
    ['null_pointer', 'todo_comment'],
    ['type_error', 'spaghetti_code'],
  ],

  // Floors 6–9: uncommon enemies mixed with tougher commons
  medium: [
    ['memory_leak'],
    ['merge_conflict'],
    ['heisenbug'],
    ['dependency_hell'],
    ['memory_leak', 'null_pointer'],
    ['merge_conflict', 'todo_comment'],
    ['heisenbug', 'type_error'],
    ['dependency_hell', 'spaghetti_code'],
  ],

  // Floors 11–14: elites and tough uncommon combos
  hard: [
    ['tech_debt'],
    ['race_condition'],
    ['tech_debt', 'null_pointer'],
    ['race_condition', 'memory_leak'],
    ['merge_conflict', 'heisenbug'],
    ['dependency_hell', 'merge_conflict'],
  ],

  // Boss floors
  boss_1: [['production_outage']],
  boss_2: [['legacy_codebase']],
  boss_3: [['the_product_manager']],
};

/**
 * Returns the encounter pool for a given floor number (1–15).
 * @param {number} floor - The current floor (1-indexed).
 * @returns {{ pool: string, isBoss: boolean }}
 */
export function getEncounterPool(floor) {
  if (floor >= 1 && floor <= 4) return { pool: 'easy', isBoss: false };
  if (floor === 5) return { pool: 'boss_1', isBoss: true };
  if (floor >= 6 && floor <= 9) return { pool: 'medium', isBoss: false };
  if (floor === 10) return { pool: 'boss_2', isBoss: true };
  if (floor >= 11 && floor <= 14) return { pool: 'hard', isBoss: false };
  if (floor === 15) return { pool: 'boss_3', isBoss: true };
  throw new Error(`Invalid floor number: ${floor}. Must be 1–15.`);
}

export default { ENEMIES, ENCOUNTERS, getEncounterPool };
