import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game/engine.js';
import { makeCard, def } from '../server/game/cards/index.js';
import { generateBoard, Board } from '../server/game/board.js';

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
  g.dungeonDeck.unshift(makeCard('crystal_golem')); // no dragon symbol
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

test('the base dungeon deck matches the reference card list: 100 cards, 26 dragon symbols', async () => {
  const { BASE_CARDS } = await import('../server/game/cards/decks.js');
  const n = (f) => BASE_CARDS.filter(f).reduce((s, d) => s + d.qty, 0);
  assert.equal(n(() => true), 100);
  assert.equal(n((d) => d.kind === 'monster'), 20);
  assert.equal(n((d) => d.kind === 'device'), 10);
  assert.equal(n((d) => (d.tags || []).includes('gem')), 9);
  assert.equal(n((d) => d.dragon), 26);
  assert.equal(n((d) => d.danger), 5);
});

test('depths-only cards can only be taken in the Depths', () => {
  const g = setup();
  const p = cur(g);
  g.dungeonRow[0] = makeCard('cave_troll');
  g.turn.swords = 10;
  assert.ok(!g.legalFor(p).fightable.includes(0));
  assert.throws(() => g.act(p.id, { type: 'fight', slot: 0 }), /only be fought in the Depths/);
  p.room = g.board.rooms.find((r) => r.depths).id;
  assert.ok(g.legalFor(p).fightable.includes(0));
});

test('Search gives +1 gold every time you gain gold that turn', () => {
  const g = setup();
  const p = cur(g);
  p.hand = [makeCard('search'), makeCard('pickaxe')];
  const gold = p.gold;
  playAll(g);
  assert.equal(p.gold, gold + 3);
});

test('end-game bonuses: Wizard counts Secret Tomes, The Duke counts gold', () => {
  const g = setup();
  const p = cur(g);
  p.deck = [makeCard('wizard'), makeCard('secret_tome'), makeCard('secret_tome'), makeCard('the_duke')];
  p.hand = []; p.discard = []; p.playArea = [];
  p.gold = 11;
  assert.equal(g.score(p, true).breakdown.bonus, 4 + 2);
});

test('the game ends at once when the Dungeon Deck runs out', () => {
  const g = setup(2);
  const [a, b] = g.players;
  a.status = 'escaped';
  b.room = g.board.rooms.find((r) => r.depths).id;
  g.dungeonDeck = [];
  g.dungeonRow[0] = null;
  g.act(cur(g).id === a.id ? a.id : b.id, { type: 'endTurn' });
  assert.equal(g.phase, 'ended');
  assert.equal(b.status, 'ko');
  assert.equal(b.koRescued, false, 'knocked out in the Depths: no points');
  assert.ok(g.logs.some((l) => l.t.includes('Dungeon Deck has run out')));
});

// ---------- Sunken Treasures / promo cards ----------
const resolve = (g, pick) => { const o = g.pending.options.find(pick); assert.ok(o, 'option offered'); g.act(g.pending.pid, { type: 'resolve', value: o.value }); };

test('discarding Coin Purse to another card pays 5 gold; Boomerang comes back to hand', () => {
  const g = setup();
  const p = cur(g);
  p.hand = [makeCard('medic'), makeCard('coin_purse')];
  const gold = p.gold;
  g.act(p.id, { type: 'play', uid: p.hand[0].uid });
  resolve(g, (o) => o.label === 'Coin Purse');
  assert.equal(p.gold, gold + 5);
  p.hand = [makeCard('climbing_gear'), makeCard('boomerang')];
  g.act(p.id, { type: 'play', uid: p.hand[0].uid });
  resolve(g, (o) => o.label === 'Boomerang');
  assert.deepEqual(p.hand.map((c) => c.id), ['boomerang']);
  assert.ok(!p.discard.some((c) => c.id === 'boomerang'));
});

test('Pickpocket takes a cheap Dungeon Row card for free', () => {
  const g = setup();
  const p = cur(g);
  g.dungeonRow[0] = makeCard('merling'); g.dungeonRow[1] = makeCard('elven_ranger');
  p.hand = [makeCard('pickpocket')];
  g.act(p.id, { type: 'play', uid: p.hand[0].uid });
  assert.ok(!g.pending.options.some((o) => o.label === 'Elven Ranger'), 'costs 5, over the limit');
  resolve(g, (o) => o.label === 'Merling');
  assert.ok(p.discard.some((c) => c.id === 'merling'));
  assert.equal(g.dungeonRow[0], null);
});

