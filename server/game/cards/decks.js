// Custom dungeon decks: validation, the read-only base deck, and registering a deck's cards for a game.
//
// A deck is plain JSON: { id, name, cards: [cardData, ...] }. Card data uses the same shape as the
// definitions in this folder (see README.md), minus functions. Only the effect keys listed below are
// accepted, so a saved deck can never carry code.
//
// At game start each card is registered in CARD_DEFS. A card identical to a base card keeps the base id
// (so rules and bots that know it by name still work); any other card gets an id derived from its
// content, so the same card always maps to the same id and two games never clash.
import crypto from 'node:crypto';
import monsters from './monsters.js';
import devices from './devices.js';
import gems from './gems.js';
import companions from './companions.js';
import { CARD_DEFS, EXPANSIONS } from './index.js';

export class DeckError extends Error {}
const bad = (m) => { throw new DeckError(m); };

export const BASE_CARDS = [...monsters, ...devices, ...gems, ...companions];
// every card that ships with the game (base and expansions); a deck card naming one of these as baseId keeps its id
const BASE_BY_ID = Object.fromEntries([...BASE_CARDS, ...Object.values(EXPANSIONS).flat()].map((d) => [d.id, d]));

export const LIMITS = { cards: 120, copies: 10, minTotal: 20, maxTotal: 200, name: 32, deckName: 40, text: 240, label: 40, depth: 4 };
export const KINDS = ['companion', 'device', 'monster'];
export const TAGS = ['companion', 'equipment', 'action', 'gem'];
export const ZONES = ['hand', 'playArea', 'discard'];
export const FLAGS = ['ignoreMonsterTunnels', 'ignoreCrystalCaves', 'waterBreathing'];
export const HAS = ['crown', 'artifact', 'monkeyIdol', 'chalice'];
export const WHERE = ['depths', 'crystal'];

// End-game bonus: { perCard: id, points } | { perGold: n, points } | { mastery: true, points } | { treasures: n, points } | { marketItems: n, points }
function cleanEndScore(v, where) {
  if (!v) return null;
  const points = int(v.points, 1, 20, `${where}: end-game points`);
  if (v.perCard) { if (!/^[a-z0-9_]{1,40}$/.test(v.perCard)) bad(`${where}: bad card id for end-game points`); return { perCard: v.perCard, points }; }
  if (v.perGold) return { perGold: int(v.perGold, 1, 20, `${where}: gold per point`), points };
  if (v.mastery) return { mastery: true, points };
  if (v.treasures) return { treasures: int(v.treasures, 1, 3, `${where}: treasures needed`), points };
  if (v.marketItems) return { marketItems: int(v.marketItems, 1, 6, `${where}: market items needed`), points };
  bad(`${where}: unknown end-game bonus`);
}
// numeric effect keys and their allowed range
const NUM = { skill: [0, 10], swords: [0, 10], boots: [0, 10], gold: [0, 10], heal: [0, 10], clank: [-10, 10], draw: [0, 5], teleport: [0, 3], othersClank: [0, 5], allClank: [0, 5], gemDiscount: [0, 5], goldBonus: [0, 5], returnDragonCubes: [0, 10], rage: [-3, 3] };
const BOOL = ['dragonAttack', 'replaceRow', 'takeAdjacentSecret', 'skillPerClank', 'returnToHand'];
// the order applyEffect handles keys in; one effect object is split into single-key "atoms" in this order
const ORDER = ['skill', 'swords', 'boots', 'gold', 'heal', 'clank', 'draw', 'teleport', 'dragonAttack', 'othersClank', 'allClank', 'flag', 'gemDiscount', 'goldBonus', 'returnDragonCubes', 'rage', 'skillPerClank', 'buyTomes', 'freeAcquire', 'when', 'choose', 'discardThen', 'trash', 'replaceRow', 'takeAdjacentSecret', 'returnToHand'];
// which effect lists each kind of card may have
const SLOTS = { companion: ['play', 'acquire', 'arrive', 'discard'], device: ['use', 'acquire', 'arrive'], monster: ['defeat', 'arrive'] };

const int = (v, lo, hi, what) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) bad(`${what} must be a whole number from ${lo} to ${hi}`);
  return n;
};
const str = (v, max, what, { required = false } = {}) => {
  const s = String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
  if (required && !s) bad(`${what} is required`);
  if (s.length > max) bad(`${what} is longer than ${max} characters`);
  return s;
};

