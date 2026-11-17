// Saved decks: one JSON file per deck in data/decks (or $CLANK_DATA/decks). Built-in decks (base game, expansions) are read-only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BASE_DECK, BUILTIN_DECKS, BUILTIN_BY_ID, cleanDeck, DeckError } from './game/cards/decks.js';

const ROOT = process.env.CLANK_DATA || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DIR = path.join(ROOT, 'decks');
const ID_RE = /^[a-z0-9-]{1,48}$/;

const file = (id) => path.join(DIR, `${id}.json`);
const summary = (d) => ({ id: d.id, name: d.name, builtin: !!d.builtin, kinds: d.cards.length, total: d.cards.reduce((s, c) => s + c.qty, 0), updatedAt: d.updatedAt || null });

function readDeck(id) {
  try {
    const raw = JSON.parse(fs.readFileSync(file(id), 'utf8'));
    return { ...cleanDeck(raw), id, updatedAt: raw.updatedAt || null };
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`deck ${id} could not be read: ${e.message}`);
    return null;
  }
}

export function listDecks() {
  let ids = [];
  try { ids = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((id) => ID_RE.test(id)); } catch { /* no decks yet */ }
  const decks = ids.map(readDeck).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  return [...BUILTIN_DECKS, ...decks].map(summary);
}

export function getDeck(id) {
  if (!id) return BASE_DECK;
  if (BUILTIN_BY_ID[id]) return BUILTIN_BY_ID[id];
  if (!ID_RE.test(id)) return null;
  return readDeck(id);
}

// Create (no id) or overwrite (id) a deck. Returns the saved deck.
export function saveDeck(raw, id = null) {
  if (BUILTIN_BY_ID[id]) throw new DeckError('Built-in decks are read-only: clone one to make changes');
  if (id && (!ID_RE.test(id) || !fs.existsSync(file(id)))) throw new DeckError('No such deck');
  const deck = cleanDeck(raw);
  if (!id) {
    const slug = deck.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'deck';
    do id = `${slug}-${crypto.randomBytes(3).toString('hex')}`; while (fs.existsSync(file(id)));
  }
  const saved = { id, name: deck.name, updatedAt: new Date().toISOString(), cards: deck.cards };
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${file(id)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(saved, null, 2));
  fs.renameSync(tmp, file(id));
  return saved;
}

export function deleteDeck(id) {
  if (BUILTIN_BY_ID[id]) throw new DeckError('Built-in decks cannot be deleted');
  if (!ID_RE.test(id || '') || !fs.existsSync(file(id))) throw new DeckError('No such deck');
  fs.unlinkSync(file(id));
}
