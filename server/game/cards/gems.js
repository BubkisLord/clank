// Gems: draw a card when played; acquiring one makes 2 Clank!. Every gem has a dragon symbol.
const gem = (id, name, qty, cost, extra = {}) => ({
  id, name, kind: 'companion', tags: ['gem'], qty, cost, points: cost, dragon: true,
  text: 'Draw a card. Acquire: +2 Clank!',
  play: [{ draw: 1 }], acquire: [{ clank: 2 }], ...extra,
});
export default [
  gem('sapphire', 'Sapphire', 3, 4),
  gem('emerald', 'Emerald', 2, 5),
  gem('ruby', 'Ruby', 2, 6),
  gem('diamond', 'Diamond', 1, 8),
  gem('dragons_eye', "Dragon's Eye", 1, 5, { points: 0, where: 'depths', endScore: { mastery: true, points: 10 },
    text: 'Acquire only in the Depths. Draw a card. Acquire: +2 Clank!. At game end: +10 points if you have a Mastery token.' }),
];