// Validate an effect list and return it in canonical form (one key per effect object).
export function cleanEffects(list, where, depth = 0) {
  if (list == null) return [];
  if (!Array.isArray(list)) bad(`${where}: effects must be a list`);
  if (depth > LIMITS.depth) bad(`${where}: effects are nested too deeply`);
  if (list.length > 12) bad(`${where}: too many effects`);
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) bad(`${where}: every effect must be an object`);
    for (const k of Object.keys(e)) if (!ORDER.includes(k) && !(k === 'effects' && 'when' in e)) bad(`${where}: unknown effect "${k}"`);
    for (const k of ORDER) {
      if (!(k in e)) continue;
      const v = e[k];
      if (k in NUM) { const n = int(k === 'returnDragonCubes' && v === true ? 3 : v, NUM[k][0], NUM[k][1], `${where}: ${k}`); if (n) out.push({ [k]: n }); }
      else if (BOOL.includes(k)) { if (v) out.push({ [k]: true }); }
      else if (k === 'flag') { if (!FLAGS.includes(v)) bad(`${where}: unknown flag "${v}"`); out.push({ flag: v }); }
      else if (k === 'buyTomes') out.push({ buyTomes: { gold: int(v?.gold, 0, 20, `${where}: tome price`), count: int(v?.count, 1, 3, `${where}: tome count`) } });
      else if (k === 'freeAcquire') {
        const f = { max: int(v?.max, 0, 20, `${where}: free card's highest cost`) };
        if (v?.tag) { if (!TAGS.includes(v.tag)) bad(`${where}: unknown card type "${v.tag}"`); f.tag = v.tag; }
        out.push({ freeAcquire: f });
      } else if (k === 'when') {
        let cond;
        if (v?.otherCompanion) cond = { otherCompanion: true };
        else if (v?.inFlooded) cond = { inFlooded: true };
        else if (v?.inPlayOrDiscard) { if (!/^[a-z0-9_]{1,40}$/.test(v.inPlayOrDiscard)) bad(`${where}: bad card id in condition`); cond = { inPlayOrDiscard: v.inPlayOrDiscard }; }
        else if (HAS.includes(v?.has)) cond = { has: v.has };
        else bad(`${where}: unknown condition`);
        out.push({ when: cond, effects: cleanEffects(e.effects, `${where} (if)`, depth + 1) });
      } else if (k === 'choose') {
        if (!Array.isArray(v) || v.length < 2 || v.length > 4) bad(`${where}: "choose one" needs 2 to 4 options`);
        out.push({ choose: v.map((o, i) => {
          const opt = { label: str(o?.label, LIMITS.label, `${where}: option ${i + 1} label`, { required: true }), effects: cleanEffects(o?.effects, `${where} (option ${i + 1})`, depth + 1) };
          if (o?.requires?.gold) opt.requires = { gold: int(o.requires.gold, 1, 20, `${where}: option ${i + 1} gold cost`) };
          if (o?.requires?.flooded) opt.requires = { ...opt.requires, flooded: true };
          return opt;
        }) });
      } else if (k === 'discardThen') out.push({ discardThen: cleanEffects(v, `${where} (after discarding)`, depth + 1) });
      else if (k === 'trash') {
        const from = Array.isArray(v?.from) ? v.from.filter((z) => ZONES.includes(z)) : [];
        if (!from.length) bad(`${where}: trash needs at least one place to trash from`);
        const t = { from: ZONES.filter((z) => from.includes(z)) };
        if (v.match) { if (!/^[a-z0-9_]{1,40}$/.test(v.match)) bad(`${where}: bad card id to trash`); t.match = v.match; }
        if (v.optional) t.optional = true;
        out.push({ trash: t });
      }
    }
  }
  return out;
}

// Validate one card; returns clean data (no functions, canonical effects, only known fields).
export function cleanCard(raw, i = 0) {
  if (!raw || typeof raw !== 'object') bad(`Card ${i + 1} is not an object`);
  const name = str(raw.name, LIMITS.name, `Card ${i + 1} name`, { required: true });
  const where = name;
  const id = String(raw.id || '');
  if (!/^[a-z0-9_]{1,40}$/.test(id)) bad(`${where}: id must be 1-40 lowercase letters, digits or _`);
  if (!KINDS.includes(raw.kind)) bad(`${where}: kind must be one of ${KINDS.join(', ')}`);
  const c = { id, name, kind: raw.kind };
  if (raw.baseId && BASE_BY_ID[raw.baseId]) c.baseId = raw.baseId; // a base card that no longer exists just becomes a custom card
  const tags = Array.isArray(raw.tags) ? TAGS.filter((t) => raw.tags.includes(t)) : [];
  if (raw.kind === 'companion' && tags.length) c.tags = tags;
  c.qty = int(raw.qty ?? 1, 1, LIMITS.copies, `${where}: copies`);
  if (raw.kind === 'monster') c.swords = int(raw.swords ?? 0, 0, 20, `${where}: swords`);
  else c.cost = int(raw.cost ?? 0, 0, 20, `${where}: cost`);
  c.points = int(raw.points ?? 0, -5, 20, `${where}: points`);
  if (raw.dragon) c.dragon = true;
  if (raw.danger) c.danger = true;
  if (raw.where) { if (!WHERE.includes(raw.where)) bad(`${where}: unknown place "${raw.where}"`); c.where = raw.where; }
  const es = cleanEndScore(raw.endScore, where);
  if (es) c.endScore = es;
  c.text = str(raw.text, LIMITS.text, `${where}: text`);
  for (const slot of ['play', 'use', 'defeat', 'acquire', 'arrive', 'discard']) {
    if (raw[slot] == null || (Array.isArray(raw[slot]) && !raw[slot].length)) continue;
    if (!SLOTS[raw.kind].includes(slot)) bad(`${where}: a ${raw.kind} cannot have "${slot}" effects`);
    const list = cleanEffects(raw[slot], `${where} (${slot})`);
    if (list.length) c[slot] = list;
  }
  if (raw.kind === 'companion' && !c.play) c.play = [];
  return c;
}

