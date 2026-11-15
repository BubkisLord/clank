/* Clank! browser client */
const $ = (id) => document.getElementById(id);
let STATIC = null;       // cards, secrets, board
let ws = null;
let state = null;
let me = null;           // my player id
let teleportMode = false;
const COLOR = { red: '#e74c3c', blue: '#3498db', green: '#2ecc71', yellow: '#f1c40f' };
// Background art per room type (public/assets/tiles) and per card kind (public/assets/cards)
function tileFor(r) {
  if (r.start) return 'start';
  if (r.crystal) return 'crystal';
  if (r.market) return 'market';
  if (r.fountain) return 'fountain';
  if (r.monkeyShrine) return 'monkey';
  if (r.artifact >= 30) return 'nest';
  if (r.artifact) return 'artifact';
  return r.depths ? 'depths' : 'room';
}
const artFor = (def) => def.reserve ? 'reserve' : (def.tags || []).includes('gem') ? 'gem' : def.kind;

// ---------- connection ----------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    const params = new URLSearchParams(location.search);
    const code = (params.get('g') || '').toUpperCase();
    if (code) {
      $('code').value = code;
      const session = JSON.parse(sessionStorage.getItem('clank:' + code) || 'null');
      const seats = savedSeats(code);
      if (session) send({ type: 'join', code, name: session.name, token: session.token });
      else if (seats.length) {
        $('rejoin').innerHTML = seats.map((s, i) => `<button class="primary" data-seat="${i}">Rejoin game ${code} as ${s.name}</button>`).join('');
        $('rejoin').classList.remove('hidden');
        $('rejoin').querySelectorAll('button').forEach((b) => { b.onclick = () => { const s = seats[Number(b.dataset.seat)]; send({ type: 'join', code, name: s.name, token: s.token }); }; });
      }
    }
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'joined') {
      me = msg.playerId;
      const rec = { token: msg.token, name: $('name').value || 'Thief' };
      sessionStorage.setItem('clank:' + msg.code, JSON.stringify(rec));
      const seats = savedSeats(msg.code).filter((s) => s.token !== rec.token);
      localStorage.setItem('clank:' + msg.code, JSON.stringify([...seats, rec]));
      history.replaceState(null, '', `?g=${msg.code}${location.hash}`);
    } else if (msg.type === 'state') {
      state = msg.state;
      me = state.me;
      render();
    } else if (msg.type === 'kicked') {
      sessionStorage.removeItem('clank:' + msg.code);
      localStorage.removeItem('clank:' + msg.code);
      state = null; me = null;
      $('waiting').classList.add('hidden'); $('game').classList.add('hidden'); $('lobby').classList.remove('hidden');
      history.replaceState(null, '', location.pathname);
      $('lobbyError').textContent = 'The host removed you from the heist.';
      toast('You were removed from the game');
    } else if (msg.type === 'error') {
      toast(msg.message);
      $('lobbyError').textContent = msg.message;
    }
  };
  ws.onclose = () => { toast('Disconnected — reconnecting…'); setTimeout(connect, 1500); };
}
function savedSeats(code) {
  const v = JSON.parse(localStorage.getItem('clank:' + code) || '[]');
  return Array.isArray(v) ? v : [v];
}
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
function act(action) { send({ type: 'action', action }); }

let toastTimer;
function toast(t, kind = '') { const el = $('toast'); el.textContent = t; el.className = kind; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 3000); }

// ---------- mobile tabs ----------
document.body.dataset.tab = 'map';
document.querySelectorAll('#tabbar button').forEach((b) => { b.onclick = () => { document.body.dataset.tab = b.dataset.tab; document.querySelectorAll('#tabbar button').forEach((x) => x.classList.toggle('on', x === b)); }; });
function showTab(t) { const b = document.querySelector(`#tabbar [data-tab="${t}"]`); if (b && window.innerWidth <= 900) b.click(); }

// ---------- lobby ----------
$('createBtn').onclick = () => send({ type: 'create', name: $('name').value || 'Thief' });
$('joinBtn').onclick = () => send({ type: 'join', code: $('code').value, name: $('name').value || 'Thief' });
$('startBtn').onclick = () => send({ type: 'start' });
$('name').value = localStorage.getItem('clank:name') || '';
$('name').onchange = () => localStorage.setItem('clank:name', $('name').value);

