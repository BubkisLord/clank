// Custom decks: validation, registering their cards, playing a game with one, and saving them to disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Game } from '../server/game/engine.js';
import { CARD_DEFS, def } from '../server/game/cards/index.js';
import { BASE_DECK, BASE_CARDS, cleanDeck, cleanCard, registerDeck, DeckError } from '../server/game/cards/decks.js';
import { nextAction } from '../server/game/ai.js';

process.env.CLANK_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'clank-decks-'));
const store = await import('../server/decks-store.js');

const copy = (x) => JSON.parse(JSON.stringify(x));
const deckWith = (edit) => { const d = copy(BASE_DECK); edit(d.cards); return { ...cleanDeck(d), id: 'test', name: 'Test' }; };

test('the base deck survives the round trip and keeps its card ids', () => {
  assert.equal(BASE_DECK.cards.length, BASE_CARDS.length);
  assert.equal(BASE_DECK.cards.reduce((s, c) => s + c.qty, 0), 100);
  const { list, custom } = registerDeck(BASE_DECK);
  assert.deepEqual(custom, []);
  assert.deepEqual(list.map((x) => x.id).sort(), BASE_CARDS.map((d) => d.id).sort());
  // a cloned, unedited deck (as saved JSON) is still the base game
  assert.deepEqual(registerDeck(cleanDeck(copy(BASE_DECK))).custom, []);
});

test('effects written in several objects or one compare the same', () => {
  const a = cleanCard({ id: 'a', name: 'A', kind: 'companion', cost: 1, play: [{ skill: 2, draw: 1 }] });
  const b = cleanCard({ id: 'a', name: 'A', kind: 'companion', cost: 1, play: [{ skill: 2 }, { draw: 1 }] });
  assert.deepEqual(a, b);
});

test('validation rejects code, unknown effects and impossible cards', () => {
  const card = (o) => ({ id: 'x', name: 'X', kind: 'companion', qty: 1, cost: 1, ...o });
  const bad = [
    card({ play: [{ fn: 'process.exit()' }] }),
    card({ play: [{ explode: 3 }] }),
    card({ kind: 'wizard' }),
    card({ kind: 'monster', swords: 2, play: [{ skill: 1 }] }),
    card({ play: [{ skill: 99 }] }),
    card({ qty: 0 }),
    card({ play: [{ choose: [{ label: 'only one', effects: [] }] }] }),
    card({ play: [{ when: { fn: 1 }, effects: [] }] }),
    card({ play: [{ trash: { from: ['bank'] } }] }),
    card({ play: [{ discardThen: [{ discardThen: [{ discardThen: [{ discardThen: [{ discardThen: [{ discardThen: [{ draw: 1 }] }] }] }] }] }] }] }),
    card({ id: '../etc' }),
    card({ name: '' }),
  ];
  for (const c of bad) assert.throws(() => cleanCard(c), DeckError, JSON.stringify(c));
  assert.throws(() => cleanDeck({ name: 'Tiny', cards: [card({ qty: 5 })] }), /at least 20/);
  assert.throws(() => cleanDeck({ name: 'Twins', cards: [card({ qty: 10 }), card({ qty: 10 })] }), /share the id/);
  assert.throws(() => cleanDeck({ name: '', cards: [card({ qty: 10 })] }), /Deck name/);
});

test('edited and new cards get stable content ids and their own definitions', () => {
  const deck = deckWith((cards) => {
    cards.find((c) => c.id === 'kobold').swords = 4;
    cards.push({ id: 'card_new', name: 'Lucky Coin', kind: 'companion', tags: ['equipment'], qty: 2, cost: 2, points: 1, text: 'Choose one.',
      play: [{ choose: [{ label: '+2 Gold', effects: [{ gold: 2 }] }, { label: 'Draw', effects: [{ draw: 1 }] }] }, { when: { has: 'artifact' }, effects: [{ skill: 1 }] }] });
  });
  const a = registerDeck(deck), b = registerDeck(copy(deck));
  assert.equal(a.custom.length, 2);
  assert.deepEqual(a.custom, b.custom, 'same content, same ids');
  const kobold = CARD_DEFS[a.custom.find((id) => CARD_DEFS[id].name === 'Kobold')];
  assert.equal(kobold.swords, 4);
  assert.equal(CARD_DEFS.kobold.swords, 1, 'the base Kobold is untouched');
  assert.ok(a.list.some((x) => x.id === 'goblin') === false);
});

