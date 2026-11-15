// Board definition. Coordinates are in a 1000x1000 space used by the client to draw the map.
// Room features: start, crystal, market, fountain, monkeyShrine, artifact (value),
//                majorSecret (true), minorSecrets (count), depths (bool)
// Tunnels: [from, to, opts]  opts: { boots: 2 (footprints), monsters: n, locked: true, oneWay: true (from -> to) }

export const ROOMS = [
  { id: 'start', name: 'Outside the Dungeon', x: 500, y: 45, start: true },
  // --- Surface ---
  { id: 'a1', name: 'Entrance Hall', x: 500, y: 150 },
  { id: 'a2', name: 'Guard Post', x: 320, y: 160, minorSecrets: 2 },
  { id: 'a3', name: 'Barracks', x: 680, y: 160 },
  { id: 'a4', name: 'Trading Post', x: 150, y: 250, market: true },
  { id: 'a5', name: 'Glittering Cave', x: 400, y: 270, crystal: true },
  { id: 'a6', name: 'Fountain Court', x: 600, y: 270, fountain: true },
  { id: 'a7', name: 'Armory', x: 850, y: 240, artifact: 5 },
  { id: 'a8', name: 'Treasury Vault', x: 260, y: 360, artifact: 7 },
  { id: 'a9', name: 'Chapel', x: 490, y: 370, majorSecret: true },
  { id: 'a10', name: 'Store Room', x: 700, y: 370, minorSecrets: 2 },
  { id: 'a11', name: 'Lookout', x: 890, y: 370, minorSecrets: 2 },
  // --- The Depths ---
  { id: 'b1', name: 'Crystal Grotto', x: 130, y: 490, crystal: true, depths: true },
  { id: 'b2', name: 'Lower Cells', x: 380, y: 490, minorSecrets: 2, depths: true },
  { id: 'b3', name: 'Deep Market', x: 620, y: 490, market: true, depths: true },
  { id: 'b4', name: 'Shrine of Secrets', x: 860, y: 490, majorSecret: true, depths: true },
  { id: 'b5', name: 'Forgotten Vault', x: 90, y: 600, artifact: 10, depths: true },
  { id: 'b6', name: 'Monkey Shrine', x: 300, y: 615, monkeyShrine: true, depths: true },
  { id: 'b7', name: 'Crystal Maze', x: 500, y: 600, crystal: true, depths: true },
  { id: 'b8', name: 'Ossuary', x: 700, y: 615, minorSecrets: 2, depths: true },
  { id: 'b9', name: 'Dragon Hoard', x: 905, y: 600, artifact: 15, depths: true },
  { id: 'b10', name: 'Sunken Library', x: 190, y: 735, majorSecret: true, depths: true },
  { id: 'b11', name: 'Healing Spring', x: 400, y: 745, fountain: true, depths: true },
  { id: 'b12', name: 'Golem Workshop', x: 600, y: 735, artifact: 20, depths: true },
  { id: 'b13', name: 'Crystal Abyss', x: 810, y: 745, crystal: true, depths: true },
  { id: 'b14', name: 'Troll Den', x: 290, y: 870, artifact: 25, depths: true },
  { id: 'b15', name: 'Ancient Altar', x: 540, y: 890, majorSecret: true, depths: true },
  { id: 'b16', name: 'Black Market', x: 760, y: 870, market: true, depths: true },
  { id: 'b17', name: "Nicki's Nest", x: 930, y: 890, artifact: 30, depths: true },
];

export const TUNNELS = [
  ['start', 'a1'],
  ['a1', 'a2'], ['a1', 'a3'], ['a1', 'a5'],
  ['a2', 'a4'], ['a2', 'a5'],
  ['a3', 'a6'], ['a3', 'a7', { monsters: 1 }], ['a3', 'a10'],
  ['a4', 'a8', { boots: 2 }], ['a4', 'b1', { boots: 2 }],
  ['a5', 'a9'], ['a5', 'a6'],
  ['a6', 'a10'], ['a6', 'a9', { monsters: 1 }],
  ['a7', 'a11', { oneWay: true }], ['a7', 'a10'],
  ['a8', 'a9'], ['a8', 'b2', { monsters: 1 }],
  ['a9', 'b2'], ['a9', 'b3', { boots: 2 }],
  ['a10', 'a11'], ['a10', 'b3', { monsters: 1 }], ['a10', 'b4'],
  ['a11', 'b4', { boots: 2 }],
  ['b1', 'b5'], ['b1', 'b6'], ['b1', 'b2'],
  ['b2', 'b6'], ['b2', 'b7'],
  ['b3', 'b7'], ['b3', 'b8'], ['b3', 'b4'],
  ['b4', 'b9', { monsters: 1 }], ['b4', 'b8'],
  ['b5', 'b10', { monsters: 1 }],
  ['b6', 'b10'], ['b6', 'b11'], ['b6', 'b7', { boots: 2 }],
  ['b7', 'b11'], ['b7', 'b12', { monsters: 1 }],
  ['b8', 'b12'], ['b8', 'b13'], ['b8', 'b9', { boots: 2 }],
  ['b9', 'b13', { oneWay: true }],
  ['b10', 'b14', { monsters: 1 }], ['b10', 'b11'],
  ['b11', 'b15', { boots: 2 }], ['b11', 'b14', { monsters: 1 }],
  ['b12', 'b15'], ['b12', 'b16', { boots: 2 }], ['b12', 'b13'],
  ['b13', 'b16', { monsters: 1 }], ['b13', 'b17', { locked: true }],
  ['b14', 'b15', { oneWay: true }],
  ['b15', 'b16'],
  ['b16', 'b17', { locked: true }],
];

export const RAGE_TRACK = [2, 2, 3, 3, 4, 4, 5];
export const RAGE_START = { 2: 2, 3: 1, 4: 0 }; // index by player count (1-player uses 2-player start)
export const HEALTH_MAX = 10;
export const CLANK_SUPPLY = 30;
export const DRAGON_CUBES = 24;
export const MASTERY_POINTS = 20;
export const MARKET_PRICE = 7;
export const ARTIFACTS = [5, 7, 10, 15, 20, 25, 30];

export const roomById = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

export function tunnelsFrom(roomId) {
  const out = [];
  for (const [a, b, opts = {}] of TUNNELS) {
    if (a === roomId) out.push({ to: b, ...opts });
    else if (b === roomId && !opts.oneWay) out.push({ to: a, ...opts });
  }
  return out;
}

export function connectedRooms(roomId) {
  // Any room joined by a tunnel in either direction (teleport ignores one-way/locks).
  const out = new Set();
  for (const [a, b] of TUNNELS) {
    if (a === roomId) out.add(b);
    if (b === roomId) out.add(a);
  }
  return [...out];
}

export function publicBoard() {
  return { rooms: ROOMS, tunnels: TUNNELS.map(([a, b, o = {}]) => ({ from: a, to: b, ...o })), rageTrack: RAGE_TRACK };
}
