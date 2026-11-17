// Dungeon deck monsters (red banners). Fought with swords; go to the dungeon discard.
// `where`: can only be fought while you are in such a room.
export default [
  { id: 'kobold', name: 'Kobold', kind: 'monster', qty: 3, swords: 1, dragon: true, danger: true, text: 'Danger. Defeat: +1 Skill', defeat: [{ skill: 1 }] },
  { id: 'animated_door', name: 'Animated Door', kind: 'monster', qty: 2, swords: 1, dragon: true, text: 'Defeat: +1 Boot', defeat: [{ boots: 1 }] },
  { id: 'orc_grunt', name: 'Orc Grunt', kind: 'monster', qty: 3, swords: 2, dragon: true, text: 'Defeat: +3 Gold', defeat: [{ gold: 3 }] },
  { id: 'belcher', name: 'Belcher', kind: 'monster', qty: 2, swords: 2, dragon: true, text: 'Defeat: +4 Gold. +2 Clank!', defeat: [{ gold: 4, clank: 2 }] },
  { id: 'overlord', name: 'Overlord', kind: 'monster', qty: 2, swords: 2, text: 'Arrive: each player adds 1 Clank!. Defeat: Draw 2 cards', arrive: [{ allClank: 1 }], defeat: [{ draw: 2 }] },
  { id: 'ogre', name: 'Ogre', kind: 'monster', qty: 2, swords: 3, dragon: true, text: 'Defeat: +5 Gold', defeat: [{ gold: 5 }] },
  { id: 'crystal_golem', name: 'Crystal Golem', kind: 'monster', qty: 2, swords: 3, where: 'crystal', text: 'Fight only in a Crystal Cave. Defeat: +3 Skill', defeat: [{ skill: 3 }] },
  { id: 'watcher', name: 'Watcher', kind: 'monster', qty: 3, swords: 3, text: 'Arrive: each player adds 1 Clank!. Defeat: +3 Gold. Each other player adds 1 Clank!', arrive: [{ allClank: 1 }], defeat: [{ gold: 3, othersClank: 1 }] },
  { id: 'cave_troll', name: 'Cave Troll', kind: 'monster', qty: 1, swords: 4, dragon: true, where: 'depths', text: 'Fight only in the Depths. Defeat: +3 Gold. Draw 2 cards', defeat: [{ gold: 3, draw: 2 }] },
];
