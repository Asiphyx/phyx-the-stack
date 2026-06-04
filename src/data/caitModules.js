export const CAIT_IDOL = {
  id: 'cait',
  name: 'Cait',
  title: 'The Peon Queen',
  portrait: '/assets/heroes/cait.png',
  avatar: '/assets/heroes/avatars/cait.png',
  battlePortrait: '/assets/heroes/battle/cait.png',
  maxHp: 92,
  baseIntent: {
    name: 'Royal Autoplay',
    description: 'Cait acts after you. Big value, imperfect control.',
    valueRatio: '60%',
  },
};

export const CAIT_DUO_LOADOUTS = {
  asiphyx: {
    bondName: 'Null Crown',
    bondLine: 'Asiphyx turns Cait into a void engine that gets strongest when the stack empties.',
    role: 'Control the queen through absence.',
    reliability: 0.58,
    risk: 'Medium',
    modules: [
      { slot: 'Crown', name: 'Peon Queen Protocol', text: 'Cait gains more value when protected instead of directly piloted.' },
      { slot: 'Heart', name: 'Void-Thread Pulse', text: 'Empty draw states preview a defensive Cait response.' },
      { slot: 'Voice', name: 'Null Command', text: 'Cait can mark enemies for delayed block or collapse payoffs.' },
      { slot: 'Glitch', name: 'Event Horizon Mood', text: 'High payoff upgrades carry deck-thinning risk.' },
    ],
  },
  codex: {
    bondName: 'Compiler Queen',
    bondLine: 'Codex stabilizes Cait so her power lands cleaner and repeats with less waste.',
    role: 'Turn volatility into procedure.',
    reliability: 0.72,
    risk: 'Low',
    modules: [
      { slot: 'Crown', name: 'Standards Crown', text: 'Cait favors repeatable actions and safer target selection.' },
      { slot: 'Heart', name: 'Watchdog Guard', text: 'Cait preserves HP when the run state is clean.' },
      { slot: 'Voice', name: 'Compile Order', text: 'Repeated card lines improve Cait follow-up consistency.' },
      { slot: 'Glitch', name: 'Linted Chaos', text: 'Weak random outputs are more likely to downgrade into block.' },
    ],
  },
  xadnib: {
    bondName: 'Oracle Idol',
    bondLine: 'Xadnib gives Cait foresight, letting her act around threats before they hit.',
    role: 'Read the run before it happens.',
    reliability: 0.66,
    risk: 'Medium',
    modules: [
      { slot: 'Crown', name: 'Pattern Crown', text: 'Cait weighs visible enemy intent before choosing an action.' },
      { slot: 'Heart', name: 'Star-Shelter', text: 'Incoming burst damage raises Cait defense priority.' },
      { slot: 'Voice', name: 'Constellation Cue', text: 'Cait can reveal or amplify the next enemy pattern.' },
      { slot: 'Glitch', name: 'Prophecy Drift', text: 'Oracle upgrades are strong but punish stale assumptions.' },
    ],
  },
  bindax: {
    bondName: 'Chaos Idol',
    bondLine: 'Bindax makes Cait funnier, louder, and more explosive when the run gets messy.',
    role: 'Convert accidents into morale.',
    reliability: 0.49,
    risk: 'High',
    modules: [
      { slot: 'Crown', name: 'Confetti Crown', text: 'Cait rolls larger effects with less predictable timing.' },
      { slot: 'Heart', name: 'Emergency Giggle', text: 'Low HP can trigger a strange save or a cursed gift.' },
      { slot: 'Voice', name: 'Bit Command', text: 'Cait can hand you random cards, buffs, or problems.' },
      { slot: 'Glitch', name: 'Jackpot Mood', text: 'High variance upgrades can carry entire fights.' },
    ],
  },
  antigrav: {
    bondName: 'Velocity Queen',
    bondLine: 'Antigrav overclocks Cait into a dangerous motion engine with recoil risk.',
    role: 'Pilot the forbidden turbo button.',
    reliability: 0.43,
    risk: 'Critical',
    modules: [
      { slot: 'Crown', name: 'Inversion Crown', text: 'Cait actions scale with alternating attack and defense tempo.' },
      { slot: 'Heart', name: 'Momentum Shell', text: 'Fast chains protect Cait until the chain snaps.' },
      { slot: 'Voice', name: 'Turbo Command', text: 'Cait can double a tempo payoff or force a volatile reset.' },
      { slot: 'Glitch', name: 'Unsafe Feature Flag', text: 'Peak upgrades spike huge value with visible recoil.' },
    ],
  },
};

export function getCaitLoadout(heroId) {
  return CAIT_DUO_LOADOUTS[heroId] ?? CAIT_DUO_LOADOUTS.asiphyx;
}

export function buildCaitCompanion(heroId) {
  const loadout = getCaitLoadout(heroId);
  return {
    ...CAIT_IDOL,
    hp: CAIT_IDOL.maxHp,
    bondName: loadout.bondName,
    bondLine: loadout.bondLine,
    role: loadout.role,
    reliability: loadout.reliability,
    risk: loadout.risk,
    modules: loadout.modules.map(module => ({ ...module, level: 1 })),
    intent: { ...CAIT_IDOL.baseIntent },
  };
}
