// Builds design/mock.html: a static redesign draft (3 artboards) that is pushed to Figma via html_to_figma.
import fs from 'node:fs';
import { ROOMS, TUNNELS } from '../server/game/board.js';
const ASSETS = new URL('../public/assets/', import.meta.url);
const dataUri = (rel) => `data:image/jpeg;base64,${fs.readFileSync(new URL(rel, ASSETS)).toString('base64')}`;
const TILE = Object.fromEntries(['start', 'crystal', 'market', 'fountain', 'monkey', 'nest', 'artifact', 'depths', 'room'].map((k) => [k, dataUri(`tiles/tile-${k}.jpg`)]));
const CARDART = Object.fromEntries(['companion', 'device', 'monster', 'gem', 'reserve'].map((k) => [k, dataUri(`cards/card-${k}.jpg`)]));
const LOBBY_BG = dataUri('bg-lobby.jpg');
function tileFor(r) {
  if (r.start) return 'start'; if (r.crystal) return 'crystal'; if (r.market) return 'market'; if (r.fountain) return 'fountain';
  if (r.monkeyShrine) return 'monkey'; if (r.artifact >= 30) return 'nest'; if (r.artifact) return 'artifact'; return r.depths ? 'depths' : 'room';
}

const C = {
  ink: '#0E0B12', panel: '#171320', raised: '#221C2E', line: '#3A3148', text: '#F1E9D8', muted: '#A79BB5',
  gold: '#E0A526', ember: '#E0583A', blue: '#3C8DDE', purple: '#8E5BC4', red: '#C7453A', brass: '#B8862B', green: '#35A66A', crystal: '#4FB3D6',
  parch: '#F3EAD3', parch2: '#E6D9B8', inkText: '#1E1726',
};

// ---------- board svg ----------
function boardSvg() {
  const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
  let s = `<svg viewBox="30 0 940 940" width="590" height="590" xmlns="http://www.w3.org/2000/svg" style="display:block">`;
  s += `<rect x="0" y="0" width="1000" height="1000" fill="${C.ink}"/>`;
  s += `<rect x="0" y="430" width="1000" height="570" fill="#15101E"/>`;
  s += `<text x="24" y="458" fill="#5E5370" font-family="Cinzel" font-size="18" letter-spacing="6">THE DEPTHS</text>`;
  for (const [a, b, o = {}] of TUNNELS) {
    const A = byId[a], B = byId[b];
    const stroke = o.locked ? C.brass : o.monsters ? C.ember : '#5A4E6E';
    s += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${stroke}" stroke-width="5" ${o.boots ? 'stroke-dasharray="10 7"' : ''} stroke-linecap="round"/>`;
    if (o.oneWay) { const mx = (A.x + 2 * B.x) / 3, my = (A.y + 2 * B.y) / 3; s += `<circle cx="${mx}" cy="${my}" r="6" fill="#5A4E6E"/>`; }
    const label = (o.locked ? '🔒' : '') + (o.boots ? '👣' : '') + (o.monsters ? '⚔'.repeat(o.monsters) : '');
    if (label) { const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2; s += `<rect x="${mx - 17}" y="${my - 12}" width="34" height="22" rx="6" fill="#0E0B12" stroke="#3A3148"/><text x="${mx}" y="${my + 5}" text-anchor="middle" font-size="13" font-family="Inter">${label}</text>`; }
  }
  const fillFor = (r) => r.start ? '#3E5A2A' : r.crystal ? '#1F4A5E' : r.market ? '#5A4318' : r.fountain ? '#1C5A46' : r.monkeyShrine ? '#5A3C1C' : '#2A2338';
  for (const r of ROOMS) {
    const w = 150, h = 66;
    const here = r.id === 'a5';
    const canMove = ['a9', 'a6', 'a1', 'a2'].includes(r.id);
    const stroke = here ? '#FFFFFF' : canMove ? C.gold : '#7B6D95';
    const rx = r.x - w / 2, ry = r.y - h / 2;
    s += `<clipPath id="clip-${r.id}"><rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="12"/></clipPath><image href="${TILE[tileFor(r)]}" x="${rx}" y="${ry}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${r.id})"/>`;
    s += `<rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="12" fill="${fillFor(r)}" fill-opacity="0.72" stroke="${stroke}" stroke-width="${here || canMove ? 3.5 : 2}"/>`;
    s += `<text x="${r.x}" y="${r.y - 8}" text-anchor="middle" fill="${C.text}" font-family="Cinzel" font-size="13" font-weight="700">${r.name}</text>`;
    const info = [];
    if (r.artifact) info.push(`🏺 ${r.artifact}`);
    if (r.majorSecret) info.push('★ Major');
    if (r.minorSecrets) info.push('? ×2');
    if (r.monkeyShrine) info.push('🐒 ×3');
    if (r.crystal) info.push('💎 cave');
    if (r.market) info.push('🛒 market');
    if (r.fountain) info.push('⛲ heal');
    if (r.start) info.push('🏅 exit');
    s += `<text x="${r.x}" y="${r.y + 15}" text-anchor="middle" fill="#D9CDEF" font-family="Inter" font-size="12">${info.join('   ')}</text>`;
    if (here) s += `<circle cx="${r.x - w / 2 + 12}" cy="${r.y - h / 2 - 2}" r="9" fill="${C.blue}" stroke="#000" stroke-width="1.5"/>`;
    if (r.id === 'a2') s += `<circle cx="${r.x - w / 2 + 12}" cy="${r.y - h / 2 - 2}" r="9" fill="${C.red}" stroke="#000" stroke-width="1.5"/>`;
  }
  return s + '</svg>';
}

