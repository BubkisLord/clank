# Card definitions

Every card is a plain object. To add a card, add an entry to one of the files in
this folder (or create a new file and import it in `index.js`). Nothing else in
the engine needs to change.

```js
{
  id: 'sapphire',          // unique key
  name: 'Sapphire',
  kind: 'companion',       // 'companion' | 'device' | 'monster'
  tags: ['gem'],           // optional: 'gem', 'companion' (for Rebel checks), ...
  qty: 3,                  // copies in the dungeon deck
  cost: 4,                 // skill cost (companions/devices)  — monsters use `swords`
  swords: 3,               // monsters: swords needed to defeat
  points: 4,               // victory points when in your deck at game end
  dragon: true,            // dragon-attack symbol (attacks when revealed in the row)
  danger: true,            // Danger keyword (+1 cube per attack while in the row)
  text: 'Gain 2 skill...', // shown to players
  play:   [ ...effects ],  // companion: when played from hand
  use:    [ ...effects ],  // device: when acquired
  defeat: [ ...effects ],  // monster: when defeated
  acquire:[ ...effects ],  // when bought from the dungeon row
  arrive: [ ...effects ],  // when revealed into the dungeon row
  discard:[ ...effects ],  // companion: when another card makes you discard this one (Sunken Treasures)
  where: 'depths',         // optional: only acquire / fight / use while in the Depths ('depths') or a Crystal Cave ('crystal')
  endScore: { perCard: 'secret_tome', points: 2 },  // optional end-game bonus, one of:
           // { perCard: id, points } · { perGold: 5, points: 1 } · { mastery: true, points: 10 } · { treasures: 2, points: 4 } · { marketItems: 3, points: 7 }
}
```

## Effects

Effects are plain objects processed by `../effects.js`. Available keys:

| effect | meaning |
|---|---|
| `{ skill, swords, boots, gold, clank, heal, draw }` | resource gains (any subset; clank may be negative) |
| `{ choose: [{ label, effects: [...] }, ...] }` | player picks one option |
| `{ discardThen: [...] }` | discard a card from hand, then run effects (nothing if hand empty) |
| `{ trash: { from: ['hand','playArea','discard'], match: 'burgle', optional: false } }` | trash a card |
| `{ teleport: 1 }` | gain a teleport charge usable this turn |
| `{ dragonAttack: true }` | the dragon attacks immediately |
| `{ othersClank: n }` / `{ allClank: n }` | other players / all players add clank |
| `{ when: cond, effects: [...] }` | fires once, as soon as `cond` is true this turn (even later) |
| `{ replaceRow: true }` | choose a dungeon-row card to replace |
| `{ flag: 'ignoreMonsterTunnels' \| 'ignoreCrystalCaves' }` | turn-long flags |
| `{ gemDiscount: 2 }` | gems cost less this turn |
| `{ buyTomes: { gold: 7, count: 2 } }` | pay gold for Secret Tomes from the Reserve |
| `{ takeAdjacentSecret: true }` | take a secret token from an adjacent room |
| `{ skillPerClank: true }` | +1 skill for every clank made this turn (Swagger) |
| `{ returnDragonCubes: 3 }` | put up to n set-aside black cubes back into the bag |
| `{ goldBonus: 1 }` | each time you gain gold this turn, gain n more (Search) |
| `{ rage: 1 }` | move the Dragon marker n spaces (negative moves it down) |
| `{ freeAcquire: { max: 3, tag? } }` | take a non-monster Dungeon Row card costing up to max for free (optionally only one subtype) |
| `{ clearScent: true }` | Dragon Presence: the dragon loses your scent and forgets noise you made |
| `{ flag: 'foreseeDragon' }` | Dragon Presence: you see the dragon's next move this turn |
| `{ returnToHand: true }` | put this card back into your hand (use in a `discard` slot) |
| `{ fn: (game, player, card) => void }` | escape hatch for anything else |

Conditions for `when`: `{ has: 'crown' | 'artifact' | 'monkeyIdol' | 'chalice' }`,
`{ otherCompanion: true }`, `{ inPlayOrDiscard: 'secret_tome' }`.

## Expansions

`sunken-treasures.js` and `promos.js` hold expansion cards. They are registered in `CARD_DEFS` but are
not in the default dungeon deck; `decks.js` builds the read-only built-in decks that shuffle them in
(Base + Sunken Treasures, Base + Promos, and both).

## Custom decks (Deck Workshop)

The Deck Workshop (main menu) clones and edits dungeon decks in the browser. Decks are saved as
JSON in `data/decks/` (or `$CLANK_DATA/decks`) and the host picks one in the waiting room.
`decks.js` validates them: only the effect keys above are allowed (no `fn`), within fixed ranges.
At game start, a card identical to a base card keeps the base id; anything else is registered
under a content-hashed id (`x_…`), and its definition is sent to clients with the game state.
The starting deck and the Reserve are not editable yet.
