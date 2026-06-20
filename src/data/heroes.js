/**
 * Phyx the Stack — Assistant Definitions
 * Cait is the main character. These assistants define locked duo variants.
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
    title: 'The Void Architect',
    portrait: '/assets/heroes/asiphyx2.png',
    selectionPortrait: '/assets/heroes/asiphyxheroselect.png',
    selectionPortraitLabel: 'Asiphyx + Cait',
    avatar: '/assets/heroes/avatars/asiphyx2.png',
    battlePortrait: '/assets/heroes/battle/asiphyx2.png',
    maxHp: 70,
    startingDeck: [
      'try_catch', 'try_catch', 'try_catch',
      'null_check', 'null_check',
      'mass_increase',
      'redirect',
      'singularity_target',
      'cait_momentum',
    ],
    passive: {
      name: 'Locked Duo: Kinetic Regent',
      description: 'Asiphyx cannot deal direct damage. Gravity modules bend threats into Cait follow-up windows and stored kinetic pressure.',
    },
    ultimate: {
      name: 'Event Horizon',
      description: 'This turn, all enemy attacks redirect to the highest-HP enemy. Gain 15 block.',
      emoji: '🕳️',
      chargeCost: 6,
      effects: [{ type: 'redirectEnemiesToEnemy' }, { type: 'block', value: 15 }],
    },
    signatureCardId: 'null_pointer_exception',
    color: '#9933ff',
    quote: 'Bend the battlefield. Let Cait finish it.',
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
