// Computer-controlled thief. `nextAction(game, p)` looks at the game and returns ONE action
// (the same shape a browser sends), or null when it is not this bot's move. The server calls it
// repeatedly with a short delay so humans can watch the bot play.
//
// It is a hand-written heuristic player, not a trained network: it values cards by what they
// produce, plans a route to the artifact that is worth the most for the risk, and heads home
// once it has loot or is getting hurt.
import { def, CARD_DEFS } from './cards/index.js';
import { SECRET_DEFS } from './secrets.js';
import { HEALTH_MAX, MARKET_PRICE } from './board.js';

export const BOT_NAMES = ['Sir Pilfer', 'Mags the Quiet', 'Old Rattlebag', 'Wren Lightfoot', 'Brother Snatch', 'Lady Gloves', 'Tobin Twelvetoes', 'Nix'];

// ---------------- valuing cards ----------------
function effectValue(list, ctx) {
  let v = 0;
  for (const e of list || []) {
    if (typeof e === 'function' || e.fn) { v += 1; continue; }
    v += (e.skill || 0) * 1 + (e.swords || 0) * 0.85 + (e.boots || 0) * ctx.bootW + (e.gold || 0) * 0.6
      + (e.draw || 0) * 1.4 - (e.clank || 0) * ctx.clankW + (e.heal || 0) * ctx.healW + (e.teleport || 0) * 1.5;
    if (e.choose) v += Math.max(...e.choose.map((o) => effectValue(o.effects, ctx)));
    if (e.when) v += 0.5 * effectValue(e.effects, ctx);
    if (e.discardThen) v += effectValue(e.discardThen, ctx) - 0.9;
    if (e.trash) v += 0.6;
    if (e.flag) v += 0.5;
    if (e.othersClank) v += 0.5;
    if (e.allClank) v -= 0.3;
    if (e.dragonAttack) v -= 1.5;
    if (e.buyTomes) v += 2;
    if (e.skillPerClank) v += 1.5;
    if (e.replaceRow) v += 0.3;
    if (e.takeAdjacentSecret) v += 1;
    if (e.gemDiscount) v += 0.3;
  }
  return v;
}

function context(game, p) {
  const late = lateness(game, p);
  return {
    late,
    bootW: p.status === 'in' ? 1.2 : 0,
    clankW: 0.35 + game.rage * 0.08 + p.damage * 0.05,
    healW: p.damage > 0 ? 0.9 : 0.1,
    pointW: 0.3 + 0.7 * late,
  };
}

// 0 at the start of the game, 1 when the end is close
function lateness(game, p) {
  let l = Math.min(1, game.turnNumber / (game.players.length * 14));
  if (p.artifacts.length) l = Math.max(l, 0.6);
  if (game.players.some((x) => x.status !== 'in')) l = 1;
  if (p.status !== 'in') l = 1;
  return Math.max(l, game.rage / 6);
}

function cardValue(game, p, d, ctx = context(game, p)) {
  const points = (d.points || 0) * ctx.pointW;
  if (d.kind === 'device') return effectValue(d.use, ctx) + (d.arrive ? 0.2 : 0);
  if (d.kind === 'monster') return effectValue(d.defeat, ctx);
  // a card bought now gets played about once per pass through the deck for the rest of the game
  const plays = Math.max(0.3, 2.2 * (1 - ctx.late));
  return effectValue(d.play, ctx) * plays + points + effectValue(d.acquire, ctx) - 0.8; // -0.8: it dilutes the deck
}