// ---------- components ----------
const KIND = { companion: C.blue, device: C.purple, monster: C.red, reserve: C.brass, gem: '#2E9A8C' };
function card({ name, kind = 'companion', cost, swords, pts, text, w = 150, h = 206, icons = '', action = '', count, playable = false }) {
  const banner = KIND[kind];
  const costHtml = swords != null ? `<div class="cost sw">⚔ ${swords}</div>` : cost != null ? `<div class="cost">${cost}</div>` : '';
  return `<div class="card ${playable ? 'playable' : ''}" style="width:${w}px;height:${h}px">
    <div class="banner" style="background:${banner}"><span>${name}</span><span class="bic">${count != null ? `<span class="cnt">×${count}</span>` : ''}${icons}</span></div>
    <div class="art" style="background-image:url(${CARDART[kind]})"></div>
    <div class="ctext">${text}</div>
    <div class="cfoot"><span class="pts">${pts ? `${pts} pts` : ''}</span>${costHtml}</div>
    ${action ? `<div class="cact">${action}</div>` : ''}
  </div>`;
}
const chip = (icon, v, label, accent = C.gold) => `<div class="chip"><div class="chipv" style="color:${accent}">${icon} ${v}</div><div class="chipl">${label}</div></div>`;
const hearts = (n) => `<span class="hearts">${'♥'.repeat(n)}<span class="dim">${'♥'.repeat(10 - n)}</span></span>`;
function playerChip({ name, color, hp, clank, gold, room, current, you }) {
  return `<div class="pc ${current ? 'cur' : ''}"><div class="av" style="background:${color}">${name[0]}</div>
    <div class="pcb"><div class="pcn">${name}${you ? ' <em>you</em>' : ''}<span class="pcg">${gold}g</span></div>${hearts(hp)}<div class="pcm">${room} · ${clank} clank</div></div></div>`;
}
const btn = (label, cls = '') => `<div class="btn ${cls}">${label}</div>`;

// ---------- artboards ----------
const topbar = `<header class="top">
  <div class="logo">CLANK<span>!</span></div>
  <div class="players">
    ${playerChip({ name: 'Ann', color: C.red, hp: 9, clank: 4, gold: 0, room: 'Guard Post', current: false })}
    ${playerChip({ name: 'Bob', color: C.blue, hp: 10, clank: 3, gold: 1, room: 'Glittering Cave', current: true, you: true })}
    ${playerChip({ name: 'Cass', color: C.green, hp: 7, clank: 1, gold: 5, room: 'Deep Market' })}
    ${playerChip({ name: 'Dee', color: '#E8C547', hp: 10, clank: 0, gold: 2, room: 'Outside' })}
  </div>
  <div class="dragon">
    <div class="drow"><span class="dtitle">🐉 Rage</span><div class="rage">${[2, 2, 3, 3, 4, 4, 5].map((v, i) => `<span class="${i === 2 ? 'on' : i < 2 ? 'past' : ''}">${v}</span>`).join('')}</div></div>
    <div class="dmeta">Bag 24 cubes · 24 black · set aside 0</div>
    <div class="dmeta">Deck 93 · Mastery ×2 · Danger +0</div>
  </div>
</header>`;

