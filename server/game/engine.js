import { uid, shuffle } from './util.js';
import { def, makeCard, publicDef, buildDungeonDeck, buildStartingDeck, buildReserve, allPublicDefs, CARD_DEFS } from './cards/index.js';
import { ROOMS, roomById, tunnelsFrom, connectedRooms, RAGE_TRACK, RAGE_START, HEALTH_MAX, CLANK_SUPPLY, DRAGON_CUBES, MASTERY_POINTS, MARKET_PRICE, ARTIFACTS, publicBoard } from './board.js';
import { MAJOR_SECRETS, MINOR_SECRETS, SECRET_DEFS, buildSecretStack, publicSecretDefs } from './secrets.js';
import { applyEffect, evalCondition } from './effects.js';

const COLORS = ['red', 'blue', 'green', 'yellow'];
const MAX_PLAYERS = 4;

class GameError extends Error {}
const fail = (m) => { throw new GameError(m); };

export class Game {
  constructor(code) {
    this.code = code;
    this.phase = 'lobby';
    this.players = [];
    this.logs = [];
    this.version = 0;
    this.createdAt = Date.now();
  }

  // ---------------- lobby ----------------
  addPlayer(name) {
    if (this.phase !== 'lobby') fail('Game already started');
    if (this.players.length >= MAX_PLAYERS) fail('Game is full');
    const p = {
      id: uid('p'), token: uid('t') + uid('t'), name: String(name || 'Thief').slice(0, 20),
      color: COLORS[this.players.length], connected: true,
      deck: [], hand: [], discard: [], playArea: [], trashed: [],
      damage: 0, supply: CLANK_SUPPLY, gold: 0, room: 'start', artifacts: [], secrets: [],
      items: { masterKey: 0, backpack: 0, crowns: [] }, monkeyIdols: 0, mastery: false,
      status: 'in', koRescued: false, onCountdown: false,
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
      this.players.forEach((p, j) => { p.color = COLORS[j]; });
    }
  }

