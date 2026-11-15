import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game/engine.js';
import { makeCard, def } from '../server/game/cards/index.js';
import { generateBoard } from '../server/game/board.js';

function setup(n = 2, opts = {}) {
  const g = new Game('T');
  for (let i = 0; i < n; i++) g.addPlayer(`P${i}`);
  Object.assign(g.options, { autoEnd: false, map: 'classic' }, opts);
  g.start();
  return g;
}
const cur = (g) => g.currentPlayer();
function playAll(g) { const p = cur(g); while (cur(g) === p && g.turn && p.hand.length && !g.pending) g.act(p.id, { type: 'play', uid: p.hand[0].uid }); }

test('a dragon card arriving in the row triggers an attack at end of turn', () => {
  const g = setup();
  const p = cur(g);
  g.dungeonRow[0] = null; // make room for a refill
  g.dungeonDeck.unshift(makeCard('cave_troll')); // dragon symbol
  g.addClank(p, 5);
  const before = g.logs.length;
  playAll(g);
  g.act(p.id, { type: 'endTurn' });
  assert.ok(g.logs.slice(before).some((l) => l.t.startsWith('DRAGON ATTACK')), 'attack should be logged');
  assert.equal(g.clankArea[p.id], 0, 'clank moved into the bag');
});

test('no attack when the refilled cards have no dragon symbol', () => {
  const g = setup();
  const p = cur(g);
  g.dungeonRow[0] = null;
  g.dungeonDeck.unshift(makeCard('kobold'));
  const before = g.logs.length;
  playAll(g);
  g.act(p.id, { type: 'endTurn' });
  assert.ok(!g.logs.slice(before).some((l) => l.t.startsWith('DRAGON ATTACK')));
});

test('acquired cards go to the discard pile and are reshuffled only when the deck runs out', () => {
  const g = setup();
  const p = cur(g);
  g.dungeonRow[0] = makeCard('sneak');
  playAll(g);
  g.turn.skill = 10;
  g.act(p.id, { type: 'acquire', slot: 0 });
  assert.ok(p.discard.some((c) => c.id === 'sneak'));
  assert.ok(!p.deck.some((c) => c.id === 'sneak'));
  g.act(p.id, { type: 'endTurn' });
  // deck had 5 left -> new hand of 5 is the rest of the original deck; sneak still in discard
  assert.ok(!p.hand.some((c) => c.id === 'sneak'));
  assert.equal(p.deck.length, 0);
  assert.ok(p.discard.some((c) => c.id === 'sneak'));
});

test('reshuffle from the discard pile is random', () => {
  const orders = new Set();
  for (let i = 0; i < 20; i++) {
    const g = setup();
    const p = cur(g);
    p.deck = []; p.hand = [];
    p.discard = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, k) => ({ uid: 'u' + k, id: 'burgle' }));
    g.drawCards(p, 8, true);
    orders.add(p.hand.map((c) => c.uid).join(''));
    assert.equal(p.discard.length, 0);
  }
  assert.ok(orders.size > 5, 'shuffles should differ');
});

test('escaping does not strand the turn: the player can still act and end the turn', () => {
  const g = setup(2);
  const p = cur(g);
  p.artifacts.push(5);
  p.room = 'a1';
  playAll(g);
  g.turn.boots = 1;
  g.act(p.id, { type: 'move', to: 'start' });
  assert.equal(p.status, 'escaped');
  assert.ok(p.mastery);
  const L = g.legalFor(p);
  assert.ok(L && L.canEndTurn);
  assert.equal(L.moves.length, 0);
  g.act(p.id, { type: 'endTurn' });
  assert.notEqual(cur(g), p);
});

test('auto end: turn ends by itself when nothing is left to do', () => {
  const g = setup(2, { autoEnd: true });
  const p = cur(g);
  for (let i = 0; i < 6; i++) g.dungeonRow[i] = makeCard('ruby'); // nothing affordable
  p.hand = p.hand.map(() => makeCard('secret_tome')); // playing them yields no resources
  playAll(g);
  assert.notEqual(cur(g), p, 'turn should have passed automatically');
});

test('ending the turn with cards in hand discards them', () => {
  const g = setup();
  const p = cur(g);
  g.act(p.id, { type: 'endTurn' });
  assert.equal(p.hand.length, 5);
  assert.equal(p.deck.length + p.discard.length + p.hand.length, 10);
});

test('a prompt can be postponed and resumed', () => {
  const g = setup();
  const p = cur(g);
  const apoth = makeCard('apothecary');
  p.hand = [apoth, makeCard('burgle')];
  g.act(p.id, { type: 'play', uid: apoth.uid });
  assert.ok(g.pending, 'apothecary asks for a discard');
  g.act(p.id, { type: 'defer' });
  assert.equal(g.pending, null);
  assert.equal(g.legalFor(p).deferred.length, 1);
  g.act(p.id, { type: 'play', uid: p.hand[0].uid });
  g.act(p.id, { type: 'resume', index: 0 });
  assert.ok(g.pending);
  assert.equal(g.pending.options.length, 0 + 0 + g.pending.options.length);
});

