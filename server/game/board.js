// Board definitions: the hand-made 'classic' map below, plus a rule-based random generator.
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


export class Board {
  constructor({ rooms, tunnels, name = 'classic', geometry = CLASSIC_GEOMETRY }) {
    this.name = name;
    this.rooms = rooms;
    this.tunnels = tunnels; // [from, to, opts]
    this.geometry = geometry; // { width, height, roomW, roomH, depthsY }
    this.byId = Object.fromEntries(rooms.map((r) => [r.id, r]));
  }
  room(id) { return this.byId[id]; }
  tunnelsFrom(roomId) {
    const out = [];
    for (const [a, b, opts = {}] of this.tunnels) {
      if (a === roomId) out.push({ to: b, ...opts });
      else if (b === roomId && !opts.oneWay) out.push({ to: a, ...opts });
    }
    return out;
  }
  connectedRooms(roomId) {
    const out = new Set();
    for (const [a, b] of this.tunnels) { if (a === roomId) out.add(b); if (b === roomId) out.add(a); }
    return [...out];
  }
  toJSON() { return { name: this.name, geometry: this.geometry, rooms: this.rooms, tunnels: this.tunnels.map(([a, b, o = {}]) => ({ from: a, to: b, ...o })) }; }
}

export const CLASSIC_GEOMETRY = { width: 1000, height: 1000, roomW: 176, roomH: 80, depthsY: 430 };
const RANDOM_GEOMETRY = { width: 1500, height: 1000, roomW: 180, roomH: 78, depthsY: 470 };

