/* Deck Workshop: browse decks, clone them, edit and invent cards. Uses helpers from app.js ($, esc, cardHTML, toast). */
(() => {
  // ---------- effect catalogue (mirrors server/game/cards/decks.js) ----------
  const NUM = { skill: [0, 10, 2], swords: [0, 10, 2], boots: [0, 10, 1], gold: [0, 10, 2], heal: [0, 10, 1], clank: [-10, 10, 1], draw: [0, 5, 1], teleport: [1, 3, 1], othersClank: [0, 5, 1], allClank: [0, 5, 1], gemDiscount: [0, 5, 2] };
  const TYPES = [
    ['Gain', [['skill', '+ Skill'], ['swords', '+ Swords'], ['boots', '+ Boots'], ['gold', '+ Gold'], ['heal', 'Heal'], ['draw', 'Draw cards'], ['clank', 'Clank! (negative removes)']]],
    ['Move', [['teleport', 'Teleport'], ['flag:ignoreMonsterTunnels', 'Ignore monsters in tunnels'], ['flag:ignoreCrystalCaves', 'No stopping in Crystal Caves']]],
    ['Others & dragon', [['othersClank', 'Each other player adds Clank!'], ['allClank', 'Every player adds Clank!'], ['dragonAttack', 'Dragon attack'], ['returnDragonCubes', 'Return set-aside dragon cubes']]],
    ['Cards', [['trash', 'Trash a card'], ['discardThen', 'Discard a card, then…'], ['replaceRow', 'Replace a Dungeon Row card'], ['gemDiscount', 'Gems cost less this turn'], ['buyTomes', 'Pay gold for Secret Tomes'], ['takeAdjacentSecret', 'Take a secret from an adjacent room']]],
    ['Logic', [['choose', 'Choose one…'], ['when', 'If…, then'], ['skillPerClank', '+1 Skill per Clank! this turn']]],
  ];
  const TYPE_LABEL = Object.fromEntries(TYPES.flatMap(([, l]) => l));
  const ORDER = ['skill', 'swords', 'boots', 'gold', 'heal', 'clank', 'draw', 'teleport', 'dragonAttack', 'othersClank', 'allClank', 'flag', 'gemDiscount', 'returnDragonCubes', 'skillPerClank', 'buyTomes', 'when', 'choose', 'discardThen', 'trash', 'replaceRow', 'takeAdjacentSecret'];
  const CONDS = [['monkeyIdol', 'you have a Monkey Idol'], ['artifact', 'you have an Artifact'], ['crown', 'you have a Crown'], ['chalice', 'you have the Chalice'], ['otherCompanion', 'another Companion is in play']];
  const ZONES = [['hand', 'hand'], ['playArea', 'play area'], ['discard', 'discard pile']];
  const SLOTS = { companion: [['play', 'When played'], ['acquire', 'When acquired'], ['arrive', 'When it arrives in the row']], device: [['use', 'When acquired (used at once)'], ['arrive', 'When it arrives in the row']], monster: [['defeat', 'When defeated'], ['arrive', 'When it arrives in the row']] };
  const SUBTYPES = [['companion', 'Companion'], ['equipment', 'Item'], ['action', 'Action'], ['gem', 'Gem']];
  const KIND_ORDER = { monster: 0, device: 1, companion: 2 };
  const FILTERS = [['all', 'All'], ['monster', 'Monsters'], ['device', 'Devices'], ['companion', 'Companions'], ['gem', 'Gems'], ['dragon', 'Dragon']];
  const LIMIT = { minTotal: 20, maxTotal: 200 };

  const typeOf = (e) => { const k = ORDER.find((x) => x in e); return k === 'flag' ? `flag:${e.flag}` : k; };
  const fresh = (t) => {
    if (t.startsWith('flag:')) return { flag: t.slice(5) };
    if (NUM[t]) return { [t]: NUM[t][2] };
    if (t === 'trash') return { trash: { from: ['hand', 'playArea', 'discard'], optional: true } };
    if (t === 'discardThen') return { discardThen: [{ draw: 1 }] };
    if (t === 'choose') return { choose: [{ label: '+2 Gold', effects: [{ gold: 2 }] }, { label: 'Heal 1', effects: [{ heal: 1 }] }] };
    if (t === 'when') return { when: { has: 'artifact' }, effects: [{ skill: 2 }] };
    if (t === 'buyTomes') return { buyTomes: { gold: 7, count: 2 } };
    return { [t]: true };
  };
  // split { skill: 2, draw: 1 } into [{ skill: 2 }, { draw: 1 }] so every row edits one effect
  function atoms(list) {
    const out = [];
    for (const e of list || []) for (const k of ORDER) {
      if (!(k in e)) continue;
      if (k === 'when') out.push({ when: e.when, effects: atoms(e.effects) });
      else if (k === 'choose') out.push({ choose: e.choose.map((o) => ({ ...o, effects: atoms(o.effects) })) });
      else if (k === 'discardThen') out.push({ discardThen: atoms(e.discardThen) });
      else out.push({ [k]: e[k] });
    }
    return out;
  }

  // ---------- auto-written card text ----------
  const cardName = (id) => STATIC?.cards?.[id]?.name || draft?.cards.find((c) => c.id === id)?.name || id;
  function say(e) {
    const t = typeOf(e);
    const n = e[t];
    switch (t) {
      case 'skill': return `+${n} Skill`;
      case 'swords': return `+${n} Sword${n === 1 ? '' : 's'}`;
      case 'boots': return `+${n} Boot${n === 1 ? '' : 's'}`;
      case 'gold': return `+${n} Gold`;
      case 'heal': return `Heal ${n}`;
      case 'clank': return n < 0 ? `-${-n} Clank!` : `+${n} Clank!`;
      case 'draw': return n === 1 ? 'Draw a card' : `Draw ${n} cards`;
      case 'teleport': return n === 1 ? 'Teleport' : `Teleport ${n} times`;
      case 'othersClank': return `Each other player adds ${n} Clank!`;
      case 'allClank': return `Each player adds ${n} Clank!`;
      case 'gemDiscount': return `Gems cost ${n} less this turn`;
      case 'dragonAttack': return 'Dragon Attack';
      case 'replaceRow': return 'Replace a card in the Dungeon Row';
      case 'takeAdjacentSecret': return 'Take a Secret from an adjacent room';
      case 'skillPerClank': return '+1 Skill for each Clank! you make this turn';
      case 'returnDragonCubes': return 'Return set-aside dragon cubes to the bag';
      case 'flag:ignoreMonsterTunnels': return 'Ignore monsters in tunnels this turn';
      case 'flag:ignoreCrystalCaves': return 'You do not have to stop in Crystal Caves this turn';
      case 'buyTomes': return `Pay ${e.buyTomes.gold} Gold to gain ${e.buyTomes.count === 1 ? 'a Secret Tome' : `${e.buyTomes.count} Secret Tomes`}`;
      case 'trash': return `${e.trash.optional ? 'You may trash' : 'Trash'} ${e.trash.match ? `a ${cardName(e.trash.match)}` : 'a card'}`;
      case 'discardThen': return `Discard a card to: ${phrase(e.discardThen)}`;
      case 'choose': return `Choose one: ${e.choose.map((o) => o.label).join(', or ')}`;
      case 'when': {
        const c = e.when.otherCompanion ? 'otherCompanion' : e.when.has;
        return `If ${CONDS.find(([k]) => k === c)?.[1] || '…'}, ${phrase(e.effects)}`;
      }
      default: return '';
    }
  }
  const phrase = (list) => (list || []).map(say).filter(Boolean).join('. ') || 'nothing';
  const sentence = (list) => { const p = (list || []).map(say).filter(Boolean).join('. '); return p ? p + '.' : ''; };
  function writeText(c) {
    const parts = [];
    if (c.danger) parts.push('Danger.');
    const main = SLOTS[c.kind][0][0];
    const lead = { defeat: 'Defeat: ', use: 'Use: ' }[main] || '';
    if (c.arrive?.length) parts.push(`Arrive: ${sentence(c.arrive)}`);
    if (c[main]?.length) parts.push(lead + sentence(c[main]));
    if (c.acquire?.length) parts.push(`Acquire: ${sentence(c.acquire)}`);
    return parts.join(' ').slice(0, 240);
  }

  // ---------- state ----------
  let decks = [];          // summaries
  let draft = null;        // the deck being edited (full)
  let savedJSON = '';      // what is on the server, to tell if there are unsaved changes
  let sel = null;          // index of the selected card
  let filter = 'all', query = '';
  let refs = [];           // effect-editor handles, rebuilt on every editor render
  const autoText = new WeakSet(); // cards whose text follows their effects (new cards, until text is typed)

  const readOnly = () => !!draft?.builtin;
  const dirty = () => !!draft && !draft.builtin && JSON.stringify(strip(draft)) !== savedJSON;
  const strip = (d) => ({ name: d.name, cards: d.cards });
  const uidCard = () => 'card_' + Math.random().toString(36).slice(2, 8);
  const preview = (c) => ({ id: c.id, name: c.name || 'Unnamed', kind: c.kind, tags: c.tags || [], cost: c.cost ?? 0, swords: c.swords ?? 0, points: c.points || 0, dragon: !!c.dragon, danger: !!c.danger, text: c.text || '', reserve: false });

  async function api(method, path, body) {
    const r = await fetch(`/api/decks${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  }

  // ---------- open / close ----------
  async function open() {
    $('lobby').classList.add('hidden');
    $('workshop').classList.remove('hidden');
    document.title = 'Deck Workshop — Clank!';
    await loadList();
    const want = localStorage.getItem('clank:deck');
    await selectDeck(decks.some((d) => d.id === want) ? want : 'base', { force: true });
  }
  function close() {
    if (dirty() && !confirm('You have unsaved changes. Leave without saving?')) return;
    $('workshop').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    closeSheet();
    document.title = 'Clank!';
    deckList = null; // the waiting room re-reads the deck list
  }

  async function loadList() {
    try { decks = await api('GET', ''); } catch (e) { toast(e.message); }
    renderList();
  }

  async function selectDeck(id, { force = false } = {}) {
    if (!force && draft?.id === id) return;
    if (!force && dirty() && !confirm('You have unsaved changes. Switch decks and lose them?')) { renderList(); return; }
    try {
      const d = await api('GET', `/${encodeURIComponent(id)}`);
      draft = { id: d.id, name: d.name, builtin: !!d.builtin, cards: d.cards.map((c) => ({ ...c, ...slotAtoms(c) })) };
      savedJSON = JSON.stringify(strip(draft));
      sel = null; closeSheet();
      localStorage.setItem('clank:deck', id);
      renderAll();
    } catch (e) { toast(e.message); }
  }
  const slotAtoms = (c) => Object.fromEntries(['play', 'use', 'defeat', 'acquire', 'arrive'].filter((s) => c[s]).map((s) => [s, atoms(c[s])]));

  // ---------- deck actions ----------
  async function save() {
    if (!draft || readOnly()) return;
    try {
      const saved = await api('PUT', `/${encodeURIComponent(draft.id)}`, strip(draft));
      savedJSON = JSON.stringify(strip(draft));
      draft.name = saved.name;
      toast('Deck saved');
      await loadList(); renderBar();
    } catch (e) { toast(e.message); showNotice(e.message, true); }
  }
  async function create(body, msg) {
    try {
      const saved = await api('POST', '', body);
      await loadList();
      await selectDeck(saved.id, { force: true });
      toast(msg);
    } catch (e) { toast(e.message); }
  }
  function cloneDeck() {
    if (!draft) return;
    if (dirty() && !confirm('Clone the deck as it is now, including unsaved changes?')) return;
    create({ name: `${draft.name} (copy)`.slice(0, 40), cards: draft.cards }, 'Cloned: you are now editing the copy');
  }
  async function deleteDeck() {
    if (!draft || readOnly()) return;
    if (!confirm(`Delete the deck "${draft.name}"? This cannot be undone.`)) return;
    try { await api('DELETE', `/${encodeURIComponent(draft.id)}`); savedJSON = JSON.stringify(strip(draft)); toast('Deck deleted'); await loadList(); await selectDeck('base', { force: true }); }
    catch (e) { toast(e.message); }
  }
  function exportDeck() {
    if (!draft) return;
    const blob = new Blob([JSON.stringify({ name: draft.name, cards: draft.cards }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function importDeck(file) {
    try {
      const data = JSON.parse(await file.text());
      await create({ name: data.name || file.name.replace(/\.json$/i, ''), cards: data.cards }, 'Deck imported');
    } catch (e) { toast(e instanceof SyntaxError ? 'That file is not valid JSON' : e.message); }
  }

  // ---------- card actions ----------
  function addCard() {
    if (readOnly()) return;
    const c = { id: uidCard(), name: 'New card', kind: 'companion', tags: ['companion'], qty: 1, cost: 3, points: 0, text: '', play: [{ skill: 2 }] };
    c.text = writeText(c);
    autoText.add(c);
    draft.cards.push(c);
    selectCard(draft.cards.length - 1);
  }
  function duplicateCard() {
    if (readOnly() || sel == null) return;
    const src = draft.cards[sel];
    const c = JSON.parse(JSON.stringify(src));
    c.id = uidCard(); delete c.baseId; c.name = `${src.name} II`.slice(0, 32);
    draft.cards.splice(sel + 1, 0, c);
    selectCard(sel + 1);
  }
  function removeCard() {
    if (readOnly() || sel == null) return;
    const c = draft.cards[sel];
    if (!confirm(`Remove "${c.name}" (${c.qty} ${c.qty === 1 ? 'copy' : 'copies'}) from this deck?`)) return;
    draft.cards.splice(sel, 1);
    sel = null; closeSheet();
    renderAll();
  }
  function selectCard(i) {
    sel = i;
    renderGrid(); renderEditor(); renderStats();
    if (window.innerWidth <= 900) { $('wsEditor').classList.add('open'); document.body.classList.add('ws-sheet'); }
    $('wsEditor').scrollTop = 0;
  }
  function closeSheet() { $('wsEditor').classList.remove('open'); document.body.classList.remove('ws-sheet'); }

  // called after any edit to the selected card
  function changed({ editor = false } = {}) {
    const c = draft.cards[sel];
    if (c && autoText.has(c)) { c.text = writeText(c); const t = $('wsEditor').querySelector('[data-f="text"]'); if (t) t.value = c.text; }
    if (editor) renderEditor(); else renderPreview();
    renderGrid(); renderStats(); renderBar();
  }

  // ---------- rendering ----------
  function renderAll() { renderList(); renderBar(); renderStats(); renderFilters(); renderGrid(); renderEditor(); }

  function renderList() {
    const cur = draft?.id;
    $('wsDeckList').innerHTML = decks.map((d) => `<button class="ws-deck ${d.id === cur ? 'on' : ''}" data-deck="${esc(d.id)}">
      <span class="nm">${esc(d.name)}${d.builtin ? ' <em>built-in</em>' : ''}${d.id === cur && dirty() ? ' <em class="dot">unsaved</em>' : ''}</span>
      <span class="muted">${d.total} cards · ${d.kinds} kinds</span></button>`).join('');
    $('wsDeckSel').innerHTML = decks.map((d) => `<option value="${esc(d.id)}" ${d.id === cur ? 'selected' : ''}>${esc(d.name)}${d.builtin ? ' (built-in)' : ''}</option>`).join('');
  }

  function renderBar() {
    if (!draft) return;
    const ro = readOnly();
    const n = $('wsName');
    if (document.activeElement !== n) n.value = draft.name;
    n.disabled = ro;
    $('wsSave').disabled = ro || !dirty();
    $('wsSave').textContent = dirty() ? 'Save' : 'Saved';
    $('wsDelete').disabled = ro;
    renderList();
    if (ro) showNotice('This is the base game deck, so it is read-only. <button id="wsCloneInline" class="primary">Clone it</button> to make a version you can edit.');
    else hideNotice();
    const b = $('wsCloneInline'); if (b) b.onclick = cloneDeck;
  }
  function showNotice(html, isError = false) { const el = $('wsNotice'); el.innerHTML = isError ? esc(html) : html; el.classList.toggle('err', isError); el.classList.remove('hidden'); }
  function hideNotice() { $('wsNotice').classList.add('hidden'); }

  function renderStats() {
    if (!draft) return;
    const sum = (f) => draft.cards.filter(f).reduce((s, c) => s + c.qty, 0);
    const total = sum(() => true);
    const bits = [
      `<b class="${total < LIMIT.minTotal || total > LIMIT.maxTotal ? 'bad' : ''}">${total} cards</b>`,
      `${sum((c) => c.kind === 'monster')} monsters`, `${sum((c) => c.kind === 'device')} devices`,
      `${sum((c) => c.kind === 'companion' && !(c.tags || []).includes('gem'))} companions`, `${sum((c) => (c.tags || []).includes('gem'))} gems`,
      `${sum((c) => c.dragon)} with dragon`,
    ];
    $('wsStats').innerHTML = bits.join(' · ') + (total < LIMIT.minTotal ? ` <span class="bad">— needs at least ${LIMIT.minTotal}</span>` : total > LIMIT.maxTotal ? ` <span class="bad">— at most ${LIMIT.maxTotal}</span>` : '');
  }

  function renderFilters() {
    $('wsKinds').innerHTML = FILTERS.map(([k, l]) => `<button data-filter="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('');
  }

  const matches = (c) => {
    const tags = c.tags || [];
    if (filter === 'gem' && !tags.includes('gem')) return false;
    if (filter === 'companion' && (c.kind !== 'companion' || tags.includes('gem'))) return false;
    if ((filter === 'monster' || filter === 'device') && c.kind !== filter) return false;
    if (filter === 'dragon' && !c.dragon) return false;
    if (query && !`${c.name} ${c.text}`.toLowerCase().includes(query)) return false;
    return true;
  };
  function renderGrid() {
    if (!draft) return;
    const rows = draft.cards.map((c, i) => ({ c, i })).filter(({ c }) => matches(c))
      .sort((a, b) => KIND_ORDER[a.c.kind] - KIND_ORDER[b.c.kind] || (a.c.cost ?? a.c.swords) - (b.c.cost ?? b.c.swords) || a.c.name.localeCompare(b.c.name));
    $('wsGrid').innerHTML = rows.map(({ c, i }) => `<div class="ws-tile ${i === sel ? 'sel' : ''}" data-card="${i}" tabindex="0" role="button" aria-label="${esc(c.name)}, ${c.qty} copies">${cardHTML(preview(c), { count: c.qty, playable: i === sel })}</div>`).join('')
      + (readOnly() ? '' : `<button class="ws-add" id="wsAdd" title="Create a new card in this deck"><span>＋</span>New card</button>`)
      + (!rows.length && readOnly() ? '<p class="muted">No cards match.</p>' : '');
    const add = $('wsAdd'); if (add) add.onclick = addCard;
  }

  function renderPreview() {
    const c = draft?.cards[sel];
    const el = $('wsEditor').querySelector('.ws-preview');
    if (c && el) el.innerHTML = cardHTML(preview(c), { count: c.qty });
  }

  // number stepper
  const stepper = (f, v, lo, hi, dis) => `<span class="ws-step"><button data-step="${f}" data-d="-1" ${dis} aria-label="less">−</button><input type="number" data-f="${f}" value="${v ?? 0}" min="${lo}" max="${hi}" ${dis}><button data-step="${f}" data-d="1" ${dis} aria-label="more">＋</button></span>`;

  function renderEditor() {
    const box = $('wsEditor');
    const y = box.scrollTop;
    refs = [];
    const c = draft?.cards[sel];
    if (!c) {
      box.innerHTML = `<div class="ws-empty"><p>Select a card to ${readOnly() ? 'see its details' : 'edit it'}.</p>${readOnly() ? '' : '<p class="muted">Or add a new one with the ＋ tile.</p>'}</div>`;
      return;
    }
    const dis = readOnly() ? 'disabled' : '';
    const sub = (c.tags || [])[0] || 'companion';
    const slots = SLOTS[c.kind];
    box.innerHTML = `
      <div class="ws-edhead"><h3>${readOnly() ? 'Card' : 'Edit card'}</h3><button class="defer" id="wsSheetClose">Done</button></div>
      <div class="ws-preview"></div>
      <label class="ws-f"><span>Name</span><input data-f="name" maxlength="32" value="${esc(c.name)}" ${dis}></label>
      <div class="ws-f"><span>Type</span><div class="seg">${[['monster', 'Monster'], ['device', 'Device'], ['companion', 'Companion / item']].map(([k, l]) => `<button data-kind="${k}" class="${c.kind === k ? 'on' : ''}" ${dis}>${l}</button>`).join('')}</div></div>
      ${c.kind === 'companion' ? `<div class="ws-f"><span>Subtype</span><div class="seg">${SUBTYPES.map(([k, l]) => `<button data-sub="${k}" class="${sub === k ? 'on' : ''}" ${dis}>${l}</button>`).join('')}</div></div>` : ''}
      <div class="ws-grid2">
        <label class="ws-f"><span>Copies</span>${stepper('qty', c.qty, 1, 10, dis)}</label>
        ${c.kind === 'monster' ? `<label class="ws-f"><span>Swords to defeat</span>${stepper('swords', c.swords, 0, 20, dis)}</label>` : `<label class="ws-f"><span>Skill cost</span>${stepper('cost', c.cost, 0, 20, dis)}</label>`}
        <label class="ws-f"><span>Points</span>${stepper('points', c.points, -5, 20, dis)}</label>
        <div class="ws-f"><span>Symbols</span><label class="ws-chk"><input type="checkbox" data-f="dragon" ${c.dragon ? 'checked' : ''} ${dis}> Dragon attack</label><label class="ws-chk"><input type="checkbox" data-f="danger" ${c.danger ? 'checked' : ''} ${dis}> Danger</label></div>
      </div>
      ${slots.map(([s, l]) => `<div class="ws-slot"><h4>${l}</h4>${effectList(c[s] || (c[s] = []), dis)}</div>`).join('')}
      <label class="ws-f"><span>Card text <button class="defer ws-auto" id="wsAutoText" ${dis} title="Write the text from the effects above">Write from effects</button></span><textarea data-f="text" rows="3" maxlength="240" ${dis}>${esc(c.text)}</textarea>
        <small class="muted">${autoText.has(c) ? 'Follows the effects as you edit them; type here to write your own.' : 'Shown to players. The effects above are what the game actually does.'}</small></label>
      ${c.baseId && STATIC?.cards?.[c.baseId] && /At game end/i.test(STATIC.cards[c.baseId].text) ? '<p class="muted">This card keeps its special end-of-game scoring from the base game.</p>' : ''}
      ${readOnly() ? '' : `<div class="ws-cardbtns"><button id="wsDup">Duplicate</button><button id="wsRemove" class="danger">Remove from deck</button></div>`}`;
    renderPreview();
    box.scrollTop = y;
    const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    on('wsSheetClose', () => { closeSheet(); sel = null; renderGrid(); renderEditor(); });
    on('wsDup', duplicateCard); on('wsRemove', removeCard);
    on('wsAutoText', () => { c.text = writeText(c); autoText.add(c); changed({ editor: true }); });
  }

  function effectList(list, dis) {
    const r = refs.push({ list }) - 1;
    const rows = list.map((e, i) => effectRow(list, i, dis)).join('');
    return `<div class="ws-effects">${rows || '<div class="muted ws-none">Nothing.</div>'}${dis ? '' : `<button class="ws-addfx" data-ref="${r}" data-act="add">＋ Add effect</button>`}</div>`;
  }

  function typeSelect(r, cur, dis) {
    return `<select data-ref="${r}" data-act="type" ${dis} aria-label="Effect">${TYPES.map(([g, l]) => `<optgroup label="${g}">${l.map(([k, n]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${n}</option>`).join('')}</optgroup>`).join('')}</select>`;
  }

  function effectRow(list, i, dis) {
    const e = list[i];
    const t = typeOf(e);
    const r = refs.push({ list, i }) - 1;
    let params = '', nested = '';
    if (NUM[t]) params = `<input type="number" data-ref="${r}" data-act="num" value="${e[t]}" min="${NUM[t][0]}" max="${NUM[t][1]}" ${dis} aria-label="Amount">`;
    else if (t === 'buyTomes') params = `<label>gold <input type="number" data-ref="${r}" data-act="tomeGold" value="${e.buyTomes.gold}" min="0" max="20" ${dis}></label><label>tomes <input type="number" data-ref="${r}" data-act="tomeCount" value="${e.buyTomes.count}" min="1" max="3" ${dis}></label>`;
    else if (t === 'trash') {
      const ids = [...new Set(['burgle', 'stumble', 'sidestep', 'scramble', ...draft.cards.map((c) => c.id)])];
      params = `<div class="ws-trash">from ${ZONES.map(([z, l]) => `<label class="ws-chk"><input type="checkbox" data-ref="${r}" data-act="zone" data-zone="${z}" ${e.trash.from.includes(z) ? 'checked' : ''} ${dis}> ${l}</label>`).join('')}
        <label>card <select data-ref="${r}" data-act="match" ${dis}><option value="">any card</option>${ids.map((id) => `<option value="${esc(id)}" ${e.trash.match === id ? 'selected' : ''}>${esc(cardName(id))}</option>`).join('')}</select></label>
        <label class="ws-chk"><input type="checkbox" data-ref="${r}" data-act="optional" ${e.trash.optional ? 'checked' : ''} ${dis}> optional</label></div>`;
    } else if (t === 'when') {
      const c = e.when.otherCompanion ? 'otherCompanion' : e.when.has;
      params = `<select data-ref="${r}" data-act="cond" ${dis} aria-label="Condition">${CONDS.map(([k, l]) => `<option value="${k}" ${k === c ? 'selected' : ''}>if ${l}</option>`).join('')}</select>`;
      nested = `<div class="ws-nest"><span class="ws-nl">then</span>${effectList(e.effects, dis)}</div>`;
    } else if (t === 'discardThen') nested = `<div class="ws-nest"><span class="ws-nl">after discarding</span>${effectList(e.discardThen, dis)}</div>`;
    else if (t === 'choose') {
      nested = `<div class="ws-nest">${e.choose.map((o, j) => {
        const or = refs.push({ list, i, j }) - 1;
        return `<div class="ws-opt"><div class="ws-optrow"><span class="ws-nl">option ${j + 1}</span><input data-ref="${or}" data-act="label" maxlength="40" value="${esc(o.label)}" ${dis} aria-label="Option label">
          <label title="Only offered if the player has this much gold">needs gold <input type="number" data-ref="${or}" data-act="needGold" value="${o.requires?.gold || 0}" min="0" max="20" ${dis}></label>
          ${dis || e.choose.length <= 2 ? '' : `<button class="ws-x" data-ref="${or}" data-act="delOpt" title="Remove this option">✕</button>`}</div>${effectList(o.effects, dis)}</div>`;
      }).join('')}${dis || e.choose.length >= 4 ? '' : `<button class="ws-addfx" data-ref="${r}" data-act="addOpt">＋ Add option</button>`}</div>`;
    }
    const tools = dis ? '' : `<span class="ws-tools"><button data-ref="${r}" data-act="up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button><button data-ref="${r}" data-act="down" ${i === list.length - 1 ? 'disabled' : ''} title="Move down">↓</button><button class="ws-x" data-ref="${r}" data-act="del" title="Remove effect">✕</button></span>`;
    return `<div class="ws-fx"><div class="ws-fxrow">${typeSelect(r, t, dis)}${params}${tools}</div>${nested}</div>`;
  }

  // ---------- editor events ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const RANGE = { qty: [1, 10], cost: [0, 20], swords: [0, 20], points: [-5, 20] };

  function onField(el) {
    const c = draft.cards[sel];
    const f = el.dataset.f;
    if (f === 'name') { c.name = el.value.slice(0, 32); return changed(); }
    if (f === 'text') { c.text = el.value.slice(0, 240); autoText.delete(c); return changed(); }
    if (f === 'dragon' || f === 'danger') { if (el.checked) c[f] = true; else delete c[f]; return changed(); }
    if (RANGE[f]) { if (el.value === '' || el.value === '-') return; c[f] = clamp(el.value, ...RANGE[f]); return changed(); }
  }

  function setKind(kind) {
    const c = draft.cards[sel];
    if (c.kind === kind) return;
    const oldMain = SLOTS[c.kind][0][0], newMain = SLOTS[kind][0][0];
    const main = c[oldMain] || [];
    delete c[oldMain];
    for (const s of ['play', 'use', 'defeat', 'acquire']) if (!SLOTS[kind].some(([k]) => k === s)) delete c[s];
    c[newMain] = main;
    if (kind === 'monster') { c.swords = c.cost ?? 2; delete c.cost; delete c.tags; }
    else { if (c.cost == null) c.cost = c.swords ?? 3; delete c.swords; }
    if (kind === 'companion') c.tags = c.tags?.length ? c.tags : ['companion']; else delete c.tags;
    c.kind = kind;
    changed({ editor: true });
  }

  function onEffect(el, ev) {
    const h = refs[Number(el.dataset.ref)];
    if (!h) return;
    const act = el.dataset.act;
    const e = h.i != null ? h.list[h.i] : null;
    const num = (v, lo, hi) => clamp(v, lo, hi);
    let structural = true;
    switch (act) {
      case 'add': h.list.push({ skill: 1 }); break;
      case 'del': h.list.splice(h.i, 1); break;
      case 'up': [h.list[h.i - 1], h.list[h.i]] = [h.list[h.i], h.list[h.i - 1]]; break;
      case 'down': [h.list[h.i + 1], h.list[h.i]] = [h.list[h.i], h.list[h.i + 1]]; break;
      case 'type': h.list[h.i] = fresh(el.value); break;
      case 'num': { if (el.value === '' || el.value === '-') return; const t = typeOf(e); e[t] = num(el.value, NUM[t][0], NUM[t][1]); structural = false; break; }
      case 'tomeGold': e.buyTomes.gold = num(el.value, 0, 20); structural = false; break;
      case 'tomeCount': e.buyTomes.count = num(el.value, 1, 3); structural = false; break;
      case 'zone': {
        const z = el.dataset.zone;
        const from = new Set(e.trash.from);
        if (el.checked) from.add(z); else if (from.size > 1) from.delete(z); else { el.checked = true; return toast('Pick at least one place to trash from'); }
        e.trash.from = ZONES.map(([k]) => k).filter((k) => from.has(k));
        structural = false; break;
      }
      case 'match': if (el.value) e.trash.match = el.value; else delete e.trash.match; structural = false; break;
      case 'optional': if (el.checked) e.trash.optional = true; else delete e.trash.optional; structural = false; break;
      case 'cond': e.when = el.value === 'otherCompanion' ? { otherCompanion: true } : { has: el.value }; structural = false; break;
      case 'addOpt': e.choose.push({ label: 'Draw a card', effects: [{ draw: 1 }] }); break;
      case 'delOpt': e.choose.splice(h.j, 1); break;
      case 'label': e.choose[h.j].label = el.value.slice(0, 40); structural = false; break;
      case 'needGold': { const g = num(el.value, 0, 20); if (g) e.choose[h.j].requires = { gold: g }; else delete e.choose[h.j].requires; structural = false; break; }
      default: return;
    }
    if (ev?.type === 'input' && structural) return; // structural changes come from clicks/changes only
    changed({ editor: structural });
  }

  // ---------- wiring ----------
  $('workshopBtn').onclick = open;
  $('wsBack').onclick = close;
  // a new deck starts as a copy of the base game's cards
  $('wsNew').onclick = async () => {
    if (dirty() && !confirm('You have unsaved changes. Start a new deck and lose them?')) return;
    try { const base = await api('GET', '/base'); create({ name: 'My deck', cards: base.cards }, 'New deck created from the base game\'s cards'); } catch (e) { toast(e.message); }
  };
  $('wsImport').onclick = () => $('wsFile').click();
  $('wsFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importDeck(f); };
  $('wsClone').onclick = cloneDeck;
  $('wsDelete').onclick = deleteDeck;
  $('wsExport').onclick = exportDeck;
  $('wsSave').onclick = save;
  $('wsName').oninput = (e) => { if (!readOnly()) { draft.name = e.target.value; renderBar(); } };
  $('wsDeckList').onclick = (e) => { const b = e.target.closest('[data-deck]'); if (b) selectDeck(b.dataset.deck); };
  $('wsDeckSel').onchange = (e) => selectDeck(e.target.value);
  $('wsKinds').onclick = (e) => { const b = e.target.closest('[data-filter]'); if (b) { filter = b.dataset.filter; renderFilters(); renderGrid(); } };
  $('wsSearch').oninput = (e) => { query = e.target.value.trim().toLowerCase(); renderGrid(); };
  $('wsGrid').onclick = (e) => { const t = e.target.closest('[data-card]'); if (t) selectCard(Number(t.dataset.card)); };
  $('wsGrid').onkeydown = (e) => { const t = e.target.closest('[data-card]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectCard(Number(t.dataset.card)); } };

  const ed = $('wsEditor');
  ed.addEventListener('input', (e) => {
    if (readOnly()) return;
    if (e.target.dataset.f) onField(e.target);
    else if (e.target.dataset.ref != null && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') onEffect(e.target, e);
  });
  ed.addEventListener('change', (e) => {
    if (readOnly()) return;
    const t = e.target;
    if (t.dataset.f && (t.type === 'checkbox')) onField(t);
    else if (t.dataset.f && t.type === 'number') { const c = draft.cards[sel]; t.value = c[t.dataset.f]; } // show the clamped value
    else if (t.dataset.ref != null && (t.tagName === 'SELECT' || t.type === 'checkbox')) onEffect(t, e);
    else if (t.dataset.ref != null && t.type === 'number') t.value = clamp(t.value, Number(t.min), Number(t.max)); // show the clamped value
  });
  ed.addEventListener('click', (e) => {
    if (readOnly()) return;
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const c = draft.cards[sel];
    if (b.dataset.kind) setKind(b.dataset.kind);
    else if (b.dataset.sub) { c.tags = [b.dataset.sub]; changed({ editor: true }); }
    else if (b.dataset.step) { const f = b.dataset.step; c[f] = clamp((c[f] ?? 0) + Number(b.dataset.d), ...RANGE[f]); changed({ editor: true }); }
    else if (b.dataset.ref != null) onEffect(b, e);
  });

  document.addEventListener('keydown', (e) => {
    if ($('workshop').classList.contains('hidden')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    else if (e.key === 'Escape' && $('wsEditor').classList.contains('open')) { closeSheet(); }
  });
  window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('resize', () => { if (window.innerWidth > 900) closeSheet(); });
})();