async function refreshOpenGames() {
  try {
    const list = await (await fetch('/api/games')).json();
    $('openGames').innerHTML = list.length ? '<div class="muted">Open games:</div>' + list.map((g) => `<button data-code="${g.code}">${g.code} — ${g.players.join(', ')}</button>`).join('') : '';
    $('openGames').querySelectorAll('button').forEach((b) => { b.onclick = () => send({ type: 'join', code: b.dataset.code, name: $('name').value || 'Thief' }); });
  } catch { /* ignore */ }
}
setInterval(() => { if (!state) refreshOpenGames(); }, 4000);

// ---------- helpers ----------
const cdef = (c) => STATIC.cards[typeof c === 'string' ? c : c.id];
const sdef = (id) => STATIC.secrets[id];
const room = (id) => (state?.board?.rooms || []).find((r) => r.id === id) || { id, name: id };
const myPlayer = () => state.players.find((p) => p.id === me);
const isMyTurn = () => state.currentPlayer === me && !!state.turn;
function hearts(dmg) { return '♥'.repeat(10 - dmg) + '<span style="opacity:.3">♥</span>'.repeat(dmg); }

function cardHTML(def, { cost, count, buttons = '', playable = false, small = false } = {}) {
  const kind = def.reserve ? 'reserve ' + def.kind : def.kind;
  const c = cost ?? def.cost;
  const costLabel = def.kind === 'monster' ? `⚔ ${def.swords}` : (c > 0 || def.reserve ? `${c}` : '');
  const icons = (def.dragon ? '🐉' : '') + (def.danger ? '☠' : '');
  const art = artFor(def);
  const subtype = def.kind === 'monster' ? 'Monster' : def.kind === 'device' ? 'Device' : def.tags.includes('gem') ? 'Gem' : def.tags.includes('companion') ? 'Companion' : def.tags.includes('equipment') ? 'Item' : '';
  return `<div class="card ${kind} ${art} ${playable ? 'playable' : ''}" title="${def.text}">
    <div class="art" style="background-image:url(assets/cards/card-${art}.jpg)"></div>
    <div class="banner"><span>${def.name}</span><span>${count != null ? `<span class="count">×${count}</span>` : ''}${icons ? `<span class="icons" title="${def.dragon ? 'Dragon attack when revealed. ' : ''}${def.danger ? 'Danger: +1 cube per attack' : ''}">${icons}</span>` : ''}</span></div>
    ${subtype ? `<div class="subtype">${subtype}</div>` : ''}
    <div class="body">${def.text}</div>
    ${buttons ? `<div class="act">${buttons}</div>` : ''}
    <div class="foot"><span class="pts">${def.points ? def.points + ' pts' : ''}</span>${costLabel ? `<span class="cost">${costLabel}</span>` : ''}</div>
  </div>`;
}

