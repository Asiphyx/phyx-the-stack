export const RESERVED_SOUNDTRACK = {
  demoBoss: {
    id: 'perpetual-motion-toast-cat',
    title: 'Perpetual Motion Toast-Cat',
    src: '/assets/audio/reserved/perpetual-motion-toast-cat-boss.mp3',
    note: 'Reserved for demo boss and core finisher.',
  },
};

export const SOUNDTRACK_TRACKS = [
  {
    id: RESERVED_SOUNDTRACK.demoBoss.id,
    title: RESERVED_SOUNDTRACK.demoBoss.title,
    src: RESERVED_SOUNDTRACK.demoBoss.src,
    domains: ['boss'],
    intensity: 0.94,
  },
  {
    id: 'cait-intro',
    title: 'C.A.I.T — Boot Signal',
    src: '/assets/audio/cait-intro.mp3',
    domains: ['title'],
    intensity: 0.72,
  },
  {
    id: 'queen-circuit',
    title: 'Queen Circuit',
    src: '/assets/audio/soundtrack/queen-circuit.mp3',
    domains: ['heroSelect', 'map'],
    intensity: 0.74,
  },
  {
    id: 'stack-trace-daydream',
    title: 'Stack Trace Daydream',
    src: '/assets/audio/soundtrack/stack-trace-daydream.mp3',
    domains: ['map', 'draft'],
    intensity: 0.66,
  },
  {
    id: 'big-top-mainframe',
    title: 'Big Top Mainframe',
    src: '/assets/audio/soundtrack/big-top-mainframe.mp3',
    domains: ['heroSelect', 'draft'],
    intensity: 0.78,
  },
  {
    id: 'jester-subroutine',
    title: 'Jester Subroutine',
    src: '/assets/audio/soundtrack/jester-subroutine.mp3',
    domains: ['heroSelect', 'combat'],
    intensity: 0.8,
  },
  {
    id: 'honk-protocol',
    title: 'Honk Protocol',
    src: '/assets/audio/soundtrack/honk-protocol.mp3',
    domains: ['draft', 'combat'],
    intensity: 0.82,
  },
  {
    id: 'clownworld-kernel-panic',
    title: 'Clownworld Kernel Panic',
    src: '/assets/audio/soundtrack/clownworld-kernel-panic.mp3',
    domains: ['combat'],
    intensity: 0.86,
  },
  {
    id: 'sector-20320',
    title: 'Sector 20320',
    src: '/assets/audio/soundtrack/sector-20320.mp3',
    domains: ['map', 'combat'],
    intensity: 0.76,
  },
  {
    id: 'neon-chase-exception',
    title: 'Neon Chase Exception',
    src: '/assets/audio/soundtrack/neon-chase-exception.mp3',
    domains: ['combat'],
    intensity: 0.9,
  },
  {
    id: 'sea-of-static',
    title: 'Sea of Static',
    src: '/assets/audio/soundtrack/sea-of-static.mp3',
    domains: ['map', 'victory'],
    intensity: 0.62,
  },
  {
    id: 'segfault-serenade',
    title: 'Segfault Serenade',
    src: '/assets/audio/soundtrack/segfault-serenade.mp3',
    domains: ['combat', 'gameOver'],
    intensity: 0.88,
  },
  {
    id: 'heartcore-compiler',
    title: 'Heartcore Compiler',
    src: '/assets/audio/soundtrack/heartcore-compiler.mp3',
    domains: ['map', 'draft'],
    intensity: 0.7,
  },
  {
    id: 'phyx-anthem',
    title: 'Phyx the Stack (Anthem)',
    src: '/assets/audio/soundtrack/phyx-anthem.mp3',
    domains: ['combat', 'victory'],
    intensity: 0.84,
  },
];

export function tracksForDomain(domain) {
  return SOUNDTRACK_TRACKS.filter(track => track.domains.includes(domain));
}
