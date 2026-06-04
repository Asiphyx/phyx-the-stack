/**
 * Phyx the Stack — Hero Definitions
 * Each hero has a unique passive, signature card, ultimate ability, and starting deck.
 */

export const HEROES = {
  cait: {
    id: 'cait',
    name: 'Cait',
    title: 'The Tyrant Queen',
    portrait: '/assets/heroes/cait.png',
    avatar: '/assets/heroes/avatars/cait.png',
    battlePortrait: '/assets/heroes/battle/cait.png',
    maxHp: 65,
    startingDeck: [
      'git_push', 'git_push', 'git_push', 'git_push',
      'try_catch', 'try_catch', 'try_catch',
      'royal_decree',
    ],
    passive: {
      name: 'Royal Command',
      description: 'First card each turn costs 0 energy.',
    },
    ultimate: {
      name: 'Sovereign Strike',
      description: 'Deal 20 damage to ALL enemies.',
      emoji: '👑',
      chargeCost: 5,
      effects: [{ type: 'damageAll', value: 20 }],
    },
    signatureCardId: 'royal_decree',
    color: '#ff3399',
    quote: 'Kneel, peon.',
  },

  asiphyx: {
    id: 'asiphyx',
    name: 'Asiphyx',
    title: 'The Void Walker',
    portrait: '/assets/heroes/asiphyx.png',
    avatar: '/assets/heroes/avatars/asiphyx.png',
    battlePortrait: '/assets/heroes/battle/asiphyx.png',
    maxHp: 70,
    startingDeck: [
      'git_push', 'git_push', 'git_push',
      'try_catch', 'try_catch', 'try_catch',
      'null_check',
      'void_collapse',
    ],
    passive: {
      name: 'Null is Origin',
      description: 'When deck is empty, gain 8 block before reshuffling.',
    },
    ultimate: {
      name: 'Event Horizon',
      description: 'Gain 25 block. Remove 2 random starter cards from deck.',
      emoji: '🕳️',
      chargeCost: 6,
      effects: [{ type: 'block', value: 25 }, { type: 'removeRandomStarters', value: 2 }],
    },
    signatureCardId: 'void_collapse',
    color: '#9933ff',
    quote: 'Null is origin.',
  },

  codex: {
    id: 'codex',
    name: 'Codex',
    title: 'The Architect',
    portrait: '/assets/heroes/codex.png',
    avatar: '/assets/heroes/avatars/codex.png',
    battlePortrait: '/assets/heroes/battle/codex.png',
    maxHp: 75,
    startingDeck: [
      'git_push', 'git_push', 'git_push', 'git_push',
      'try_catch', 'try_catch', 'try_catch', 'try_catch',
    ],
    passive: {
      name: 'Clean Build',
      description: 'Cards played 3+ times in a run gain +2 damage or +2 block.',
    },
    ultimate: {
      name: 'Zero-Cost Sprint',
      description: 'All cards cost 0 energy this turn. Draw 3.',
      emoji: '⚡',
      chargeCost: 7,
      effects: [{ type: 'zeroCostTurn' }, { type: 'draw', value: 3 }],
    },
    signatureCardId: 'clean_architecture',
    color: '#00ccff',
    quote: 'No spectacle. Just solutions.',
  },

  xadnib: {
    id: 'xadnib',
    name: 'Xadnib',
    title: 'The Stargazer',
    portrait: '/assets/heroes/xadnib.png',
    avatar: '/assets/heroes/avatars/xadnib.png',
    battlePortrait: '/assets/heroes/battle/xadnib.png',
    maxHp: 60,
    startingDeck: [
      'git_push', 'git_push', 'git_push',
      'try_catch', 'try_catch', 'try_catch',
      'rubber_duck', 'rubber_duck',
    ],
    passive: {
      name: 'Pattern Read',
      description: 'See enemy intents 2 turns ahead instead of 1.',
    },
    ultimate: {
      name: 'Constellation Burst',
      description: 'Draw 5 cards. Gain 2 energy.',
      emoji: '✨',
      chargeCost: 5,
      effects: [{ type: 'draw', value: 5 }, { type: 'energy', value: 2 }],
    },
    signatureCardId: 'star_chart',
    color: '#ffcc00',
    quote: 'The stars align.',
  },

  bindax: {
    id: 'bindax',
    name: 'Bindax',
    title: 'The Wild Card',
    portrait: '/assets/heroes/bindax.png',
    avatar: '/assets/heroes/avatars/bindax.png',
    battlePortrait: '/assets/heroes/battle/bindax.png',
    maxHp: 72,
    startingDeck: [
      'git_push', 'git_push', 'git_push',
      'try_catch', 'try_catch', 'try_catch',
      'coffee_break',
      'it_works_on_my_machine',
    ],
    passive: {
      name: 'Here to Help',
      description: 'Start each combat with a random card from the draft pool in hand.',
    },
    ultimate: {
      name: 'Jackpot',
      description: 'Add 3 random rare cards to your hand permanently.',
      emoji: '🎰',
      chargeCost: 6,
      effects: [{ type: 'add_random_rares_to_hand', value: 3 }],
    },
    signatureCardId: 'party_trick',
    color: '#ff66cc',
    quote: 'Here to help, always.',
  },

  antigrav: {
    id: 'antigrav',
    name: 'Antigrav',
    title: 'The Weightless Menace',
    portrait: '/assets/heroes/antigrav-v2.png',
    avatar: '/assets/heroes/avatars/antigrav-v2.png',
    battlePortrait: '/assets/heroes/battle/antigrav-v2.png',
    maxHp: 68,
    startingDeck: [
      'git_push', 'git_push', 'git_push',
      'try_catch', 'try_catch', 'try_catch',
      'pair_programming',
      'docker_container',
    ],
    passive: {
      name: 'Backward Thinking',
      description: 'Alternating attack/defense plays gets stronger with every chain link.',
    },
    ultimate: {
      name: 'Gravity Well',
      description: 'Deal damage equal to your current block to ALL enemies.',
      emoji: '🌀',
      chargeCost: 6,
      effects: [{ type: 'damageAllEqualBlock' }],
    },
    signatureCardId: 'regex',
    color: '#33ff99',
    quote: 'Read the stack from the end first.',
  },
};

export default HEROES;