const sidePanel = `<aside class="side">
  <div class="sh"><h3>Dungeon Row</h3><span class="mut">93 in deck</span></div>
  <div class="grid3">
    ${card({ name: 'Kobold', kind: 'monster', swords: 1, text: 'Defeat: +1 Skill', action: btn('Fight', 'act') })}
    ${card({ name: 'Shrine', kind: 'device', cost: 2, text: 'Arrive: return set-aside dragon cubes. Use: +1 Gold or heal 1.', action: btn('Use', 'act') })}
    ${card({ name: 'Apothecary', kind: 'companion', cost: 2, pts: 1, text: 'Discard a card to choose one: +3 Swords, +2 Gold, or heal 1.', action: btn('Acquire', 'act') })}
    ${card({ name: 'Master Burglar', kind: 'companion', cost: 3, pts: 2, text: '+2 Skill. Trash a Burgle.' })}
    ${card({ name: 'Wand of Recall', kind: 'device', cost: 5, text: 'Use: +2 Skill. Teleport.' })}
    ${card({ name: 'Ruby', kind: 'gem', cost: 6, pts: 6, text: '+2 Skill. Draw a card. +2 Clank!', icons: '🐉' })}
  </div>
  <div class="sh"><h3>Reserve</h3></div>
  <div class="row4">
    ${card({ name: 'Mercenary', kind: 'reserve', cost: 2, count: 15, text: '+1 Skill. +2 Swords', w: 118, h: 150 })}
    ${card({ name: 'Explore', kind: 'reserve', cost: 3, count: 15, text: '+2 Skill. +1 Boot', w: 118, h: 150 })}
    ${card({ name: 'Secret Tome', kind: 'reserve', cost: 7, pts: 7, count: 12, text: 'Worth 7 points.', w: 118, h: 150 })}
    ${card({ name: 'Goblin', kind: 'monster', swords: 2, text: 'Defeat: +1 Gold. Repeatable.', w: 118, h: 150 })}
  </div>
  <div class="sh"><h3>Market</h3><span class="mut">7 gold · in a Market room</span></div>
  <div class="row3">
    <div class="mk"><div class="mki">🔑</div><b>Master Key</b><span>2 left · 5 pts</span></div>
    <div class="mk"><div class="mki">🎒</div><b>Backpack</b><span>2 left · 5 pts</span></div>
    <div class="mk"><div class="mki">👑</div><b>Crown</b><span>next 10 · 9 · 8</span></div>
  </div>
  <div class="sh"><h3>Log</h3></div>
  <div class="log"><div class="lt">— Bob's turn —</div><div>Bob plays Stumble · makes 1 Clank!</div><div>Bob plays Scramble</div><div>Bob moves to Glittering Cave</div><div>Bob is exhausted by the Crystal Cave</div><div>Bob uses Shrine · gains 1 gold</div><div class="la">DRAGON ATTACK: 3 cubes — black, red, black</div></div>
</aside>`;

