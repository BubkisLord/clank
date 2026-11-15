import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game/engine.js';
import { nextAction, STYLES, LEVELS } from '../server/game/ai.js';

function botGame(n, map, level = 'medium') {
  const g = new Game('AI');
  for (let i = 0; i < n; i++) g.addPlayer(`Bot ${i}`, { bot: true });
  g.options.map = map;
  g.setOption('botLevel', level);
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

for (const level of Object.keys(LEVELS)) {
  test(`${level} bots finish games with only legal actions`, () => {
    for (let i = 0; i < 6; i++) assert.equal(botGame(4, i % 2 ? 'classic' : 'random', level).phase, 'ended');
  });
}

test('a table of bots is dealt a mix of play styles', () => {
  const g = new Game('MIX');
  g.addPlayer('Host');
  for (let i = 0; i < 3; i++) g.addPlayer(`Bot ${i}`, { bot: true });
  const styles = g.players.filter((p) => p.bot).map((p) => p.bot.style);
  assert.equal(new Set(styles).size, 3);
  for (const s of styles) assert.ok(STYLES[s]);
  assert.ok(g.stateFor(g.players[0].id).players[1].botStyle);
});
