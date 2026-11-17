import { makeBotProfile, STYLES, LEVELS, PACES } from './ai.js';
import { uid, shuffle } from './util.js';
import { def, makeCard, publicDef, buildDungeonDeck, buildStartingDeck, buildReserve, allPublicDefs, CARD_DEFS } from './cards/index.js';
import { RAGE_TRACK, RAGE_START, HEALTH_MAX, CLANK_SUPPLY, DRAGON_CUBES, MASTERY_POINTS, MARKET_PRICE, ARTIFACTS, generateBoard, floodBoard, publicRules } from './board.js';
import { MAJOR_SECRETS, MINOR_SECRETS, SECRET_DEFS, buildSecretStack, publicSecretDefs } from './secrets.js';
import { applyEffect, evalCondition } from './effects.js';
import { BASE_DECK, registerDeck, needsFlooding } from './cards/decks.js';

const COLORS = ['red', 'blue', 'green', 'yellow'];
const MAX_PLAYERS = 4;

class GameError extends Error {}
// Player names are shown to everyone: strip markup characters, collapse whitespace, cap length.
export function cleanName(raw) {
  const n = String(raw ?? '').replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return n || 'Nameless Thief';
}
const fail = (m) => { throw new GameError(m); };
const PLACE = { depths: 'the Depths', crystal: 'a Crystal Cave' };

// End-game bonus points from a card's `endScore` (see cards/README.md). `b` is the score breakdown so far.
export function endScore(d, p, b) {
  const e = d.endScore;
  if (!e) return 0;
  if (e.perCard) return e.points * [...p.deck, ...p.hand, ...p.discard, ...p.playArea].filter((c) => c.id === e.perCard).length;
  if (e.perGold) return e.points * Math.floor(b.gold / e.perGold);
  if (e.mastery) return p.mastery ? e.points : 0;
  if (e.marketItems) return p.items.masterKey + p.items.backpack + p.items.crowns.length >= e.marketItems ? e.points : 0;
  if (e.treasures) {
    const kinds = (p.secrets.some((s) => s.id === 'chalice') ? 1 : 0) + (p.secrets.some((s) => s.id === 'dragon_egg') ? 1 : 0) + (p.monkeyIdols > 0 ? 1 : 0);
    return kinds >= e.treasures ? e.points : 0;
  }
  return 0;
}

// Dragon Presence awareness levels.
//   moves / wakeMoves: rooms per round, before / after the countdown starts
//   range: how many rooms away it can hear Clank! (Infinity: anywhere in the Depths)
//   fade: how much of each lead is left after a round; scent: rounds it can follow a thief it has found, even a quiet one
//   scentPull: how loud (Clank! in one room) other noise must be to draw it off a scent
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const AWARENESS = {
  slumbering: { label: 'Slumbering', moves: 1, wakeMoves: 1, range: 3, fade: 0.5, scent: 1, scentPull: 2 },
  stirring: { label: 'Stirring', moves: 1, wakeMoves: 2, range: Infinity, fade: 0.6, scent: 2, scentPull: 3 },
  awake: { label: 'Wide awake', moves: 2, wakeMoves: 3, range: Infinity, fade: 0.75, scent: 3, scentPull: 4.5 },
};

export class Game {
  constructor(code) {
    this.code = code;
    this.phase = 'lobby';
    this.players = [];
    this.logs = [];
    this.logSeq = 0;
    this.attacks = []; // recent dragon attacks, numbered so clients never miss one
    this.attackSeq = 0;
    this.alerts = []; // per-player warnings shown as a popup (e.g. the dragon has found you)
    this.alertSeq = 0;
    this.dragonToken = null; // Dragon Presence: { room, prev, target, leads: { roomId: strength } }
    this.version = 0;
    this.createdAt = Date.now();
    this.options = { autoEnd: true, botLevel: 'medium', botPace: 'mixed', deck: 'base', deckName: BASE_DECK.name, dragonPresence: false, dragonAwareness: 'stirring' };
    this.deck = BASE_DECK;
    this.customCards = [];
  }

  setOption(key, value) {
    if (this.phase !== 'lobby') fail('Options can only be changed before the game starts');
    if (key === 'dragonPresence') this.options.dragonPresence = !!value;
    else if (key === 'dragonAwareness' && AWARENESS[value]) this.options.dragonAwareness = value;
    else if (key === 'botLevel' && LEVELS[value]) this.options.botLevel = value;
    else if (key === 'botPace' && PACES[value]) {
      this.options.botPace = value;
      // re-deal the bots already seated so their styles fit the new pace
      const dealt = [];
      for (const p of this.players.filter((x) => x.bot)) { p.bot = makeBotProfile(dealt, value); dealt.push(p.bot.style); }
    }
    else fail('Unknown option');
  }

  // A validated deck (see cards/decks.js) to build the dungeon deck from.
  setDeck(deck) {
    if (this.phase !== 'lobby') fail('Options can only be changed before the game starts');
    this.deck = deck || BASE_DECK;
    this.options.deck = this.deck.id;
    this.options.deckName = this.deck.name;
  }

  // ---------------- lobby ----------------
  addPlayer(name, { bot = false } = {}) {
    if (this.phase !== 'lobby') fail('Game already started');
    if (this.players.length >= MAX_PLAYERS) fail('Game is full');
    const p = {
      id: uid('p'), token: uid('t') + uid('t'), name: cleanName(name),
      color: COLORS[this.players.length], connected: true,
      deck: [], hand: [], discard: [], playArea: [], trashed: [],
      damage: 0, supply: CLANK_SUPPLY, gold: 0, room: 'start', artifacts: [], secrets: [],
      items: { masterKey: 0, backpack: 0, crowns: [] }, monkeyIdols: 0, mastery: false,
      status: 'in', koRescued: false, onCountdown: false,
      // bots get a play style (see ai.js); the table is dealt a mix
      bot: bot ? makeBotProfile(this.players.filter((x) => x.bot).map((x) => x.bot.style), this.options.botPace) : null,
    };
    this.players.push(p);
    this.log(`${p.name} joined`);
    return p;
  }

  removePlayer(pid, reason = 'left') {
    if (this.phase !== 'lobby') return;
    const i = this.players.findIndex((p) => p.id === pid);
    if (i >= 0) {
      this.log(`${this.players[i].name} ${reason}`);
      this.players.splice(i, 1);
      // the host (seat 0) must be a person
      const human = this.players.findIndex((p) => !p.bot);
      if (human > 0) this.players.unshift(...this.players.splice(human, 1));
      this.players.forEach((p, j) => { p.color = COLORS[j]; });
    }
  }