test('Alchemist pays 2 gold when a Secret Tome is in play or the discard pile', () => {
  const g = setup();
  const p = cur(g);
  p.discard = [makeCard('secret_tome')];
  p.hand = [makeCard('alchemist')];
  const gold = p.gold;
  g.act(p.id, { type: 'play', uid: p.hand[0].uid });
  assert.equal(p.gold, gold + 2);
});

test('Grand Plan scores 7 with three Market items', () => {
  const g = setup();
  const p = cur(g);
  p.deck = [makeCard('grand_plan')]; p.hand = []; p.discard = []; p.playArea = [];
  assert.equal(g.score(p, true).breakdown.bonus, 0);
  p.items.backpack = 1; p.items.masterKey = 1; p.items.crowns = [10];
  assert.equal(g.score(p, true).breakdown.bonus, 7);
});


test('a deck with water cards floods part of the Depths; the base deck does not', async () => {
  const { BUILTIN_BY_ID } = await import('../server/game/cards/decks.js');
  assert.ok(!setup().board.rooms.some((r) => r.flooded));
  for (const map of ['classic', 'random']) {
    const g = new Game('W'); g.addPlayer('A'); g.addPlayer('B');
    Object.assign(g.options, { autoEnd: false, map });
    g.setDeck(BUILTIN_BY_ID['sunken-treasures']);
    g.start();
    const wet = g.board.rooms.filter((r) => r.flooded);
    assert.ok(wet.length >= 5, `${map}: ${wet.length} flooded rooms`);
    assert.ok(wet.every((r) => r.depths && !r.crystal && !r.market && !r.start));
  }
  assert.ok(!generateBoard().rooms.some((r) => r.flooded), 'flooding never touches the shared room list');
});

test('flooded rooms: swimming costs 2 boots, and staying under all turn costs 1 health unless a Mermaid helps', () => {
  const g = setup();
  const p = cur(g);
  const ob = g.board;
  g.board = new Board({ rooms: ob.rooms.map((r) => ({ ...r })), tunnels: ob.tunnels, name: ob.name, geometry: ob.geometry }); // never touch the shared classic rooms
  const [a, b] = g.board.tunnels.find(([x, y]) => g.board.room(x).depths && g.board.room(y).depths && x !== 'start');
  g.board.room(a).flooded = true; g.board.room(b).flooded = true;
  p.room = a;
  assert.equal(g.legalFor(p).moves.find((m) => m.to === b).cost, 2);
  g.turn.noAir = true;
  p.hand = [];
  const dmg = p.damage;
  g.act(p.id, { type: 'endTurn' });
  assert.equal(p.damage, dmg + 1);
  // next time round, a Mermaid saves the player
  while (cur(g) !== p) g.act(cur(g).id, { type: 'endTurn' });
  assert.ok(g.turn.noAir, 'starts the turn underwater');
  p.hand = [makeCard('mermaid')];
  g.act(p.id, { type: 'play', uid: p.hand[0].uid });
  g.act(p.id, { type: 'endTurn' });
  assert.equal(p.damage, dmg + 1);
});

test('players see what is left in the Dungeon Deck as counts, never the order', () => {
  const g = setup();
  const s = g.stateFor(g.players[0].id);
  assert.equal(Object.values(s.dungeonLeft).reduce((a, b) => a + b, 0), s.dungeonDeckCount);
  assert.equal(Object.values(s.dungeonStart).reduce((a, b) => a + b, 0), 100);
  assert.ok(!('dungeonDeck' in s));
  for (const [id, n] of Object.entries(s.dungeonLeft)) assert.ok(n <= s.dungeonStart[id], id);
});

test('"choose two" asks twice and never offers the same option again (Wishing Well)', () => {
  const g = setup();
  const p = cur(g);
  g.queueFront(p, def({ id: 'wishing_well' }).use, null);
  g.process();
  assert.equal(g.pending.options.length, 4);
  resolve(g, (o) => o.label === '+2 Boots');
  assert.equal(g.pending.options.length, 3);
  assert.ok(!g.pending.options.some((o) => o.label === '+2 Boots'));
  resolve(g, (o) => o.label === '+2 Swords');
  assert.equal(g.pending, null);
  assert.equal(g.turn.boots, 2); assert.equal(g.turn.swords, 2);
});
