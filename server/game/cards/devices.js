// Devices (purple banners): used immediately when acquired, then dungeon discard.
export default [
  { id: 'shrine', name: 'Shrine', kind: 'device', qty: 3, cost: 2,
    text: 'Arrive: return set-aside dragon cubes to the bag. Use: +1 Gold or heal 1.',
    arrive: [{ returnDragonCubes: true }],
    use: [{ choose: [{ label: '+1 Gold', effects: [{ gold: 1 }] }, { label: 'Heal 1', effects: [{ heal: 1 }] }] }] },
  { id: 'dragon_shrine', name: 'Dragon Shrine', kind: 'device', qty: 2, cost: 4, dragon: true,
    text: 'Use: +2 Gold, or trash a card.',
    use: [{ choose: [{ label: '+2 Gold', effects: [{ gold: 2 }] }, { label: 'Trash a card', effects: [{ trash: { from: ['hand', 'playArea', 'discard'], optional: true } }] }] }] },
  { id: 'teleporter', name: 'Teleporter', kind: 'device', qty: 2, cost: 4, text: 'Use: Teleport.', use: [{ teleport: 1 }] },
  { id: 'magic_spring', name: 'Magic Spring', kind: 'device', qty: 2, cost: 3, text: 'Use: Trash a card from your hand, play area or discard pile.',
    use: [{ trash: { from: ['hand', 'playArea', 'discard'], optional: true } }] },
  { id: 'wand_of_recall', name: 'Wand of Recall', kind: 'device', qty: 2, cost: 5, text: 'Use: +2 Skill. Teleport.', use: [{ skill: 2, teleport: 1 }] },
  { id: 'wand_of_wind', name: 'Wand of Wind', kind: 'device', qty: 2, cost: 6, dragon: true, text: 'Use: +3 Skill. Teleport, or take a Secret from an adjacent room.',
    use: [{ skill: 3 }, { choose: [{ label: 'Teleport', effects: [{ teleport: 1 }] }, { label: 'Take a Secret from an adjacent room', effects: [{ takeAdjacentSecret: true }] }] }] },
];