const tray = `<footer class="tray">
  <div class="trayl">
    <div class="status">Your turn — play cards, then act.</div>
    <div class="chips">${chip('🧠', 1, 'Skill')}${chip('⚔', 0, 'Swords', C.ember)}${chip('👢', 1, 'Boots', C.crystal)}${chip('🪙', 1, 'Gold')}${chip('✨', 0, 'Teleport', C.purple)}${chip('♥', 10, 'Health', C.red)}${chip('◼', 27, 'Clank supply', C.muted)}</div>
    <div class="acts">${btn('Play all cards')}${btn('Take Artifact (7)', 'primary')}${btn('Teleport (0)', 'dis')}${btn('End turn', 'primary')}</div>
    <div class="tokens"><span class="tok">🏺 Artifact 7</span><span class="tok">★ Potion of Healing <i>Use</i></span><span class="tok">🐒 Monkey Idol ×1</span><span class="tok mut">deck 5 · discard 0 · trashed 0</span></div>
  </div>
  <div class="hand">
    <div class="zl">Hand</div>
    <div class="fan">
      ${card({ name: 'Burgle', text: '+1 Skill', w: 128, h: 172, playable: true })}
      ${card({ name: 'Stumble', text: '+1 Boot. +1 Clank!', w: 128, h: 172, playable: true })}
      ${card({ name: 'Elven Dagger', cost: 4, pts: 2, text: '+1 Skill. +1 Sword. Draw a card.', w: 128, h: 172, playable: true })}
      ${card({ name: 'Sapphire', kind: 'gem', cost: 4, pts: 4, text: '+2 Skill. Draw a card. +2 Clank!', w: 128, h: 172, playable: true })}
      ${card({ name: 'Sneak', cost: 2, text: '+1 Skill. +1 Boot. -2 Clank!', w: 128, h: 172, playable: true })}
    </div>
  </div>
  <div class="played">
    <div class="zl">Play area</div>
    <div class="stack">
      ${card({ name: 'Scramble', text: '+1 Skill. +1 Boot', w: 96, h: 128 })}
      ${card({ name: 'Stumble', text: '+1 Boot. +1 Clank!', w: 96, h: 128 })}
    </div>
  </div>
</footer>`;

const modal = `<div class="scrim"><div class="modal">
  <div class="mh"><h3>Apothecary: discard a card</h3><span class="mut">Discard one card from your hand to choose a reward.</span></div>
  <div class="mcards">
    ${card({ name: 'Burgle', text: '+1 Skill', w: 128, h: 172, playable: true })}
    ${card({ name: 'Stumble', text: '+1 Boot. +1 Clank!', w: 128, h: 172, playable: true })}
    ${card({ name: 'Sneak', cost: 2, text: '+1 Skill. +1 Boot. -2 Clank!', w: 128, h: 172, playable: true })}
  </div>
  <div class="mopts">${btn('+3 Swords', 'opt')}${btn('+2 Gold', 'opt')}${btn('Heal 1', 'opt')}</div>
</div></div>`;

const boardLegend = `<div class="legend">
  <div class="lg"><div class="lgh">You are in</div><div class="lgv">Glittering Cave</div><div class="mut">💎 Crystal Cave — no more boots this turn</div></div>
  <div class="lg"><div class="lgh">Reachable</div><div class="lgr"><b>Chapel</b><span>1 boot · ★ Major</span></div><div class="lgr"><b>Fountain Court</b><span>1 boot · ⛲ heal</span></div><div class="lgr"><b>Entrance Hall</b><span>1 boot</span></div><div class="lgr dim"><b>Guard Post</b><span>exhausted</span></div></div>
  <div class="lg"><div class="lgh">Tunnels</div><div class="tl"><i style="background:#5A4E6E"></i>normal</div><div class="tl"><i class="dash"></i>👣 2 boots</div><div class="tl"><i style="background:${C.ember}"></i>⚔ monster</div><div class="tl"><i style="background:${C.brass}"></i>🔒 locked</div><div class="tl"><i style="background:#5A4E6E"></i>● one-way</div></div>
  <div class="lg"><div class="lgh">Dragon</div><div class="mut">Attack draws <b style="color:${C.ember}">3</b> cubes · 24 in bag · 0 danger</div></div>
</div>`;
const gameBoard = `<div class="artboard game" data-name="Game — Bob's turn">
  ${topbar}
  <div class="main"><div class="boardwrap">${boardLegend}${boardSvg()}</div>${sidePanel}</div>
  ${tray}
</div>`;

const gameModal = `<div class="artboard game" data-name="Game — prompt modal">
  ${topbar}
  <div class="main"><div class="boardwrap">${boardLegend}${boardSvg()}</div>${sidePanel}</div>
  ${tray}
  ${modal}
</div>`;