// ---------------- routing ----------------
function routeCosts(game, p, from, { reverse = false } = {}) {
  // Dijkstra over tunnels. Cost ~ boots, plus a penalty for monsters, crystal caves and locks.
  const dist = { [from]: 0 }, prev = {};
  const todo = new Set(game.board.rooms.map((r) => r.id));
  const edges = (id) => {
    if (!reverse) return game.board.tunnelsFrom(id);
    // walking backwards: tunnels that lead INTO id
    const out = [];
    for (const [a, b, o = {}] of game.board.tunnels) { if (b === id) out.push({ to: a, ...o }); else if (a === id && !o.oneWay) out.push({ to: b, ...o }); }
    return out;
  };
  while (todo.size) {
    let u = null;
    for (const id of todo) if (dist[id] !== undefined && (u === null || dist[id] < dist[u])) u = id;
    if (u === null) break;
    todo.delete(u);
    for (const t of edges(u)) {
      if (t.locked && !p.items.masterKey) continue;
      const room = game.board.room(t.to);
      const c = (t.boots || 1) + (t.monsters || 0) * 1.3 + (room.crystal ? 1.2 : 0);
      if (dist[u] + c < (dist[t.to] ?? Infinity)) { dist[t.to] = dist[u] + c; prev[t.to] = u; }
    }
  }
  return { dist, prev };
}

function firstStep(prev, from, to) {
  let cur = to, guard = 0;
  while (prev[cur] !== undefined && prev[cur] !== from && guard++ < 100) cur = prev[cur];
  return prev[cur] === from ? cur : null;
}

// Where should this thief be heading?
function chooseTarget(game, p) {
  if (p.status !== 'in') return null;
  const capacity = 1 + p.items.backpack;
  const home = routeCosts(game, p, 'start', { reverse: true }).dist; // cost from room -> start
  const here = routeCosts(game, p, p.room);
  const risk = p.bot?.risk ?? 1;
  const someoneOut = game.players.some((x) => x !== p && x.status !== 'in');
  const turnCost = (1 + game.rage * 0.5 + p.damage * 0.5 + (someoneOut ? 8 : 0)) / risk;
  const goHome = p.artifacts.length >= capacity || (p.artifacts.length && (p.damage >= 6 || someoneOut || game.rage >= 5));
  if (goHome) return { room: 'start', why: 'escape' };
  let best = null;
  for (const r of game.board.rooms) {
    const value = game.rooms[r.id]?.artifact;
    if (!value || here.dist[r.id] === undefined || home[r.id] === undefined) continue;
    const turns = (here.dist[r.id] + home[r.id]) / 2.6;
    const score = value - turns * turnCost;
    if (!best || score > best.score) best = { room: r.id, score, why: `artifact ${value}` };
  }
  if (best) return best;
  return p.artifacts.length ? { room: 'start', why: 'escape' } : null;
}

// ---------------- prompts ----------------
function scoreLabel(game, p, label) {
  const L = label.toLowerCase();
  const t = game.turn;
  if (L.includes('secret tome')) return 10;
  if (L.includes('dragon attack')) return -3;
  if (L.includes('-2 clank')) return 1.2 + game.clankArea[p.id] * 0.3;
  if (L.includes('heal')) return p.damage * 0.5;
  if (L.includes('swords')) {
    const fightable = game.dungeonRow.some((c) => c && def(c).kind === 'monster' && def(c).swords <= (t?.swords || 0) + 3);
    return fightable ? 2.5 : 0.8;
  }
  if (L.includes('trash')) return trashCandidates(p).length ? 1.6 : 0.2;
  if (L.includes('teleport')) return 1.2;
  if (L.includes('secret')) return 1.6;
  const gold = L.match(/\+(\d+) gold/);
  if (gold) return Number(gold[1]) * 0.6;
  return 0;
}

const trashCandidates = (p) => [...p.hand, ...p.playArea, ...p.discard].filter((c) => c.id === 'stumble' || c.id === 'burgle');

function resolvePrompt(game, p, pending) {
  const opts = pending.options;
  const title = (pending.title || '').toLowerCase();
  const ctx = context(game, p);
  const valueOf = (o) => (o.card ? cardValue(game, p, CARD_DEFS[o.card.id], ctx) : 0);
  let pick;
  if (title.includes('trash')) {
    const order = (o) => (o.value == null ? 0 : o.card?.id === 'stumble' ? 3 : o.card?.id === 'burgle' ? 2 : -1);
    pick = [...opts].sort((a, b) => order(b) - order(a))[0];
  } else if (title.includes('discard') || title.includes('replace')) {
    pick = [...opts].sort((a, b) => valueOf(a) - valueOf(b))[0];
  } else if (opts.every((o) => !o.card)) {
    pick = [...opts].sort((a, b) => scoreLabel(game, p, b.label) - scoreLabel(game, p, a.label))[0];
  } else {
    pick = opts[0];
  }
  return { type: 'resolve', value: pick.value };
}