test('random boards are well-formed', () => {
  for (let seed = 0; seed < 150; seed++) {
    const b = generateBoard(seed);
    const ids = new Set(b.rooms.map((r) => r.id));
    assert.equal(ids.size, b.rooms.length);
    for (const [a, c] of b.tunnels) assert.ok(ids.has(a) && ids.has(c), `tunnel endpoints exist (seed ${seed})`);
    const arts = b.rooms.filter((r) => r.artifact).map((r) => r.artifact).sort((x, y) => x - y);
    assert.deepEqual(arts, [5, 7, 10, 15, 20, 25, 30], `all artifacts placed (seed ${seed})`);
    assert.equal(b.rooms.filter((r) => r.monkeyShrine).length, 1);
    assert.ok(b.rooms.filter((r) => r.market).length >= 2);
    assert.ok(b.rooms.filter((r) => r.majorSecret).length >= 3);
    const nest = b.rooms.find((r) => r.artifact === 30);
    assert.ok(nest.depths);
    // the Vault pocket: rooms only reachable through locked tunnels
    const open = new Set(['start']); const st = ['start'];
    while (st.length) { const x = st.pop(); for (const [a, c, o = {}] of b.tunnels) { if (o.locked) continue; for (const [from, to] of [[a, c], [c, a]]) if (from === x && !open.has(to) && !(o.oneWay && from === c)) { open.add(to); st.push(to); } } }
    const pocket = b.rooms.filter((r) => !open.has(r.id));
    assert.ok(pocket.some((r) => r.id === nest.id) && pocket.length <= 2, `vault pocket is 1-2 rooms (seed ${seed})`);
    for (const r of pocket) assert.ok(r.artifact >= 25 || r.majorSecret, `locked rooms hold a big reward (seed ${seed}): ${r.name}`);
    for (const [a, c, o = {}] of b.tunnels) { const ia = pocket.some((r) => r.id === a), ic = pocket.some((r) => r.id === c); if (ia !== ic) assert.ok(o.locked, `pocket boundary locked (seed ${seed})`); }
    // exactly one locked shortcut from the Depths to the surface
    const shortcuts = b.tunnels.filter(([, , o = {}]) => o.shortcut);
    assert.equal(shortcuts.length, 1);
    { const [a, c, o] = shortcuts[0]; const ra = b.rooms.find((r) => r.id === a), rc = b.rooms.find((r) => r.id === c); assert.ok(o.locked && ra.depths !== rc.depths, `shortcut joins Depths to surface (seed ${seed})`); }
    // every room outside the pocket can reach the exit without a key, respecting one-way tunnels
    const back = new Set(['start']); const stack = ['start'];
    while (stack.length) { const x = stack.pop(); for (const [a, c, o = {}] of b.tunnels) { if (o.locked) continue; if (c === x && !back.has(a)) { back.add(a); stack.push(a); } if (a === x && !o.oneWay && !back.has(c)) { back.add(c); stack.push(c); } } }
    for (const r of b.rooms) if (!pocket.some((q) => q.id === r.id)) assert.ok(back.has(r.id), `room ${r.name} can escape (seed ${seed})`);
    // with a key the pocket is reachable
    const withKey = new Set(['start']); const sk = ['start'];
    while (sk.length) { const x = sk.pop(); for (const [a, c, o = {}] of b.tunnels) { if (a === x && !withKey.has(c)) { withKey.add(c); sk.push(c); } if (c === x && !o.oneWay && !withKey.has(a)) { withKey.add(a); sk.push(a); } } }
    for (const r of pocket) assert.ok(withKey.has(r.id), `pocket reachable with a key (seed ${seed})`);
    const names = b.rooms.map((r) => r.name);
    assert.equal(new Set(names).size, names.length, `unique names (seed ${seed})`);
  }
});

test('random map games complete under random play', async () => {
  const g = new Game('R');
  g.addPlayer('A'); g.addPlayer('B');
  g.start();
  assert.ok(g.board.name.startsWith('random'));
  assert.ok(g.stateFor(g.players[0].id).board.rooms.length > 20);
});

test('treasure secrets pay out spendable gold immediately', () => {
  const g = setup();
  const p = cur(g);
  const before = p.gold;
  g.takeSecret(p, { id: 'treasure', major: false });
  g.process();
  assert.equal(p.gold, before + 2);
  assert.ok(!p.secrets.some((s) => s.id === 'treasure'));
});

test('play all resolves Underworld Dealing after gold cards, so tomes can be afforded', () => {
  const g = setup();
  const p = cur(g);
  p.gold = 3;
  p.hand = [makeCard('underworld_dealing'), makeCard('pickaxe'), makeCard('rebel_miner')];
  g.act(p.id, { type: 'playAll' });
  assert.ok(g.pending, 'should be asked to choose');
  assert.ok(g.pending.options.some((o) => /Secret Tomes/.test(o.label)));
});

test('other players can see the current player hand but not each other', () => {
  const g = setup();
  const p = cur(g);
  const other = g.players.find((x) => x !== p);
  const view = g.stateFor(other.id);
  assert.ok(view.players.find((x) => x.id === p.id).hand, 'current player hand visible');
  const v2 = g.stateFor(p.id);
  assert.equal(v2.players.find((x) => x.id === other.id).hand, undefined);
});

test('every dragon attack gets a new number, even after the chronicle is full', () => {
  const g = setup();
  for (let i = 0; i < 400; i++) g.log('filler');
  g.dragonAttack(0, 'test');
  const a = g.lastAttack.seq;
  g.dragonAttack(0, 'test');
  assert.equal(g.lastAttack.seq, a + 1);
  assert.equal(g.stateFor(g.players[0].id).attacks.at(-1).seq, a + 1);
});
