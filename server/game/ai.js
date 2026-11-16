// Computer-controlled thief. `nextAction(game, p)` looks at the game and returns ONE action
// (the same shape a browser sends), or null when it is not this bot's move. The server calls it
// repeatedly with a short delay so humans can watch the bot play.
//
// It is a hand-written heuristic player, not a trained network: it values cards by what they
// produce, plans a route to the artifact that is worth the most for the risk, and heads home
// once it has loot or is getting hurt.
//
// Two independent knobs shape a bot:
//   style  (per bot, rolled when it joins): how it likes to play — see STYLES
//   level  (game option botLevel): how well it plays — see LEVELS
//   pace   (game option botPace): which styles are dealt and how fast they push — see PACES
import { def, CARD_DEFS } from './cards/index.js';
import { SECRET_DEFS } from './secrets.js';
import { HEALTH_MAX, MARKET_PRICE } from './board.js';

export const BOT_NAMES = ['Sir Pilfer', 'Mags the Quiet', 'Old Rattlebag', 'Wren Lightfoot', 'Brother Snatch', 'Lady Gloves', 'Tobin Twelvetoes', 'Nix'];
export const BOT_FIRST_NAMES = ['Sir', 'Old', 'Lady', 'Brother', 'Mags', 'Wren', 'Tobin', 'Nix', 'Thorin', 'Fiona', 'Garrick', 'Lydia', 'Roderick', 'Selene', 'Vex', 'Zara', 'Bram', 'Cora', 'Dorian', 'Elara', 'Finn', 'Gideon', 'Harlow', 'Isolde', 'Jasper', 'Kael', 'Lyra', 'Milo', 'Niamh', 'Orin', 'Peregrine', 'Quinn', 'Rhiannon', 'Soren', 'Tamsin', 'Ulric', 'Vesper', 'Wrenna', 'Xander', 'Yara', 'Zephyr'];

// haste: >1 grabs the nearest artifact and runs; <1 walks further for a bigger one
// risk: random per-bot spread on top of haste
// cardW: how much it wants to buy cards; bootW: how much it values movement; points: extra love for point cards
// buildRounds: rounds spent near the entrance building a deck before delving
// homeAt: damage at which it heads for the exit if it holds an artifact
// about: plain description shown on the player sheet
export const STYLES = {
    raider: { label: 'Reckless raider', about: 'Grabs the nearest decent artifact and sprints for the exit. Prefers movement to buying cards and shrugs off Clank!, so it is usually first out, with a smaller haul.', grab: 10, haste: 1.6, risk: [0.9, 1.2], cardW: 0.6, bootW: 1.9, clankW: 0.5, buildRounds: [0, 0], homeAt: 8 },
    builder: { label: 'Patient deck-builder', about: 'Spends the first rounds near the entrance buying cards, especially ones worth points, then delves with a stronger deck. Slow to start, dangerous late.', haste: 0.8, risk: [0.9, 1.2], cardW: 1.4, bootW: 1, clankW: 1, points: 0.4, buildRounds: [1, 2], homeAt: 6 },
    balanced: { label: 'Steady thief', about: 'Weighs each artifact against how far and how dangerous it is to reach. No strong habits, just sensible choices.', haste: 1, risk: [0.75, 1.35], cardW: 1, bootW: 1.2, clankW: 1, buildRounds: [0, 0], homeAt: 6 },
    greedy: { label: 'Greedy delver', about: 'Goes deep for the biggest artifacts and buys a backpack so it can carry two out. Stays down longer when hurt, so it comes back rich or not at all.', haste: 0.55, risk: [0.9, 1.2], cardW: 0.9, bootW: 1.4, clankW: 0.8, buildRounds: [0, 1], homeAt: 7, backpack: true },
};

// noise: random error added to every judgement; slip: chance of skipping a good buy or fight;
// careless: misjudges wounds, grabs the first artifact it finds, sometimes picks prompts at random.
// detour: takes slightly longer routes past secrets, idols and markets;
// rivals: skips artifacts another thief will reach first; tune: multipliers on the value weights.
// (Tuned by simulation: a planned knapsack buy and pickier buying both made bots weaker.)
export const LEVELS = {
    easy: { label: 'Easy', noise: 2.5, slip: 0.35, potions: false, careless: true },
    medium: { label: 'Medium', noise: 0, slip: 0, potions: true, careless: false },
    hard: { label: 'Hard', noise: 0, slip: 0, potions: true, careless: false, detour: true, rivals: true, tune: { haste: 0.7 } },
};