// ---------------- the turn ----------------
export function nextAction(game, p) {
  if (game.phase !== 'playing') return null;
  if (game.pending) return game.pending.pid === p.id ? resolvePrompt(game, p, game.pending) : null;
  if (game.currentPlayer() !== p || !game.turn) return null;
  const t = game.turn;
  if (t.deferred.length) return { type: 'resume', index: 0 };
  const L = game.legalFor(p);
  if (!L) return null;
  const ctx = context(game, p);

  // 1. potions
  for (const s of p.secrets) {
    const d = SECRET_DEFS[s.id];
    if (d.use !== 'held') continue;
    const heal = d.effects[0].heal;
    if (heal && p.damage >= heal + 2) return { type: 'useSecret', uid: s.uid };
    if (!heal && L.usefulSecrets.includes(s.uid)) return { type: 'useSecret', uid: s.uid };
  }

  // 2. play the whole hand
  if (p.hand.length) return { type: 'playAll' };

  const target = chooseTarget(game, p);

  // 3. loot in this room
  if (L.canTakeArtifact && (target?.room === p.room || (!p.artifacts.length && p.damage >= 5))) return { type: 'takeArtifact' };
  if (L.canBuy.length) {
    const lockedArtifact = !p.items.masterKey && game.board.tunnels.some(([a, b, o = {}]) => o.locked && (game.rooms[a]?.artifact || game.rooms[b]?.artifact));
    if (L.canBuy.includes('masterKey') && lockedArtifact && !p.artifacts.length && p.damage < 5) return { type: 'buy', item: 'masterKey' };
    if (L.canBuy.includes('crown')) return { type: 'buy', item: 'crown' };
    if (L.canBuy.includes('backpack') && p.artifacts.length && p.damage < 4 && !p.items.backpack && p.gold >= MARKET_PRICE + 3) return { type: 'buy', item: 'backpack' };
  }

  // 4. walk one step toward the target (swords go to tunnel monsters first)
  if (target && p.status === 'in' && target.room !== p.room) {
    const { prev } = routeCosts(game, p, p.room);
    const step = firstStep(prev, p.room, target.room);
    const m = step && L.moves.find((x) => x.to === step);
    const safe = m && m.ok && p.damage + m.damage < HEALTH_MAX - 2;
    if (safe) return { type: 'move', to: step };
    if (L.teleports.length) {
      const toHome = target.room === 'start' ? routeCosts(game, p, 'start', { reverse: true }).dist : null;
      const distTo = (rid) => (toHome ? toHome[rid] : routeCosts(game, p, rid).dist[target.room]) ?? Infinity;
      const best = [...L.teleports].sort((a, b) => distTo(a) - distTo(b))[0];
      if (distTo(best) < distTo(p.room)) return { type: 'teleport', to: best };
    }
  }

  // 5. fight what is worth fighting
  const fights = L.fightable.map((i) => ({ i, v: cardValue(game, p, def(game.dungeonRow[i]), ctx) })).sort((a, b) => b.v - a.v);
  if (fights.length && fights[0].v > 0.5) return { type: 'fight', slot: fights[0].i };

  // 6. spend skill on the best card it can afford
  const buys = [
    ...L.acquirable.map((i) => ({ slot: i, d: def(game.dungeonRow[i]) })),
    ...L.reserveBuy.map((id) => ({ slot: id, d: CARD_DEFS[id] })),
  ].map((x) => ({ ...x, v: cardValue(game, p, x.d, ctx) + (x.d.id === 'secret_tome' ? 7 * ctx.pointW : 0) }))
    .filter((x) => x.v > 0.4)
    .sort((a, b) => b.v - a.v || (b.d.cost || 0) - (a.d.cost || 0));
  if (buys.length) return { type: 'acquire', slot: buys[0].slot };

  // 7. leftover swords: the goblin pays a gold
  if (L.canFightGoblin) return { type: 'fight', slot: 'goblin' };

  return { type: 'endTurn' };
}