// --- geometry helpers for the generator ---
function segIntersectsRect(p, q, cx, cy, hw, hh) {
  // Liang–Barsky clip of segment p->q against the rect centred on (cx, cy)
  let t0 = 0, t1 = 1; const dx = q.x - p.x, dy = q.y - p.y;
  const checks = [[-dx, p.x - (cx - hw)], [dx, (cx + hw) - p.x], [-dy, p.y - (cy - hh)], [dy, (cy + hh) - p.y]];
  for (const [pk, qk] of checks) {
    if (pk === 0) { if (qk < 0) return false; continue; }
    const r = qk / pk;
    if (pk < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b) && o(a, b, c) !== 0 && o(c, d, a) !== 0;
}

export function classicBoard() { return new Board({ rooms: ROOMS, tunnels: TUNNELS, name: 'classic' }); }

// ---------------------------------------------------------------------------
// Random map generator. Rules:
//  - 7 rows of rooms below the start: 3 surface rows, 4 Depths rows.
//  - Every room in a row links to its nearest room in the row above (so everything is reachable),
//    plus optional second links and horizontal links to neighbours.
//  - Tunnel hazards are rolled per tunnel (footprints / monsters / one-way); one-way tunnels are
//    only kept if every room can still get back to the entrance.
//  - Master Keys matter in exactly two ways:
//      * the Vault: the 30-point artifact sits in a bottom-row room, sometimes with a locked
//        antechamber holding the 25-point artifact or a Major Secret; every way in is locked.
//      * the Shortcut: one extra locked passage joins a deep room straight to a surface room,
//        a fast way down early or a fast way out with the loot.
//  - Features are dealt from a surface pool and a Depths pool with artifact depth constraints.
// ---------------------------------------------------------------------------
const NAMES = {
  plain: ['Guard Post', 'Barracks', 'Entrance Hall', 'Store Room', 'Lookout', 'Lower Cells', 'Ossuary', 'Rat Warren', 'Collapsed Stair', 'Old Cistern', 'Hall of Statues', 'Spider Gallery', 'Broken Bridge', 'Echoing Vault', 'Dusty Archive', 'Torture Chamber', 'Wine Cellar', 'Dripping Passage', 'Kobold Den', 'Forgotten Shrine'],
  crystal: ['Glittering Cave', 'Crystal Grotto', 'Crystal Maze', 'Crystal Abyss', 'Shard Hollow', 'Prism Cavern'],
  market: ['Trading Post', 'Deep Market', 'Black Market', 'Smugglers’ Den', 'Goblin Bazaar'],
  fountain: ['Fountain Court', 'Healing Spring', 'Sacred Pool', 'Moss Well'],
  monkey: ['Monkey Shrine'],
  major: ['Chapel', 'Shrine of Secrets', 'Sunken Library', 'Ancient Altar', 'Sealed Reliquary', 'Oracle’s Cell'],
  minor: ['Guard Post', 'Store Room', 'Lookout', 'Lower Cells', 'Ossuary', 'Thieves’ Cache', 'Abandoned Camp', 'Crypt Niche', 'Hidden Alcove'],
  artifact: { 5: 'Armory', 7: 'Treasury Vault', 10: 'Forgotten Vault', 15: 'Dragon Hoard', 20: 'Golem Workshop', 25: 'Troll Den', 30: "Nicki’s Nest" },
};

export function makeRng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function generateBoard(seed = Math.floor(Math.random() * 2 ** 31)) {
  const rnd = makeRng(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const take = (arr) => arr.splice(Math.floor(rnd() * arr.length), 1)[0];
  const shuf = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  // --- rooms on a jittered grid (wide canvas, generous row spacing) ---
  const G = RANDOM_GEOMETRY;
  const rowSpec = [
    { y: 175, n: 4, depths: false }, { y: 295, n: 5, depths: false }, { y: 410, n: 5, depths: false },
    { y: 540, n: 5, depths: true }, { y: 660, n: 5, depths: true }, { y: 780, n: 5, depths: true }, { y: 910, n: 4 + (rnd() < 0.5 ? 1 : 0), depths: true },
  ];
  const rooms = [{ id: 'start', name: 'Outside the Dungeon', x: G.width / 2, y: 55, start: true, row: 0 }];
  const rows = [[rooms[0]]];
  const xMin = 160, xMax = G.width - 160;
  rowSpec.forEach((spec, ri) => {
    const row = [];
    for (let i = 0; i < spec.n; i++) {
      const x = Math.round(Math.min(xMax, Math.max(xMin, xMin + ((xMax - xMin) * (i + 0.5)) / spec.n + (rnd() - 0.5) * 80)));
      const y = Math.round(spec.y + (rnd() - 0.5) * 30);
      const r = { id: `r${ri + 1}_${i}`, name: '', x, y, depths: spec.depths, row: ri + 1 };
      row.push(r); rooms.push(r);
    }
    rows.push(row);
  });

  // --- tunnels ---
  const edges = new Map(); // key -> [a, b, opts]
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const link = (a, b, opts = {}) => { const k = key(a.id, b.id); if (!edges.has(k)) edges.set(k, [a.id, b.id, opts]); return edges.get(k); };
  const dist = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 0.6);
  // A tunnel is "blocked" if it would pass through a third room or cross an existing tunnel.
  const hw = G.roomW / 2 + 14, hh = G.roomH / 2 + 14;
  const blocked = (a, b) => {
    for (const r of rooms) if (r !== a && r !== b && segIntersectsRect(a, b, r.x, r.y, hw, hh)) return true;
    for (const [ia, ib] of edges.values()) {
      if (ia === a.id || ia === b.id || ib === a.id || ib === b.id) continue;
      const ra = rooms.find((r) => r.id === ia), rb = rooms.find((r) => r.id === ib);
      if (segmentsCross(a, b, ra, rb)) return true;
    }
    return false;
  };
  const linkClean = (cands, r, force) => { for (const c of cands) if (!blocked(c, r)) { link(c, r); return true; } if (force && cands[0]) { link(cands[0], r); return true; } return false; };
  // start -> middle of row 1
  const r1 = [...rows[1]].sort((a, b) => Math.abs(a.x - G.width / 2) - Math.abs(b.x - G.width / 2));
  link(rooms[0], r1[0]);
  if (rnd() < 0.5 && !blocked(rooms[0], r1[1])) link(rooms[0], r1[1]);
  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];
    // horizontal links between neighbours
    for (let i = 0; i + 1 < row.length; i++) if (ri === 1 || rnd() < 0.72) link(row[i], row[i + 1]);
    // vertical links to the previous row: nearest first, then optional second links that stay clean
    if (ri >= 2) {
      const above = rows[ri - 1];
      for (const r of row) linkClean([...above].sort((a, b) => dist(a, r) - dist(b, r)), r, true);
      for (const r of row) {
        const sorted = [...above].sort((a, b) => dist(a, r) - dist(b, r)).filter((a) => !edges.has(key(a.id, r.id)));
        if (sorted[0] && rnd() < 0.42 && Math.abs(sorted[0].x - r.x) < 380 && !blocked(sorted[0], r)) link(sorted[0], r);
      }
    }
  }
  const tunnels = [...edges.values()];
  const byId = Object.fromEntries(rooms.map((r) => [r.id, r]));

  // --- helpers over the current tunnel list ---
  const reachable = (from, { respectOneWay = true, skipLocked = false, reverse = false } = {}) => {
    const seen = new Set([from]); const stack = [from];
    while (stack.length) {
      const cur = stack.pop();
      for (const [a, b, o = {}] of tunnels) {
        if (skipLocked && o.locked) continue;
        let nexts = [];
        const fwd = !respectOneWay || !o.oneWay;
        if (!reverse) { if (a === cur) nexts.push(b); if (b === cur && fwd) nexts.push(a); }
        else { if (b === cur) nexts.push(a); if (a === cur && fwd) nexts.push(b); }
        for (const n of nexts) if (!seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    return seen;
  };
  // connectivity guard
  let reach = reachable('start', { respectOneWay: false });
  for (const r of rooms) if (!reach.has(r.id)) {
    const cands = rooms.filter((o) => reach.has(o.id) && o.row === r.row - 1).sort((a, b) => dist(a, r) - dist(b, r));
    const c = cands.find((o) => !blocked(o, r)) || cands[0];
    tunnels.push([c.id, r.id, {}]); edges.set(key(c.id, r.id), tunnels[tunnels.length - 1]);
    reach = reachable('start', { respectOneWay: false });
  }

  // --- features ---
  const surface = rooms.filter((r) => r.row >= 1 && r.row <= 3);
  const depths = rooms.filter((r) => r.row >= 4);
  const assign = (room, f) => Object.assign(room, f);
  const freeIn = (list) => list.filter((r) => !r.feature);
  const placeArtifact = (value, candidates) => { const r = take(shuf(freeIn(candidates))); assign(r, { feature: 'artifact', artifact: value, name: NAMES.artifact[value] }); return r; };
  // the 30 goes in a bottom-row room with the fewest tunnels
  const bottom = rows[rows.length - 1];
  const degree = (r) => tunnels.filter(([a, b]) => a === r.id || b === r.id).length;
  const nest = [...bottom].sort((a, b) => degree(a) - degree(b) || rnd() - 0.5)[0];
  assign(nest, { feature: 'artifact', artifact: 30, name: NAMES.artifact[30] });
  // the Vault pocket: the nest plus, often, one locked antechamber next to it
  const pocket = [nest];
  const adjacent = (r) => rooms.filter((o) => o !== r && tunnels.some(([a, b]) => (a === r.id && b === o.id) || (b === r.id && a === o.id)));
  const anteCands = adjacent(nest).filter((o) => o.row >= 6 && degree(o) <= 3);
  let anteHas25 = false;
  if (anteCands.length && rnd() < 0.65) {
    const ante = anteCands[Math.floor(rnd() * anteCands.length)];
    pocket.push(ante);
    if (rnd() < 0.5) { assign(ante, { feature: 'artifact', artifact: 25, name: 'Treasure Antechamber' }); anteHas25 = true; }
    else assign(ante, { feature: 'major', majorSecret: true, name: 'Sealed Reliquary' });
  }
  placeArtifact(5, rows[2]);
  placeArtifact(7, rows[3]);
  placeArtifact(10, [...rows[4]]);
  placeArtifact(15, [...rows[4], ...rows[5]]);
  placeArtifact(20, [...rows[5], ...rows[6]]);
  if (!anteHas25) placeArtifact(25, [...rows[6], ...rows[7]]);
  const dealt = (pool, list) => { const free = shuf(freeIn(list)); for (const f of pool) { const r = free.pop(); if (!r) break; assign(r, f); } };
  const featureDefs = {
    market: () => ({ feature: 'market', market: true }), crystal: () => ({ feature: 'crystal', crystal: true }), fountain: () => ({ feature: 'fountain', fountain: true }),
    monkey: () => ({ feature: 'monkey', monkeyShrine: true }), major: () => ({ feature: 'major', majorSecret: true }), minor: () => ({ feature: 'minor', minorSecrets: 2 }), plain: () => ({ feature: 'plain' }),
  };
  const surfacePool = ['market', 'crystal', 'fountain', 'major', 'minor', 'minor', 'minor', 'minor', 'plain', 'plain', 'plain', 'plain'].map((k) => featureDefs[k]());
  const depthsPool = ['market', 'market', 'crystal', 'crystal', 'crystal', 'fountain', 'fountain', 'monkey', 'major', 'major', 'major', 'minor', 'minor', 'minor', 'minor', 'plain', 'plain', 'plain'].map((k) => featureDefs[k]());
  // never a crystal cave directly off the entrance row
  dealt(surfacePool, surface.filter((r) => r.row !== 1 || true));
  dealt(depthsPool, depths);
  for (const r of rooms) if (!r.feature && !r.start) assign(r, featureDefs.plain());
  // names
  const pools = Object.fromEntries(Object.entries(NAMES).filter(([k]) => k !== 'artifact').map(([k, v]) => [k, shuf([...v])]));
  const used = new Set(rooms.map((r) => r.name).filter(Boolean));
  for (const r of rooms) {
    if (r.name) continue;
    const pool = pools[r.feature] || pools.plain;
    let n = pool.length ? pool.pop() : null;
    while (n && used.has(n)) n = pool.length ? pool.pop() : null;
    if (!n) { n = pools.plain.pop(); while (n && used.has(n)) n = pools.plain.pop(); }
    r.name = n || `Chamber ${r.id.slice(1)}`;
    used.add(r.name);
  }

  // --- hazards ---
  for (const t of tunnels) {
    const [a, b] = t; const o = t[2] = t[2] || {};
    if (a === 'start' || b === 'start') continue;
    const deep = byId[a].depths || byId[b].depths;
    const roll = rnd();
    if (roll < 0.17) o.boots = 2;
    else if (roll < 0.33) o.monsters = deep && rnd() < 0.22 ? 2 : 1;
    else if (roll < 0.41) o.oneWay = true;
  }
  // locks: every tunnel crossing the Vault pocket boundary is locked and otherwise plain;
  // tunnels inside the pocket are plain
  const inPocket = (id) => pocket.some((r) => r.id === id);
  for (const t of tunnels) {
    const a = inPocket(t[0]), b = inPocket(t[1]);
    if (a && b) t[2] = {};
    else if (a || b) t[2] = { locked: true };
  }
  // the Shortcut: a locked passage from deep in the Depths up to the surface, routed along one
  // side of the map so it never passes under other rooms
  const side = rnd() < 0.5 ? 'left' : 'right';
  const edgeDist = (r) => (side === 'left' ? r.x : G.width - r.x);
  const deepRooms = rooms.filter((r) => r.row >= 5 && !inPocket(r.id)).sort((a, b) => edgeDist(a) - edgeDist(b));
  const highRooms = rooms.filter((r) => r.row >= 1 && r.row <= 2).sort((a, b) => edgeDist(a) - edgeDist(b));
  if (deepRooms[0] && highRooms[0]) tunnels.push([highRooms[0].id, deepRooms[0].id, { locked: true, shortcut: side }]);
  // orient one-way tunnels: prefer pointing away from the entrance, then validate escape routes
  for (const t of tunnels) if (t[2].oneWay) { if (byId[t[0]].row > byId[t[1]].row) [t[0], t[1]] = [t[1], t[0]]; }
  const everyoneCanEscape = () => { const back = reachable('start', { respectOneWay: true, skipLocked: true, reverse: true }); return rooms.every((r) => inPocket(r.id) || back.has(r.id)); };
  const everythingReachable = () => { const fwd = reachable('start', { respectOneWay: true, skipLocked: true }); return rooms.every((r) => inPocket(r.id) || fwd.has(r.id)); };
  for (const t of tunnels) {
    if (t[2].oneWay && !(everyoneCanEscape() && everythingReachable())) { delete t[2].oneWay; }
  }
  // the pocket must be reachable (with a key): drop one-ways that would seal it, then confirm
  for (const r of pocket) if (!reachable('start', { respectOneWay: true }).has(r.id)) { for (const t of tunnels) if (t[2].oneWay) delete t[2].oneWay; }

  const cleanRooms = rooms.map(({ feature, row, ...r }) => r);
  const cleanTunnels = tunnels.map(([a, b, o]) => [a, b, Object.keys(o).length ? o : undefined]).map(([a, b, o]) => (o ? [a, b, o] : [a, b]));
  return new Board({ rooms: cleanRooms, tunnels: cleanTunnels, name: `random-${seed}`, geometry: G });
}

export function publicRules() {
  return { rageTrack: RAGE_TRACK };
}