export function cleanDeck(raw) {
  if (!raw || typeof raw !== 'object') bad('Deck is not an object');
  const name = str(raw.name, LIMITS.deckName, 'Deck name', { required: true });
  if (!Array.isArray(raw.cards) || !raw.cards.length) bad('A deck needs at least one card');
  if (raw.cards.length > LIMITS.cards) bad(`A deck can have at most ${LIMITS.cards} different cards`);
  const cards = raw.cards.map(cleanCard);
  const ids = new Set();
  for (const c of cards) { if (ids.has(c.id)) bad(`Two cards share the id "${c.id}"`); ids.add(c.id); }
  const total = cards.reduce((s, c) => s + c.qty, 0);
  if (total < LIMITS.minTotal) bad(`A deck needs at least ${LIMITS.minTotal} cards in total (has ${total})`);
  if (total > LIMITS.maxTotal) bad(`A deck can have at most ${LIMITS.maxTotal} cards in total (has ${total})`);
  return { name, cards };
}

// Base card definitions as deck data (functions dropped, baseId set).
export function baseCardData(d) {
  const c = cleanCard({ ...d, baseId: d.id });
  return c;
}

export const BASE_DECK = Object.freeze({ id: 'base', name: 'Base game', builtin: true, cards: BASE_CARDS.map(baseCardData) });
// Read-only decks that ship with the game: the base deck, and the base deck with each expansion shuffled in.
const withSets = (id, name, sets) => Object.freeze({ id, name, builtin: true, cards: [...BASE_CARDS, ...sets.flat()].map(baseCardData) });
export const BUILTIN_DECKS = [
  BASE_DECK,
  withSets('sunken-treasures', 'Base + Sunken Treasures', [EXPANSIONS.sunken]),
  withSets('promos', 'Base + Promos', [EXPANSIONS.promos]),
  withSets('everything', 'Base + Sunken Treasures + Promos', [EXPANSIONS.sunken, EXPANSIONS.promos]),
];
export const BUILTIN_BY_ID = Object.fromEntries(BUILTIN_DECKS.map((d) => [d.id, d]));

// Does this deck need flooded rooms on the board? (any card that mentions water)
export function needsFlooding(deck) {
  const walk = (list) => (list || []).some((e) => e.flag === 'waterBreathing' || e.when?.inFlooded || walk(e.effects) || walk(e.discardThen)
    || (e.choose || []).some((o) => o.requires?.flooded || walk(o.effects)));
  return deck.cards.some((c) => ['play', 'use', 'defeat', 'acquire', 'arrive', 'discard'].some((s) => walk(c[s])));
}

// What decides a card's identity at runtime: everything except deck bookkeeping.
const essence = (c) => { const { id, baseId, qty, ...rest } = c; return rest; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Register a (clean) deck's cards; returns [{ id, qty }] for building the dungeon deck,
// plus the ids that are not base cards (the client needs their definitions).
export function registerDeck(deck) {
  const list = [], custom = [];
  for (const c of deck.cards) {
    const base = c.baseId && BASE_BY_ID[c.baseId];
    if (base && same(essence(baseCardData(base)), essence(c))) { list.push({ id: base.id, qty: c.qty }); continue; }
    const body = essence(c);
    const id = 'x_' + crypto.createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 12);
    if (!CARD_DEFS[id]) {
      CARD_DEFS[id] = { id, ...body, qty: c.qty, custom: true };
    }
    list.push({ id, qty: c.qty });
    custom.push(id);
  }
  return { list, custom: [...new Set(custom)] };
}