  start() {
    if (this.phase !== 'lobby') fail('Already started');
    const n = this.players.length;
    if (n < 1) fail('Need at least 1 player');
    this.phase = 'playing';
    this.board = generateBoard();
    this.log('A new dungeon has been carved out for this heist.');

    const { list, custom } = registerDeck(this.deck);
    this.customCards = custom;
    if (this.options.dragonPresence) {
      const nest = this.board.rooms.find((r) => r.artifact === 30) || this.board.rooms.filter((r) => r.depths).at(-1);
      this.dragonToken = { room: nest.id, prev: null, target: null, targetBy: null, why: null, next: null, leads: {}, scent: null, ignore: {} };
      this.dragonSense = AWARENESS[this.options.dragonAwareness] || AWARENESS.stirring;
      this.dragonAim();
      this.log(`Dragon Presence (${this.dragonSense.label}): the dragon lies in ${nest.name}. It hunts the Depths by sound — every Clank! you make down there tells it where to look.`);
    }
    if (needsFlooding(this.deck)) { this.board = floodBoard(this.board); this.log('Water has flooded parts of the Depths. Start your turn underwater and you must reach a dry room, or take 1 damage.'); }
    this.dungeonDeck = buildDungeonDeck(list);
    this.deckCounts = {}; // how many of each card the dungeon deck started with (public: it is the deck list)
    for (const x of list) this.deckCounts[x.id] = (this.deckCounts[x.id] || 0) + x.qty;
    if (this.deck !== BASE_DECK) this.log(`The dungeon is stocked from the "${this.deck.name}" deck.`);
    this.dungeonRow = [null, null, null, null, null, null];
    this.dungeonDiscard = [];
    this.reserve = buildReserve();
    this.clankArea = {};
    this.bag = { black: DRAGON_CUBES };
    this.setAside = { black: 0 };
    this.rage = RAGE_START[Math.max(2, n)] ?? 0;
    this.market = { masterKey: 2, backpack: 2, crowns: [10, 9, 8] };
    this.masteryTokens = n;
    this.countdown = null;
    this.queue = [];
    this.pending = null;
    this.turnIdx = 0;
    this.turn = null;
    this.turnNumber = 0;

    // artifacts: remove some at random with fewer than 4 players
    const arts = shuffle([...ARTIFACTS]);
    const removeCount = n >= 4 ? 0 : n === 3 ? 1 : 2;
    const removed = arts.slice(0, removeCount);
    this.rooms = {};
    const majors = shuffle(buildSecretStack(MAJOR_SECRETS));
    const minors = shuffle(buildSecretStack(MINOR_SECRETS));
    for (const r of this.board.rooms) {
      const rs = { artifact: null, majorSecret: null, minorSecrets: [], monkeyIdols: 0 };
      if (r.artifact && !removed.includes(r.artifact)) rs.artifact = r.artifact;
      if (r.majorSecret) rs.majorSecret = majors.pop() || null;
      if (r.minorSecrets) for (let i = 0; i < r.minorSecrets; i++) { const s = minors.pop(); if (s) rs.minorSecrets.push(s); }
      if (r.monkeyShrine) rs.monkeyIdols = 3;
      this.rooms[r.id] = rs;
    }
    if (removed.length) this.log(`Artifacts removed for ${n} players: ${removed.join(', ')}`);

    // players: humans in random order, then the bots (also shuffled), so people always play first
    const humans = shuffle(this.players.filter((p) => !p.bot)), bots = shuffle(this.players.filter((p) => p.bot));
    this.players.splice(0, this.players.length, ...humans, ...bots);
    this.players.forEach((p, i) => {
      p.color = COLORS[i];
      p.deck = buildStartingDeck();
      this.clankArea[p.id] = 0;
      this.bag[p.id] = 0;
      this.drawCards(p, 5, true);
    });
    const startClank = [3, 2, 1, 0];
    this.players.forEach((p, i) => { this.addClank(p, startClank[i] || 0); });

    // dungeon row without dragon symbols
    const held = [];
    for (let i = 0; i < 6; i++) {
      let c = this.dungeonDeck.shift();
      while (c && def(c).dragon) { held.push(c); c = this.dungeonDeck.shift(); }
      this.dungeonRow[i] = c || null;
    }
    this.dungeonDeck.push(...held);
    shuffle(this.dungeonDeck);
    for (const c of this.dungeonRow) if (c && def(c).arrive) this.queueBack(this.players[0], def(c).arrive, c);
    this.log(`Game started. ${this.players[0].name} goes first.`);
    this.beginTurn();
    this.process();
  }

  // ---------------- helpers ----------------
  log(t) {
    this.logs.push({ n: this.logSeq++, t });
    if (this.logs.length > 300) this.logs.shift();
  }

  currentPlayer() { return this.players[this.turnIdx]; }
  playerById(id) { return this.players.find((p) => p.id === id); }
  activePlayers() { return this.players.filter((p) => p.status === 'in'); }

  queueBack(p, effects, card) { for (const e of effects || []) this.queue.push({ pid: p.id, e, card }); }
  queueFront(p, effects, card) { this.queue.unshift(...(effects || []).map((e) => ({ pid: p.id, e, card }))); }

  prompt(p, spec, resolve) {
    if (this.pending) throw new Error('prompt while pending');
    this.pending = { pid: p.id, title: spec.title, options: spec.options, resolve };
  }

  process(depth = 0) {
    let guard = 0;
    while (!this.pending && this.queue.length && guard++ < 10000) {
      const { pid, e, card } = this.queue.shift();
      const p = this.playerById(pid);
      if (!p) continue;
      applyEffect(this, p, e, card);
    }
    if (!this.pending) {
      this.checkConditionals();
      if (this.queue.length) return this.process(depth);
      const turnChanged = this.afterProcess();
      if (turnChanged && this.queue.length && depth < 50) return this.process(depth + 1);
    }
    this.version++;
  }

  checkConditionals() {
    const t = this.turn;
    if (!t) return;
    const p = this.currentPlayer();
    const still = [];
    for (const c of t.conditionals) {
      if (evalCondition(this, p, c.cond, c.card)) this.queueBack(p, c.effects, c.card);
      else still.push(c);
    }
    t.conditionals = still;
  }

