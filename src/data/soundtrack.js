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
    id: 'cait-intro',
    title: 'C.A.I.T Intro Signal',
    src: '/assets/audio/cait-intro.mp3',
    domains: ['title'],
    intensity: 0.72,
  },
  {
    id: 'queen-circuit',
    title: 'Queen Circuit Concept',
    src: '/assets/audio/soundtrack/queen-circuit-concept.mp3',
    domains: ['heroSelect', 'map'],
    intensity: 0.74,
  },
  {
    id: 'track-concept',
    title: 'Track Concept',
    src: '/assets/audio/soundtrack/track-concept.mp3',
    domains: ['map', 'draft'],
    intensity: 0.66,
  },
  {
    id: 'bindax-concept-2',
    title: 'Bindax Concept 2',
    src: '/assets/audio/soundtrack/bindax-concept-2.mp3',
    domains: ['heroSelect', 'draft'],
    intensity: 0.78,
  },
  {
    id: 'bindax-music-concept',
    title: 'Bindax Music Concept',
    src: '/assets/audio/soundtrack/bindax-music-concept.mp3',
    domains: ['heroSelect', 'combat'],
    intensity: 0.8,
  },
  {
    id: 'clown-track',
    title: 'Clown Track Concept',
    src: '/assets/audio/soundtrack/clown-track-concept.mp3',
    domains: ['draft', 'combat'],
    intensity: 0.82,
  },
  {
    id: 'clownworld-track',
    title: 'Clownworld Track Concept',
    src: '/assets/audio/soundtrack/clownworld-track-concept.mp3',
    domains: ['combat'],
    intensity: 0.86,
  },
  {
    id: 'concept-20320',
    title: 'Concept 20320',
    src: '/assets/audio/soundtrack/concept-20320.mp3',
    domains: ['map', 'combat'],
    intensity: 0.76,
  },
  {
    id: 'city-night-chase',
    title: 'City Night Chase Concept',
    src: '/assets/audio/soundtrack/city-night-chase-concept.mp3',
    domains: ['combat'],
    intensity: 0.9,
  },
  {
    id: 'concept-sea',
    title: 'Concept Sea',
    src: '/assets/audio/soundtrack/concept-sea.mp3',
    domains: ['map', 'victory'],
    intensity: 0.62,
  },
  {
    id: 'concept-ss',
    title: 'Concept SS',
    src: '/assets/audio/soundtrack/concept-ss.mp3',
    domains: ['combat', 'gameOver'],
    intensity: 0.88,
  },
  {
    id: 'concept-track-4',
    title: 'Concept Track 4',
    src: '/assets/audio/soundtrack/concept-track-4.mp3',
    domains: ['map', 'draft'],
    intensity: 0.7,
  },
  {
    id: 'concept-track-7',
    title: 'Concept Track 7',
    src: '/assets/audio/soundtrack/concept-track-7.mp3',
    domains: ['combat', 'victory'],
    intensity: 0.84,
  },
];

export function tracksForDomain(domain) {
  return SOUNDTRACK_TRACKS.filter(track => track.domains.includes(domain));
}
