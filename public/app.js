/* Clank! browser client */
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
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
        $('rejoin').innerHTML = seats.map((s, i) => `<button class="primary" data-seat="${i}">Rejoin game ${code} as ${esc(s.name)}</button>`).join('');
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
      if (state.customCards) Object.assign(STATIC.cards, state.customCards); // cards from a custom deck
      const wait = holdUntil - Date.now();
      clearTimeout(holdTimer);
      if (wait > 0) holdTimer = setTimeout(render, wait); else render();
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
      if (leaving.size) { leaving.clear(); if (state) render(); }
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
// while an animation is running, incoming updates wait until it finishes
let holdUntil = 0, holdTimer = null;
const holdFor = (ms) => { holdUntil = Math.max(holdUntil, Date.now() + ms); };

// In-page yes/no dialog (the browser's confirm() is blocked in some embedded browsers). Resolves true or false.
let confirmDone = null;
function askConfirm(message, { ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  if (confirmDone) confirmDone(false);
  $('confirmText').textContent = message;
  $('confirmYes').textContent = ok; $('confirmNo').textContent = cancel;
  $('confirmYes').classList.toggle('danger', danger); $('confirmYes').classList.toggle('primary', !danger);
  $('confirm').classList.remove('hidden');
  $('confirmYes').focus();
  return new Promise((resolve) => { confirmDone = (v) => { confirmDone = null; $('confirm').classList.add('hidden'); resolve(v); }; });
}
$('confirmYes').onclick = () => confirmDone?.(true);
$('confirmNo').onclick = () => confirmDone?.(false);
$('confirm').addEventListener('click', (e) => { if (e.target === $('confirm')) confirmDone?.(false); });
document.addEventListener('keydown', (e) => { if (confirmDone && e.key === 'Escape') { e.stopImmediatePropagation(); confirmDone(false); } }, true);

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
$('shareLink').onclick = async () => {
  const text = $('shareLink').textContent;
  try { await navigator.clipboard.writeText(text); }
  catch { // plain-http LAN addresses have no clipboard API: fall back to a hidden textarea
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  $('shareLink').classList.add('copied'); setTimeout(() => $('shareLink').classList.remove('copied'), 1200);
  toast('Link copied to clipboard');
};

// ---------- leaving / dialogs ----------
function leaveGame() {
  const code = state?.code;
  send({ type: 'leave' });
  if (code) { sessionStorage.removeItem('clank:' + code); localStorage.removeItem('clank:' + code); }
  state = null; me = null; resultsDismissed = false; viewOwn = false;
  ['waiting', 'game', 'prompt', 'results', 'viewer'].forEach((id) => $(id).classList.add('hidden'));
  $('lobby').classList.remove('hidden');
  $('code').value = ''; $('rejoin').classList.add('hidden'); $('lobbyError').textContent = '';
  history.replaceState(null, '', location.pathname);
  document.title = 'Clank!';
  refreshOpenGames();
}
let resultsDismissed = false;
function closeModal(id) {
  if (id === 'viewer') $('viewer').classList.add('hidden');
  else if (id === 'pileView') { $('pileView').classList.add('hidden'); pileOpen = null; }
  else if (id === 'prompt') { if (isMyTurn() && state.pending) act({ type: 'defer' }); }
  else if (id === 'results') { resultsDismissed = true; $('results').classList.add('hidden'); }
}
for (const id of ['viewer', 'pileView', 'prompt', 'results']) $(id).addEventListener('click', (e) => { if (e.target === $(id)) closeModal(id); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const id of ['pileView', 'viewer', 'results', 'prompt']) if (!$(id).classList.contains('hidden')) return closeModal(id);
});
$('leaveBtn').onclick = leaveGame;
$('resultsClose').onclick = () => closeModal('results');
$('name').value = localStorage.getItem('clank:name') || '';
$('name').onchange = () => localStorage.setItem('clank:name', $('name').value);

// decks the host can pick in the waiting room
let deckList = null;
async function loadDeckList() {
  try { deckList = await (await fetch('/api/decks')).json(); if (state?.phase === 'lobby') render(); } catch { /* keep the current one */ }
}

async function refreshOpenGames() {
  try {
    const list = await (await fetch('/api/games')).json();
    $('openGames').innerHTML = list.length ? '<div class="muted">Open games:</div>' + list.map((g) => `<button data-code="${g.code}">${g.code} — ${esc(g.players.join(', '))}</button>`).join('') : '';
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

// Card text with its keywords coloured: "+2 Skill", "Draw a card", "+1 Clank!" and so on.
const KEYWORDS = [
  ['skill', 'Skill'], ['swords', 'Swords?'], ['boots', 'Boots?'], ['gold', 'Gold'], ['clank', 'Clank!?'],
  ['draw', String.raw`[Dd]raws?(?:\s+(?:a|one|two|three|\d+)\s+cards?)?`], ['heal', String.raw`[Hh]eal(?:\s+\d+)?`], ['teleport', 'Teleport'], ['trash', 'Trash'],
  ['danger', 'Dragon Attack|Danger'], ['points', 'points?|pts'],
];
const KW_RE = new RegExp(String.raw`([+−-]?\d+\s+)?\b(${KEYWORDS.map(([, re]) => `(${re})`).join('|')})(?!\w)`, 'g');
function richText(text) {
  return esc(text)
    .replace(KW_RE, (m, num, word, ...groups) => {
      const i = groups.slice(0, KEYWORDS.length).findIndex((g) => g !== undefined);
      return `<b class="kw kw-${KEYWORDS[i][0]}">${m}</b>`;
    })
    .replace(/\b(Defeat|Arrive|Acquire):/g, '<b class="kw-when">$1:</b>');
}

function cardHTML(def, { cost, count, buttons = '', playable = false, small = false, cls = '', attrs = '' } = {}) {
  const kind = def.reserve ? 'reserve ' + def.kind : def.kind;
  const c = cost ?? def.cost;
  const costLabel = def.kind === 'monster' ? `⚔ ${def.swords}` : (c > 0 || def.reserve ? `${c}` : '');
  const badges = (def.dragon ? '<span class="badge dragon-ic" title="Dragon Attack: the dragon attacks when this card enters the Dungeon Row"><img src="assets/dragon.svg" alt="Dragon"></span>' : '')
    + (def.danger ? '<span class="badge danger-ic" title="Danger: each dragon attack draws 1 extra cube while this is in the row">☠</span>' : '');
  const art = artFor(def);
  const subtype = def.kind === 'monster' ? 'Monster' : def.kind === 'device' ? 'Device' : def.tags.includes('gem') ? 'Gem' : def.tags.includes('companion') ? 'Companion' : def.tags.includes('equipment') ? 'Item' : '';
  return `<div class="card ${kind} ${art} ${playable ? 'playable' : ''} ${cls}" title="${esc(def.text)}" ${attrs}>
    <div class="banner"><span>${esc(def.name)}</span><span>${count != null ? `<span class="count">×${count}</span>` : ''}</span></div>
    ${subtype ? `<div class="subtype">${subtype}</div>` : ''}
    <div class="body">${richText(def.text)}</div>
    ${buttons ? `<div class="act">${buttons}</div>` : ''}
    <div class="foot"><span class="pts">${def.points ? def.points + ' pts' : ''}</span><span class="fr">${badges}${costLabel ? `<span class="cost">${costLabel}</span>` : ''}</span></div>
  </div>`;
}

// ---------- render ----------
// Dragon attacks are numbered by the server; every one newer than the last we saw gets a banner,
// queued so two attacks in one update both show.
let seenAttack, seenCode, wasMyTurn = false, bannerBusy = false;
const bannerQueue = [];
function showNextBanner() {
  if (bannerBusy || !bannerQueue.length) return;
  bannerBusy = true;
  const a = bannerQueue.shift();
  const name = (pid) => esc(state.players.find((p) => p.id === pid)?.name ?? '?');
  const hits = a.hits?.length ? a.hits.map((h) => `${h.pid === me ? '<em>You</em>' : name(h.pid)} take${h.pid === me ? '' : 's'} ${h.dmg} damage`).join(' · ') : 'Nobody was hurt';
  const el = $('banner');
  el.innerHTML = `<img src="assets/dragon.svg" alt=""><div><b>The dragon attacks!</b><span>${a.n} cube${a.n === 1 ? '' : 's'} drawn: ${a.drawn.map((c) => `<i style="background:${COLOR[c] || '#111'}"></i>`).join('') || 'the bag was empty'}</span><span class="hits">${hits}</span></div>`;
  el.classList.toggle('hurt', !!a.hits?.some((h) => h.pid === me));
  el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
  const fl = $('flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
  document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 600);
  setTimeout(() => { el.classList.add('hidden'); bannerBusy = false; showNextBanner(); }, 4200);
}
function announce() {
  if (seenCode !== state.code) { seenCode = state.code; seenAttack = state.attackSeq ?? 0; } // do not replay old attacks on join
  for (const a of state.attacks || []) if (a.seq > seenAttack) bannerQueue.push(a);
  seenAttack = Math.max(seenAttack, state.attackSeq ?? 0);
  showNextBanner();
  const mine = isMyTurn();
  if (mine && !wasMyTurn && state.phase === 'playing') { toast('Your turn!', 'gold'); }
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
    $('waitPlayers').innerHTML = state.players.map((p, i) => `<li style="border-color:${COLOR[p.color]}"><span>${esc(p.name)}${i === 0 ? ' <em>host</em>' : ''}${p.id === me ? ' <em>you</em>' : ''}${p.bot ? ` <em>${esc(p.botStyle || 'computer')}</em>` : ''}</span>${host && i > 0 ? `<button class="kick" data-kick="${p.id}" title="Remove ${esc(p.name)} from the game">${p.bot ? 'Remove' : 'Kick'}</button>` : ''}</li>`).join('')
      + (host && state.players.length < 4 ? `<li class="addbot"><button id="addBot" title="Add a computer-controlled player">＋ Add a bot player</button></li>` : '');
    if ($('addBot')) $('addBot').onclick = () => send({ type: 'addBot' });
    $('waitPlayers').querySelectorAll('[data-kick]').forEach((b) => { b.onclick = () => { if (state.players.find((x) => x.id === b.dataset.kick)?.bot) return send({ type: 'kick', playerId: b.dataset.kick }); askConfirm(`Remove ${b.title.replace('Remove ', '').replace(' from the game', '')} from the game?`, { ok: 'Kick', danger: true }).then((yes) => { if (yes) send({ type: 'kick', playerId: b.dataset.kick }); }); }; });
    $('startBtn').disabled = !host;
    const o = state.options || {};
    const dis = host ? '' : 'disabled';
    const seg = (key, cur, items) => `<div class="seg">${items.map(([v, l, tip]) => `<button data-opt="${key}" data-val="${v}" class="${cur === v ? 'on' : ''}" title="${tip}" ${dis}>${l}</button>`).join('')}</div>`;
    $('options').innerHTML = `<span class="opt-l">Deck</span><div class="deck-pick">${host
        ? `<select id="deckSel" title="Which cards stock the dungeon deck">${(deckList || [{ id: o.deck, name: o.deckName }]).map((d) => `<option value="${esc(d.id)}" ${d.id === o.deck ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`
        : `<b>${esc(o.deckName || 'Base game')}</b>`}</div>`
      + `<span class="opt-l">Game</span>`
      + seg('map', o.map, [['random', 'Random dungeon', 'A new dungeon layout every game'], ['classic', 'Classic map', 'The standard board']])
      + seg('autoEnd', o.autoEnd ? '1' : '0', [['1', 'Auto-end', 'End your turn automatically once your hand is empty'], ['0', 'Manual', 'Press End turn yourself']])
      + (state.players.some((p) => p.bot) ? `<span class="opt-l">Bots</span>`
        + seg('botLevel', o.botLevel || 'medium', [['easy', 'Easy', 'Sloppy: misjudges cards, wounds and prompts'], ['medium', 'Medium', 'Solid, straightforward play'], ['hard', 'Hard', 'Plans detours and races rivals to artifacts']])
        + seg('botPace', o.botPace || 'mixed', [['reckless', 'Reckless', 'Bots grab the nearest artifact and run: shorter games'], ['mixed', 'Mixed', 'A mix of fast and slow bots'], ['patient', 'Patient', 'Bots build their decks and delve deep: longer games']]) : '');
    if ($('deckSel')) { $('deckSel').onchange = (e) => send({ type: 'option', key: 'deck', value: e.target.value }); if (!deckList) loadDeckList(); }
    $('options').querySelectorAll('[data-opt]').forEach((b) => { b.onclick = () => send({ type: 'option', key: b.dataset.opt, value: b.dataset.opt === 'autoEnd' ? b.dataset.val === '1' : b.dataset.val }); });
    return;
  }
  $('waiting').classList.add('hidden'); $('game').classList.remove('hidden');
  renderPlayers(); renderDragon(); renderBoard(); renderRow(); renderReserve(); renderMarket(); renderLog(); renderMe(); renderPrompt(); renderResults(); announce();
  if (pileOpen) { const pp = state.players.find((x) => x.id === pileOpen.pid); if (pp) showPile(pp, pileOpen.which); }
  if (!$('viewer').classList.contains('hidden')) { // keep an open player sheet live
    const box = $('viewer').querySelector('.modal-box'), y = box.scrollTop;
    const vp = state.players.find((x) => x.id === $('viewer').dataset.pid);
    if (vp) { showCards(vp); box.scrollTop = y; }
  }
  scheduleInline();
}

function renderPlayers() {
  $('players').innerHTML = state.players.map((p) => {
    const st = p.status === 'in' ? room(p.room).name : p.status === 'escaped' ? 'Escaped the dungeon' : p.koRescued ? 'Knocked out · rescued' : 'Knocked out · lost';
    const secretIcons = p.secrets.map((sx) => ({ chalice: '🏆', dragon_egg: '🥚', treasure: '💰', greater_treasure: '💰' }[sx.id] || '🧪')).join('');
    const loot = [...p.artifacts.map((a) => `🏺${a}`), p.monkeyIdols ? `🐒${p.monkeyIdols}` : '', p.items.masterKey ? '🔑' : '', p.items.backpack ? '🎒' : '', ...p.items.crowns.map((c) => `👑${c}`), p.mastery ? '🏅' : '', secretIcons].filter(Boolean).join(' ');
    const hp = Array.from({ length: 10 }, (_, i) => `<i class="${i < 10 - p.damage ? '' : 'off'}"></i>`).join('');
    const cubes = Array.from({ length: Math.min(p.clankArea, 8) }, () => `<i style="background:${COLOR[p.color]}"></i>`).join('') + (p.clankArea > 8 ? `<b>+${p.clankArea - 8}</b>` : '');
    const title = `${esc(p.name)}: ${10 - p.damage}/10 health · ${p.clankArea} Clank in the area, ${p.inBag} in the bag, ${p.supply} in supply · deck ${p.deckCount}, hand ${p.handCount}, discard ${p.discard.length}${p.connected ? '' : ' · disconnected'}`;
    return `<div class="pl ${p.id === state.currentPlayer ? 'current' : ''} ${p.status !== 'in' ? 'out' : ''}" title="${title} — click to inspect their cards" data-inspect="${p.id}">
      <div class="av" style="background:${COLOR[p.color]}">${esc(p.name[0].toUpperCase())}</div>
      <div style="min-width:0;flex:1">
        <div class="nm"><span>${esc(p.name)}${p.id === me ? ' ✦' : ''}${p.connected ? '' : ' ⚠'}</span><span class="g" title="Points if they made it out now">${p.score ?? 0} pts · ${p.gold}g</span></div>
        <div class="r2"><div class="hp" title="Health ${10 - p.damage}/10">${hp}</div><div class="loot">${loot}</div></div>
        <div class="r3"><div class="st">${st}${p.onCountdown ? ' · countdown' : ''}</div><div class="cubes" title="${p.clankArea} Clank! in the area">${cubes}</div></div>
      </div>
    </div>`;
  }).join('');
  $('players').querySelectorAll('[data-inspect]').forEach((el) => { el.onclick = () => showCards(state.players.find((x) => x.id === el.dataset.inspect)); });
}

// ---------- card viewer (deck is alphabetical; discard in play order, newest first) ----------
// one pile in a small dialog: deck (alphabetical), discard (newest first), trashed, or this turn's play area
let pileOpen = null;
function showPile(p, which) {
  const whose = p.id === me ? 'Your' : `${esc(p.name)}'s`;
  const P = {
    deck: ['deck', p.deck, true, 'shown alphabetically, not in draw order'],
    discard: ['discard pile', [...p.discard].reverse(), false, 'newest first'],
    trashed: ['trashed cards', p.trashed, true, 'removed from the game'],
    played: ['play area', p.playArea, false, 'played this turn, in order'],
  }[which];
  const [name, cards, grouped, note] = P;
  const box = $('pileView').querySelector('.modal-box'), y = box.scrollTop;
  $('pileTitle').innerHTML = `<span>${whose} ${name} <small>${plural(cards.length, 'card')} · ${note}</small></span><button id="pileClose" class="defer">✕ Close</button>`;
  $('pileBody').innerHTML = cards.length
    ? `<div class="cards">${grouped ? groupCards(cards).map((g) => cardHTML(g.def, { count: g.n > 1 ? g.n : undefined })).join('') : cards.map((c) => cardHTML(cdef(c))).join('')}</div>`
    : '<p class="muted">No cards here.</p>';
  $('pileClose').onclick = () => closeModal('pileView');
  const reopen = pileOpen && pileOpen.pid === p.id && pileOpen.which === which;
  pileOpen = { pid: p.id, which };
  $('pileView').classList.remove('hidden');
  box.scrollTop = reopen ? y : 0;
}

function groupCards(cards) {
  const m = new Map();
  for (const c of cards) { const d = cdef(c); const g = m.get(d.id) || { def: d, n: 0 }; g.n++; m.set(d.id, g); }
  return [...m.values()].sort((x, y) => x.def.name.localeCompare(y.def.name));
}
function showCards(p, focus) {
  p = state.players.find((x) => x.id === p.id) || p; // always the freshest copy
  const handNote = p.hand ? (p.id === me ? '' : 'visible while it is their turn') : `${plural(p.handCount, 'card')}, hidden until their turn`;
  const sections = [
    ['Hand', p.hand || [], handNote, false],
    ['Play area', p.playArea, '', false],
    ['Deck', p.deck, `${plural(p.deckCount, 'card')}, shown alphabetically`, true],
    ['Discard pile', [...p.discard].reverse(), `${plural(p.discard.length, 'card')}, newest first`, false],
    ['Trashed', p.trashed, 'removed from the game', true],
  ];
  const st = p.status === 'in' ? `In ${esc(room(p.room).name)}` : p.status === 'escaped' ? 'Escaped the dungeon' : p.koRescued ? 'Knocked out · rescued' : 'Knocked out · lost';
  const stat = (k, v, sub = '') => `<div class="ps"><small>${k}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const stats = [
    stat('Points', p.score ?? '—', state.phase === 'playing' ? 'if they escaped now' : ''),
    stat('Gold', p.gold),
    stat('Health', `${10 - p.damage}/10`, p.damage ? `${p.damage} damage` : 'unhurt'),
    stat('Clank!', p.clankArea, `in the area · ${p.inBag} in the bag · ${p.supply} in supply`),
    stat('Cards', p.deckCount + p.handCount + p.discard.length + p.playArea.length, `deck ${p.deckCount} · hand ${p.handCount} · discard ${p.discard.length}`),
  ].join('');
  const loot = [];
  for (const v of p.artifacts) loot.push(`🏺 Artifact <b>${v}</b>`);
  for (const sx of p.secrets) { const d = sdef(sx.id); loot.push(`${d.points ? '🏆' : '🧪'} ${esc(d.name)}${d.points ? ` <b>${d.points}</b>` : ''}`); }
  if (p.monkeyIdols) loot.push(`🐒 Monkey Idol ×${p.monkeyIdols} <b>${p.monkeyIdols * 5}</b>`);
  if (p.items.masterKey) loot.push(`🔑 Master Key <b>5</b>`);
  if (p.items.backpack) loot.push(`🎒 Backpack <b>5</b>`);
  for (const c of p.items.crowns) loot.push(`👑 Crown <b>${c}</b>`);
  if (p.mastery) loot.push(`🏅 Mastery <b>20</b>`);
  const b = p.scoreBreakdown;
  const bd = b ? `<div class="breakdown">${[['Artifacts', b.artifacts], ['Secrets', b.secrets], ['Idols', b.monkeyIdols], ['Items', b.items], ['Gold', b.gold], ['Cards', b.cards + b.bonus], ['Mastery', b.mastery]].map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('')}</div>` : '';
  $('viewerTitle').innerHTML = `<span class="vt"><i class="av" style="background:${COLOR[p.color]}">${esc(p.name[0].toUpperCase())}</i>${esc(p.name)}${p.id === me ? ' <em>(you)</em>' : ''}${p.bot ? ` <em>${esc(p.botStyle || 'computer')} · ${esc(state.options?.botLevel || 'medium')}</em>` : ''}<small>${st}${p.onCountdown ? ' · on countdown' : ''}${p.connected ? '' : ' · disconnected'}</small></span><button id="viewerClose" class="defer">✕ Close</button>`;
  const backs = (n) => Array.from({ length: n }, () => '<div class="card back"><img src="assets/dragon.svg" alt=""></div>').join('');
  $('viewerBody').innerHTML = (p.bot && p.botAbout ? `<p class="botabout"><b>${esc(p.botStyle)}</b> ${esc(p.botAbout)}</p>` : '') + `<div class="pstats">${stats}</div>${bd}<div class="vsec"><h4>Loot</h4><div class="lootlist">${loot.length ? loot.map((x) => `<span>${x}</span>`).join('') : '<span class="muted">nothing yet</span>'}</div></div>`
    + sections.map(([title, cards, note, grouped]) => `<div class="vsec"><h4>${title} <span class="muted">${note}</span></h4><div class="cards small">${title === 'Hand' && !p.hand && p.handCount ? backs(p.handCount) : cards.length ? (grouped ? groupCards(cards).map((g) => cardHTML(g.def, { count: g.n > 1 ? g.n : undefined })).join('') : cards.map((c) => cardHTML(cdef(c))).join('')) : '<span class="muted">empty</span>'}</div></div>`).join('');
  $('viewer').dataset.pid = p.id;
  const wasOpen = !$('viewer').classList.contains('hidden');
  $('viewer').classList.remove('hidden');
  $('viewerClose').onclick = () => closeModal('viewer');
  if (focus && !wasOpen) [...$('viewerBody').querySelectorAll('.vsec h4')].find((h) => h.textContent.startsWith(focus))?.scrollIntoView({ block: 'start' });
}
function renderDragon() {
  const track = STATIC.rules.rageTrack.map((v, i) => `<b class="${i === state.rage ? 'on' : i < state.rage ? 'past' : ''}">${v}</b>`).join('');
  const cd = state.countdown ? `<div class="dm">⏳ ${esc(state.players.find((p) => p.id === state.countdown.pid).name)} on countdown space <b>${state.countdown.pos + 1}/5</b></div>` : '';
  $('dragon').innerHTML = `<div class="rt"><img src="assets/dragon.svg" alt="">Rage <span class="rage">${track}</span>${state.danger ? `<span title="Danger cards in the row">+${state.danger}☠</span>` : ''}</div>
    <div class="dm">Next attack draws <b>${state.rageValue + state.danger}</b> · bag <b>${state.bag.total}</b> (${state.bag.black} black) · deck <b>${state.dungeonDeckCount}</b></div>${cd}`;
}

function renderBoard() {
  const b = state.board;
  const G = b.geometry || { width: 1000, height: 1000, roomW: 176, roomH: 80, depthsY: 430 };
  const mp = myPlayer();
  const legal = state.legal;
  const moves = new Map((legal?.moves || []).map((m) => [m.to, m]));
  const tele = new Set(legal?.teleports || []);
  const W = G.roomW, H = G.roomH;
  const svg = $('board');
  svg.setAttribute('viewBox', `0 0 ${G.width} ${G.height}`);
  // point on the border of a room's box, on the line towards another point
  const edgePoint = (from, to, pad = 2) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    if (!dx && !dy) return { x: from.x, y: from.y };
    const t = Math.min((W / 2 + pad) / Math.abs(dx || 1e-9), (H / 2 + pad) / Math.abs(dy || 1e-9));
    return { x: from.x + dx * t, y: from.y + dy * t };
  };
  let s = `<defs>
    <linearGradient id="roomShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0a10" stop-opacity=".15"/><stop offset=".45" stop-color="#0d0a10" stop-opacity=".55"/><stop offset="1" stop-color="#0d0a10" stop-opacity=".9"/></linearGradient>
    <symbol id="ic-swords" viewBox="0 0 24 24"><g id="ic-sword1">
      <polygon points="2,2 5.2,3 15.6,13.4 13.4,15.6 3,5.2" fill="#eef1f6" stroke="#0d0a10" stroke-width=".6" stroke-linejoin="round"/>
      <line x1="11.2" y1="17.6" x2="17.6" y2="11.2" stroke="#f0b04a" stroke-width="2" stroke-linecap="round"/>
      <line x1="15.6" y1="15.6" x2="19.4" y2="19.4" stroke="#a8673a" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="20.5" cy="20.5" r="1.4" fill="#f0b04a"/></g>
      <use href="#ic-sword1" transform="translate(24 0) scale(-1 1)"/></symbol>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#e3d4ad"/></marker>
  </defs>
  <image href="assets/tiles/tile-room.jpg" x="-20" y="-20" width="${G.width + 40}" height="${G.depthsY + 40}" preserveAspectRatio="xMidYMid slice" opacity=".16"/>
  <image href="assets/tiles/tile-depths.jpg" x="-20" y="${G.depthsY}" width="${G.width + 40}" height="${G.height - G.depthsY + 40}" preserveAspectRatio="xMidYMid slice" opacity=".22"/>
  <rect x="0" y="${G.depthsY - 2}" width="${G.width}" height="4" fill="#0d0a10"/><rect x="0" y="${G.depthsY + 2}" width="${G.width}" height="1" fill="#6a5a46" opacity=".6"/>
  <text x="22" y="${G.depthsY + 32}" class="depths-label">✦ THE DEPTHS ✦</text>`;
  const labels = [];
  for (const t of b.tunnels) {
    const a = room(t.from), c = room(t.to);
    const cls = ['tunnel', t.locked ? 'locked' : '', t.boots ? 'footprints' : '', t.monsters ? 'monsters' : '', t.shortcut ? 'shortcut' : ''].join(' ');
    const label = [t.locked ? '🔒' : '', t.boots ? '👣' : '', t.monsters ? '⚔'.repeat(t.monsters) : ''].join('');
    const icons = [t.locked ? '🔒' : null, t.boots ? '👣' : null, ...Array(t.monsters || 0).fill('swords')].filter(Boolean);
    if (t.shortcut) {
      // routed along the side of the map so it never runs under other rooms
      const laneX = t.shortcut === 'left' ? 28 : G.width - 28;
      const pa = { x: a.x + (laneX > a.x ? W / 2 : -W / 2), y: a.y }, pc = { x: c.x + (laneX > c.x ? W / 2 : -W / 2), y: c.y };
      const d = `M${pa.x},${pa.y} L${laneX},${pa.y} L${laneX},${pc.y} L${pc.x},${pc.y}`;
      s += `<path d="${d}" class="tunnel-bg"/><path d="${d}" class="${cls}"><title>Locked shortcut between ${a.name} and ${c.name} — Master Key needed</title></path>`;
      labels.push({ x: laneX, y: (pa.y + pc.y) / 2, icons: ['🔒', '⤴'], w: 48 });
      continue;
    }
    const p1 = edgePoint(a, c), p2 = edgePoint(c, a);
    s += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" class="tunnel-bg"/><line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" class="${cls}" ${t.oneWay ? 'marker-end="url(#arrow)"' : ''}><title>${a.name} ↔ ${c.name}${t.oneWay ? ' (one way)' : ''}${label ? ' ' + label : ''}</title></line>`;
    if (icons.length) labels.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, icons, w: 12 + 18 * icons.length });
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
    if (rs.majorSecret) info.push('★ Major Secret');
    if (rs.minorSecrets.length) info.push(`×${rs.minorSecrets.length} Minor Secret${rs.minorSecrets.length > 1 ? 's' : ''}`);
    if (rs.monkeyIdols) info.push(`×${rs.monkeyIdols} Idols Left`);
    if (r.crystal) info.push('Crystal Cave');
    if (r.market) info.push('Market');
    if (r.fountain) info.push('Healing Fountain');
    if (r.start) info.push('Exit');
    let title = r.name;
    if (m) title += m.ok ? ` — move (${m.cost} boot${m.cost > 1 ? 's' : ''}${m.monsters ? `, ${m.swordsUsed} sword(s) used, ${m.damage} damage` : ''})` : ` — ${m.reason}`;
    const rx = r.x - W / 2, ry = r.y - H / 2;
    s += `<g ${click}><title>${title}</title><clipPath id="clip-${r.id}"><rect x="${rx}" y="${ry}" width="${W}" height="${H}" rx="12"/></clipPath>
      <image href="assets/tiles/tile-${tileFor(r)}.jpg" x="${rx}" y="${ry}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${r.id})"/>
      <rect x="${rx}" y="${ry}" width="${W}" height="${H}" rx="12" class="${cls.join(' ')}"/>
      <text x="${r.x}" y="${r.y + 6}" class="rname">${esc(r.name)}</text><text x="${r.x}" y="${r.y + 26}" class="rinfo">${info.join('   ')}</text></g>`;
    const here = state.players.filter((p) => p.room === r.id && p.status === 'in');
    here.forEach((p, i) => { const cx = rx + 16 + i * 24, cy = ry + 2; const cur = p.id === state.currentPlayer; s += `<g class="pawn-g">${cur ? `<circle cx="${cx}" cy="${cy}" r="11" class="pawn-ring" fill="none" stroke="${COLOR[p.color]}"/>` : ''}<circle cx="${cx}" cy="${cy}" r="11" class="pawn" fill="${COLOR[p.color]}"><title>${esc(p.name)}${cur ? ' (taking their turn)' : ''}</title></circle><text x="${cx}" y="${cy + 4}" class="pawn-l">${esc(p.name[0].toUpperCase())}</text></g>`; });
  }
  // hazard labels last so they sit on top of everything
  for (const l of labels) {
    s += `<rect x="${l.x - l.w / 2}" y="${l.y - 12}" width="${l.w}" height="24" rx="7" class="tlabel-bg"/>`;
    l.icons.forEach((ic, i) => {
      const cx = l.x + (i - (l.icons.length - 1) / 2) * 18;
      s += ic === 'swords' ? `<use href="#ic-swords" x="${cx - 8}" y="${l.y - 8}" width="16" height="16"/>` : `<text x="${cx}" y="${l.y + 5}" class="tlabel">${ic}</text>`;
    });
  }
  svg.innerHTML = s;
  svg.querySelectorAll('[data-mv]').forEach((g) => { g.onclick = () => act({ type: 'move', to: g.dataset.mv }); });
  svg.querySelectorAll('[data-tp]').forEach((g) => { g.onclick = () => { teleportMode = false; act({ type: 'teleport', to: g.dataset.tp }); }; });
  renderHud(moves, tele);
}

function renderHud(moves, tele) {
  const mp = myPlayer();
  const r = room(mp.room);
  const t = state.turn;
  let h = '';
  if (mp.status === 'in') {
    const feats = [r.crystal ? '💎 Crystal cave' : '', r.market ? '🛒 Market' : '', r.fountain ? '⛲ Fountain' : '', r.depths ? 'in the Depths' : '', r.start ? 'outside the dungeon' : ''].filter(Boolean).join(' · ');
    h += `<div class="hud"><div class="k">You are in</div><div class="v">${esc(r.name)}</div>${feats ? `<div class="m">${feats}</div>` : ''}</div>`;
  }
  if (isMyTurn() && !state.pending) {
    const exhausted = t.enteredCrystalCave && !t.flags.ignoreCrystalCaves;
    const rows = [...moves.values()].map((m) => `<div class="r ${m.ok ? '' : 'dim'}"><b>${m.shortcut ? '⤴ ' : ''}${room(m.to).name}</b><span>${m.ok ? `${m.cost}👢${m.damage ? ` ${m.damage}💔` : ''}${m.monsters && !m.damage ? ' ⚔' : ''}${m.shortcut ? ' shortcut' : ''}` : exhausted ? '' : m.reason}</span></div>`).join('');
    const tp = tele.size ? `<div class="m">✨ ${tele.size} room${tele.size > 1 ? 's' : ''} by teleport</div>` : '';
    h += `<div class="hud tunnels"><div class="k">${exhausted ? 'Exhausted — no more boots' : 'Tunnels from here'}</div>${rows}${tp}</div>`;
  } else if (state.pending && state.pending.pid !== me) {
    h += `<div class="hud"><div class="m">${esc(state.players.find((p) => p.id === state.pending.pid)?.name)} is deciding…</div></div>`;
  }
  $('boardHud').innerHTML = h;
}

function renderRow() {
  const L = state.legal;
  $('deckInfo').textContent = `(${state.dungeonDeckCount} in deck)`;
  $('dungeonRow').innerHTML = state.dungeonRow.map((c, i) => {
    if (!c) return '<div class="card empty"></div>';
    const d = cdef(c);
    const disc = (state.turn?.gemDiscount && d.tags.includes('gem')) ? Math.max(0, d.cost - state.turn.gemDiscount) : undefined;
    return cardHTML(d, { cost: disc, ...cardAction(d, i, L) });
  }).join('');
  wireButtons($('dungeonRow'));
}

function renderReserve() {
  const L = state.legal;
  const ids = ['mercenary', 'explore', 'secret_tome', 'goblin'];
  $('reserve').innerHTML = ids.map((id) => {
    const d = cdef(id);
    const count = id === 'goblin' ? null : state.reserve[id];
    return cardHTML(d, { count, ...cardAction(d, id, L) });
  }).join('');
  wireButtons($('reserve'));
}

// What clicking a Dungeon Row / Reserve card does on your turn: buy it, use it (devices) or fight it.
// The card gets a highlighted border instead of a button.
function cardAction(d, slot, L) {
  if (!isMyTurn() || state.pending || !L) return {};
  const fight = slot === 'goblin' ? L.canFightGoblin : d.kind === 'monster' && L.fightable.includes(slot);
  if (fight) return { cls: 'can-fight', attrs: `data-fight="${slot}"` };
  const buy = typeof slot === 'number' ? d.kind !== 'monster' && L.acquirable.includes(slot) : L.reserveBuy.includes(slot);
  if (buy) return { cls: d.kind === 'device' ? 'can-use' : 'can-buy', attrs: `data-acq="${slot}"` };
  return {};
}
function wireButtons(root) {
  root.querySelectorAll('[data-fight]').forEach((el) => { el.onclick = () => { cardFx(el, 'slain'); act({ type: 'fight', slot: el.dataset.fight === 'goblin' ? 'goblin' : Number(el.dataset.fight) }); }; });
  root.querySelectorAll('[data-acq]').forEach((el) => {
    el.onclick = () => {
      if (el.classList.contains('can-use')) cardFx(el, 'used'); else flyToDiscard(el);
      act({ type: 'acquire', slot: /^\d+$/.test(el.dataset.acq) ? Number(el.dataset.acq) : el.dataset.acq });
    };
  });
}

// ---------- card animations ----------
// a copy of the card lifted off the page, so the animation survives the re-render that follows
function ghost(el) {
  const r = el.getBoundingClientRect(), g = el.cloneNode(true);
  g.classList.remove('can-buy', 'can-use', 'can-fight');
  g.removeAttribute('title');
  Object.assign(g.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: 0, zIndex: 80, pointerEvents: 'none' });
  document.body.append(g);
  return { g, r };
}
// bought cards fly into your discard pile (played cards into the play pile), which bumps when they land
let flying = 0;
const lastPlayCount = { pid: null, n: 0 };
const flyToDiscard = (el) => flyTo(el, 'pileDiscard', 650);
function flyTo(el, targetId, ms, delay = 0, hold = true) {
  const target = $(targetId);
  if (!el || !target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { g, r } = ghost(el), t = target.getBoundingClientRect();
  if (hold) holdFor(ms + delay);
  flying++;
  const dx = t.left + t.width / 2 - (r.left + r.width / 2), dy = t.top + t.height / 2 - (r.top + r.height / 2), sc = t.width / r.width;
  g.animate([
    { transform: 'none', offset: 0 },
    { transform: 'translate(0, -18px) scale(1.06) rotate(-2deg)', offset: 0.18 },
    { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotate(8deg)`, opacity: 0.9, offset: 1 },
  ], { duration: ms, delay, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'backwards' }).onfinish = () => {
    g.remove(); flying--;
    setTimeout(() => $(targetId)?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' }), 30);
  };
}
// playing a card: it leaves your hand at once (the rest close up) while a copy flies to the play pile.
// Updates are not held back for this, so quick plays in a row stay snappy; cards on their way out
// are left out of the hand until the server confirms (or 3s pass, e.g. if the play was refused).
const leaving = new Map(); // uid -> time it left the hand
function playOut(wrap, delay = 0, close = true) {
  const card = wrap.querySelector('.card');
  leaving.set(wrap.dataset.uid, Date.now());
  flyTo(card, 'pilePlay', 420, delay, false);
  wrap.style.visibility = 'hidden';
  wrap.style.pointerEvents = 'none';
  if (!close || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const w = wrap.getBoundingClientRect().width, gap = parseFloat(getComputedStyle(wrap.parentElement).columnGap) || 0;
  wrap.animate([{ width: `${w}px`, marginRight: '0px' }, { width: '0px', marginRight: `${-gap}px` }], { duration: 220, easing: 'ease-in-out', fill: 'forwards' });
}
// reshuffle: a few cards lift off the discard pile, flip face down and drop onto the deck, which then riffles
function reshuffleFx() {
  const from = $('pileDiscard')?.getBoundingClientRect(), to = $('pileDeck')?.getBoundingClientRect();
  if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  holdFor(900);
  const dx = to.left - from.left, dy = to.top - from.top;
  for (let i = 0; i < 5; i++) {
    const g = document.createElement('span');
    g.className = 'pcard back';
    g.innerHTML = '<img src="assets/dragon.svg" alt="">';
    Object.assign(g.style, { position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, zIndex: 80, pointerEvents: 'none' });
    document.body.append(g);
    g.animate([
      { transform: 'translate(0,0) rotateY(180deg)', opacity: 0 },
      { transform: 'translate(0,-22px) rotateY(90deg)', opacity: 1, offset: 0.3 },
      { transform: `translate(${dx}px, ${dy - 10}px) rotateY(0deg) rotate(${(i - 2) * 6}deg)`, offset: 0.8 },
      { transform: `translate(${dx}px, ${dy}px)`, opacity: 1 },
    ], { duration: 620, delay: i * 70, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'backwards' }).onfinish = () => g.remove();
  }
  setTimeout(() => $('pileDeck')?.querySelector('.pcard')?.animate([
    { transform: 'none' }, { transform: 'translateX(-4px) rotate(-4deg)' }, { transform: 'translateX(4px) rotate(4deg)' }, { transform: 'translateX(-2px) rotate(-2deg)' }, { transform: 'none' },
  ], { duration: 360, easing: 'ease-in-out' }), 620 + 4 * 70);
}

// fights: a red flash and the card drops away; devices: a purple flare
function cardFx(el, kind) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { g } = ghost(el);
  g.classList.add(`fx-${kind}`);
  const frames = kind === 'slain'
    ? [{ transform: 'none', filter: 'none' }, { transform: 'translateX(-5px) rotate(-2deg)', filter: 'brightness(1.6) saturate(2) hue-rotate(-20deg)', offset: 0.2 }, { transform: 'translateX(5px) rotate(2deg)', offset: 0.35 }, { transform: 'translateY(30px) scale(.85) rotate(6deg)', opacity: 0 }]
    : [{ transform: 'none', filter: 'none' }, { transform: 'scale(1.08)', filter: 'brightness(1.5) drop-shadow(0 0 14px #b07cf0)', offset: 0.3 }, { transform: 'scale(1.15)', opacity: 0 }];
  g.animate(frames, { duration: 600, easing: 'ease-out' }).onfinish = () => g.remove();
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
  el.innerHTML = state.logs.map((l) => `<div class="${l.t.startsWith('DRAGON ATTACK') ? 'attack' : l.t.startsWith('—') ? 'turn' : ''}">${esc(l.t)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// Cards whose uid we have not drawn before get an entrance animation.
const seenUids = { hand: new Set(), playArea: new Set() };
function animateNew(container, key) {
  const fresh = [...container.querySelectorAll('[data-uid]')].filter((el) => !seenUids[key].has(el.dataset.uid));
  fresh.forEach((el, i) => { el.classList.add(key === 'hand' ? 'deal' : 'slam'); el.style.animationDelay = `${i * 70}ms`; });
  seenUids[key] = new Set([...container.querySelectorAll('[data-uid]')].map((el) => el.dataset.uid));
}
let viewOwn = false, lastCurrent = null, lingerUntil = 0;
const lastShuffles = {};
function renderMe() {
  const p = myPlayer();
  const t = state.turn;
  const mine = isMyTurn();
  const cur = state.players.find((x) => x.id === state.currentPlayer);
  if (state.currentPlayer !== lastCurrent) {
    // your turn just ended: keep your own cards on screen briefly (new hand, any reshuffle) before following the next player
    if (lastCurrent === me && state.phase === 'playing') { lingerUntil = Date.now() + 1600; setTimeout(() => { if (state) render(); }, 1650); }
    viewOwn = false; lastCurrent = state.currentPlayer;
  }
  const lingering = Date.now() < lingerUntil;
  // not your turn: spectate whoever is playing (toggle back to your own hand any time)
  const watching = !mine && state.phase === 'playing' && cur && cur.id !== me && !viewOwn && !lingering;
  const v = watching ? cur : p;
  let status;
  if (watching) status = `Watching ${cur.name}${state.pending ? ` — deciding: ${state.pending.title}` : ''}`;
  else if (p.status === 'escaped' && mine) status = `You escaped${p.mastery ? ' with a Mastery token' : ''}! Spend what you have left, then end your turn.`;
  else if (p.status !== 'in') status = p.status === 'escaped' ? `You escaped${p.mastery ? ' with a Mastery token' : ''}! Waiting for the others…` : p.koRescued ? 'You were knocked out but rescued — your loot counts.' : 'You were knocked out in the dungeon. Better luck next heist.';
  else if (mine) status = state.pending ? 'Make your choice…' : p.hand.length ? 'Your turn — play your cards' : 'Spend your skill, swords and boots';
  else if (state.phase === 'ended') status = 'The heist is over.';
  else status = `Your next hand · ${cur?.name ?? '…'} is playing`;
  $('status').textContent = status;
  $('status').className = mine ? 'yours' : watching ? 'watching' : '';
  $('me').classList.toggle('spectating', !!watching);
  $('me').style.setProperty('--who', COLOR[v.color]);
  const res = (mine || watching) && t ? t : { skill: 0, swords: 0, boots: 0, teleports: 0 };
  $('resources').innerHTML = [['Skill', res.skill, '🧠'], ['Swords', res.swords, '⚔'], ['Boots', res.boots, '👢'], ['Gold', v.gold, '🪙'], ['Teleport', res.teleports || 0, '✨'], ['Health', 10 - v.damage, '♥']]
    .map(([n, val, ic]) => `<div class="res ${val === 0 && n !== 'Health' ? 'zero' : ''}" title="${n}">${ic} <b>${val}</b><small>${n}</small></div>`).join('')
    + ((mine || watching) && t?.negativeClank ? `<div class="res" title="Negative Clank! available"><b>-${t.negativeClank}</b><small>clank</small></div>` : '')
    + ((mine || watching) && t?.enteredCrystalCave && !t.flags.ignoreCrystalCaves ? `<div class="res" title="Entered a Crystal Cave">💎<small>exhausted</small></div>` : '');
  let a = '';
  if (mine && !state.pending) {
    const L = state.legal;
    if (p.hand.length) a += `<button id="playAll" class="primary">Play all cards</button>`;
    if (L?.canTakeArtifact) a += `<button id="takeArt" class="primary">Take Artifact (${state.rooms[p.room].artifact})</button>`;
    if (t.teleports > 0 && p.status === 'in') a += `<button id="tpMode" ${teleportMode ? 'class="primary"' : ''}>${teleportMode ? 'Cancel teleport' : `Teleport (${t.teleports})`}</button>`;
    for (const d of L?.deferred || []) a += `<button class="resume" data-resume="${d.i}" title="Return to this postponed choice">↩ ${esc(d.title)}</button>`;
    a += `<button id="endTurn" class="${!p.hand.length && !L?.hasAction ? 'primary' : ''}">End turn${p.hand.length ? ` (${p.hand.length} unplayed)` : ''}</button>`;
  } else if (!mine && state.phase === 'playing' && cur && cur.id !== me) {
    a += `<button id="viewToggle">${watching ? '✋ Show my hand' : `👁 Watch ${esc(cur.name)}`}</button>`;
  }
  if (state.phase === 'ended') a += `<button id="showResults" class="primary">📜 Results</button><button id="leaveEnded">Back to the tavern</button>`;
  $('actions').innerHTML = a;
  $('actions').querySelectorAll('[data-resume]').forEach((b) => { b.onclick = () => act({ type: 'resume', index: Number(b.dataset.resume) }); });
  if ($('playAll')) $('playAll').onclick = () => { [...$('hand').querySelectorAll('[data-play]')].forEach((d, i) => playOut(d, i * 70, false)); act({ type: 'playAll' }); };
  if ($('takeArt')) $('takeArt').onclick = () => act({ type: 'takeArtifact' });
  if ($('tpMode')) $('tpMode').onclick = () => { teleportMode = !teleportMode; render(); };
  if ($('viewToggle')) $('viewToggle').onclick = () => { viewOwn = !viewOwn; render(); };
  if ($('showResults')) $('showResults').onclick = () => { resultsDismissed = false; render(); };
  if ($('leaveEnded')) $('leaveEnded').onclick = leaveGame;
  if ($('endTurn')) $('endTurn').onclick = async () => {
    const unplayed = p.hand.length, postponed = (state.legal?.deferred || []).length;
    if ((unplayed || postponed) && !await askConfirm(`End your turn now?${unplayed ? ` ${unplayed} card${unplayed > 1 ? 's' : ''} in hand will be discarded unplayed.` : ''}${postponed ? ' Postponed choices will lapse.' : ''}`, { ok: 'End turn' })) return;
    act({ type: 'endTurn' });
  };
  const who = watching ? `${esc(cur.name)}'s` : 'Your';
  document.querySelector('.hand-zone h4').innerHTML = `${who} hand`;
  document.querySelector('.loot-zone h4').innerHTML = `${who} loot`;
  document.querySelector('.pile-zone h4').innerHTML = `${who} cards`;
  // switching between your hand and someone else's should deal the new hand in
  if ($('hand').dataset.viewing !== v.id) { seenUids.hand = new Set(); seenUids.playArea = new Set(); $('hand').dataset.viewing = v.id; }
  const now = Date.now();
  for (const [uid, t] of leaving) if (now - t > 3000 || !(v.hand || []).some((c) => c.uid === uid)) leaving.delete(uid);
  const hand = (v.hand || []).filter((c) => !(mine && leaving.has(c.uid)));
  $('hand').innerHTML = hand.map((c) => `<div data-play="${c.uid}" data-uid="${c.uid}">${cardHTML(cdef(c), { playable: mine && !state.pending })}</div>`).join('')
    || `<span class="muted">${mine ? 'All cards played — spend your resources, then end your turn.' : watching ? `${esc(cur.name)} has played every card.` : 'Waiting for your next hand.'}</span>`;
  if (mine) $('hand').querySelectorAll('[data-play]').forEach((d) => { d.onclick = () => { if (state.pending || leaving.has(d.dataset.uid)) return; playOut(d); act({ type: 'play', uid: d.dataset.play }); }; });
  animateNew($('hand'), 'hand');
  // loot: one row per thing held, with its points, then gold, card points and the total
  const rows = [];
  const row = (name, pts, extra = '', title = '') => rows.push(`<tr${title ? ` title="${esc(title)}"` : ''}><td>${name}${extra}</td><td>${pts}</td></tr>`);
  for (const x of v.artifacts) row('Artifact', x);
  for (const s of v.secrets) { const d = sdef(s.id); row(esc(d.name), d.points || (d.gold ? `${d.gold}<small>g</small>` : '—'), d.use === 'held' && mine && !state.pending ? ` <button data-use="${s.uid}">Use</button>` : '', d.text); }
  if (v.monkeyIdols) row(`Monkey Idol <small>×${v.monkeyIdols}</small>`, v.monkeyIdols * 5);
  if (v.items.masterKey) row(`Master Key${v.items.masterKey > 1 ? ` <small>×${v.items.masterKey}</small>` : ''}`, v.items.masterKey * 5);
  if (v.items.backpack) row(`Backpack${v.items.backpack > 1 ? ` <small>×${v.items.backpack}</small>` : ''}`, v.items.backpack * 5);
  for (const c of v.items.crowns) row('Crown', c);
  if (v.mastery) row('Mastery', 20);
  const b = v.scoreBreakdown;
  const extras = b ? `<tr class="ls"><td>Gold</td><td>${v.gold}</td></tr><tr class="ls"><td>Card points</td><td>${b.cards + b.bonus}</td></tr>` : '';
  const total = v.score != null ? `<tfoot><tr><td>Total <small>if out now</small></td><td>${v.score}</td></tr></tfoot>` : '';
  $('tokens').innerHTML = `<table class="lootsheet"><tbody>${rows.join('') || '<tr class="none"><td colspan="2">No loot yet</td></tr>'}${extras}</tbody>${total}</table>`;
  const top = v.discard.length ? cdef(v.discard[v.discard.length - 1]) : null;
  const lastPlayed = v.playArea.length ? cdef(v.playArea[v.playArea.length - 1]) : null;
  const faceCls = (d) => `face ${d.reserve ? 'reserve' : d.kind}${d.tags.includes('gem') ? ' gem' : ''}`;
  const piles = `<div class="piles">
    <button class="pile" id="pilePlay" title="Play area: ${plural(v.playArea.length, 'card')} played this turn. Click to see them."><span class="pcard ${lastPlayed ? faceCls(lastPlayed) : 'empty'}">${lastPlayed ? `<i>${esc(lastPlayed.name)}</i>` : ''}</span><span class="pl-l">Played <b>${v.playArea.length}</b></span></button>
    <button class="pile" id="pileDeck" title="Deck: ${plural(v.deckCount, 'card')}. Click to see them (alphabetical)."><span class="pcard back"><img src="assets/dragon.svg" alt=""></span><span class="pl-l">Deck <b>${v.deckCount}</b></span></button>
    <button class="pile" id="pileDiscard" title="Discard pile: ${plural(v.discard.length, 'card')}. Click to see them (newest first)."><span class="pcard ${top ? `face ${top.reserve ? 'reserve' : top.kind}${top.tags.includes('gem') ? ' gem' : ''}` : 'empty'}">${top ? `<i>${esc(top.name)}</i>` : ''}</span><span class="pl-l">Discard <b>${v.discard.length}</b></span></button>
    ${v.trashedCount ? `<button class="pile trash" id="pileTrash" title="${plural(v.trashedCount, 'card')} trashed (removed from the game). Click to see them."><span>Trashed <b>${v.trashedCount}</b></span></button>` : ''}
  </div>`;
  $('piles').innerHTML = piles;
  $('pilePlay').onclick = () => showPile(v, 'played');
  $('pileDeck').onclick = () => showPile(v, 'deck');
  $('pileDiscard').onclick = () => showPile(v, 'discard');
  if ($('pileTrash')) $('pileTrash').onclick = () => showPile(v, 'trashed');
  // someone else's card landed in the play area while we watch: bump the pile
  if (lastPlayCount.pid === v.id && v.playArea.length > lastPlayCount.n && !(mine && flying)) $('pilePlay').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  lastPlayCount.pid = v.id; lastPlayCount.n = v.playArea.length;
  // the discard pile was shuffled into the deck since we last looked: animate it
  if (lastShuffles[v.id] !== undefined && v.shuffles > lastShuffles[v.id]) reshuffleFx();
  for (const x of state.players) lastShuffles[x.id] = x.shuffles;
  $('tokens').querySelectorAll('[data-use]').forEach((b) => { b.onclick = () => act({ type: 'useSecret', uid: b.dataset.use }); });
}
function renderPrompt() {
  const pr = state.pending;
  if (!pr || pr.pid !== me || !pr.options) { $('prompt').classList.add('hidden'); return; }
  $('prompt').classList.remove('hidden');
  $('promptTitle').innerHTML = `<span>${pr.title}</span>${isMyTurn() ? '<button id="deferBtn" class="defer" title="Close this and come back to it later this turn">✕ Decide later</button>' : ''}`;
  $('promptOptions').innerHTML = pr.options.map((o, i) => o.card ? `<div data-opt="${i}">${cardHTML(o.card, { playable: true })}</div>` : `<button class="opt" data-opt="${i}">${esc(o.label)}</button>`).join('');
  $('promptOptions').querySelectorAll('[data-opt]').forEach((el) => { el.onclick = () => act({ type: 'resolve', value: pr.options[Number(el.dataset.opt)].value }); });
  if ($('deferBtn')) $('deferBtn').onclick = () => act({ type: 'defer' });
}

function renderResults() {
  if (state.phase !== 'ended' || !state.results || resultsDismissed) { $('results').classList.add('hidden'); return; }
  $('results').classList.remove('hidden');
  const rows = state.results.map((r, i) => {
    const b = r.breakdown;
    return `<tr><td style="color:${COLOR[r.color]}">${i === 0 && r.total != null ? '🏆 ' : ''}${esc(r.name)}</td><td>${r.survived ? '' : 'lost'}</td><td>${b.artifacts}</td><td>${b.secrets + b.monkeyIdols}</td><td>${b.items}</td><td>${b.gold}</td><td>${b.cards + b.bonus}</td><td>${b.mastery}</td><th>${r.total ?? '—'}</th></tr>`;
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

// ---------- theme: dark by default, parchment (light) on request; remembered per browser ----------
function syncThemeButtons() {
  const dark = document.documentElement.classList.contains('dark');
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => { b.textContent = dark ? '☀' : '☾'; b.title = dark ? 'Switch to the light parchment theme' : 'Switch to the dark theme'; });
}
document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
  b.onclick = () => {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('clank.theme', dark ? 'dark' : 'light');
    syncThemeButtons();
  };
});
syncThemeButtons();
