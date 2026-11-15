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

## Accuracy notes

Rules, secret tokens and market items follow the official rulebook and FAQ. The dungeon-deck
card stats (`server/game/cards/*.js`) and the board layout (`server/game/board.js`) were
reconstructed from memory and reviews, not from an official card list, so some costs, point
values, quantities, and the exact room graph may differ from the physical game. Both are plain
data files — correct a card by editing one line.

## Art

`public/assets/` holds original artwork generated for this project (room tiles, card-kind
illustrations, lobby background, dragon icon). The full-resolution sources are in
`design/art-src/`. `design/build-mock.mjs` regenerates the Figma design mock with the art embedded.
No official Clank! card artwork is used: that art is copyrighted by Dire Wolf Digital / Renegade
Game Studios and is not redistributable.