  afterProcess() {
    if (this.phase !== 'playing') return false;
    const p = this.currentPlayer();
    let changed = false;
    // current player knocked out mid-turn: their turn ends immediately
    if (this.turn && p.status === 'ko') { this.finishTurn(); changed = true; }
    // nothing left to do: end the turn automatically
    else if (this.turn && this.options.autoEnd && p.hand.length === 0 && !this.pending) {
      const L = this.legalFor(p);
      if (L && !L.hasAction) { this.log(`${p.name} has nothing left to do — turn ends`); this.finishTurn(); changed = true; }
    }
    this.checkGameEnd();
    return changed;
  }

  drawCards(p, n, silent = false) {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (p.deck.length === 0) {
        if (p.discard.length === 0) break;
        p.deck = shuffle(p.discard);
        p.discard = [];
        p.shuffles = (p.shuffles || 0) + 1; // lets the client animate the reshuffle
      }
      p.hand.push(p.deck.shift());
      drawn++;
    }
    if (!silent && drawn) this.log(`${p.name} draws ${drawn} card${drawn === 1 ? '' : 's'}`);
  }

  addClank(p, n) {
    const t = this.turn;
    const mine = t && this.currentPlayer() === p;
    if (n > 0) {
      if (p.status !== 'in') return;
      if (mine) {
        t.clankMade += n;
        t.skill += n * t.skillPerClank;
        const off = Math.min(t.negativeClank, n);
        t.negativeClank -= off;
        n -= off;
        if (off) this.log(`${p.name} avoids ${off} Clank!`);
      }
      const add = Math.min(n, p.supply);
      if (add > 0) {
        p.supply -= add;
        this.clankArea[p.id] += add;
        this.log(`${p.name} makes ${add} Clank!`);
        this.dragonHears(p, add);
      }
    } else if (n < 0) {
      let r = -n;
      const rem = Math.min(r, this.clankArea[p.id]);
      this.clankArea[p.id] -= rem;
      p.supply += rem;
      r -= rem;
      if (rem) this.log(`${p.name} removes ${rem} Clank!`);
      if (mine) t.negativeClank += r;
    }
  }

  heal(p, n) {
    const h = Math.min(n, p.damage);
    if (h <= 0) return;
    p.damage -= h;
    p.supply += h;
    this.log(`${p.name} heals ${h}`);
  }

  dealDamage(p, n, source) {
    if (p.status !== 'in' || n <= 0) return;
    p.damage = Math.min(HEALTH_MAX, p.damage + n);
    this.log(`${p.name} takes ${n} damage (${source})`);
    if (p.damage >= HEALTH_MAX) this.knockOut(p);
  }

  dangerCount() { return this.dungeonRow.filter((c) => c && def(c).danger).length; }
  rageValue() { return RAGE_TRACK[Math.min(this.rage, RAGE_TRACK.length - 1)]; }
  advanceRage() { this.rage = Math.min(this.rage + 1, RAGE_TRACK.length - 1); this.log(`The dragon's rage increases (now draws ${this.rageValue()} cubes)`); }

  dragonAttack(extra = 0, reason = 'dungeon row') {
    for (const p of this.players) { this.bag[p.id] += this.clankArea[p.id]; this.clankArea[p.id] = 0; }
    const n = this.rageValue() + this.dangerCount() + extra;
    const drawn = [], doubled = {};
    for (let i = 0; i < n; i++) {
      const keys = Object.keys(this.bag).filter((k) => this.bag[k] > 0);
      const total = keys.reduce((s, k) => s + this.bag[k], 0);
      if (total === 0) break;
      let r = Math.floor(Math.random() * total);
      let key = keys[0];
      for (const k of keys) { if (r < this.bag[k]) { key = k; break; } r -= this.bag[k]; }
      this.bag[key]--;
      if (key === 'black') { this.setAside.black++; drawn.push('black'); continue; }
      const p = this.playerById(key);
      drawn.push(p.color);
      if (p.status !== 'in') { p.supply++; continue; } // treated as black
      this.dealDamage(p, 1, 'dragon');
      // Dragon Presence: sharing a room with the dragon doubles every hit (the extra comes from your supply)
      if (this.dragonToken?.room === p.room && p.status === 'in' && p.supply > 0) { p.supply--; this.dealDamage(p, 1, 'the dragon is in the room'); doubled[p.id] = (doubled[p.id] || 0) + 1; }
    }
    this.log(`DRAGON ATTACK (${reason}): ${n} cube${n === 1 ? '' : 's'} drawn — ${drawn.length ? drawn.join(', ') : 'bag empty'}`);
    const hit = {};
    for (const c of drawn) if (c !== 'black') { const p = this.players.find((x) => x.color === c); if (p) hit[p.id] = (hit[p.id] || 0) + 1; }
    for (const [pid, x] of Object.entries(doubled)) { hit[pid] += x; this.log(`${this.playerById(pid).name} shares a room with the dragon: double damage!`); }
    this.lastAttack = { seq: ++this.attackSeq, n, drawn, reason, hits: Object.entries(hit).map(([pid, dmg]) => ({ pid, dmg, doubled: !!doubled[pid] })) };
    this.attacks.push(this.lastAttack);
    if (this.attacks.length > 6) this.attacks.shift();
    if (this.dragonToken && this.phase === 'playing') this.dragonStep(); // the dragon lunges a room after every attack
  }

  // ---------------- Dragon Presence ----------------
  // The dragon token prowls the Depths. It cannot see thieves: it hears Clank! made in the Depths,
  // remembers where (leads fade each round) and heads for the loudest lead. It ignores locks, one-way
  // tunnels and monsters, and never leaves the Depths.
  nextTurnIdx() {
    this.turnIdx = (this.turnIdx + 1) % this.players.length;
    if (this.turnIdx === 0 && this.dragonToken && this.phase === 'playing') this.dragonRound();
  }

  // Clank! made in the Depths within earshot leaves a lead on that room, remembered with whoever made it.
  dragonHears(p, n) {
    const d = this.dragonToken;
    if (!d || !this.board.room(p.room)?.depths) return; // the surface is out of earshot
    const far = this.dragonDistances(d.room)[p.room];
    if (far == null || far > this.dragonSense.range) return; // too far away to hear
    const lead = d.leads[p.room] || { strength: 0 };
    d.leads[p.room] = { strength: lead.strength + n, pid: p.id };
    this.dragonAim();
  }

  dragonDistances(from) {
    const dist = { [from]: 0 }, todo = [from];
    while (todo.length) {
      const u = todo.shift();
      for (const v of this.board.connectedRooms(u)) if (dist[v] == null && this.board.room(v)?.depths) { dist[v] = dist[u] + 1; todo.push(v); }
    }
    return dist;
  }

  // What the dragon wants right now: the loudest lead, or the thief whose scent it has.
  // Noise louder than the scent's pull wins, so a noisy rival can draw it off a quiet one.
  dragonWant() {
    const d = this.dragonToken, sense = this.dragonSense;
    const dist = this.dragonDistances(d.room);
    let best = null;
    for (const [rid, lead] of Object.entries(d.leads)) {
      if (dist[rid] == null || rid === d.room) continue;
      const score = lead.strength - dist[rid] * 0.05; // nearer wins ties
      if (!best || score > best.score) best = { room: rid, score, pid: lead.pid, why: 'noise' };
    }
    const q = d.scent && this.playerById(d.scent.pid);
    if (d.scent && (!q || q.status !== 'in' || !this.board.room(q.room)?.depths)) {
      if (q) this.log(`The dragon loses ${q.name}'s scent`);
      d.scent = null;
    } else if (q && dist[q.room] != null && (!best || sense.scentPull >= best.score)) best = { room: q.room, score: sense.scentPull, pid: q.id, why: 'scent' };
    return best;
  }

  // Re-decide the target and the next room (the next room is fixed in advance, so it can be foreseen).
  dragonAim() {
    const d = this.dragonToken;
    const want = this.dragonWant();
    const was = d.target, wasBy = d.targetBy;
    d.target = want && want.room !== d.room ? want.room : null;
    d.targetBy = d.target ? want.pid : null;
    d.why = want?.why || null;
    const near = this.board.connectedRooms(d.room).filter((id) => this.board.room(id)?.depths);
    let next = null;
    if (want?.room === d.room) next = d.room; // stays on its prey
    else if (d.target) {
      const back = this.dragonDistances(d.target);
      next = near.filter((id) => back[id] != null).sort((a, b) => back[a] - back[b])[0] || null;
    }
    if (!next && near.length) { // wander, but keep the same random choice until something changes
      if (!near.includes(d.next) || d.next === d.room) { const fresh = near.filter((id) => id !== d.prev); const pool = fresh.length ? fresh : near; d.next = pool[Math.floor(Math.random() * pool.length)]; }
      next = d.next;
    }
    d.next = next;
    // tell the thief it is now coming for, when that changes because of their noise
    if (d.target && d.why === 'noise' && (d.target !== was || d.targetBy !== wasBy)) {
      const p = this.playerById(d.targetBy);
      if (p && p.room === d.target) this.alert(p, 'The dragon heard you!', `Your Clank! carried through the Depths. The dragon is heading for ${this.board.room(d.target).name}: get out of there or keep quiet.`, 'heard');
    }
  }

  dragonRound() {
    const sense = this.dragonSense, d = this.dragonToken;
    const steps = this.countdown ? sense.wakeMoves : sense.moves; // once someone is out, the dragon wakes further
    for (let i = 0; i < steps && this.phase === 'playing'; i++) if (this.dragonStep({ sniff: true }) === 'stayed') break; // sniffs a found thief once a round
    for (const k of Object.keys(d.leads)) { d.leads[k].strength *= sense.fade; if (d.leads[k].strength < 0.3) delete d.leads[k]; }
    // scent fades every round, even while it lurks with you; it only renews when it finds you again
    for (const k of Object.keys(d.ignore)) if (--d.ignore[k] <= 0) delete d.ignore[k];
    if (d.scent && --d.scent.rounds <= 0) { // it gives up on this thief for a couple of rounds, so it cannot just re-find them
      this.log(`The dragon loses ${this.playerById(d.scent.pid)?.name}'s scent and loses interest for now`);
      d.ignore[d.scent.pid] = 2;
      d.scent = null;
    }
    if (this.phase === 'playing') this.dragonAim();
  }

  dragonStep({ sniff = false } = {}) {
    const d = this.dragonToken;
    delete d.leads[d.room]; // it has searched here
    const prey = this.activePlayers().filter((p) => p.room === d.room);
    const r0 = this.board.room(d.room);
    // someone walked into its room and it has no scent yet: it finds them (as if it had just arrived)
    const fresh = prey.filter((p) => !d.ignore[p.id]);
    if (fresh.length && !d.scent) { this.dragonFinds(fresh, r0); this.dragonAim(); return 'stayed'; }
    // it stays with a thief whose scent it still has, unless louder noise calls it away
    const want = this.dragonWant();
    const stay = prey.length && d.scent && prey.some((p) => p.id === d.scent.pid) && (!want || want.room === d.room);
    if (stay) {
      d.target = null;
      if (sniff) for (const p of prey) {
        this.log(`The dragon lurks with ${p.name} in ${r0.name}`);
        this.alert(p, 'The dragon is still on you!', `It is lurking in ${r0.name} with you and sniffs you out again: you make 1 Clank!. Its attacks hit you for double damage until you get away. It loses your scent in ${plural(d.scent.rounds, 'round')} unless it finds you again.`);
        this.addClank(p, 1);
      }
      this.dragonAim();
      return 'stayed';
    }
    this.dragonAim();
    const next = d.next;
    if (!next || next === d.room) return;
    const why = d.why === 'scent' ? 'follows a scent' : d.why === 'noise' ? 'follows the noise' : 'prowls';
    d.prev = d.room;
    d.room = next;
    d.next = null;
    const r = this.board.room(next);
    this.log(`The dragon ${why} to ${r.name}`);
    this.dragonFinds(this.activePlayers().filter((p) => p.room === next && !d.ignore[p.id]), r);
    this.dragonAim();
  }

  dragonFinds(prey, r) {
    const d = this.dragonToken;
    for (const p of prey) {
      this.log(`The dragon sniffs out ${p.name}!`);
      d.scent = { pid: p.id, rounds: this.dragonSense.scent };
      this.alert(p, 'The dragon is hunting you!', `It found you in ${r.name} and sniffed you out: you make 1 Clank!. While you share its room, its attacks hit you for double damage. It now has your scent and will follow you for ${plural(this.dragonSense.scent, 'round')}, even if you stay quiet, unless someone else makes more noise. Reach the surface to shake it off.`);
      this.addClank(p, 1);
    }
  }

  // Dragon Presence card effects
  clearScent(p) {
    const d = this.dragonToken;
    if (!d) return;
    let cleared = false;
    if (d.scent?.pid === p.id) { d.scent = null; cleared = true; }
    for (const [rid, lead] of Object.entries(d.leads)) if (lead.pid === p.id) { delete d.leads[rid]; cleared = true; }
    this.log(cleared ? `${p.name} covers their tracks: the dragon loses the trail` : `${p.name} covers their tracks`);
    this.dragonAim();
  }

  alert(p, title, text, kind = 'popup') {
    this.alerts.push({ seq: ++this.alertSeq, pid: p.id, title, text, kind });
    if (this.alerts.length > 12) this.alerts.shift();
  }

  knockOut(p) {
    if (p.status !== 'in') return;
    p.status = 'ko';
    p.koRescued = p.artifacts.length > 0 && !this.board.room(p.room).depths;
    this.log(`${p.name} is knocked out${p.koRescued ? ' and rescued by the townsfolk' : ' and lost in the dungeon'}!`);
    this.markOut(p);
  }

  escape(p) {
    p.status = 'escaped';
    if (this.masteryTokens > 0) { this.masteryTokens--; p.mastery = true; }
    this.log(`${p.name} escapes the dungeon${p.mastery ? ` with a Mastery token (+${MASTERY_POINTS})` : ''}!`);
    this.markOut(p);
  }

  markOut(p) {
    if (!this.countdown) {
      this.countdown = { pid: p.id, pos: 0 };
      p.onCountdown = true;
      this.log(`${p.name} starts the Countdown Track`);
    }
  }

  checkGameEnd() {
    if (this.phase !== 'playing') return;
    if (this.activePlayers().length === 0) this.endGame();
  }

  endGame() {
    this.phase = 'ended';
    this.turn = null;
    this.pending = null;
    this.queue = [];
    this.results = this.players.map((p) => ({ pid: p.id, name: p.name, color: p.color, ...this.score(p) })).sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || (b.bestArtifact - a.bestArtifact));
    this.log('Game over! ' + (this.results[0].total != null ? `${this.results[0].name} is the Greatest Thief in the Realm!` : 'Nobody escaped.'));
  }

  score(p, assumeSurvived = false) {
    const survived = assumeSurvived || p.status === 'escaped' || (p.status === 'ko' && p.koRescued);
    const all = [...p.deck, ...p.hand, ...p.discard, ...p.playArea];
    const b = {
      artifacts: p.artifacts.reduce((s, v) => s + v, 0),
      secrets: p.secrets.reduce((s, x) => s + (SECRET_DEFS[x.id].points || 0), 0),
      gold: p.gold + p.secrets.reduce((s, x) => s + (SECRET_DEFS[x.id].gold || 0), 0),
      monkeyIdols: p.monkeyIdols * 5,
      items: p.items.masterKey * 5 + p.items.backpack * 5 + p.items.crowns.reduce((s, v) => s + v, 0),
      mastery: p.mastery ? MASTERY_POINTS : 0,
      cards: all.reduce((s, c) => s + (def(c).points || 0), 0),
    };
    b.bonus = all.reduce((s, c) => s + endScore(def(c), p, b), 0);
    const total = survived ? Object.values(b).reduce((s, v) => s + v, 0) : null;
    return { survived, breakdown: b, total, bestArtifact: Math.max(0, ...p.artifacts) };
  }

  // ---------------- turns ----------------
  beginTurn() {
    if (this.phase !== 'playing') return;
    let guard = 0;
    while (guard++ < this.players.length + 1) {
      const p = this.currentPlayer();
      if (p.onCountdown) { this.countdownStep(p); if (this.phase !== 'playing') return; this.nextTurnIdx(); continue; }
      if (p.status !== 'in') { this.nextTurnIdx(); continue; }
      this.turnNumber++;
      this.turn = { skill: 0, swords: 0, boots: 0, clankMade: 0, negativeClank: 0, teleports: 0, flags: {}, enteredCrystalCave: false, conditionals: [], gemDiscount: 0, goldBonus: 0, skillPerClank: 0, deferred: [] };
      this.log(`— ${p.name}'s turn —`);
      if (p.status === 'in' && this.board.room(p.room)?.flooded) { this.turn.noAir = true; this.log(`${p.name} is underwater: reach a dry room this turn or take 1 damage`); }
      return;
    }
    this.checkGameEnd();
  }

  countdownStep(p) {
    this.countdown.pos++;
    const pos = this.countdown.pos;
    this.log(`${p.name} advances on the Countdown Track (space ${pos + 1})`);
    if (pos >= 1 && pos <= 3) this.dragonAttack(pos, 'countdown');
    if (pos >= 4) {
      this.log('The dragon knocks out everyone still in the dungeon!');
      for (const o of this.activePlayers()) this.knockOut(o);
    }
    this.checkGameEnd();
  }

  finishTurn() {
    const p = this.currentPlayer();
    if (this.turn?.noAir && !this.turn.flags.waterBreathing && p.status === 'in') {
      this.log(`${p.name} never came up for air`);
      if (p.supply > 0) { p.supply--; this.dealDamage(p, 1, 'out of air'); }
    }
    if (this.turn?.deferred.length) this.log(`${p.name} lets ${this.turn.deferred.length} postponed choice${this.turn.deferred.length > 1 ? 's' : ''} lapse`);
    if (p.hand.length) this.log(`${p.name} discards ${p.hand.length} unplayed card${p.hand.length > 1 ? 's' : ''}`);
    p.discard.push(...p.playArea, ...p.hand);
    p.playArea = [];
    p.hand = [];
    this.turn = null;
    this.drawCards(p, 5, true);
    this.refillRow();
    this.nextTurnIdx();
    this.beginTurn();
  }

  fillRowSlot(i, { ignoreDragon = false } = {}) {
    const c = this.dungeonDeck.shift();
    if (!c) { this.dungeonRow[i] = null; this.dungeonExhausted(); return false; }
    this.dungeonRow[i] = c;
    const d = def(c);
    this.log(`${d.name} arrives in the Dungeon Row`);
    if (d.arrive) this.queueBack(this.currentPlayer(), d.arrive, c);
    return !!d.dragon && !ignoreDragon;
  }

  // FAQ: if the Dungeon Deck runs out, the game ends at once. Everyone still inside is knocked out
  // (and scores only if rescued, i.e. not in the Depths), as though their health meter had filled.
  dungeonExhausted() {
    if (this.phase !== 'playing') return;
    this.log('The Dungeon Deck has run out! The dungeon collapses and the game ends.');
    for (const o of this.activePlayers()) this.knockOut(o);
    this.endGame();
  }

  refillRow() {
    let dragon = false;
    for (let i = 0; i < 6; i++) if (!this.dungeonRow[i]) dragon = this.fillRowSlot(i) || dragon;
    if (dragon) this.queue.push({ pid: this.currentPlayer().id, e: { dragonAttack: true } });
  }

  // ---------------- tokens ----------------
  takeSecret(p, secret) {
    const d = SECRET_DEFS[secret.id];
    this.log(`${p.name} finds a ${secret.major ? 'Major' : 'Minor'} Secret: ${d.name}`);
    if (d.onPickup === 'rage') this.advanceRage();
    if (d.use === 'immediate') this.queueFront(p, d.effects, null);
    else p.secrets.push({ uid: uid('s'), id: d.id, major: !!secret.major });
  }

  takeRoomSecret(p, rid) {
    const rs = this.rooms[rid];
    if (rs.majorSecret) { const s = rs.majorSecret; rs.majorSecret = null; this.takeSecret(p, s); return true; }
    if (rs.minorSecrets.length) { const i = Math.floor(Math.random() * rs.minorSecrets.length); const [s] = rs.minorSecrets.splice(i, 1); this.takeSecret(p, s); return true; }
    return false;
  }

  enterRoom(p, rid) {
    const t = this.turn;
    p.room = rid;
    const r = this.board.room(rid);
    this.log(`${p.name} moves to ${r.name}`);
    if (r.start) return this.escape(p);
    if (t?.noAir && !r.flooded) { t.noAir = false; this.log(`${p.name} comes up for air`); }
    if (r.crystal && !t.flags.ignoreCrystalCaves) { t.enteredCrystalCave = true; this.log(`${p.name} is exhausted by the Crystal Cave`); }
    if (r.fountain) this.heal(p, 1);
    const rs = this.rooms[rid];
    if (r.monkeyShrine && rs.monkeyIdols > 0) { rs.monkeyIdols--; p.monkeyIdols++; this.log(`${p.name} takes a Monkey Idol`); }
    else this.takeRoomSecret(p, rid);
  }

  // Sunken Treasures: swimming from one flooded room to another costs 2 boots.
  moveCost(from, tn) {
    const base = tn.boots || 1;
    return this.board.room(from)?.flooded && this.board.room(tn.to)?.flooded ? Math.max(2, base) : base;
  }

  // ---------------- legal move computation (for the UI) ----------------
  legalFor(p) {
    const t = this.turn;
    if (!t || this.currentPlayer() !== p || this.pending) return null;
    const moves = [];
    const exhausted = t.enteredCrystalCave && !t.flags.ignoreCrystalCaves;
    const inDungeon = p.status === 'in';
    for (const tn of inDungeon ? this.board.tunnelsFrom(p.room) : []) {
      const cost = this.moveCost(p.room, tn);
      const monsters = t.flags.ignoreMonsterTunnels ? 0 : (tn.monsters || 0);
      const swordsUsed = Math.min(t.swords, monsters);
      const dmg = monsters - swordsUsed;
      let reason = null;
      if (tn.to === 'start' && p.artifacts.length === 0) reason = 'Need an Artifact to leave';
      else if (exhausted) reason = 'Exhausted (Crystal Cave)';
      else if (t.boots < cost) reason = `Need ${cost} boots`;
      else if (tn.locked && !p.items.masterKey) reason = 'Locked (Master Key needed)';
      else if (dmg > 0 && (p.supply < dmg || p.damage + dmg >= HEALTH_MAX)) reason = 'Too dangerous';
      moves.push({ to: tn.to, cost, monsters, swordsUsed, damage: dmg, locked: !!tn.locked, shortcut: !!tn.shortcut, ok: !reason, reason, via: 'move' });
    }
    const teleports = t.teleports > 0 && inDungeon ? this.board.connectedRooms(p.room).filter((r) => r !== 'start' || p.artifacts.length > 0) : [];
    const rs = this.rooms[p.room];
    const capacity = 1 + p.items.backpack;
    const canTakeArtifact = !!(inDungeon && rs && rs.artifact && p.artifacts.length < capacity);
    const inMarket = inDungeon && !!this.board.room(p.room).market;
    const canBuy = inMarket && p.gold >= MARKET_PRICE ? Object.entries({ masterKey: this.market.masterKey, backpack: this.market.backpack, crown: this.market.crowns.length }).filter(([, n]) => n > 0).map(([k]) => k) : [];
    const acquirable = this.dungeonRow.map((c, i) => c && def(c).kind !== 'monster' && this.cardCost(def(c)) <= t.skill && this.inPlace(p, def(c)) ? i : null).filter((x) => x !== null);
    const fightable = this.dungeonRow.map((c, i) => c && def(c).kind === 'monster' && def(c).swords <= t.swords && this.inPlace(p, def(c)) ? i : null).filter((x) => x !== null);
    const reserveBuy = Object.keys(this.reserve).filter((id) => this.reserve[id] > 0 && CARD_DEFS[id].cost <= t.skill);
    const usefulSecrets = p.secrets.filter((sx) => {
      const d = SECRET_DEFS[sx.id];
      if (d.use !== 'held') return false;
      const eff = d.effects[0];
      if (eff.heal) return p.damage > 0;
      if (eff.boots) return moves.some((m) => !m.ok && m.reason && m.reason.startsWith('Need') && m.cost <= t.boots + eff.boots);
      if (eff.swords) return this.dungeonRow.some((c) => c && def(c).kind === 'monster' && def(c).swords <= t.swords + eff.swords) || t.swords + eff.swords >= 2;
      return true;
    }).map((sx) => sx.uid);
    const hasAction = moves.some((m) => m.ok) || teleports.length > 0 || canTakeArtifact || canBuy.length > 0 || acquirable.length > 0 || fightable.length > 0 || reserveBuy.length > 0 || t.swords >= 2 || usefulSecrets.length > 0 || t.deferred.length > 0;
    return { moves, teleports, canTakeArtifact, canBuy, acquirable, fightable, reserveBuy, canFightGoblin: t.swords >= 2, canEndTurn: true, mustPlayCards: p.hand.length > 0, usefulSecrets, hasAction, deferred: t.deferred.map((d, i) => ({ i, title: d.title })) };
  }

  // A card leaves the row or reserve for player p: devices are used at once, anything else goes to their discard pile.
  gainCard(p, card) {
    const d = def(card);
    if (d.kind === 'device') { this.dungeonDiscard.push(card); this.log(`${p.name} uses ${d.name}`); this.queueBack(p, d.use, card); }
    else { p.discard.push(card); this.log(`${p.name} acquires ${d.name}`); this.queueBack(p, d.acquire, card); }
  }

  moveRage(n) {
    const before = this.rage;
    this.rage = Math.max(0, Math.min(this.rage + n, RAGE_TRACK.length - 1));
    if (this.rage !== before) this.log(`The dragon marker moves ${n > 0 ? 'up' : 'down'} (now draws ${this.rageValue()} cubes)`);
  }

  // Cards marked `where` can only be acquired / fought while you stand in such a room.
  inPlace(p, d) {
    if (!d.where) return true;
    const r = this.board.room(p.room);
    return d.where === 'depths' ? !!r.depths : d.where === 'crystal' ? !!r.crystal : true;
  }

  cardCost(d) {
    const t = this.turn;
    const disc = (d.tags || []).includes('gem') && t ? t.gemDiscount : 0;
    return Math.max(0, (d.cost || 0) - disc);
  }

  // ---------------- actions ----------------
  act(pid, a) {
    if (this.phase !== 'playing') fail('Game is not in progress');
    const p = this.playerById(pid);
    if (!p) fail('Unknown player');
    if (a.type === 'resolve') return this.resolvePending(p, a.value);
    if (a.type === 'defer') {
      if (!this.pending || this.pending.pid !== p.id) fail('Nothing to postpone');
      if (!this.turn || this.currentPlayer() !== p) fail('Not your turn');
      this.turn.deferred.push(this.pending);
      this.pending = null;
      this.log(`${p.name} postpones a choice`);
      return this.process();
    }
    if (this.pending) fail('Waiting for a decision');
    if (this.currentPlayer() !== p || !this.turn) fail('Not your turn');
    const t = this.turn;
    switch (a.type) {
      case 'play': {
        const i = p.hand.findIndex((c) => c.uid === a.uid);
        if (i < 0) fail('Card not in hand');
        this.playCard(p, i);
        break;
      }
      case 'playAll': {
        // cards that ask for a decision go last, so gold/skill from the others is already counted
        const asks = (c) => JSON.stringify(def(c).play || [], (k, v) => (typeof v === 'function' ? 'fn' : v)).match(/"(choose|discardThen|trash|replaceRow)"/) ? 1 : 0;
        p.hand.sort((x, y) => asks(x) - asks(y));
        while (p.hand.length && !this.pending) this.playCard(p, 0);
        break;
      }
      case 'acquire': {
        if (a.slot === undefined) fail('No card');
        let card, d;
        if (typeof a.slot === 'number') { card = this.dungeonRow[a.slot]; if (!card) fail('Empty slot'); d = def(card); }
        else { d = CARD_DEFS[a.slot]; if (!d || !d.reserve || d.kind === 'monster') fail('Not in reserve'); if (!(this.reserve[a.slot] > 0)) fail('Reserve exhausted'); }
        if (d.kind === 'monster') fail('Monsters must be fought');
        if (!this.inPlace(p, d)) fail(`${d.name} can only be acquired in ${PLACE[d.where]}`);
        const cost = this.cardCost(d);
        if (t.skill < cost) fail(`Need ${cost} skill`);
        t.skill -= cost;
        if (typeof a.slot === 'number') this.dungeonRow[a.slot] = null; else { this.reserve[a.slot]--; card = makeCard(d.id); }
        this.gainCard(p, card);
        break;
      }
      case 'fight': {
        let card, d;
        if (a.slot === 'goblin') d = CARD_DEFS.goblin;
        else { card = this.dungeonRow[a.slot]; if (!card) fail('Empty slot'); d = def(card); }
        if (d.kind !== 'monster') fail('Not a monster');
        if (!this.inPlace(p, d)) fail(`${d.name} can only be fought in ${PLACE[d.where]}`);
        if (t.swords < d.swords) fail(`Need ${d.swords} swords`);
        t.swords -= d.swords;
        if (card) { this.dungeonRow[a.slot] = null; this.dungeonDiscard.push(card); }
        this.log(`${p.name} defeats ${d.name}`);
        this.queueBack(p, d.defeat, card);
        break;
      }
      case 'move': {
        const m = (this.legalFor(p) || { moves: [] }).moves.find((x) => x.to === a.to);
        if (!m) fail('No tunnel there');
        if (!m.ok) fail(m.reason);
        let swordsUsed = m.swordsUsed;
        if (a.swords !== undefined) swordsUsed = Math.max(0, Math.min(m.monsters, Math.min(t.swords, a.swords)));
        const dmg = m.monsters - swordsUsed;
        if (dmg > 0 && (p.supply < dmg || p.damage + dmg >= HEALTH_MAX)) fail('Cannot take that much damage');
        t.boots -= m.cost;
        t.swords -= swordsUsed;
        if (dmg > 0) { p.supply -= dmg; this.dealDamage(p, dmg, 'monster tunnel'); }
        this.enterRoom(p, a.to);
        break;
      }
      case 'teleport': {
        if (t.teleports <= 0) fail('No teleport available');
        if (!this.board.connectedRooms(p.room).includes(a.to)) fail('Not connected');
        if (a.to === 'start' && p.artifacts.length === 0) fail('Need an Artifact to leave');
        t.teleports--;
        this.log(`${p.name} teleports`);
        this.enterRoom(p, a.to);
        break;
      }
      case 'takeArtifact': {
        const rs = this.rooms[p.room];
        if (!rs.artifact) fail('No artifact here');
        if (p.artifacts.length >= 1 + p.items.backpack) fail('You cannot carry another Artifact');
        p.artifacts.push(rs.artifact);
        this.log(`${p.name} takes the ${rs.artifact}-point Artifact!`);
        rs.artifact = null;
        this.advanceRage();
        break;
      }
      case 'buy': {
        if (!this.board.room(p.room).market) fail('Not in a Market room');
        if (p.gold < MARKET_PRICE) fail(`Need ${MARKET_PRICE} gold`);
        if (a.item === 'masterKey' && this.market.masterKey > 0) { this.market.masterKey--; p.items.masterKey++; }
        else if (a.item === 'backpack' && this.market.backpack > 0) { this.market.backpack--; p.items.backpack++; }
        else if (a.item === 'crown' && this.market.crowns.length) { p.items.crowns.push(this.market.crowns.shift()); }
        else fail('Item not available');
        p.gold -= MARKET_PRICE;
        this.log(`${p.name} buys a ${a.item === 'masterKey' ? 'Master Key' : a.item === 'backpack' ? 'Backpack' : 'Crown'}`);
        break;
      }
      case 'useSecret': {
        const i = p.secrets.findIndex((s) => s.uid === a.uid);
        if (i < 0) fail('No such secret');
        const d = SECRET_DEFS[p.secrets[i].id];
        if (d.use !== 'held') fail('That token cannot be used');
        p.secrets.splice(i, 1);
        this.log(`${p.name} uses ${d.name}`);
        this.queueBack(p, d.effects, null);
        break;
      }
      case 'endTurn': {
        this.finishTurn();
        break;
      }
      case 'defer': {
        fail('Nothing to postpone');
      }
      case 'resume': {
        const d = t.deferred[a.index];
        if (!d) fail('No postponed choice there');
        t.deferred.splice(a.index, 1);
        this.pending = d;
        break;
      }
      default: fail(`Unknown action ${a.type}`);
    }
    this.process();
  }

  playCard(p, i) {
    const [c] = p.hand.splice(i, 1);
    p.playArea.push(c);
    const d = def(c);
    this.log(`${p.name} plays ${d.name}`);
    this.queueBack(p, d.play, c);
    this.process();
  }

  resolvePending(p, value) {
    if (!this.pending) fail('Nothing to decide');
    if (this.pending.pid !== p.id) fail('Not your decision');
    const opt = this.pending.options.find((o) => o.value === value);
    if (!opt) fail('Invalid choice');
    const { resolve } = this.pending;
    this.pending = null;
    resolve(value);
    this.process();
  }

  // ---------------- public state ----------------
  static staticData() {
    return { cards: allPublicDefs(), secrets: publicSecretDefs(), rules: publicRules(), marketPrice: MARKET_PRICE, healthMax: HEALTH_MAX };
  }

  stateFor(pid) {
    const me = this.playerById(pid);
    const cardView = (c) => ({ uid: c.uid, id: c.id });
    const cur = this.phase === 'playing' ? this.currentPlayer() : null;
    const players = this.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, bot: !!p.bot, botStyle: p.bot ? STYLES[p.bot.style]?.label : undefined, botAbout: p.bot ? STYLES[p.bot.style]?.about : undefined, connected: p.connected, status: p.status, koRescued: p.koRescued, onCountdown: p.onCountdown,
      room: p.room, damage: p.damage, supply: p.supply, gold: p.gold, artifacts: p.artifacts, secrets: p.secrets.map((s) => ({ uid: s.uid, id: s.id })),
      items: p.items, monkeyIdols: p.monkeyIdols, mastery: p.mastery, clankArea: this.clankArea?.[p.id] ?? 0, inBag: this.bag?.[p.id] ?? 0,
      deckCount: p.deck.length, handCount: p.hand.length, shuffles: p.shuffles || 0, discard: p.discard.map(cardView), playArea: p.playArea.map(cardView), trashedCount: p.trashed.length,
      // deck contents are public knowledge but the order is secret: sent alphabetically
      deck: [...p.deck].map(cardView).sort((x, y) => def(x).name.localeCompare(def(y).name)), trashed: p.trashed.map(cardView),
      // your own hand, plus the hand of whoever is taking their turn (spectating)
      hand: p.id === pid || p === cur ? p.hand.map(cardView) : undefined,
      score: this.phase === 'playing' ? this.score(p, true).total : undefined,
      scoreBreakdown: this.phase === 'playing' ? this.score(p, true).breakdown : undefined,
      allCards: this.phase === 'ended' ? [...p.deck, ...p.hand, ...p.discard, ...p.playArea].map(cardView) : undefined,
    }));
    const base = { code: this.code, phase: this.phase, version: this.version, me: pid, players, logs: this.logs.slice(-80), options: this.options };
    if (this.phase === 'lobby') return base;
    return {
      ...base,
      board: this.board.toJSON(),
      dungeonRow: this.dungeonRow.map((c) => (c ? cardView(c) : null)),
      dungeonDeckCount: this.dungeonDeck.length,
      // what is left in the dungeon deck, as counts only: the order stays secret
      dungeonLeft: this.dungeonDeck.reduce((m, c) => { m[c.id] = (m[c.id] || 0) + 1; return m; }, {}),
      dungeonStart: this.deckCounts,
      dungeonDiscardTop: this.dungeonDiscard.length ? cardView(this.dungeonDiscard[this.dungeonDiscard.length - 1]) : null,
      reserve: this.reserve,
      rage: this.rage, rageValue: this.rageValue(), danger: this.dangerCount(),
      bag: { black: this.bag.black, total: Object.values(this.bag).reduce((s, v) => s + v, 0) }, setAside: this.setAside.black,
      rooms: this.rooms, market: this.market, masteryTokens: this.masteryTokens, countdown: this.countdown,
      currentPlayer: this.currentPlayer()?.id, turn: this.turn, turnNumber: this.turnNumber,
      pending: this.pending ? { pid: this.pending.pid, title: this.pending.title, options: this.pending.options, spectating: this.pending.pid !== pid } : null,
      legal: me ? this.legalFor(me) : null,
      results: this.results || null,
      lastAttack: this.lastAttack || null,
      attacks: this.attacks, attackSeq: this.attackSeq,
      alerts: this.alerts.filter((a) => a.pid === pid), alertSeq: this.alertSeq,
      dragonToken: this.dragonToken ? { room: this.dragonToken.room, target: this.dragonToken.target, scent: this.dragonToken.scent, awareness: this.dragonSense.label,
        // foreseen next room: only for the thief who played a card that reveals it, during their turn
        next: me && me === this.currentPlayer() && this.turn?.flags.foreseeDragon ? this.dragonToken.next : undefined } : null,
      customCards: Object.fromEntries(this.customCards.map((id) => [id, publicDef(CARD_DEFS[id])])),
    };
  }
}

export { GameError };
