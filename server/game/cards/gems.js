// Gems: +2 Skill, draw a card, +2 Clank!. Points equal cost.
const gem = (id, name, qty, cost) => ({
  id, name, kind: 'companion', tags: ['gem'], qty, cost, points: cost,
  text: `+2 Skill. Draw a card. +2 Clank!`,
  play: [{ skill: 2, draw: 1, clank: 2 }],
});
export default [
  gem('sapphire', 'Sapphire', 3, 4),
  gem('emerald', 'Emerald', 2, 5),
  gem('ruby', 'Ruby', 2, 6),
];
