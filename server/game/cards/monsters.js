// Dungeon deck monsters (red banners). Fought with swords; go to the dungeon discard.
export default [
  { id: 'kobold', name: 'Kobold', kind: 'monster', qty: 3, swords: 1, text: 'Defeat: +1 Skill', defeat: [{ skill: 1 }] },
  { id: 'orc_grunt', name: 'Orc Grunt', kind: 'monster', qty: 3, swords: 2, text: 'Defeat: +3 Gold', defeat: [{ gold: 3 }] },
  { id: 'overlord', name: 'Overlord', kind: 'monster', qty: 2, swords: 2, text: 'Defeat: Draw 2 cards', defeat: [{ draw: 2 }] },
  { id: 'crystal_golem', name: 'Crystal Golem', kind: 'monster', qty: 2, swords: 3, text: 'Defeat: +3 Skill', defeat: [{ skill: 3 }] },
  { id: 'ogre', name: 'Ogre', kind: 'monster', qty: 2, swords: 3, danger: true, text: 'Danger. Defeat: +5 Gold', defeat: [{ gold: 5 }] },
  { id: 'cave_troll', name: 'Cave Troll', kind: 'monster', qty: 1, swords: 3, danger: true, dragon: true, text: 'Danger. Defeat: +3 Gold, +2 Skill', defeat: [{ gold: 3, skill: 2 }] },
  { id: 'watcher', name: 'Watcher', kind: 'monster', qty: 3, swords: 3, text: 'Arrive: each player adds 1 Clank!. Defeat: +3 Gold, +1 Skill', arrive: [{ allClank: 1 }], defeat: [{ gold: 3, skill: 1 }] },
  { id: 'animated_door', name: 'Animated Door', kind: 'monster', qty: 1, swords: 1, text: 'Defeat: +1 Skill, +1 Boot', defeat: [{ skill: 1, boots: 1 }] },
];
