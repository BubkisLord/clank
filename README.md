# Clank! — browser multiplayer

A browser implementation of **Clank! A Deck-Building Adventure** (base game) with a Node.js
server. Players join from any device on the LAN, or over the internet with port forwarding.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`. The server prints LAN URLs such as `http://192.168.1.20:3000`;
other players open that URL, or the share link shown in the waiting room (`/?g=CODE`).

- **LAN:** anyone on the same network can open the LAN URL.
- **Internet:** forward TCP port 3000 on your router to the host machine and share
  `http://<your-public-ip>:3000`. Set a different port with `PORT=8080 npm start`.
- Reloading the page or losing the connection keeps your seat (per browser tab; a "Rejoin" button
  appears if you open the game link in a new tab).

## Tests

```bash
npm test
```

Runs random-play simulations (bots take random legal actions for 2–4 players) and checks the
engine's invariants: games end, cube accounting stays consistent, deck has 100 cards.

## Layout

```
server/index.js            HTTP static server + WebSocket lobby/game relay
server/game/engine.js      Game state, turn flow, movement, dragon, scoring
server/game/effects.js     Interpreter for declarative card/secret effects
server/game/board.js       Map (rooms, tunnels), rage track, constants
server/game/secrets.js     Major/Minor secret tokens (from the rulebook)
server/game/cards/*.js     Card data — see cards/README.md to add cards
public/                    Vanilla JS client (board SVG, hand, dungeon row, prompts)
test/sim.test.js           Random-play simulation
```

## Adding cards

Cards are plain data objects (`server/game/cards/README.md`). Add an object to one of the card
files (or a new file imported in `cards/index.js`); the effect vocabulary covers resources,
choices, discard/trash, teleport, conditionals (`when`), dragon attacks, row replacement, etc.
Anything exotic can use `{ fn: (game, player, card) => ... }`.

## Lobby options

- **Map**: *Random dungeon* (default) generates a new map each game from rules in
  `server/game/board.js` (`generateBoard`): three surface rows and four Depths rows, guaranteed
  connectivity and escape routes, hazards rolled per tunnel, features dealt from surface and
  Depths pools. Master Keys open exactly two things: the **Vault** (the 30-point artifact, often
  with a locked antechamber holding the 25-point artifact or a Major Secret) and the **Shortcut**,
  a locked passage joining a deep room directly to the surface. *Classic map* uses the fixed hand-made layout.
- **Turns**: *Auto-end when idle* ends a turn automatically once all cards are played and no
  action remains (nothing affordable, nowhere to go, nothing useful to use). *Manual* never does.

Players may end a turn early (unplayed cards are discarded) and may postpone a card's choice
dialog ("Decide later") to play other cards first; postponed choices lapse at end of turn.

## Rules implemented

Full turn structure, dungeon row refill with dragon attacks (once per refill), Danger,
Arrive/Acquire/Use/Defeat text, Reserve (Mercenary/Explore/Secret Tome/Goblin), tunnels
(footprints, monsters, locks, one-way), Crystal Caves, Fountains of Healing, Market (7 gold:
Master Key, Backpack, Crowns 10/9/8), Monkey Idols, Major/Minor secrets, artifacts & rage track
(2 2 3 3 4 4 5, start space by player count, artifacts removed for 2–3 players), negative Clank!,
running out of cubes, knock-out/rescue rules, Mastery token (20), Countdown Track
(+1/+2/+3 cube attacks, then everyone remaining is knocked out), tie-break by artifact value.

Picking up secrets and Monkey Idols happens automatically on entering a room (one per entry);
artifacts are taken with a button, as per the updated FAQ rule.

## Computer players

The host can press **Add computer player** in the lobby to fill a seat with an AI thief
(`server/game/ai.js`). It is a hand-written strategy rather than a trained neural network. Bots
act about once every 0.85 seconds so you can watch them. Set the `BOT_DELAY` environment
variable, in milliseconds, to change that. They pause while no human is connected.

Each bot is dealt a play style, and a table gets a mix:

| Style | Plays like |
|---|---|
| Reckless raider | Buys boots, grabs the first artifact worth 10+ and runs, ignores wounds |
| Patient deck-builder | Stays near the entrance for a round or two buying cards, likes point cards |
| Steady thief | Weighs artifact value against distance and danger |
| Greedy delver | Saves gold for a backpack (planning a market trip), then goes deep for two big artifacts; ignores rage and rivals escaping until badly hurt |

The lobby's **Bots** setting picks the difficulty for all of them. Medium is the baseline.
Easy misjudges cards and wounds, sometimes skips good buys, and grabs the first artifact it
finds. Hard detours past secrets, idols and markets, avoids artifacts a rival will reach first,
and reaches slightly deeper. In bot-only simulations Hard wins about a third more often than
Medium, and Easy rarely wins.

The second Bots setting sets the pace. **Reckless** deals raiders, steady thieves and greedy
delvers and pushes them to grab the nearest artifact and run. **Patient** deals deck-builders,
steady thieves and greedy delvers. They head down early, detour past secrets, idols and markets,
walk far for big artifacts, and once they hold one they keep looting nearby rooms (the depths
first, until round 16) as long as nobody has escaped, they have under 5 damage and the dragon's
rage is below 7. **Mixed** (the default)
deals all four styles. In 3-bot simulations, games last about 5.7 rounds on Reckless, 7 on Mixed
and 14.5 on Patient.
Changing the pace re-deals the styles of bots already in the lobby.

## Accuracy notes

Rules, secret tokens and market items follow the official rulebook and FAQ. The dungeon-deck
card stats (`server/game/cards/*.js`) and the board layout (`server/game/board.js`) were
reconstructed from memory and reviews, not from an official card list, so some costs, point
values, quantities, and the exact room graph may differ from the physical game. Both are plain
data files — correct a card by editing one line.

Which cards carry the Dragon Attack symbol (`dragon: true`) is also a best guess: 25 of the
100 dungeon cards have it, mostly the strong buys plus the Ogre, Overlord and Cave Troll. Toggle
the flag on any card to match your copy of the game.

## Art

`public/assets/` holds original artwork generated for this project (room tiles, card-kind
illustrations, lobby background, dragon icon). The full-resolution sources are in
`design/art-src/`. `design/build-mock.mjs` regenerates the Figma design mock with the art embedded.
No official Clank! card artwork is used: that art is copyrighted by Dire Wolf Digital / Renegade
Game Studios and is not redistributable.