// Game length. reckless: only fast styles, pushed harder, so games end sooner;
// patient: only slow styles that build a deck first, so games run longer.
// styles: the pool bots are dealt from; haste: multiplier on the style's haste; build: extra build rounds;
// grab: take any artifact at least this valuable on the way, instead of walking on to the planned one.
export const PACES = {
    reckless: { label: 'Reckless', styles: ['raider', 'balanced'], haste: 2, build: 0, grab: 8 },
    mixed: { label: 'Mixed', styles: Object.keys(STYLES), haste: 1, build: 0 },
    patient: { label: 'Patient', styles: ['builder', 'greedy'], haste: 0.6, build: 2 },
};

const between = ([a, b]) => a + Math.random() * (b - a);

// The per-bot profile stored on the player. Styles are dealt from the pace's pool so a table gets a mix.
export function makeBotProfile(existingStyles = [], pace = 'mixed') {
    const P = PACES[pace] || PACES.mixed;
    const all = P.styles;
    const fresh = all.filter((s) => !existingStyles.includes(s));
    const pool = fresh.length ? fresh : all;
    const style = pool[Math.floor(Math.random() * pool.length)];
    const S = STYLES[style];
    return { style, risk: between(S.risk), buildRounds: Math.round(between(S.buildRounds)) + P.build };
}

const styleOf = (p) => STYLES[p.bot?.style] || STYLES.balanced;
const paceOf = (game) => PACES[game.options?.botPace] || PACES.mixed;
const levelOf = (game, p) => LEVELS[p?.bot?.level || game.options?.botLevel] || LEVELS.medium;
const jitter = (game, p) => (Math.random() - 0.5) * levelOf(game, p).noise;