  start() {
    if (this.phase !== 'lobby') fail('Already started');
    const n = this.players.length;
    if (n < 1) fail('Need at least 1 player');
    this.phase = 'playing';

    this.dungeonDeck = buildDungeonDeck();
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
    for (const r of ROOMS) {
      const rs = { artifact: null, majorSecret: null, minorSecrets: [], monkeyIdols: 0 };
      if (r.artifact && !removed.includes(r.artifact)) rs.artifact = r.artifact;
      if (r.majorSecret) rs.majorSecret = majors.pop() || null;
      if (r.minorSecrets) for (let i = 0; i < r.minorSecrets; i++) { const s = minors.pop(); if (s) rs.minorSecrets.push(s); }
      if (r.monkeyShrine) rs.monkeyIdols = 3;
      this.rooms[r.id] = rs;
    }
    if (removed.length) this.log(`Artifacts removed for ${n} players: ${removed.join(', ')}`);

    // players
    shuffle(this.players);
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
    this.logs.push({ n: this.logs.length, t });
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

  process() {
    let guard = 0;
    while (!this.pending && this.queue.length && guard++ < 10000) {
      const { pid, e, card } = this.queue.shift();
      const p = this.playerById(pid);
      if (!p) continue;
      applyEffect(this, p, e, card);
    }
    if (!this.pending) {
      this.checkConditionals();
      if (this.queue.length) return this.process();
      this.afterProcess();
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
    if (this.phase !== 'playing') return;
    const p = this.currentPlayer();
    // current player knocked out mid-turn: their turn ends immediately
    if (this.turn && p.status === 'ko') this.finishTurn();
    this.checkGameEnd();
  }

  drawCards(p, n, silent = false) {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (p.deck.length === 0) {
        if (p.discard.length === 0) break;
        p.deck = shuffle(p.discard);
        p.discard = [];
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
    const drawn = [];
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
    }
    this.log(`DRAGON ATTACK (${reason}): ${n} cube${n === 1 ? '' : 's'} drawn — ${drawn.length ? drawn.join(', ') : 'bag empty'}`);
    this.lastAttack = { n, drawn, at: this.logs.length };
  }

  knockOut(p) {
    if (p.status !== 'in') return;
    p.status = 'ko';
    p.koRescued = p.artifacts.length > 0 && !roomById[p.room].depths;
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

  score(p) {
    const survived = p.status === 'escaped' || (p.status === 'ko' && p.koRescued);
    const all = [...p.deck, ...p.hand, ...p.discard, ...p.playArea];
    const b = {
      artifacts: p.artifacts.reduce((s, v) => s + v, 0),
      secrets: p.secrets.reduce((s, x) => s + (SECRET_DEFS[x.id].points || 0), 0),
      gold: p.gold + p.secrets.reduce((s, x) => s + (SECRET_DEFS[x.id].gold || 0), 0),
      monkeyIdols: p.monkeyIdols * 5,
      items: p.items.masterKey * 5 + p.items.backpack * 5 + p.items.crowns.reduce((s, v) => s + v, 0),
      mastery: p.mastery ? MASTERY_POINTS : 0,
      cards: all.reduce((s, c) => s + (def(c).points || 0), 0),
      bonus: all.reduce((s, c) => s + (def(c).endGamePoints ? def(c).endGamePoints(this, p) : 0), 0),
    };
    const total = survived ? Object.values(b).reduce((s, v) => s + v, 0) : null;
    return { survived, breakdown: b, total, bestArtifact: Math.max(0, ...p.artifacts) };
  }

  // ---------------- turns ----------------
  beginTurn() {
    if (this.phase !== 'playing') return;
    let guard = 0;
    while (guard++ < this.players.length + 1) {
      const p = this.currentPlayer();
      if (p.onCountdown) { this.countdownStep(p); if (this.phase !== 'playing') return; this.turnIdx = (this.turnIdx + 1) % this.players.length; continue; }
      if (p.status !== 'in') { this.turnIdx = (this.turnIdx + 1) % this.players.length; continue; }
      this.turnNumber++;
      this.turn = { skill: 0, swords: 0, boots: 0, clankMade: 0, negativeClank: 0, teleports: 0, flags: {}, enteredCrystalCave: false, conditionals: [], gemDiscount: 0, skillPerClank: 0 };
      this.log(`— ${p.name}'s turn —`);
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
    p.discard.push(...p.playArea, ...p.hand);
    p.playArea = [];
    p.hand = [];
    this.turn = null;
    this.drawCards(p, 5, true);
    this.refillRow();
    this.turnIdx = (this.turnIdx + 1) % this.players.length;
    this.beginTurn();
  }

  fillRowSlot(i, { ignoreDragon = false } = {}) {
    const c = this.dungeonDeck.shift();
    if (!c) { this.dungeonRow[i] = null; return false; }
    this.dungeonRow[i] = c;
    const d = def(c);
    this.log(`${d.name} arrives in the Dungeon Row`);
    if (d.arrive) this.queueBack(this.currentPlayer(), d.arrive, c);
    return !!d.dragon && !ignoreDragon;
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
    const r = roomById[rid];
    this.log(`${p.name} moves to ${r.name}`);
    if (r.start) return this.escape(p);
    if (r.crystal && !t.flags.ignoreCrystalCaves) { t.enteredCrystalCave = true; this.log(`${p.name} is exhausted by the Crystal Cave`); }
    if (r.fountain) this.heal(p, 1);
    const rs = this.rooms[rid];
    if (r.monkeyShrine && rs.monkeyIdols > 0) { rs.monkeyIdols--; p.monkeyIdols++; this.log(`${p.name} takes a Monkey Idol`); }
    else this.takeRoomSecret(p, rid);
  }

  // ---------------- legal move computation (for the UI) ----------------
  legalFor(p) {
    const t = this.turn;
    if (!t || this.currentPlayer() !== p || p.status !== 'in' || this.pending) return null;
    const moves = [];
    const exhausted = t.enteredCrystalCave && !t.flags.ignoreCrystalCaves;
    for (const tn of tunnelsFrom(p.room)) {
      const cost = tn.boots || 1;
      const monsters = t.flags.ignoreMonsterTunnels ? 0 : (tn.monsters || 0);
      const swordsUsed = Math.min(t.swords, monsters);
      const dmg = monsters - swordsUsed;
      let reason = null;
      if (tn.to === 'start' && p.artifacts.length === 0) reason = 'Need an Artifact to leave';
      else if (exhausted) reason = 'Exhausted (Crystal Cave)';
      else if (t.boots < cost) reason = `Need ${cost} boots`;
      else if (tn.locked && !p.items.masterKey) reason = 'Locked (Master Key needed)';
      else if (dmg > 0 && (p.supply < dmg || p.damage + dmg >= HEALTH_MAX)) reason = 'Too dangerous';
      moves.push({ to: tn.to, cost, monsters, swordsUsed, damage: dmg, locked: !!tn.locked, ok: !reason, reason, via: 'move' });
    }
    const teleports = t.teleports > 0 ? connectedRooms(p.room).filter((r) => r !== 'start' || p.artifacts.length > 0) : [];
    const rs = this.rooms[p.room];
    const capacity = 1 + p.items.backpack;
    const canTakeArtifact = !!(rs && rs.artifact && p.artifacts.length < capacity);
    const inMarket = !!roomById[p.room].market;
    const canBuy = inMarket && p.gold >= MARKET_PRICE ? Object.entries({ masterKey: this.market.masterKey, backpack: this.market.backpack, crown: this.market.crowns.length }).filter(([, n]) => n > 0).map(([k]) => k) : [];
    const acquirable = this.dungeonRow.map((c, i) => c && def(c).kind !== 'monster' && this.cardCost(def(c)) <= t.skill ? i : null).filter((x) => x !== null);
    const fightable = this.dungeonRow.map((c, i) => c && def(c).kind === 'monster' && def(c).swords <= t.swords ? i : null).filter((x) => x !== null);
    const reserveBuy = Object.keys(this.reserve).filter((id) => this.reserve[id] > 0 && CARD_DEFS[id].cost <= t.skill);
    return { moves, teleports, canTakeArtifact, canBuy, acquirable, fightable, reserveBuy, canFightGoblin: t.swords >= 2, canEndTurn: p.hand.length === 0, mustPlayCards: p.hand.length > 0 };
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
        while (p.hand.length && !this.pending) this.playCard(p, 0);
        break;
      }
      case 'acquire': {
        if (a.slot === undefined) fail('No card');
        let card, d;
        if (typeof a.slot === 'number') { card = this.dungeonRow[a.slot]; if (!card) fail('Empty slot'); d = def(card); }
        else { d = CARD_DEFS[a.slot]; if (!d || !d.reserve || d.kind === 'monster') fail('Not in reserve'); if (!(this.reserve[a.slot] > 0)) fail('Reserve exhausted'); }
        if (d.kind === 'monster') fail('Monsters must be fought');
        const cost = this.cardCost(d);
        if (t.skill < cost) fail(`Need ${cost} skill`);
        t.skill -= cost;
        if (typeof a.slot === 'number') this.dungeonRow[a.slot] = null; else { this.reserve[a.slot]--; card = makeCard(d.id); }
        if (d.kind === 'device') { this.dungeonDiscard.push(card); this.log(`${p.name} uses ${d.name}`); this.queueBack(p, d.use, card); }
        else { p.discard.push(card); this.log(`${p.name} acquires ${d.name}`); this.queueBack(p, d.acquire, card); }
        break;
      }
      case 'fight': {
        let card, d;
        if (a.slot === 'goblin') d = CARD_DEFS.goblin;
        else { card = this.dungeonRow[a.slot]; if (!card) fail('Empty slot'); d = def(card); }
        if (d.kind !== 'monster') fail('Not a monster');
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
        if (!connectedRooms(p.room).includes(a.to)) fail('Not connected');
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
        if (!roomById[p.room].market) fail('Not in a Market room');
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
        if (p.hand.length > 0) fail('You must play all cards in your hand');
        this.finishTurn();
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
    return { cards: allPublicDefs(), secrets: publicSecretDefs(), board: publicBoard(), marketPrice: MARKET_PRICE, healthMax: HEALTH_MAX };
  }

  stateFor(pid) {
    const me = this.playerById(pid);
    const cardView = (c) => ({ uid: c.uid, id: c.id });
    const players = this.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, connected: p.connected, status: p.status, koRescued: p.koRescued, onCountdown: p.onCountdown,
      room: p.room, damage: p.damage, supply: p.supply, gold: p.gold, artifacts: p.artifacts, secrets: p.secrets.map((s) => ({ uid: s.uid, id: s.id })),
      items: p.items, monkeyIdols: p.monkeyIdols, mastery: p.mastery, clankArea: this.clankArea?.[p.id] ?? 0, inBag: this.bag?.[p.id] ?? 0,
      deckCount: p.deck.length, handCount: p.hand.length, discard: p.discard.map(cardView), playArea: p.playArea.map(cardView), trashedCount: p.trashed.length,
      hand: p.id === pid ? p.hand.map(cardView) : undefined,
      allCards: this.phase === 'ended' ? [...p.deck, ...p.hand, ...p.discard, ...p.playArea].map(cardView) : undefined,
    }));
    const base = { code: this.code, phase: this.phase, version: this.version, me: pid, players, logs: this.logs.slice(-80) };
    if (this.phase === 'lobby') return base;
    return {
      ...base,
      dungeonRow: this.dungeonRow.map((c) => (c ? cardView(c) : null)),
      dungeonDeckCount: this.dungeonDeck.length,
      dungeonDiscardTop: this.dungeonDiscard.length ? cardView(this.dungeonDiscard[this.dungeonDiscard.length - 1]) : null,
      reserve: this.reserve,
      rage: this.rage, rageValue: this.rageValue(), danger: this.dangerCount(),
      bag: { black: this.bag.black, total: Object.values(this.bag).reduce((s, v) => s + v, 0) }, setAside: this.setAside.black,
      rooms: this.rooms, market: this.market, masteryTokens: this.masteryTokens, countdown: this.countdown,
      currentPlayer: this.currentPlayer()?.id, turn: this.turn, turnNumber: this.turnNumber,
      pending: this.pending ? { pid: this.pending.pid, title: this.pending.title, options: this.pending.pid === pid ? this.pending.options : undefined } : null,
      legal: me ? this.legalFor(me) : null,
      results: this.results || null,
      lastAttack: this.lastAttack || null,
    };
  }
}

export { GameError };
