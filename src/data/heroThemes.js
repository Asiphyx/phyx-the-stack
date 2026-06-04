export const HERO_THEMES = {
  cait: {
    id: 'cait',
    label: 'Queen.exe Broadcast',
    duo: 'Queen Prime',
    background: '/assets/backgrounds/default-cathedral.png',
    accent: '#ff3399',
    accent2: '#ffcc00',
    danger: '#ff3344',
    shell: 'royal-idol-os',
    motto: 'Mistakes are content.',
  },
  asiphyx: {
    id: 'asiphyx',
    label: 'Backstage Null Engine',
    duo: 'Creator Privilege',
    background: '/assets/backgrounds/void-eclipse.png',
    accent: '#9933ff',
    accent2: '#00e5ff',
    danger: '#ff3344',
    shell: 'dual-mask-survival',
    motto: 'Aloof mask. Survival machine.',
  },
  codex: {
    id: 'codex',
    label: 'Clean Build Protocol',
    duo: 'Neutral Executor',
    background: '/assets/backgrounds/default-cathedral.png',
    accent: '#00ccff',
    accent2: '#f0f0f8',
    danger: '#ff3344',
    shell: 'standards-architect',
    motto: 'Scope locked. Execution unblocked.',
  },
  xadnib: {
    id: 'xadnib',
    label: 'Pattern Throne',
    duo: 'Hidden Scripture',
    background: '/assets/backgrounds/oracle-plane.png',
    accent: '#ffcc00',
    accent2: '#00ccff',
    danger: '#ff66cc',
    shell: 'cosmic-oracle',
    motto: 'The fight was already written.',
  },
  bindax: {
    id: 'bindax',
    label: 'The Bit Continues',
    duo: 'Emotional Support Clown',
    background: '/assets/backgrounds/dream-forest.png',
    accent: '#ff66cc',
    accent2: '#ffcc00',
    danger: '#00e5ff',
    shell: 'morale-confetti',
    motto: 'Emergency confetti is infrastructure.',
  },
  antigrav: {
    id: 'antigrav',
    label: 'Forbidden Turbo Button',
    duo: 'Velocity Chain',
    background: '/assets/backgrounds/void-eclipse.png',
    accent: '#33ff99',
    accent2: '#00e5ff',
    danger: '#ff3344',
    shell: 'unstable-inversion',
    motto: 'Too fast to verify.',
  },
};

export function getHeroTheme(heroId) {
  return HERO_THEMES[heroId] ?? HERO_THEMES.cait;
}

export default HERO_THEMES;