// ---------- render ----------
let seenAttack = null, wasMyTurn = false;
function announce() {
  if (state.lastAttack && state.lastAttack.at !== seenAttack) {
    if (seenAttack !== null) {
      const el = $('banner');
      el.innerHTML = `<img src="assets/dragon.svg" alt=""><div><b>The dragon attacks!</b><span>${state.lastAttack.n} cube${state.lastAttack.n === 1 ? '' : 's'} drawn: ${state.lastAttack.drawn.map((c) => `<i style="background:${COLOR[c] || '#111'}"></i>`).join('')}</span></div>`;
      el.classList.remove('hidden'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 600);
      setTimeout(() => el.classList.add('hidden'), 3800);
    }
    seenAttack = state.lastAttack.at;
  }
  const mine = isMyTurn();
  if (mine && !wasMyTurn && state.phase === 'playing') { toast('Your turn, thief.', 'gold'); }
  wasMyTurn = mine;
  document.title = (mine ? '● ' : '') + 'Clank!';
}
function render() {
  if (!state) return;
  $('lobby').classList.add('hidden');
  if (state.phase === 'lobby') {
    $('waiting').classList.remove('hidden'); $('game').classList.add('hidden');
    scheduleInline();
    $('waitCode').textContent = state.code;
    $('shareLink').textContent = `${location.origin}/?g=${state.code}`;
    const host = state.players[0].id === me;
    $('waitPlayers').innerHTML = state.players.map((p, i) => `<li style="border-color:${COLOR[p.color]}"><span>${p.name}${i === 0 ? ' <em>host</em>' : ''}${p.id === me ? ' <em>you</em>' : ''}</span>${host && i > 0 ? `<button class="kick" data-kick="${p.id}" title="Remove ${p.name} from the game">Kick</button>` : ''}</li>`).join('');
    $('waitPlayers').querySelectorAll('[data-kick]').forEach((b) => { b.onclick = () => { if (confirm(`Remove ${b.title.replace('Remove ', '').replace(' from the game', '')} from the game?`)) send({ type: 'kick', playerId: b.dataset.kick }); }; });
    $('startBtn').disabled = !host;
    const o = state.options || {};
    $('options').innerHTML = `<div class="opt-row"><span>Map</span><div class="seg">${['random', 'classic'].map((m) => `<button data-opt="map" data-val="${m}" class="${o.map === m ? 'on' : ''}" ${host ? '' : 'disabled'}>${m === 'random' ? 'Random dungeon' : 'Classic map'}</button>`).join('')}</div></div>
      <div class="opt-row"><span>Turns</span><div class="seg"><button data-opt="autoEnd" data-val="1" class="${o.autoEnd ? 'on' : ''}" ${host ? '' : 'disabled'}>Auto-end when idle</button><button data-opt="autoEnd" data-val="0" class="${o.autoEnd ? '' : 'on'}" ${host ? '' : 'disabled'}>Manual</button></div></div>`;
    $('options').querySelectorAll('[data-opt]').forEach((b) => { b.onclick = () => send({ type: 'option', key: b.dataset.opt, value: b.dataset.opt === 'autoEnd' ? b.dataset.val === '1' : b.dataset.val }); });
    return;
  }
  $('waiting').classList.add('hidden'); $('game').classList.remove('hidden');
  renderPlayers(); renderDragon(); renderBoard(); renderRow(); renderReserve(); renderMarket(); renderLog(); renderMe(); renderPrompt(); renderResults(); announce();
  scheduleInline();
}

function renderPlayers() {
  $('players').innerHTML = state.players.map((p) => {
    const st = p.status === 'in' ? room(p.room).name : p.status === 'escaped' ? 'Escaped the dungeon' : p.koRescued ? 'Knocked out · rescued' : 'Knocked out · lost';
    const loot = [...p.artifacts.map((a) => `🏺${a}`), p.monkeyIdols ? `🐒${p.monkeyIdols}` : '', p.items.masterKey ? '🔑' : '', p.items.backpack ? '🎒' : '', ...p.items.crowns.map((c) => `👑${c}`), p.mastery ? '🏅' : ''].filter(Boolean).join(' ');
    const hp = Array.from({ length: 10 }, (_, i) => `<i class="${i < 10 - p.damage ? '' : 'off'}"></i>`).join('');
    const cubes = Array.from({ length: Math.min(p.clankArea, 30) }, () => `<i style="background:${COLOR[p.color]}"></i>`).join('');
    const title = `${p.name}: ${10 - p.damage}/10 health · ${p.clankArea} Clank in the area, ${p.inBag} in the bag, ${p.supply} in supply · deck ${p.deckCount}, hand ${p.handCount}, discard ${p.discard.length}${p.connected ? '' : ' · disconnected'}`;
    return `<div class="pl ${p.id === state.currentPlayer ? 'current' : ''} ${p.status !== 'in' ? 'out' : ''}" title="${title}">
      <div class="av" style="background:${COLOR[p.color]}">${p.name[0].toUpperCase()}</div>
      <div style="min-width:0;flex:1">
        <div class="nm"><span>${p.name}${p.id === me ? ' ✦' : ''}${p.connected ? '' : ' ⚠'}</span><span class="g" title="Points if they made it out now">${p.score ?? 0} pts · ${p.gold}g</span></div>
        <div class="loot">${loot}</div>
        <div class="hp" title="Health ${10 - p.damage}/10">${hp}</div>
        <div class="st">${st}${p.onCountdown ? ' · countdown' : ''}</div>
        <div class="cubes" title="${p.clankArea} Clank! in the area">${cubes}</div>
      </div>
    </div>`;
  }).join('');
}

