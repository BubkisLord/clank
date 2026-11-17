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
  endGamePoints(game, player) => number   // optional bonus scoring
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
| `{ returnDragonCubes: true }` | put set-aside black cubes back into the bag |
| `{ fn: (game, player, card) => void }` | escape hatch for anything else |

Conditions for `when`: `{ has: 'crown' | 'artifact' | 'monkeyIdol' | 'chalice' }`,
`{ otherCompanion: true }`.

## Custom decks (Deck Workshop)

The Deck Workshop (main menu) clones and edits dungeon decks in the browser. Decks are saved as
JSON in `data/decks/` (or `$CLANK_DATA/decks`) and the host picks one in the waiting room.
`decks.js` validates them: only the effect keys above are allowed (no `fn`), within fixed ranges.
At game start, a card identical to a base card keeps the base id; anything else is registered
under a content-hashed id (`x_…`), and its definition is sent to clients with the game state.
The starting deck and the Reserve are not editable yet.
