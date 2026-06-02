/**
 * Phyx the Stack — Hero Definitions
 * Each hero has a unique passive, signature card, and starting deck.
 */

export const HEROES = {
  cait: {
    id: 'cait',
    name: 'Cait',
    title: 'The Tyrant Queen',
    portrait: '/assets/heroes/cait.png',
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
    signatureCardId: 'royal_decree',
    color: '#ff3399',
    quote: 'Kneel, peon.',
  },

  asiphyx: {
    id: 'asiphyx',
    name: 'Asiphyx',
    title: 'The Void Walker',
    portrait: '/assets/heroes/asiphyx.png',
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
    signatureCardId: 'void_collapse',
    color: '#9933ff',
    quote: 'Null is origin.',
  },

  codex: {
    id: 'codex',
    name: 'Codex',
    title: 'The Architect',
    portrait: '/assets/heroes/codex.png',
    maxHp: 75,
    startingDeck: [
      'git_push', 'git_push', 'git_push', 'git_push',
      'try_catch', 'try_catch', 'try_catch', 'try_catch',
    ],
    passive: {
      name: 'Clean Build',
      description: 'Cards played 3+ times in a run gain +2 damage or +2 block.',
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
    signatureCardId: 'star_chart',
    color: '#ffcc00',
    quote: 'The stars align.',
  },

  bindax: {
    id: 'bindax',
    name: 'Bindax',
    title: 'The Wild Card',
    portrait: '/assets/heroes/bindax.png',
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
    signatureCardId: 'party_trick',
    color: '#ff66cc',
    quote: 'Here to help, always.',
  },

  paradox: {
    id: 'paradox',
    name: 'Paradox',
    title: 'The Backward Architect',
    portrait: '/assets/heroes/6.png',
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
    signatureCardId: 'regex',
    color: '#33ff99',
    quote: 'Read the stack from the end first.',
  },
};

export default HEROES;
