// Effect interpreter. Every card/secret effect is a plain object; this file knows how to apply them.
// Effects that need a decision set `game.pending` and are continued by Game.resolvePending().
import { def, makeCard, publicDef } from './cards/index.js';
import { connectedRooms, roomById } from './board.js';

export function evalCondition(game, p, cond, card) {
  if (!cond) return true;
  if (cond.has === 'crown') return p.items.crowns.length > 0;
  if (cond.has === 'artifact') return p.artifacts.length > 0;
  if (cond.has === 'monkeyIdol') return p.monkeyIdols > 0;
  if (cond.has === 'chalice') return p.secrets.some((s) => s.id === 'chalice');
  if (cond.otherCompanion) return p.playArea.some((c) => c.uid !== card?.uid && (def(c).tags || []).includes('companion'));
  if (typeof cond.fn === 'function') return !!cond.fn(game, p, card);
  return false;
}

export function applyEffect(game, p, e, card) {
  if (typeof e === 'function') return e(game, p, card);
  if (e.fn) return e.fn(game, p, card);

  // --- resource gains ---
  const t = game.turn;
  const mine = t && game.currentPlayer() === p;
  if (e.skill) { if (mine) t.skill += e.skill; }
  if (e.swords) { if (mine) t.swords += e.swords; }
  if (e.boots) { if (mine) t.boots += e.boots; }
  if (e.gold) { p.gold += e.gold; game.log(`${p.name} gains ${e.gold} gold`); }
  if (e.heal) game.heal(p, e.heal);
  if (e.clank) game.addClank(p, e.clank);
  if (e.draw) game.drawCards(p, e.draw);

  if (e.teleport) { if (mine) { t.teleports += e.teleport; game.log(`${p.name} may teleport`); } }
  if (e.dragonAttack) game.dragonAttack(0, 'card effect');
  if (e.othersClank) for (const o of game.players) if (o !== p && o.status === 'in') game.addClank(o, e.othersClank);
  if (e.allClank) for (const o of game.players) if (o.status === 'in') game.addClank(o, e.allClank);
  if (e.flag) { if (mine) t.flags[e.flag] = true; }
  if (e.gemDiscount) { if (mine) t.gemDiscount += e.gemDiscount; }
  if (e.returnDragonCubes) { game.bag.black += game.setAside.black; game.setAside.black = 0; game.log('Set-aside dragon cubes return to the bag'); }
  if (e.skillPerClank && mine) { t.skillPerClank += 1; t.skill += t.clankMade; }

  if (e.buyTomes) {
    const avail = game.reserve.secret_tome || 0;
    if (p.gold >= e.buyTomes.gold && avail > 0) {
      p.gold -= e.buyTomes.gold;
      const n = Math.min(e.buyTomes.count, avail);
      for (let i = 0; i < n; i++) { game.reserve.secret_tome--; p.discard.push(makeCard('secret_tome')); }
      game.log(`${p.name} pays ${e.buyTomes.gold} gold for ${n} Secret Tome(s)`);
    }
  }

  if (e.when) {
    if (evalCondition(game, p, e.when, card)) game.queueFront(p, e.effects, card);
    else if (mine) t.conditionals.push({ pid: p.id, cond: e.when, effects: e.effects, card });
  }

  if (e.choose) {
    const opts = e.choose.filter((o) => !o.requires || (o.requires.gold == null || p.gold >= o.requires.gold));
    if (opts.length === 0) return;
    if (opts.length === 1) return game.queueFront(p, opts[0].effects, card);
    game.prompt(p, {
      title: `${card ? def(card).name : 'Choose'}: choose one`,
      options: opts.map((o, i) => ({ label: o.label, value: i })),
    }, (v) => game.queueFront(p, opts[v].effects, card));
  }

  if (e.discardThen) {
    if (p.hand.length === 0) return game.log(`${p.name} has no card to discard`);
    game.prompt(p, {
      title: `${card ? def(card).name : ''}: discard a card`,
      options: p.hand.map((c) => ({ label: def(c).name, value: c.uid, card: publicDef(def(c)) })),
    }, (uidv) => {
      const i = p.hand.findIndex((c) => c.uid === uidv);
      if (i < 0) return;
      const [c] = p.hand.splice(i, 1);
      p.discard.push(c);
      game.log(`${p.name} discards ${def(c).name}`);
      game.queueFront(p, e.discardThen, card);
    });
  }

  if (e.trash) {
    const zones = e.trash.from || ['playArea', 'discard'];
    const cands = [];
    for (const z of zones) for (const c of p[z]) if (!e.trash.match || c.id === e.trash.match) cands.push({ zone: z, c });
    if (cands.length === 0) return game.log(`${p.name} has nothing to trash`);
    const options = cands.map((x) => ({ label: `${def(x.c).name} (${zoneName(x.zone)})`, value: x.c.uid, card: publicDef(def(x.c)) }));
    if (e.trash.optional) options.push({ label: 'Do not trash anything', value: null });
    game.prompt(p, { title: `${card ? def(card).name : 'Trash'}: trash a card`, options }, (uidv) => {
      if (uidv == null) return;
      const x = cands.find((y) => y.c.uid === uidv);
      if (!x) return;
      const arr = p[x.zone];
      arr.splice(arr.findIndex((c) => c.uid === uidv), 1);
      p.trashed.push(x.c);
      game.log(`${p.name} trashes ${def(x.c).name}`);
    });
  }

  if (e.replaceRow) {
    const options = game.dungeonRow.map((c, i) => c ? { label: def(c).name, value: i, card: publicDef(def(c)) } : null).filter(Boolean);
    if (options.length === 0) return;
    game.prompt(p, { title: 'Replace a card in the Dungeon Row', options }, (i) => {
      const old = game.dungeonRow[i];
      if (!old) return;
      game.dungeonDiscard.push(old);
      game.dungeonRow[i] = null;
      game.log(`${p.name} replaces ${def(old).name} in the Dungeon Row`);
      game.fillRowSlot(i, { ignoreDragon: true });
    });
  }

  if (e.takeAdjacentSecret) {
    const options = [];
    for (const rid of connectedRooms(p.room)) {
      const rs = game.rooms[rid];
      if (rs && (rs.majorSecret || rs.minorSecrets.length)) options.push({ label: roomById[rid].name, value: rid });
    }
    if (options.length === 0) return game.log('No secrets in adjacent rooms');
    game.prompt(p, { title: 'Take a Secret from an adjacent room', options }, (rid) => game.takeRoomSecret(p, rid));
  }
}

function zoneName(z) {
  return { hand: 'hand', playArea: 'play area', discard: 'discard pile' }[z] || z;
}