function renderDragon() {
  const track = STATIC.rules.rageTrack.map((v, i) => `<b class="${i === state.rage ? 'on' : i < state.rage ? 'past' : ''}">${v}</b>`).join('');
  const cd = state.countdown ? `<div class="dm">⏳ ${state.players.find((p) => p.id === state.countdown.pid).name} on countdown space <b>${state.countdown.pos + 1}/5</b></div>` : '';
  $('dragon').innerHTML = `<div class="rt"><img src="assets/dragon.svg" alt="">Rage <span class="rage">${track}</span>${state.danger ? `<span title="Danger cards in the row">+${state.danger}☠</span>` : ''}</div>
    <div class="dm">Next attack draws <b>${state.rageValue + state.danger}</b> · bag <b>${state.bag.total}</b> (${state.bag.black} black) · deck <b>${state.dungeonDeckCount}</b></div>${cd}`;
}

function renderBoard() {
  const b = state.board;
  const mp = myPlayer();
  const legal = state.legal;
  const moves = new Map((legal?.moves || []).map((m) => [m.to, m]));
  const tele = new Set(legal?.teleports || []);
  const W = 176, H = 80;
  let s = `<defs>
    <linearGradient id="roomShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0a10" stop-opacity=".15"/><stop offset=".45" stop-color="#0d0a10" stop-opacity=".55"/><stop offset="1" stop-color="#0d0a10" stop-opacity=".9"/></linearGradient>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6a5a46"/></marker>
    <filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter>
  </defs>
  <image href="assets/tiles/tile-room.jpg" x="-20" y="-20" width="1040" height="470" preserveAspectRatio="xMidYMid slice" opacity=".16"/>
  <image href="assets/tiles/tile-depths.jpg" x="-20" y="430" width="1040" height="600" preserveAspectRatio="xMidYMid slice" opacity=".22"/>
  <rect x="0" y="428" width="1000" height="4" fill="#0d0a10"/><rect x="0" y="432" width="1000" height="1" fill="#6a5a46" opacity=".6"/>
  <text x="22" y="462" class="depths-label">✦ THE DEPTHS ✦</text>`;
  for (const t of b.tunnels) {
    const a = room(t.from), c = room(t.to);
    const cls = ['tunnel', t.locked ? 'locked' : '', t.boots ? 'footprints' : '', t.monsters ? 'monsters' : ''].join(' ');
    s += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" class="tunnel-bg"/><line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" class="${cls}" ${t.oneWay ? 'marker-end="url(#arrow)"' : ''}/>`;
    const label = [t.locked ? '🔒' : '', t.boots ? '👣' : '', t.monsters ? '⚔'.repeat(t.monsters) : ''].join('');
    if (label) { const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2; s += `<rect x="${mx - 17}" y="${my - 12}" width="34" height="22" rx="6" class="tlabel-bg"/><text x="${mx}" y="${my + 5}" class="tlabel">${label}</text>`; }
  }
  for (const r of b.rooms) {
    const rs = state.rooms[r.id];
    const cls = ['room', r.start ? 'start' : ''];
    const m = moves.get(r.id);
    let click = '';
    if (isMyTurn() && !state.pending) {
      if (teleportMode && tele.has(r.id)) { cls.push('can-teleport'); click = `data-tp="${r.id}"`; }
      else if (!teleportMode && m && m.ok) { cls.push('can-move'); click = `data-mv="${r.id}"`; }
      else if (!teleportMode && tele.has(r.id) && !(m && m.ok)) { cls.push('can-teleport'); click = `data-tp="${r.id}"`; }
    }
    if (mp && mp.room === r.id && mp.status === 'in') cls.push('here');
    const info = [];
    if (rs.artifact) info.push(`🏺 ${rs.artifact}`);
    if (rs.majorSecret) info.push('★ Major');
    if (rs.minorSecrets.length) info.push(`? ×${rs.minorSecrets.length}`);
    if (rs.monkeyIdols) info.push(`🐒 ×${rs.monkeyIdols}`);
    if (r.crystal) info.push('💎 cave');
    if (r.market) info.push('🛒 market');
    if (r.fountain) info.push('⛲ heal 1');
    if (r.start) info.push('🏅 exit');
    let title = r.name;
    if (m) title += m.ok ? ` — move (${m.cost} boot${m.cost > 1 ? 's' : ''}${m.monsters ? `, ${m.swordsUsed} sword(s) used, ${m.damage} damage` : ''})` : ` — ${m.reason}`;
    const rx = r.x - W / 2, ry = r.y - H / 2;
    s += `<g ${click}><title>${title}</title><clipPath id="clip-${r.id}"><rect x="${rx}" y="${ry}" width="${W}" height="${H}" rx="12"/></clipPath>
      <image href="assets/tiles/tile-${tileFor(r)}.jpg" x="${rx}" y="${ry}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${r.id})"/>
      <rect x="${rx}" y="${ry}" width="${W}" height="${H}" rx="12" class="${cls.join(' ')}"/>
      <text x="${r.x}" y="${r.y + 6}" class="rname">${r.name}</text><text x="${r.x}" y="${r.y + 26}" class="rinfo">${info.join('   ')}</text></g>`;
    const here = state.players.filter((p) => p.room === r.id && p.status === 'in');
    here.forEach((p, i) => { const cx = rx + 16 + i * 24, cy = ry + 2; const cur = p.id === state.currentPlayer; s += `<g class="pawn-g">${cur ? `<circle cx="${cx}" cy="${cy}" r="11" class="pawn-ring" fill="none" stroke="${COLOR[p.color]}"/>` : ''}<circle cx="${cx}" cy="${cy}" r="11" class="pawn" fill="${COLOR[p.color]}"><title>${p.name}${cur ? ' (taking their turn)' : ''}</title></circle><text x="${cx}" y="${cy + 4}" class="pawn-l">${p.name[0].toUpperCase()}</text></g>`; });
  }
  $('board').innerHTML = s;
  $('board').querySelectorAll('[data-mv]').forEach((g) => { g.onclick = () => act({ type: 'move', to: g.dataset.mv }); });
  $('board').querySelectorAll('[data-tp]').forEach((g) => { g.onclick = () => { teleportMode = false; act({ type: 'teleport', to: g.dataset.tp }); }; });
  renderHud(moves, tele);
}

function renderHud(moves, tele) {
  const mp = myPlayer();
  const r = room(mp.room);
  const t = state.turn;
  let h = '';
  if (mp.status === 'in') {
    const feats = [r.crystal ? '💎 Crystal cave' : '', r.market ? '🛒 Market' : '', r.fountain ? '⛲ Fountain' : '', r.depths ? 'in the Depths' : '', r.start ? 'outside the dungeon' : ''].filter(Boolean).join(' · ');
    h += `<div class="hud"><div class="k">You are in</div><div class="v">${r.name}</div>${feats ? `<div class="m">${feats}</div>` : ''}</div>`;
  }
  if (isMyTurn() && !state.pending) {
    const exhausted = t.enteredCrystalCave && !t.flags.ignoreCrystalCaves;
    const rows = [...moves.values()].map((m) => `<div class="r ${m.ok ? '' : 'dim'}"><b>${room(m.to).name}</b><span>${m.ok ? `${m.cost}👢${m.damage ? ` ${m.damage}💔` : ''}${m.monsters && !m.damage ? ' ⚔' : ''}` : exhausted ? '' : m.reason}</span></div>`).join('');
    const tp = tele.size ? `<div class="m">✨ ${tele.size} room${tele.size > 1 ? 's' : ''} by teleport</div>` : '';
    h += `<div class="hud tunnels"><div class="k">${exhausted ? 'Exhausted — no more boots' : 'Tunnels from here'}</div>${rows}${tp}</div>`;
  } else if (state.pending && state.pending.pid !== me) {
    h += `<div class="hud"><div class="m">${state.players.find((p) => p.id === state.pending.pid)?.name} is deciding…</div></div>`;
  }
  $('boardHud').innerHTML = h;
}

function renderRow() {
  const L = state.legal;
  $('deckInfo').textContent = `(${state.dungeonDeckCount} in deck)`;
  $('dungeonRow').innerHTML = state.dungeonRow.map((c, i) => {
    if (!c) return '<div class="card empty"></div>';
    const d = cdef(c);
    let btn = '';
    if (isMyTurn() && !state.pending) {
      if (d.kind === 'monster' && L?.fightable.includes(i)) btn = `<button data-fight="${i}">Fight</button>`;
      if (d.kind !== 'monster' && L?.acquirable.includes(i)) btn = `<button data-acq="${i}">${d.kind === 'device' ? 'Use' : 'Acquire'}</button>`;
    }
    const disc = (state.turn?.gemDiscount && d.tags.includes('gem')) ? Math.max(0, d.cost - state.turn.gemDiscount) : undefined;
    return cardHTML(d, { buttons: btn, cost: disc });
  }).join('');
  wireButtons($('dungeonRow'));
}

function renderReserve() {
  const L = state.legal;
  const ids = ['mercenary', 'explore', 'secret_tome', 'goblin'];
  $('reserve').innerHTML = ids.map((id) => {
    const d = cdef(id);
    const count = id === 'goblin' ? null : state.reserve[id];
    let btn = '';
    if (isMyTurn() && !state.pending) {
      if (id === 'goblin' && L?.canFightGoblin) btn = '<button data-fight="goblin">Fight</button>';
      else if (L?.reserveBuy.includes(id)) btn = `<button data-acq="${id}">Acquire</button>`;
    }
    return cardHTML(d, { count, buttons: btn });
  }).join('');
  wireButtons($('reserve'));
}

function wireButtons(root) {
  root.querySelectorAll('[data-fight]').forEach((b) => { b.onclick = () => act({ type: 'fight', slot: b.dataset.fight === 'goblin' ? 'goblin' : Number(b.dataset.fight) }); });
  root.querySelectorAll('[data-acq]').forEach((b) => { b.onclick = () => act({ type: 'acquire', slot: /^\d+$/.test(b.dataset.acq) ? Number(b.dataset.acq) : b.dataset.acq }); });
}

function renderMarket() {
  const L = state.legal;
  const m = state.market;
  const items = [
    ['masterKey', '🔑 Master Key', `${m.masterKey} left · 5 pts · opens locks`],
    ['backpack', '🎒 Backpack', `${m.backpack} left · 5 pts · carry +1 artifact`],
    ['crown', '👑 Crown', m.crowns.length ? `next: ${m.crowns[0]} pts (${m.crowns.join('/')})` : 'none left'],
  ];
  $('market').innerHTML = items.map(([k, n, d]) => `<div class="mk"><b>${n}</b><span class="muted">${d}</span>${isMyTurn() && L?.canBuy.includes(k) ? `<button data-buy="${k}">Buy (7g)</button>` : ''}</div>`).join('');
  $('market').querySelectorAll('[data-buy]').forEach((b) => { b.onclick = () => act({ type: 'buy', item: b.dataset.buy }); });
}

function renderLog() {
  const el = $('log');
  el.innerHTML = state.logs.map((l) => `<div class="${l.t.startsWith('DRAGON ATTACK') ? 'attack' : l.t.startsWith('—') ? 'turn' : ''}">${l.t}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function renderMe() {
  const p = myPlayer();
  const t = state.turn;
  const mine = isMyTurn();
  const cur = state.players.find((x) => x.id === state.currentPlayer);
  let status;
  if (p.status === 'escaped' && mine) status = `You escaped${p.mastery ? ' with a Mastery token' : ''}! Spend what you have left, then end your turn.`;
  else if (p.status !== 'in') status = p.status === 'escaped' ? `You escaped${p.mastery ? ' with a Mastery token' : ''}! Waiting for the others…` : p.koRescued ? 'You were knocked out but rescued — your loot counts.' : 'You were knocked out in the dungeon. Better luck next heist.';
  else if (mine) status = state.pending ? 'Make your choice…' : p.hand.length ? 'Your turn — play your cards' : 'Spend your skill, swords and boots';
  else status = `${cur?.name ?? '…'} is sneaking about${state.pending ? ' (deciding…)' : ''}`;
  $('status').textContent = status;
  $('status').className = mine ? 'yours' : '';

  const res = mine ? t : { skill: 0, swords: 0, boots: 0, teleports: 0 };
  $('resources').innerHTML = [['Skill', res.skill, '🧠'], ['Swords', res.swords, '⚔'], ['Boots', res.boots, '👢'], ['Gold', p.gold, '🪙'], ['Teleport', res.teleports || 0, '✨'], ['Health', 10 - p.damage, '♥']]
    .map(([n, v, ic]) => `<div class="res ${v === 0 && n !== 'Health' ? 'zero' : ''}" title="${n}">${ic} <b>${v}</b><small>${n}</small></div>`).join('')
    + (mine && t.negativeClank ? `<div class="res" title="Negative Clank! available"><b>-${t.negativeClank}</b><small>clank</small></div>` : '')
    + (mine && t.enteredCrystalCave && !t.flags.ignoreCrystalCaves ? `<div class="res" title="You entered a Crystal Cave">💎<small>exhausted</small></div>` : '');

  let a = '';
  if (mine && !state.pending) {
    const L = state.legal;
    if (p.hand.length) a += `<button id="playAll" class="primary">Play all cards</button>`;
    if (L?.canTakeArtifact) a += `<button id="takeArt" class="primary">Take Artifact (${state.rooms[p.room].artifact})</button>`;
    if (t.teleports > 0 && p.status === 'in') a += `<button id="tpMode" ${teleportMode ? 'class="primary"' : ''}>${teleportMode ? 'Cancel teleport' : `Teleport (${t.teleports})`}</button>`;
    for (const d of L?.deferred || []) a += `<button class="resume" data-resume="${d.i}" title="Return to this postponed choice">↩ ${d.title}</button>`;
    a += `<button id="endTurn" class="${!p.hand.length && !L?.hasAction ? 'primary' : ''}">End turn${p.hand.length ? ` (${p.hand.length} unplayed)` : ''}</button>`;
  }
  $('actions').innerHTML = a;
  $('actions').querySelectorAll('[data-resume]').forEach((b) => { b.onclick = () => act({ type: 'resume', index: Number(b.dataset.resume) }); });
  if ($('playAll')) $('playAll').onclick = () => act({ type: 'playAll' });
  if ($('takeArt')) $('takeArt').onclick = () => act({ type: 'takeArtifact' });
  if ($('tpMode')) $('tpMode').onclick = () => { teleportMode = !teleportMode; render(); };
  if ($('endTurn')) $('endTurn').onclick = () => {
    const unplayed = p.hand.length, postponed = (state.legal?.deferred || []).length;
    if ((unplayed || postponed) && !confirm(`End your turn now?${unplayed ? ` ${unplayed} card${unplayed > 1 ? 's' : ''} in hand will be discarded unplayed.` : ''}${postponed ? ' Postponed choices will lapse.' : ''}`)) return;
    act({ type: 'endTurn' });
  };

  $('hand').innerHTML = (p.hand || []).map((c) => `<div data-play="${c.uid}">${cardHTML(cdef(c), { playable: mine && !state.pending })}</div>`).join('') || `<span class="muted">${mine ? 'All cards played — spend your resources, then end your turn.' : 'Waiting for your next hand.'}</span>`;
  if (mine) $('hand').querySelectorAll('[data-play]').forEach((d) => { d.onclick = () => { if (!state.pending) act({ type: 'play', uid: d.dataset.play }); }; });
  $('playArea').innerHTML = p.playArea.map((c) => cardHTML(cdef(c))).join('') || '<span class="muted">nothing yet</span>';

  const toks = [];
  for (const s of p.secrets) { const d = sdef(s.id); toks.push(`<div class="tok" title="${d.text}">${d.name}${d.use === 'held' && mine && !state.pending ? `<button data-use="${s.uid}">Use</button>` : ''}</div>`); }
  for (const v of p.artifacts) toks.push(`<div class="tok">🏺 Artifact ${v}</div>`);
  if (p.monkeyIdols) toks.push(`<div class="tok">🐒 Monkey Idol ×${p.monkeyIdols} (5 pts each)</div>`);
  if (p.items.masterKey) toks.push(`<div class="tok">🔑 Master Key ×${p.items.masterKey}</div>`);
  if (p.items.backpack) toks.push(`<div class="tok">🎒 Backpack ×${p.items.backpack}</div>`);
  for (const c of p.items.crowns) toks.push(`<div class="tok">👑 Crown ${c}</div>`);
  if (p.mastery) toks.push(`<div class="tok">🏅 Mastery (20 pts)</div>`);
  toks.push(`<div class="tok muted">deck ${p.deckCount} · discard ${p.discard.length} · trashed ${p.trashedCount}</div>`);
  $('tokens').innerHTML = toks.join('');
  $('tokens').querySelectorAll('[data-use]').forEach((b) => { b.onclick = () => act({ type: 'useSecret', uid: b.dataset.use }); });
}

function renderPrompt() {
  const pr = state.pending;
  if (!pr || pr.pid !== me || !pr.options) { $('prompt').classList.add('hidden'); return; }
  $('prompt').classList.remove('hidden');
  $('promptTitle').innerHTML = `<span>${pr.title}</span>${isMyTurn() ? '<button id="deferBtn" class="defer" title="Close this and come back to it later this turn">✕ Decide later</button>' : ''}`;
  $('promptOptions').innerHTML = pr.options.map((o, i) => o.card ? `<div data-opt="${i}">${cardHTML(o.card, { playable: true })}</div>` : `<button class="opt" data-opt="${i}">${o.label}</button>`).join('');
  $('promptOptions').querySelectorAll('[data-opt]').forEach((el) => { el.onclick = () => act({ type: 'resolve', value: pr.options[Number(el.dataset.opt)].value }); });
  if ($('deferBtn')) $('deferBtn').onclick = () => act({ type: 'defer' });
}

function renderResults() {
  if (state.phase !== 'ended' || !state.results) { $('results').classList.add('hidden'); return; }
  $('results').classList.remove('hidden');
  const rows = state.results.map((r, i) => {
    const b = r.breakdown;
    return `<tr><td style="color:${COLOR[r.color]}">${i === 0 && r.total != null ? '🏆 ' : ''}${r.name}</td><td>${r.survived ? '' : 'lost'}</td><td>${b.artifacts}</td><td>${b.secrets + b.monkeyIdols}</td><td>${b.items}</td><td>${b.gold}</td><td>${b.cards + b.bonus}</td><td>${b.mastery}</td><th>${r.total ?? '—'}</th></tr>`;
  }).join('');
  $('resultsBody').innerHTML = `<table class="score"><tr><th>Player</th><th></th><th>Artifact</th><th>Secrets/Idols</th><th>Items</th><th>Gold</th><th>Cards</th><th>Mastery</th><th>Total</th></tr>${rows}</table>`;
}

// ---------- Figma capture support: inline image assets as data URIs so captures keep the art ----------
const _dataCache = {};
async function toDataUri(url) {
  if (!_dataCache[url]) _dataCache[url] = fetch(url).then((r) => r.blob()).then((b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }));
  return _dataCache[url];
}
let inlineTimer = null;
async function inlineAssetsForCapture() {
  for (const el of document.querySelectorAll('[style*="background-image"]')) {
    const m = el.style.backgroundImage.match(/url\(["']?([^"')]+)/);
    if (m && !m[1].startsWith('data:')) el.style.backgroundImage = `url(${await toDataUri(m[1])})`;
  }
  for (const im of document.querySelectorAll('svg image')) { const h = im.getAttribute('href'); if (h && !h.startsWith('data:')) im.setAttribute('href', await toDataUri(h)); }
  for (const img of document.querySelectorAll('img')) { const src = img.getAttribute('src'); if (src && !src.startsWith('data:')) img.src = await toDataUri(src); }
  for (const [id, url, extra] of [['lobby', 'assets/bg-lobby.jpg', 'radial-gradient(ellipse at 50% 30%, rgba(13,10,16,.2), rgba(13,10,16,.92)), '], ['waiting', 'assets/bg-lobby.jpg', 'radial-gradient(ellipse at 50% 30%, rgba(13,10,16,.2), rgba(13,10,16,.92)), ']]) {
    const el = $(id); if (el && !el.classList.contains('hidden')) { el.style.backgroundImage = `${extra}url(${await toDataUri(url)})`; el.style.backgroundAttachment = 'scroll'; }
  }
}
function scheduleInline() { if (!location.hash.includes('figmacapture')) return; clearTimeout(inlineTimer); inlineTimer = setTimeout(inlineAssetsForCapture, 400); }

// ---------- boot ----------
(async () => {
  STATIC = await (await fetch('/api/static')).json();
  refreshOpenGames();
  connect();
  scheduleInline();
})();
