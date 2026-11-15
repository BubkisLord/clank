// Random-play simulation: bots take random legal actions until the game ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game/engine.js';

function randomTurn(g, p) {
  let steps = 0;
  while (g.phase === 'playing' && g.currentPlayer() === p && g.turn && steps++ < 200) {
    if (g.pending) {
      const opts = g.pending.options;
      g.act(p.id, { type: 'resolve', value: opts[Math.floor(Math.random() * opts.length)].value });
      continue;
    }
    if (p.hand.length) { g.act(p.id, { type: 'play', uid: p.hand[0].uid }); continue; }
    const L = g.legalFor(p);
    if (!L) break;
    const actions = [];
    if (L.canTakeArtifact) actions.push({ type: 'takeArtifact' });
    for (const i of L.acquirable) actions.push({ type: 'acquire', slot: i });
    for (const i of L.fightable) actions.push({ type: 'fight', slot: i });
    for (const id of L.reserveBuy) actions.push({ type: 'acquire', slot: id });
    if (L.canFightGoblin) actions.push({ type: 'fight', slot: 'goblin' });
    for (const m of L.moves) if (m.ok) actions.push({ type: 'move', to: m.to }, { type: 'move', to: m.to });
    for (const r of L.teleports) actions.push({ type: 'teleport', to: r });
    for (const it of L.canBuy) actions.push({ type: 'buy', item: it });
    for (const s of p.secrets) actions.push({ type: 'useSecret', uid: s.uid });
    if (actions.length === 0 || Math.random() < 0.15) { g.act(p.id, { type: 'endTurn' }); break; }
    const a = actions[Math.floor(Math.random() * actions.length)];
    try { g.act(p.id, a); } catch (e) { if (e.constructor.name !== 'GameError') throw e; }
  }
  while (g.phase === 'playing' && g.currentPlayer() === p && g.turn) {
    if (g.pending) { g.act(p.id, { type: 'resolve', value: g.pending.options[0].value }); continue; }
    if (p.hand.length) { g.act(p.id, { type: 'play', uid: p.hand[0].uid }); continue; }
    g.act(p.id, { type: 'endTurn' });
  }
}

for (const n of [2, 3, 4]) {
  test(`random game with ${n} players completes`, () => {
    for (let run = 0; run < 15; run++) {
      const g = new Game('SIM');
      for (let i = 0; i < n; i++) g.addPlayer(`P${i}`);
      g.start();
      let turns = 0;
      while (g.phase === 'playing' && turns++ < 2000) {
        const p = g.currentPlayer();
        if (!g.turn) { g.beginTurn(); g.process(); if (g.phase !== 'playing') break; }
        randomTurn(g, g.currentPlayer());
        // invariants
        for (const q of g.players) {
          const cubes = q.supply + g.clankArea[q.id] + g.bag[q.id] + q.damage;
          assert.ok(cubes <= 30 && cubes >= 0, `cube accounting off for ${q.name}: ${cubes}`);
          assert.ok(q.damage <= 10);
        }
        assert.equal(g.dungeonRow.length, 6);
      }
      assert.equal(g.phase, 'ended', 'game should end');
      assert.ok(Array.isArray(g.results));
      // row+deck+discard+player-owned dungeon cards = 100
    }
  });
}

test('card stats sum: dungeon deck has 100 cards', async () => {
  const { buildDungeonDeck } = await import('../server/game/cards/index.js');
  assert.equal(buildDungeonDeck().length, 100);
});
