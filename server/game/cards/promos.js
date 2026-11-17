// Promo cards that work with this engine. Source: github.com/kevinkey/klank promo.yml + card.rb.
// Not included (need rules this game does not have yet): Door to Before, Snack Table, Dire Wolf,
// Enchanted Dice, Magic Spectacles, Wand of Time, Mummy Hunters, Trailblazer.
export default [
  { id: 'brawn_vs_boots', name: 'Brawn vs Boots', kind: 'companion', tags: ['action'], set: 'promo', qty: 1, cost: 4, points: 0, text: '+2 Skill. Choose one: +2 Swords or +2 Boots.',
    play: [{ skill: 2 }, { choose: [{ label: '+2 Swords', effects: [{ swords: 2 }] }, { label: '+2 Boots', effects: [{ boots: 2 }] }] }] },
  { id: 'expedition_leader', name: 'Expedition Leader', kind: 'companion', tags: ['companion'], set: 'promo', qty: 1, cost: 5, points: 2,
    text: '+2 Skill. +1 Sword. +1 Boot. Each time you gain Gold this turn, gain 1 more.', play: [{ skill: 2, swords: 1, boots: 1 }, { goldBonus: 1 }] },
  { id: 'friendly_watcher', name: 'Friendly Watcher', kind: 'companion', tags: ['companion'], set: 'promo', qty: 1, cost: 5, points: 1,
    text: '+3 Gold. Each other player adds 1 Clank!. Arrive: each player adds 1 Clank!.', play: [{ gold: 3 }, { othersClank: 1 }], arrive: [{ allClank: 1 }] },
  { id: 'opal_apestone', name: 'Opal Apestone', kind: 'companion', tags: ['gem'], set: 'promo', qty: 1, cost: 3, points: 3, dragon: true,
    text: 'Draw a card. -1 Clank!. Acquire: +3 Clank!', play: [{ draw: 1, clank: -1 }], acquire: [{ clank: 3 }] },
  { id: 'siren', name: 'Siren', kind: 'companion', tags: ['companion'], set: 'promo', qty: 1, cost: 3, points: 2,
    text: '+2 Skill. Acquire a Companion from the Dungeon Row for free.', play: [{ skill: 2 }, { freeAcquire: { max: 20, tag: 'companion' } }] },
  { id: 'wishing_well', name: 'Wishing Well', kind: 'device', set: 'promo', qty: 1, cost: 6, text: 'Use: choose two: trash a card, +2 Swords, +2 Boots, or heal 1.',
    use: [0, 1].map(() => ({ choose: [
      { label: 'Trash a card', effects: [{ trash: { from: ['hand', 'playArea', 'discard'], optional: true } }] },
      { label: '+2 Swords', effects: [{ swords: 2 }] }, { label: '+2 Boots', effects: [{ boots: 2 }] }, { label: 'Heal 1', effects: [{ heal: 1 }] }] })) },
];
