import starting from './starting.js';
import reserve from './reserve.js';
import monsters from './monsters.js';
import devices from './devices.js';
import gems from './gems.js';
import companions from './companions.js';
import { uid, shuffle } from '../util.js';

// To add a new set of cards: create a file exporting an array and add it here.
const DUNGEON_SETS = [monsters, devices, gems, companions];

export const CARD_DEFS = {};
for (const set of [starting, reserve, ...DUNGEON_SETS]) {
  for (const def of set) {
    if (CARD_DEFS[def.id]) throw new Error(`Duplicate card id: ${def.id}`);
    CARD_DEFS[def.id] = def;
  }
}

export function makeCard(defId) {
  const def = CARD_DEFS[defId];
  if (!def) throw new Error(`Unknown card: ${defId}`);
  return { uid: uid('k'), id: def.id };
}

export function def(card) {
  return CARD_DEFS[typeof card === 'string' ? card : card.id];
}

// `list` is [{ id, qty }] from a custom deck (see decks.js); the base game's cards by default.
export function buildDungeonDeck(list = DUNGEON_SETS.flat()) {
  const deck = [];
  for (const d of list) for (let i = 0; i < d.qty; i++) deck.push(makeCard(d.id));
  return shuffle(deck);
}

export function buildStartingDeck() {
  const deck = [];
  for (const d of starting) for (let i = 0; i < d.qty; i++) deck.push(makeCard(d.id));
  return shuffle(deck);
}

export function buildReserve() {
  const r = {};
  for (const d of reserve) if (!d.persistent) r[d.id] = d.qty;
  return r; // counts remaining per reserve card id
}

// Public (client-safe) view of a definition
export function publicDef(d) {
  return {
    id: d.id, name: d.name, kind: d.kind, tags: d.tags || [], cost: d.cost ?? null, swords: d.swords ?? null,
    points: d.points ?? 0, dragon: !!d.dragon, danger: !!d.danger, text: d.text || '', reserve: !!d.reserve, persistent: !!d.persistent,
  };
}

export function allPublicDefs() {
  const out = {};
  for (const [id, d] of Object.entries(CARD_DEFS)) out[id] = publicDef(d);
  return out;
}
