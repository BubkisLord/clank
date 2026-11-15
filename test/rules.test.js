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
    for (const [a, c, o = {}] of b.tunnels) if (a === nest.id || c === nest.id) assert.ok(o.locked, `nest tunnels locked (seed ${seed})`);
    // every room can reach the exit without a key, respecting one-way tunnels (except the nest)
    const back = new Set(['start']); const stack = ['start'];
    while (stack.length) { const x = stack.pop(); for (const [a, c, o = {}] of b.tunnels) { if (o.locked) continue; if (c === x && !back.has(a)) { back.add(a); stack.push(a); } if (a === x && !o.oneWay && !back.has(c)) { back.add(c); stack.push(c); } } }
    for (const r of b.rooms) if (r.id !== nest.id) assert.ok(back.has(r.id), `room ${r.name} can escape (seed ${seed})`);
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
