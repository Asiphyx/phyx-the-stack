/**
 * Phyx the Stack — Card Definitions
 * All cards keyed by card ID. Includes starter, common, uncommon, rare, and hero signature cards.
 */

export const CARDS = {
  // ─────────────────────────────────────────────
  // STARTER CARDS
  // ─────────────────────────────────────────────

  git_push: {
    id: 'git_push',
    name: 'Git Push',
    description: 'Deal 6 damage.',
    flavor: 'Ship it.',
    cost: 1,
    rarity: 'starter',
    type: 'attack',
    effects: [
      { type: 'damage', value: 6, target: 'enemy' },
    ],
    heroOnly: null,
    emoji: '🚀',
    tags: ['offensive'],
  },

  try_catch: {
    id: 'try_catch',
    name: 'Try / Catch',
    description: 'Gain 5 block.',
    flavor: 'Handle it... somehow.',
    cost: 1,
    rarity: 'starter',
    type: 'skill',
    effects: [
      { type: 'block', value: 5, target: 'self' },
    ],
    heroOnly: null,
    emoji: '🛡️',
    tags: ['defensive'],
  },

  null_check: {
    id: 'null_check',
    name: 'Null Check',
    description: 'Gain 3 block.',
    flavor: 'Defensive programming.',
    cost: 0,
    rarity: 'starter',
    type: 'skill',
    effects: [
      { type: 'block', value: 3, target: 'self' },
    ],
    heroOnly: 'asiphyx',
    emoji: '✓',
    tags: ['defensive'],
  },

  // ─────────────────────────────────────────────
  // COMMON CARDS
  // ─────────────────────────────────────────────

  code_review: {
    id: 'code_review',
    name: 'Code Review',
    description: 'Reveal enemy intent. Gain 4 block.',
    flavor: 'Looks good to me.',
    cost: 1,
    rarity: 'common',
    type: 'skill',
    effects: [
      { type: 'reveal_intent', target: 'enemy' },
      { type: 'block', value: 4, target: 'self' },
    ],
    heroOnly: null,
    emoji: '🔍',
    tags: ['defensive', 'utility'],
  },

  hotfix: {
    id: 'hotfix',
    name: 'Hotfix',
    description: 'Deal 4 damage and gain 4 block.',
    flavor: 'Patch it live.',
    cost: 1,
    rarity: 'common',
    type: 'attack',
    effects: [
      { type: 'damage', value: 4, target: 'enemy' },
      { type: 'block', value: 4, target: 'self' },
    ],
    heroOnly: null,
    emoji: '🛠️',
    tags: ['offensive', 'defensive'],
  },

  unit_test: {
    id: 'unit_test',
    name: 'Unit Test',
    description: 'Gain 8 block.',
    flavor: 'Green means go.',
    cost: 1,
    rarity: 'common',
    type: 'skill',
    effects: [
      { type: 'block', value: 8, target: 'self' },
    ],
    heroOnly: null,
    emoji: '🧪',
    tags: ['defensive'],
  },

  coffee_break: {
    id: 'coffee_break',
    name: 'Coffee Break',
    description: 'Draw 2 cards.',
    flavor: 'Fuel.',
    cost: 1,
    rarity: 'common',
    type: 'skill',
    effects: [
      { type: 'draw', value: 2 },
    ],
    heroOnly: null,
    emoji: '☕',
    tags: ['utility', 'draw'],
  },

  rubber_duck: {
    id: 'rubber_duck',
    name: 'Rubber Duck',
    description: 'Deal 3 damage and draw 1 card.',
    flavor: 'Explaining it helps.',
    cost: 1,
    rarity: 'common',
    type: 'attack',
    effects: [
      { type: 'damage', value: 3, target: 'enemy' },
      { type: 'draw', value: 1 },
    ],
    heroOnly: null,
    emoji: '🦆',
    tags: ['offensive', 'draw'],
  },

  console_log: {
    id: 'console_log',
    name: 'Console.log',
    description: 'Draw 1 card.',
    flavor: 'The OG debugger.',
    cost: 0,
    rarity: 'common',
    type: 'skill',
    effects: [
      { type: 'draw', value: 1 },
    ],
    heroOnly: null,
    emoji: '📋',
    tags: ['utility', 'draw'],
  },

  git_blame: {
    id: 'git_blame',
    name: 'Git Blame',
    description: 'Deal 7 damage.',
    flavor: 'It was Dave.',
    cost: 1,
    rarity: 'common',
    type: 'attack',
    effects: [
      { type: 'damage', value: 7, target: 'enemy' },
    ],
    heroOnly: null,
    emoji: '🔎',
    tags: ['offensive'],
  },

  linter: {
    id: 'linter',
    name: 'Linter',
    description: 'Gain 6 block. Draw 1 card if you have block.',
    flavor: 'Auto-format.',
    cost: 1,
    rarity: 'common',
    type: 'skill',
    effects: [
      { type: 'block', value: 6, target: 'self' },
      { type: 'draw_if_block', value: 1 },
    ],
    heroOnly: null,
    emoji: '✨',
    tags: ['defensive', 'draw'],
  },

  // ─────────────────────────────────────────────
  // UNCOMMON CARDS
  // ─────────────────────────────────────────────

  stack_overflow: {
    id: 'stack_overflow',
    name: 'Stack Overflow',
    description: 'Copy the last attack you played this combat and play it.',
    flavor: 'Someone already solved this.',
    cost: 1,
    rarity: 'uncommon',
    type: 'attack',
    effects: [
      { type: 'copy_last_attack' },
    ],
    heroOnly: null,
    emoji: '⚡',
    tags: ['offensive', 'utility'],
  },

  docker_container: {
    id: 'docker_container',
    name: 'Docker Container',
    description: 'Gain 12 block. Block doesn\'t reset this turn.',
    flavor: 'Isolated.',
    cost: 2,
    rarity: 'uncommon',
    type: 'skill',
    effects: [
      { type: 'block', value: 12, target: 'self' },
      { type: 'retain_block' },
    ],
    heroOnly: null,
    emoji: '📦',
    tags: ['defensive'],
  },

  pair_programming: {
    id: 'pair_programming',
    name: 'Pair Programming',
    description: 'Your next card is played twice.',
    flavor: 'Two heads.',
    cost: 1,
    rarity: 'uncommon',
    type: 'skill',
    effects: [
      { type: 'double_next_card' },
    ],
    heroOnly: null,
    emoji: '👥',
    tags: ['utility'],
  },

  refactor: {
    id: 'refactor',
    name: 'Refactor',
    description: 'Remove a card from your deck permanently. Exhaust.',
    flavor: 'Clean it up.',
    cost: 1,
    rarity: 'uncommon',
    type: 'skill',
    effects: [
      { type: 'remove_card_from_deck' },
      { type: 'exhaust' },
    ],
    heroOnly: null,
    emoji: '🔄',
    tags: ['utility', 'exhaust'],
  },

  ci_pipeline: {
    id: 'ci_pipeline',
    name: 'CI Pipeline',
    description: 'Gain 5 block. At end of turn, gain 5 block again.',
    flavor: 'Automated.',
    cost: 2,
    rarity: 'uncommon',
    type: 'skill',
    effects: [
      { type: 'block', value: 5, target: 'self' },
      { type: 'end_of_turn_block', value: 5 },
    ],
    heroOnly: null,
    emoji: '🔁',
    tags: ['defensive'],
  },

  regex: {
    id: 'regex',
    name: 'Regex',
    description: 'Deal 14 damage.',
    flavor: 'Now you have two problems.',
    cost: 2,
    rarity: 'uncommon',
    type: 'attack',
    effects: [
      { type: 'damage', value: 14, target: 'enemy' },
    ],
    heroOnly: null,
    emoji: '🎯',
    tags: ['offensive'],
  },

  open_source: {
    id: 'open_source',
    name: 'Open Source',
    description: 'Add a random common card to your hand. Draw 1.',
    flavor: 'Community effort.',
    cost: 1,
    rarity: 'uncommon',
    type: 'skill',
    effects: [
      { type: 'add_random_common_to_hand' },
      { type: 'draw', value: 1 },
    ],
    heroOnly: null,
    emoji: '🌐',
    tags: ['utility', 'draw'],
  },

  // ─────────────────────────────────────────────
  // RARE CARDS
  // ─────────────────────────────────────────────

  it_works_on_my_machine: {
    id: 'it_works_on_my_machine',
    name: 'It Works on My Machine',
    description: 'Random: deal 15 damage OR gain 15 block OR draw 4 cards OR heal 10 HP.',
    flavor: 'YOLO deploy.',
    cost: 0,
    rarity: 'rare',
    type: 'skill',
    effects: [
      {
        type: 'random_one_of',
        options: [
          { type: 'damage', value: 15, target: 'enemy' },
          { type: 'block', value: 15, target: 'self' },
          { type: 'draw', value: 4 },
          { type: 'heal', value: 10, target: 'self' },
        ],
      },
    ],
    heroOnly: null,
    emoji: '🎰',
    tags: ['offensive', 'defensive', 'utility'],
  },

  microservices: {
    id: 'microservices',
    name: 'Microservices',
    description: 'All cards cost 1 less for the rest of combat.',
    flavor: 'Distributed everything.',
    cost: 3,
    rarity: 'rare',
    type: 'power',
    effects: [
      { type: 'reduce_all_costs', value: 1 },
    ],
    heroOnly: null,
    emoji: '🏗️',
    tags: ['utility'],
  },

  ai_autocomplete: {
    id: 'ai_autocomplete',
    name: 'AI Autocomplete',
    description: 'Deal damage equal to your current block.',
    flavor: 'Let the machine decide.',
    cost: 2,
    rarity: 'rare',
    type: 'attack',
    effects: [
      { type: 'damage_equal_to_block', target: 'enemy' },
    ],
    heroOnly: null,
    emoji: '🤖',
    tags: ['offensive'],
  },

  sudo_rm_rf: {
    id: 'sudo_rm_rf',
    name: 'sudo rm -rf /',
    description: 'Deal 30 damage to ALL enemies. Exhaust.',
    flavor: 'Nuclear option.',
    cost: 3,
    rarity: 'rare',
    type: 'attack',
    effects: [
      { type: 'damage', value: 30, target: 'all_enemies' },
      { type: 'exhaust' },
    ],
    heroOnly: null,
    emoji: '💀',
    tags: ['offensive', 'aoe', 'exhaust'],
  },

  kubernetes: {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'At the start of each turn, gain 3 block.',
    flavor: 'Orchestrated.',
    cost: 2,
    rarity: 'rare',
    type: 'power',
    effects: [
      { type: 'start_of_turn_block', value: 3 },
    ],
    heroOnly: null,
    emoji: '☸️',
    tags: ['defensive'],
  },

  // ─────────────────────────────────────────────
  // HERO SIGNATURE CARDS
  // ─────────────────────────────────────────────

  royal_decree: {
    id: 'royal_decree',
    name: 'Royal Decree',
    description: 'Deal 10 damage to ALL enemies.',
    flavor: 'Kneel, peons.',
    cost: 2,
    rarity: 'rare',
    type: 'attack',
    effects: [
      { type: 'damage', value: 10, target: 'all_enemies' },
    ],
    heroOnly: 'cait',
    emoji: '👑',
    tags: ['offensive', 'aoe'],
  },

  void_collapse: {
    id: 'void_collapse',
    name: 'Void Collapse',
    description: 'Deal 5 damage + 3 per card removed from deck this run.',
    flavor: 'The void remembers.',
    cost: 2,
    rarity: 'rare',
    type: 'attack',
    effects: [
      { type: 'damage', value: 5, target: 'enemy' },
      { type: 'damage_per_removed_card', value: 3, target: 'enemy' },
    ],
    heroOnly: 'asiphyx',
    emoji: '🕳️',
    tags: ['offensive'],
  },

  clean_architecture: {
    id: 'clean_architecture',
    name: 'Clean Architecture',
    description: 'All cards with 3+ plays gain +4 damage/block this combat.',
    flavor: 'Design patterns.',
    cost: 1,
    rarity: 'rare',
    type: 'skill',
    effects: [
      { type: 'buff_frequent_cards', value: 4 },
    ],
    heroOnly: 'codex',
    emoji: '🏛️',
    tags: ['utility'],
  },

  star_chart: {
    id: 'star_chart',
    name: 'Star Chart',
    description: 'Look at top 5 cards, rearrange them. Draw 1.',
    flavor: 'Patterns align.',
    cost: 1,
    rarity: 'rare',
    type: 'skill',
    effects: [
      { type: 'scry', value: 5 },
      { type: 'draw', value: 1 },
    ],
    heroOnly: 'xadnib',
    emoji: '⭐',
    tags: ['utility', 'draw'],
  },

  party_trick: {
    id: 'party_trick',
    name: 'Party Trick',
    description: 'Add 3 random rare cards to hand. They exhaust at end of turn.',
    flavor: 'Surprise!',
    cost: 2,
    rarity: 'rare',
    type: 'skill',
    effects: [
      { type: 'add_random_rares_to_hand', value: 3 },
      { type: 'exhaust_added_end_of_turn' },
    ],
    heroOnly: 'bindax',
    emoji: '🎉',
    tags: ['utility'],
  },
};

export default CARDS;
