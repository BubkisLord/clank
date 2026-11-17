// Devices (purple banners): used immediately when acquired, then dungeon discard.
export default [
  { id: 'shrine', name: 'Shrine', kind: 'device', qty: 3, cost: 2,
    text: 'Arrive: return up to 3 set-aside dragon cubes to the bag. Use: +1 Gold or heal 1.',
    arrive: [{ returnDragonCubes: 3 }],
    use: [{ choose: [{ label: '+1 Gold', effects: [{ gold: 1 }] }, { label: 'Heal 1', effects: [{ heal: 1 }] }] }] },
  { id: 'ladder', name: 'Ladder', kind: 'device', qty: 2, cost: 3, text: 'Use: +2 Boots.', use: [{ boots: 2 }] },
  { id: 'the_vault', name: 'The Vault', kind: 'device', qty: 1, cost: 3, dragon: true, where: 'depths', text: 'Use only in the Depths. Use: +5 Gold. +3 Clank!', use: [{ gold: 5, clank: 3 }] },
  { id: 'teleporter', name: 'Teleporter', kind: 'device', qty: 2, cost: 4, text: 'Use: Teleport.', use: [{ teleport: 1 }] },
  { id: 'dragon_shrine', name: 'Dragon Shrine', kind: 'device', qty: 2, cost: 4, danger: true,
    text: 'Danger. Use: +2 Gold, or trash a card.',
    use: [{ choose: [{ label: '+2 Gold', effects: [{ gold: 2 }] }, { label: 'Trash a card', effects: [{ trash: { from: ['hand', 'playArea', 'discard'], optional: true } }] }] }] },
];