const lobby = `<div class="artboard lobby" data-name="Lobby" style="background-image:url(${LOBBY_BG});background-size:cover;background-position:center">
  <div class="veil"></div>
  <div class="lhero">
    <div class="ltitle">CLANK<span>!</span></div>
    <div class="lsub">A DECK-BUILDING ADVENTURE</div>
    <p class="lp">Sneak into Dragon Keep, steal an artifact, and get out before the dragon notices. Up to four thieves, any device on the network.</p>
    <div class="lpanel">
      <label class="field"><span>Your name</span><div class="input">Bob</div></label>
      <div class="lrow">${btn('Create game', 'primary big')}<span class="or">or</span><div class="input code">AHYA</div>${btn('Join', 'big')}</div>
      <div class="lopen"><span class="mut">Open games</span><div class="og"><b>AHYA</b><span>Ann, Bob</span><em>2/4</em></div><div class="og"><b>K7PQ</b><span>Cass</span><em>1/4</em></div></div>
    </div>
    <div class="lfoot">Share the link · play over LAN · reconnect keeps your seat</div>
  </div>
</div>`;

const sheet = `<div class="artboard sheet" data-name="Components & tokens">
  <h2>Clank! Web — components</h2>
  <div class="srow"><div class="sl">Cards</div>
    ${card({ name: 'Companion', cost: 4, pts: 2, text: '+1 Skill. +1 Boot. Draw a card.' })}
    ${card({ name: 'Device', kind: 'device', cost: 4, text: 'Use: Teleport.' })}
    ${card({ name: 'Monster', kind: 'monster', swords: 3, text: 'Danger. Defeat: +5 Gold', icons: '☠' })}
    ${card({ name: 'Gem', kind: 'gem', cost: 5, pts: 5, text: '+2 Skill. Draw a card. +2 Clank!' })}
    ${card({ name: 'Reserve', kind: 'reserve', cost: 3, count: 15, text: '+2 Skill. +1 Boot' })}
    ${card({ name: 'Playable', text: '+1 Skill', playable: true, action: btn('Acquire', 'act') })}
  </div>
  <div class="srow"><div class="sl">Buttons</div>${btn('Primary', 'primary')}${btn('Secondary')}${btn('Disabled', 'dis')}${btn('Card action', 'act')}${btn('Option', 'opt')}</div>
  <div class="srow"><div class="sl">Resources</div>${chip('🧠', 3, 'Skill')}${chip('⚔', 2, 'Swords', C.ember)}${chip('👢', 1, 'Boots', C.crystal)}${chip('🪙', 7, 'Gold')}${chip('✨', 1, 'Teleport', C.purple)}${chip('♥', 6, 'Health', C.red)}</div>
  <div class="srow"><div class="sl">Players</div>${playerChip({ name: 'Ann', color: C.red, hp: 9, clank: 4, gold: 0, room: 'Guard Post' })}${playerChip({ name: 'Bob', color: C.blue, hp: 10, clank: 3, gold: 1, room: 'Glittering Cave', current: true, you: true })}${playerChip({ name: 'Cass', color: C.green, hp: 0, clank: 0, gold: 12, room: 'Knocked out · rescued' })}${playerChip({ name: 'Dee', color: '#E8C547', hp: 4, clank: 0, gold: 9, room: 'Escaped 🏅' })}</div>
  <div class="srow"><div class="sl">Rooms</div>
    <div class="room">Chapel<small>★ Major</small></div><div class="room crystal">Crystal Maze<small>💎 cave</small></div><div class="room market">Deep Market<small>🛒 market</small></div><div class="room fountain">Healing Spring<small>⛲ heal 1</small></div><div class="room here">Glittering Cave<small>you are here</small></div><div class="room move">Entrance Hall<small>move · 1 boot</small></div><div class="room tp">Lookout<small>teleport</small></div>
  </div>
  <div class="srow"><div class="sl">Tunnels</div><div class="tl"><i style="background:#5A4E6E"></i>normal</div><div class="tl"><i class="dash"></i>👣 2 boots</div><div class="tl"><i style="background:${C.ember}"></i>⚔ monster</div><div class="tl"><i style="background:${C.brass}"></i>🔒 locked</div><div class="tl"><i style="background:#5A4E6E"></i>● one-way</div></div>
  <div class="srow"><div class="sl">Tokens</div><span class="tok">🏺 Artifact 15</span><span class="tok">★ Chalice · 7 pts</span><span class="tok">🥚 Dragon Egg · 3 pts</span><span class="tok">Potion of Strength <i>Use</i></span><span class="tok">🔑 Master Key</span><span class="tok">👑 Crown 10</span><span class="tok">🏅 Mastery 20</span></div>
  <div class="srow"><div class="sl">Palette</div>${Object.entries(C).map(([k, v]) => `<div class="sw"><i style="background:${v}"></i>${k}<small>${v}</small></div>`).join('')}</div>
</div>`;