test('an edited base card keeps its special end-game scoring', () => {
  const deck = deckWith((cards) => { cards.find((c) => c.id === 'dwarven_peddler').cost = 2; });
  const { custom } = registerDeck(deck);
  assert.equal(custom.length, 1);
  assert.equal(typeof CARD_DEFS[custom[0]].endGamePoints, 'function');
});

test('a game plays to the end with a custom deck, and clients get the custom cards', () => {
  const deck = deckWith((cards) => {
    for (const c of cards) if (c.kind !== 'monster') c.cost = Math.max(1, (c.cost || 0) - 1); // a cheap dungeon
    cards.push({ id: 'card_x', name: 'Rummage', kind: 'companion', tags: ['action'], qty: 6, cost: 2, points: 0, text: 'Discard a card to draw two.', play: [{ discardThen: [{ draw: 2 }] }, { trash: { from: ['discard'], match: 'stumble', optional: true } }] });
  });
  for (let run = 0; run < 5; run++) {
    const g = new Game('DECK');
    g.addPlayer('Host');
    g.addPlayer('Bot', { bot: true });
    g.players.forEach((p) => { p.bot ||= { style: 'balanced' }; });
    g.setDeck(deck);
    g.start();
    assert.equal(g.dungeonDeck.length + g.dungeonRow.filter(Boolean).length, 106);
    const s = g.stateFor(g.players[0].id);
    assert.ok(Object.keys(s.customCards).length > 40);
    for (const id of Object.keys(s.customCards)) assert.ok(id.startsWith('x_'));
    let steps = 0;
    while (g.phase === 'playing' && steps++ < 20000) {
      const actor = g.pending ? g.playerById(g.pending.pid) : g.currentPlayer();
      const a = nextAction(g, actor) || { type: 'endTurn' };
      try { g.act(actor.id, a); }
      catch (e) {
        if (e.constructor.name !== 'GameError') throw e;
        if (g.pending) g.act(g.pending.pid, { type: 'resolve', value: g.pending.options[0].value }); else g.act(actor.id, { type: 'endTurn' });
      }
    }
    assert.equal(g.phase, 'ended', 'game should end');
    for (const p of g.players) for (const c of [...p.deck, ...p.hand, ...p.discard, ...p.playArea]) assert.ok(def(c), `unknown card ${c.id}`);
  }
});

test('the deck store saves, lists, loads and deletes decks; the base deck is read-only', () => {
  assert.equal(store.listDecks()[0].id, 'base');
  const saved = store.saveDeck({ name: 'My Heist', cards: BASE_DECK.cards });
  assert.match(saved.id, /^my-heist-[0-9a-f]{6}$/);
  assert.ok(store.listDecks().some((d) => d.id === saved.id && d.total === 100));
  const loaded = store.getDeck(saved.id);
  assert.equal(loaded.name, 'My Heist');
  const edited = copy(loaded); edited.name = 'Renamed'; edited.cards[0].qty = 5;
  store.saveDeck(edited, saved.id);
  assert.equal(store.getDeck(saved.id).cards[0].qty, 5);
  assert.throws(() => store.saveDeck(edited, 'base'), /read-only/);
  assert.throws(() => store.deleteDeck('base'), DeckError);
  assert.throws(() => store.saveDeck(edited, '../../etc/passwd'), /No such deck/);
  assert.equal(store.getDeck('../x'), null);
  store.deleteDeck(saved.id);
  assert.equal(store.getDeck(saved.id), null);
});
