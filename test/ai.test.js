import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game/engine.js';
import { nextAction } from '../server/game/ai.js';

function botGame(n, map) {
  const g = new Game('AI');
  for (let i = 0; i < n; i++) g.addPlayer(`Bot ${i}`, { bot: true });
  g.options.map = map;
  g.start();
  let steps = 0;
  while (g.phase === 'playing' && steps++ < 20000) {
    const actor = g.pending ? g.playerById(g.pending.pid) : g.currentPlayer();
    const a = nextAction(g, actor);
    assert.ok(a, 'bot must always have a move when it is its turn');
    g.act(actor.id, a); // throws on an illegal action
  }
  return g;
}

for (const n of [2, 3, 4]) {
  test(`${n} computer players finish a game with only legal actions`, () => {
    for (let i = 0; i < 8; i++) {
      const g = botGame(n, i % 2 ? 'classic' : 'random');
      assert.equal(g.phase, 'ended');
    }
  });
}

test('computer players usually escape with an artifact', () => {
  let out = 0, total = 0;
  for (let i = 0; i < 20; i++) for (const p of botGame(3, 'random').players) { total++; if (p.status === 'escaped') out++; }
  assert.ok(out / total > 0.6, `only ${out}/${total} escaped`);
});

test('the host seat stays human when the host leaves a lobby with bots', () => {
  const g = new Game('H');
  const host = g.addPlayer('Host');
  g.addPlayer('Bot', { bot: true });
  const guest = g.addPlayer('Guest');
  g.removePlayer(host.id);
  assert.equal(g.players[0].id, guest.id);
});