const css = `
* { box-sizing: border-box; margin: 0; }
body { background: #333; font-family: Inter, sans-serif; color: ${C.text}; font-size: 13px; }
.artboard { position: relative; width: 1440px; background: ${C.ink}; overflow: hidden; margin: 40px; }
.game { height: 900px; display: flex; flex-direction: column; }
.lobby { height: 900px; }
.sheet { padding: 40px; display: flex; flex-direction: column; gap: 22px; }
h2 { font-family: Cinzel, serif; color: ${C.gold}; font-size: 26px; letter-spacing: 2px; }
.mut { color: ${C.muted}; font-size: 11px; font-weight: 400; }
/* top */
.top { height: 72px; display: flex; align-items: center; gap: 18px; padding: 0 20px; background: ${C.panel}; border-bottom: 1px solid ${C.line}; }
.logo { font-family: Cinzel, serif; font-weight: 900; font-size: 26px; letter-spacing: 3px; color: ${C.text}; width: 130px; }
.logo span { color: ${C.gold}; }
.players { display: flex; gap: 10px; flex: 1; }
.pc { display: flex; gap: 8px; align-items: center; background: ${C.raised}; border: 1px solid ${C.line}; border-radius: 12px; padding: 6px 10px; min-width: 196px; }
.pc.cur { border-color: ${C.gold}; box-shadow: 0 0 0 1px ${C.gold}; }
.av { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: Cinzel, serif; font-weight: 700; color: #111; font-size: 14px; }
.pcb { display: flex; flex-direction: column; gap: 1px; flex: 1; }
.pcn { font-weight: 600; font-size: 13px; display: flex; gap: 6px; align-items: baseline; }
.pcn em { font-style: normal; color: ${C.gold}; font-size: 10px; }
.pcg { margin-left: auto; color: ${C.gold}; font-size: 12px; }
.hearts { font-size: 10px; letter-spacing: 0.5px; color: ${C.ember}; }
.hearts .dim { color: #4A3F55; }
.pcm { color: ${C.muted}; font-size: 10px; }
.dragon { background: ${C.raised}; border: 1px solid ${C.line}; border-radius: 12px; padding: 6px 12px; min-width: 250px; display: flex; flex-direction: column; gap: 2px; }
.drow { display: flex; align-items: center; gap: 8px; }
.dtitle { font-family: Cinzel, serif; font-weight: 700; color: ${C.ember}; font-size: 12px; }
.rage { display: flex; gap: 3px; }
.rage span { width: 20px; height: 20px; border-radius: 5px; background: #2C2438; display: flex; align-items: center; justify-content: center; font-size: 11px; color: ${C.muted}; }
.rage span.past { background: #4A2A2A; color: #C9A; }
.rage span.on { background: ${C.ember}; color: #fff; font-weight: 700; }
.dmeta { color: ${C.muted}; font-size: 10px; }
/* main */
.main { flex: 1; display: flex; min-height: 0; }
.boardwrap { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; background: ${C.ink}; }
.boardwrap { gap: 18px; padding: 0 18px; }
.legend { width: 230px; display: flex; flex-direction: column; gap: 12px; }
.lg { background: ${C.panel}; border: 1px solid ${C.line}; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; }
.lgh { font-family: Cinzel, serif; font-size: 10px; letter-spacing: 2px; color: ${C.gold}; text-transform: uppercase; }
.lgv { font-family: Cinzel, serif; font-weight: 700; font-size: 15px; }
.lgr { display: flex; justify-content: space-between; font-size: 11.5px; } .lgr span { color: ${C.muted}; } .lgr.dim { opacity: .45; }
.legend .tl { padding-top: 0; font-size: 11px; } .legend .tl i { width: 28px; }
.side { width: 540px; background: ${C.panel}; border-left: 1px solid ${C.line}; padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.sh { display: flex; align-items: baseline; gap: 8px; margin-top: 4px; }
.sh h3 { font-family: Cinzel, serif; font-size: 13px; letter-spacing: 2px; color: ${C.gold}; text-transform: uppercase; }
.grid3 { display: grid; grid-template-columns: repeat(3, 150px); gap: 10px; }
.row4 { display: flex; gap: 10px; }
.row3 { display: flex; gap: 10px; }
.mk { flex: 1; background: ${C.raised}; border: 1px solid ${C.line}; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; }
.mk span { color: ${C.muted}; font-size: 10px; }
.mki { font-size: 20px; }
.log { background: #100D15; border: 1px solid ${C.line}; border-radius: 8px; padding: 8px 10px; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #CDC2DA; display: flex; flex-direction: column; gap: 3px; flex: 1; }
.lt { color: ${C.gold}; } .la { color: ${C.ember}; font-weight: 700; }
/* cards */
.card { position: relative; background: ${C.parch}; color: ${C.inkText}; border-radius: 10px; border: 2px solid #2A2135; overflow: hidden; display: flex; flex-direction: column; box-shadow: inset 0 0 0 3px ${C.parch2}; }
.card.playable { border-color: ${C.gold}; box-shadow: 0 0 0 2px ${C.gold}, 0 6px 14px rgba(0,0,0,.45); }
.banner { color: #fff; font-family: Cinzel, serif; font-weight: 700; font-size: 11px; padding: 5px 8px; display: flex; justify-content: space-between; align-items: center; }
.bic { font-size: 11px; display: flex; gap: 4px; align-items: center; }
.cnt { background: rgba(0,0,0,.35); border-radius: 8px; padding: 0 5px; font-family: Inter; font-size: 10px; }
.art { height: 54px; background-size: cover; background-position: center; border-bottom: 1px solid #2A2135; }
.ctext { padding: 6px 8px; font-size: 10.5px; line-height: 1.3; flex: 1; }
.cfoot { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px 6px; }
.pts { font-family: Cinzel, serif; font-weight: 700; font-size: 11px; color: #7A5A00; }
.cost { background: ${C.inkText}; color: #fff; border-radius: 999px; min-width: 24px; height: 22px; padding: 0 7px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; }
.cost.sw { background: ${C.red}; }
.cact { position: absolute; left: 0; right: 0; bottom: 0; }
.cact .btn { border-radius: 0; width: 100%; justify-content: center; }
/* buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 14px; border-radius: 8px; background: ${C.raised}; border: 1px solid #4A4160; color: ${C.text}; font-weight: 600; font-size: 12.5px; }
.btn.primary { background: ${C.gold}; border-color: ${C.gold}; color: #1A1408; }
.btn.dis { opacity: .4; }
.btn.act { background: ${C.gold}; border: none; color: #1A1408; height: 26px; font-size: 11px; }
.btn.opt { height: 44px; padding: 0 22px; font-size: 14px; border-color: ${C.gold}; }
.btn.big { height: 42px; padding: 0 22px; font-size: 14px; }
/* tray */
.tray { height: 232px; background: ${C.panel}; border-top: 1px solid ${C.line}; display: flex; gap: 20px; padding: 10px 20px; }
.trayl { width: 520px; display: flex; flex-direction: column; gap: 8px; }
.status { font-family: Cinzel, serif; color: ${C.gold}; font-weight: 700; font-size: 13px; }
.chips { display: flex; gap: 6px; }
.chip { background: ${C.raised}; border: 1px solid ${C.line}; border-radius: 10px; padding: 6px 8px; min-width: 64px; text-align: center; }
.chipv { font-size: 17px; font-weight: 700; }
.chipl { color: ${C.muted}; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; }
.acts { display: flex; gap: 8px; }
.tokens { display: flex; gap: 6px; flex-wrap: wrap; }
.tok { background: ${C.raised}; border: 1px solid ${C.line}; border-radius: 8px; padding: 4px 8px; font-size: 11px; display: inline-flex; gap: 6px; align-items: center; }
.tok i { font-style: normal; background: ${C.gold}; color: #1A1408; border-radius: 5px; padding: 0 6px; font-size: 10px; font-weight: 700; }
.zl { color: ${C.muted}; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.hand { flex: 1; }
.fan { display: flex; gap: -10px; }
.fan .card { margin-right: -4px; }
.played { width: 200px; }
.stack { display: flex; gap: 6px; }
/* modal */
.scrim { position: absolute; inset: 0; background: rgba(5,3,8,.66); display: flex; align-items: center; justify-content: center; }
.modal { background: ${C.panel}; border: 1px solid ${C.gold}; border-radius: 16px; padding: 22px 26px; width: 560px; display: flex; flex-direction: column; gap: 16px; box-shadow: 0 30px 80px rgba(0,0,0,.6); }
.mh h3 { font-family: Cinzel, serif; color: ${C.gold}; font-size: 18px; }
.mcards { display: flex; gap: 14px; }
.mopts { display: flex; gap: 10px; }
/* lobby */
.lobby { display: flex; align-items: center; justify-content: center; }
.veil { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(14,11,18,.55), rgba(14,11,18,.85)); }
.glow { position: absolute; border-radius: 50%; filter: blur(80px); opacity: .5; }
.g1 { width: 700px; height: 700px; background: #3A1D2A; left: -200px; top: -250px; }
.g2 { width: 600px; height: 600px; background: #1D2A3A; right: -150px; bottom: -200px; }
.lhero { position: relative; width: 560px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.ltitle { font-family: Cinzel, serif; font-weight: 900; font-size: 96px; letter-spacing: 6px; line-height: 1; }
.ltitle span { color: ${C.gold}; }
.lsub { font-family: Cinzel, serif; letter-spacing: 6px; color: ${C.muted}; font-size: 14px; }
.lp { color: ${C.muted}; font-size: 14px; line-height: 1.5; max-width: 460px; }
.lpanel { width: 100%; background: ${C.panel}; border: 1px solid ${C.line}; border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 16px; text-align: left; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: ${C.muted}; }
.input { background: #100D15; border: 1px solid #4A4160; border-radius: 8px; padding: 10px 12px; color: ${C.text}; font-size: 14px; height: 42px; }
.input.code { width: 110px; text-align: center; letter-spacing: 5px; font-family: Cinzel, serif; font-weight: 700; }
.lrow { display: flex; gap: 10px; align-items: center; }
.or { color: ${C.muted}; }
.lopen { display: flex; flex-direction: column; gap: 6px; }
.og { display: flex; gap: 12px; align-items: center; background: ${C.raised}; border: 1px solid ${C.line}; border-radius: 8px; padding: 8px 12px; }
.og b { font-family: Cinzel, serif; letter-spacing: 2px; color: ${C.gold}; } .og span { flex: 1; color: ${C.muted}; } .og em { font-style: normal; color: ${C.muted}; font-size: 11px; }
.lfoot { color: #5E5370; font-size: 11px; letter-spacing: 1px; }
/* sheet */
.srow { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.sl { width: 90px; color: ${C.muted}; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; padding-top: 6px; }
.room { width: 150px; height: 66px; border-radius: 12px; background: #2A2338; border: 2px solid #7B6D95; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: Cinzel, serif; font-weight: 700; font-size: 12px; gap: 3px; }
.room small { font-family: Inter; font-weight: 400; color: #D9CDEF; font-size: 11px; }
.room.crystal { background: #1F4A5E; } .room.market { background: #5A4318; } .room.fountain { background: #1C5A46; }
.room.here { border-color: #fff; border-width: 3px; } .room.move { border-color: ${C.gold}; border-width: 3px; } .room.tp { border-color: ${C.purple}; border-style: dashed; border-width: 3px; }
.tl { display: flex; gap: 8px; align-items: center; font-size: 12px; padding-top: 6px; }
.tl i { display: inline-block; width: 40px; height: 5px; border-radius: 3px; }
.tl i.dash { background: repeating-linear-gradient(90deg, #5A4E6E 0 8px, transparent 8px 14px); }
.sw { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; width: 70px; }
.sw i { width: 56px; height: 36px; border-radius: 8px; border: 1px solid #000; }
.sw small { color: ${C.muted}; }
`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Clank! redesign draft</title><style>${css}</style></head><body>${lobby}${gameBoard}${gameModal}${sheet}</body></html>`;
fs.writeFileSync(new URL('./mock.html', import.meta.url), html);
console.log('wrote design/mock.html', html.length, 'bytes');
