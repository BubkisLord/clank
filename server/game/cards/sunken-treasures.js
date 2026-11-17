// Clank! Sunken Treasures: dungeon cards, shuffled into the base dungeon deck.
// Source: github.com/kevinkey/klank sunken_treasures/dungeon.yml plus its card.rb / player.rb rules
// (the only machine-readable list found). Card text is paraphrased from that data.
// Mermaid and Shrine of the Mermaid refer to flooded rooms, so a deck with them floods part of the Depths
// (see floodBoard in board.js).
const companion = (o) => ({ kind: 'companion', tags: ['companion'], set: 'sunken', ...o });
const item = (o) => ({ kind: 'companion', tags: ['equipment'], set: 'sunken', ...o });
const action = (o) => ({ kind: 'companion', tags: ['action'], set: 'sunken', ...o });
const pearl = (id, name, qty, cost, points) => ({ id, name, kind: 'companion', tags: ['gem'], set: 'sunken', qty, cost, points, dragon: true,
  text: 'Discard a card to draw two cards. Acquire: +2 Clank!', play: [{ discardThen: [{ draw: 2 }] }], acquire: [{ clank: 2 }] });
const rebelDraw = { when: { otherCompanion: true }, effects: [{ draw: 1 }] };

export default [
  // --- Monsters ---
  { id: 'crystal_fish', name: 'Crystal Fish', kind: 'monster', set: 'sunken', qty: 2, swords: 1, dragon: true, text: 'Defeat: +2 Gold', defeat: [{ gold: 2 }] },
  { id: 'eye_in_the_water', name: 'Eye-in-the-Water', kind: 'monster', set: 'sunken', qty: 2, swords: 2,
    text: 'Arrive: each player adds 2 Clank!. Defeat: -2 Clank! or +2 Gold.', arrive: [{ allClank: 2 }],
    defeat: [{ choose: [{ label: '-2 Clank!', effects: [{ clank: -2 }] }, { label: '+2 Gold', effects: [{ gold: 2 }] }] }] },
  { id: 'saurian', name: 'Saurian', kind: 'monster', set: 'sunken', qty: 2, swords: 3, dragon: true, danger: true, text: 'Danger. Defeat: +4 Gold', defeat: [{ gold: 4 }] },
  { id: 'sorcerer', name: 'Sorcerer', kind: 'monster', set: 'sunken', qty: 1, swords: 4, dragon: true, where: 'depths',
    text: 'Fight only in the Depths. Defeat: gain a Secret Tome.', defeat: [{ buyTomes: { gold: 0, count: 1 } }] },

  // --- Devices ---
  { id: 'pipe_organ', name: 'Pipe Organ', kind: 'device', set: 'sunken', qty: 1, cost: 1, text: 'Use: move the Dragon marker one space up or down.',
    use: [{ choose: [{ label: 'Dragon marker up', effects: [{ rage: 1 }] }, { label: 'Dragon marker down', effects: [{ rage: -1 }] }] }] },
  { id: 'shrine_of_the_mermaid', name: 'Shrine of the Mermaid', kind: 'device', set: 'sunken', qty: 2, cost: 3, danger: true,
    text: 'Danger. Use: +2 Gold, or teleport if you are in a flooded room.',
    use: [{ choose: [{ label: '+2 Gold', effects: [{ gold: 2 }] }, { label: 'Teleport', requires: { flooded: true }, effects: [{ teleport: 1 }] }] }] },

  // --- Gems ---
  pearl('black_pearl', 'Black Pearl', 1, 6, 5),
  pearl('white_pearl', 'White Pearl', 2, 4, 3),
  pearl('silver_pearl', 'Silver Pearl', 1, 3, 2),

  // --- Items ---
  item({ id: 'boomerang', name: 'Boomerang', qty: 1, cost: 2, points: 1, text: '+1 Skill. +2 Swords. When you discard this, return it to your hand.',
    play: [{ skill: 1, swords: 2 }], discard: [{ returnToHand: true }] }),
  item({ id: 'burglars_boots', name: "Burglar's Boots", qty: 1, cost: 1, points: 0, text: 'Choose one: -2 Clank!, +1 Boot, or +1 Gold.',
    play: [{ choose: [{ label: '-2 Clank!', effects: [{ clank: -2 }] }, { label: '+1 Boot', effects: [{ boots: 1 }] }, { label: '+1 Gold', effects: [{ gold: 1 }] }] }] }),
  item({ id: 'climbing_gear', name: 'Climbing Gear', qty: 1, cost: 2, points: 1, text: '+1 Boot. Discard a card for +1 Boot.', play: [{ boots: 1 }, { discardThen: [{ boots: 1 }] }] }),
  item({ id: 'coin_purse', name: 'Coin Purse', qty: 2, cost: 4, points: 0, text: '+2 Gold. Acquire: +3 Gold. When you discard this, +5 Gold.',
    play: [{ gold: 2 }], acquire: [{ gold: 3 }], discard: [{ gold: 5 }] }),
  item({ id: 'fishing_pole', name: 'Fishing Pole', qty: 1, cost: 1, points: 1, text: 'Draw a card, then discard a card.', play: [{ draw: 1 }, { discardThen: [] }] }),

  // --- Actions ---
  action({ id: 'ancient_invocation', name: 'Ancient Invocation', qty: 1, cost: 2, points: 0, text: '+2 Clank!. Teleport.', play: [{ clank: 2, teleport: 1 }] }),
  action({ id: 'aspiration', name: 'Aspiration', qty: 1, cost: 3, points: 0, text: 'If you have a Crown, draw a card. Acquire: +1 Gold.',
    play: [{ when: { has: 'crown' }, effects: [{ draw: 1 }] }], acquire: [{ gold: 1 }] }),
  action({ id: 'deep_dive', name: 'Deep Dive', qty: 1, cost: 5, points: 0, text: 'Discard three cards to draw five cards.',
    play: [{ discardThen: [{ discardThen: [{ discardThen: [{ draw: 5 }] }] }] }] }),
  action({ id: 'grand_plan', name: 'Grand Plan', qty: 1, cost: 5, points: 0, text: '+2 Skill. +2 Gold. Acquire: +2 Gold. At game end: +7 points if you have at least three Market items.',
    play: [{ skill: 2, gold: 2 }], acquire: [{ gold: 2 }], endScore: { marketItems: 3, points: 7 } }),
  action({ id: 'short_cut', name: 'Short Cut', qty: 1, cost: 2, points: 0, text: '+1 Boot. +1 Clank!. Acquire: +1 Boot. When you discard this, +2 Boots.',
    play: [{ boots: 1, clank: 1 }], acquire: [{ boots: 1 }], discard: [{ boots: 2 }] }),

  // --- Companions ---
  companion({ id: 'alchemist', name: 'Alchemist', qty: 1, cost: 3, points: 1, text: '+2 Skill. If a Secret Tome is in your play area or discard pile, +2 Gold.',
    play: [{ skill: 2 }, { when: { inPlayOrDiscard: 'secret_tome' }, effects: [{ gold: 2 }] }] }),
  companion({ id: 'elven_ranger', name: 'Elven Ranger', qty: 1, cost: 5, points: 2, text: '+1 Skill. +1 Sword. +1 Boot. Draw a card.', play: [{ skill: 1, swords: 1, boots: 1, draw: 1 }] }),
  companion({ id: 'medic', name: 'Medic', qty: 1, cost: 2, points: 1, text: '+1 Skill. Discard a card to heal 1.', play: [{ skill: 1 }, { discardThen: [{ heal: 1 }] }] }),
  companion({ id: 'merling', name: 'Merling', qty: 2, cost: 2, points: 2, text: '+1 Skill. +1 Sword. +1 Boot', play: [{ skill: 1, swords: 1, boots: 1 }] }),
  companion({ id: 'mermaid', name: 'Mermaid', qty: 2, cost: 4, points: 1, text: '+2 Skill. +1 Boot. You take no damage for being out of air this turn.', play: [{ skill: 2, boots: 1 }, { flag: 'waterBreathing' }] }),
  companion({ id: 'pickpocket', name: 'Pickpocket', qty: 1, cost: 3, points: 1, text: '+1 Boot. Acquire a card costing 3 or less for free. When you discard this, acquire one costing 6 or less for free.',
    play: [{ boots: 1 }, { freeAcquire: { max: 3 } }], discard: [{ freeAcquire: { max: 6 } }] }),
  companion({ id: 'rebel_brawler', name: 'Rebel Brawler', qty: 1, cost: 1, points: 1, text: '+2 Swords. +1 Clank!. If you have another companion in your play area, draw a card.', play: [{ swords: 2, clank: 1 }, rebelDraw] }),
  companion({ id: 'rebel_scholar', name: 'Rebel Scholar', qty: 1, cost: 2, points: 1, text: 'Draw a card. If you have another companion in your play area, draw a card.', play: [{ draw: 1 }, rebelDraw] }),
];