// ---------------- valuing cards ----------------
function effectValue(list, ctx) {
    let v = 0;
    for (const e of list || []) {
        if (typeof e === 'function' || e.fn) { v += 1; continue; }
        v += (e.skill || 0) * 1 + (e.swords || 0) * 0.85 + (e.boots || 0) * ctx.bootW + (e.gold || 0) * 0.6
            + (e.draw || 0) * ctx.drawW - (e.clank || 0) * ctx.clankW + (e.heal || 0) * ctx.healW + (e.teleport || 0) * 1.5;
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
    const S = styleOf(p), T = levelOf(game, p).tune || {};
    return {
        late,
        building: !p.artifacts.length && Math.floor(game.turnNumber / game.players.length) < (p.bot?.buildRounds || 0),
        cardW: S.cardW * (T.card || 1),
        bootW: p.status === 'in' ? S.bootW * (T.boot || 1) : 0,
        drawW: 1.4 * (T.draw || 1),
        clankW: (0.35 + game.rage * 0.08 + p.damage * 0.05) * S.clankW * (T.clank || 1),
        healW: p.damage > 0 ? 0.9 : 0.1,
        pointW: 0.3 + 0.7 * late + (T.points || 0) + (S.points || 0),
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
    const plays = Math.max(0.3, 2.2 * (1 - ctx.late)) * (ctx.building ? 1.6 : 1);
    return (effectValue(d.play, ctx) * plays - 0.8) * ctx.cardW + points + effectValue(d.acquire, ctx); // -0.8: it dilutes the deck
}

// ---------------- routing ----------------
// Dijkstra over tunnels. Cost ~ boots, plus a penalty for monsters, crystal caves and locks.
// reverse: costs of getting FROM every room TO `from`.
function routeCosts(game, p, from, { reverse = false } = {}) {
    const dist = { [from]: 0 }, prev = {};
    const todo = new Set(game.board.rooms.map((r) => r.id));
    const edges = (id) => {
        if (!reverse) return game.board.tunnelsFrom(id);
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
            const room = game.board.room(reverse ? u : t.to);
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

// What is lying around in a room for the taking?
function roomLoot(game, p, rid) {
    const r = game.board.room(rid), rs = game.rooms[rid];
    if (!rs) return 0;
    let v = 0;
    if (rs.majorSecret) v += 3;
    if (rs.minorSecrets?.length) v += 1.5;
    if (r.monkeyShrine && rs.monkeyIdols > 0) v += 5;
    if (r.market && p.gold >= MARKET_PRICE && game.market.crowns.length) v += 3;
    if (r.fountain && p.damage > 0) v += 1;
    return v;
}

// Where should this thief be heading?
function chooseTarget(game, p) {
    if (p.status !== 'in') return null;
    const S = styleOf(p), lvl = levelOf(game, p);
    const capacity = 1 + p.items.backpack;
    const home = routeCosts(game, p, 'start', { reverse: true }).dist; // cost from room -> start
    const here = routeCosts(game, p, p.room);
    const someoneOut = game.players.some((x) => x !== p && x.status !== 'in');
    const hurt = lvl.careless ? p.damage * 0.15 : p.damage * 0.5; // easy bots underrate their wounds
    const haste = (S.haste || 1) * (lvl.tune?.haste || 1) * paceOf(game).haste; // >1 prefers near artifacts and a quick exit
    const turnCost = haste * (1 + game.rage * 0.5 + hurt + (someoneOut ? 8 : 0)) / (p.bot?.risk ?? 1);
    const homeAt = lvl.careless ? 8 : S.homeAt;
    const goHome = p.artifacts.length >= capacity || (p.artifacts.length && (p.damage >= homeAt || someoneOut || game.rage >= 5));
    if (goHome) return { room: 'start', why: 'escape' };

    // deck-builders loiter near the entrance first, picking up secrets on the surface
    const round = Math.floor(game.turnNumber / game.players.length);
    if (!p.artifacts.length && round < (p.bot?.buildRounds || 0) && game.rage < 4) {
        const near = game.board.rooms.filter((r) => !r.depths && !r.start && here.dist[r.id] !== undefined && here.dist[r.id] <= 4 && roomLoot(game, p, r.id) > 0)
            .sort((a, b) => here.dist[a.id] - here.dist[b.id])[0];
        return near ? { room: near.id, why: 'building' } : null;
    }

    let best = null;
    for (const r of game.board.rooms) {
        const value = game.rooms[r.id]?.artifact;
        if (!value || here.dist[r.id] === undefined || home[r.id] === undefined) continue;
        const turns = (here.dist[r.id] + home[r.id]) / 2.6;
        let score = value - turns * turnCost + jitter(game, p) * 3;
        if (lvl.rivals) {
            for (const o of game.players) {
                if (o === p || o.status !== 'in' || o.artifacts.length >= 1 + o.items.backpack) continue;
                const theirs = routeCosts(game, o, o.room).dist[r.id];
                if (theirs !== undefined && theirs + 1 < here.dist[r.id]) { score -= value * 0.4; break; }
            }
        }
        if (!best || score > best.score) best = { room: r.id, score, why: `artifact ${value}` };
    }
    if (best) return best;
    return p.artifacts.length ? { room: 'start', why: 'escape' } : null;
}

// Pick the next room to walk into, or null.
function chooseStep(game, p, L, target) {
    const lvl = levelOf(game, p);
    const ok = L.moves.filter((m) => m.ok && p.damage + m.damage < HEALTH_MAX - 2);
    if (!ok.length) return null;
    const toTarget = routeCosts(game, p, target.room, { reverse: true }).dist;
    const base = toTarget[p.room] ?? Infinity;
    if (!lvl.detour) {
        const { prev } = routeCosts(game, p, p.room);
        const step = firstStep(prev, p.room, target.room);
        return ok.find((m) => m.to === step)?.to ?? null;
    }
    // hard: take a slightly longer way if it passes secrets, idols or a market
    let best = null;
    for (const m of ok) {
        const after = toTarget[m.to];
        if (after === undefined) continue;
        const extra = m.cost + (m.monsters ? m.damage * 1.5 : 0) + after - base; // 0 or less = on the shortest path
        if (extra > 2.5) continue;
        const score = roomLoot(game, p, m.to) * 0.6 - Math.max(0, extra) * 1.2 - after * 0.05;
        if (!best || score > best.score) best = { to: m.to, score };
    }
    return best?.to ?? null;
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
    if (levelOf(game, p).careless && Math.random() < 0.3) return { type: 'resolve', value: opts[Math.floor(Math.random() * opts.length)].value };
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

// ---------------- spending skill ----------------
function buyOptions(game, p, L, ctx) {
    return [
        ...L.acquirable.map((i) => ({ slot: i, d: def(game.dungeonRow[i]) })),
        ...L.reserveBuy.map((id) => ({ slot: id, d: CARD_DEFS[id] })),
    ].map((x) => ({ ...x, cost: game.cardCost(x.d), v: cardValue(game, p, x.d, ctx) + (x.d.id === 'secret_tome' ? 7 * ctx.pointW : 0) + jitter(game, p) }))
        .filter((x) => x.v > (levelOf(game, p).buyMin ?? 0.4));
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
    const S = styleOf(p), lvl = levelOf(game, p);

    // 1. potions
    for (const s of p.secrets) {
        const d = SECRET_DEFS[s.id];
        if (d.use !== 'held') continue;
        const heal = d.effects[0].heal;
        if (heal && p.damage >= (lvl.potions ? heal + 2 : 7)) return { type: 'useSecret', uid: s.uid };
        if (!heal && lvl.potions && L.usefulSecrets.includes(s.uid)) return { type: 'useSecret', uid: s.uid };
    }

    // 2. play the whole hand
    if (p.hand.length) return { type: 'playAll' };

    const target = chooseTarget(game, p);

    // 3. loot in this room
    if (L.canTakeArtifact && (target?.room === p.room || (!p.artifacts.length && (p.damage >= 5 || lvl.careless || ((S.grab || paceOf(game).grab) && game.rooms[p.room].artifact >= Math.min(S.grab || 99, paceOf(game).grab || 99)))))) return { type: 'takeArtifact' };
    if (L.canBuy.length) {
        const lockedArtifact = !p.items.masterKey && game.board.tunnels.some(([a, b, o = {}]) => o.locked && (game.rooms[a]?.artifact || game.rooms[b]?.artifact));
        if (L.canBuy.includes('masterKey') && lockedArtifact && !p.artifacts.length && p.damage < 5) return { type: 'buy', item: 'masterKey' };
        if (L.canBuy.includes('backpack') && S.backpack && !p.items.backpack && p.damage < 5) return { type: 'buy', item: 'backpack' };
        if (L.canBuy.includes('crown')) return { type: 'buy', item: 'crown' };
        if (L.canBuy.includes('backpack') && p.artifacts.length && p.damage < 4 && !p.items.backpack && p.gold >= MARKET_PRICE + 3) return { type: 'buy', item: 'backpack' };
    }

    // 4. walk one step toward the target (swords go to tunnel monsters first)
    if (target && p.status === 'in' && target.room !== p.room) {
        const step = chooseStep(game, p, L, target);
        if (step) return { type: 'move', to: step };
        if (L.teleports.length) {
            const distT = routeCosts(game, p, target.room, { reverse: true }).dist;
            const d = (rid) => distT[rid] ?? Infinity;
            const best = [...L.teleports].sort((a, b) => d(a) - d(b))[0];
            if (d(best) < d(p.room)) return { type: 'teleport', to: best };
        }
    }

    // 5. fight what is worth fighting
    const fights = L.fightable.map((i) => ({ i, v: cardValue(game, p, def(game.dungeonRow[i]), ctx) + jitter(game, p) })).sort((a, b) => b.v - a.v);
    if (fights.length && fights[0].v > 0.5 && Math.random() >= lvl.slip) return { type: 'fight', slot: fights[0].i };

    // 6. spend skill
    const buys = buyOptions(game, p, L, ctx);
    if (buys.length && Math.random() >= lvl.slip) {
        const pick = buys.sort((a, b) => b.v - a.v || (b.d.cost || 0) - (a.d.cost || 0))[0];
        if (pick) return { type: 'acquire', slot: pick.slot };
    }

    // 7. leftover swords: the goblin pays a gold
    if (L.canFightGoblin) return { type: 'fight', slot: 'goblin' };

    return { type: 'endTurn' };
}
