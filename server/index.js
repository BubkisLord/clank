import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game, GameError } from './game/engine.js';
import { randomCode } from './game/util.js';
import { nextAction, BOT_NAMES } from './game/ai.js';
import { listDecks, getDeck, saveDeck, deleteDeck } from './decks-store.js';
import { DeckError } from './game/cards/decks.js';

const BOT_DELAY = Number(process.env.BOT_DELAY || 1700); // ms between bot actions, so people can follow along

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };

const STATIC_DATA = JSON.stringify(Game.staticData());
const games = new Map(); // code -> { game, sockets: Map<playerId, Set<ws>> }

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new DeckError('Deck is too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch { reject(new DeckError('Body is not valid JSON')); } });
    req.on('error', reject);
  });
}

// Deck workshop API: GET /api/decks, GET/PUT/DELETE /api/decks/:id, POST /api/decks (create)
async function decksApi(req, res, url) {
  const id = decodeURIComponent(url.pathname.slice('/api/decks/'.length) || '') || null;
  try {
    if (req.method === 'GET' && !id) return json(res, 200, listDecks());
    if (req.method === 'GET') { const d = getDeck(id); return d ? json(res, 200, d) : json(res, 404, { error: 'No such deck' }); }
    if (req.method === 'POST' && !id) return json(res, 201, saveDeck(await readBody(req)));
    if (req.method === 'PUT' && id) return json(res, 200, saveDeck(await readBody(req), id));
    if (req.method === 'DELETE' && id) { deleteDeck(id); return json(res, 200, { ok: true }); }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    if (e instanceof DeckError) return json(res, 400, { error: e.message });
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/decks' || url.pathname.startsWith('/api/decks/')) return decksApi(req, res, url);
  if (url.pathname === '/api/static') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' });
    return res.end(STATIC_DATA);
  }
  if (url.pathname === '/api/games') {
    const list = [...games.values()].filter((g) => g.game.phase === 'lobby').map((g) => ({ code: g.game.code, players: g.game.players.map((p) => p.name) }));
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(list));
  }
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

function send(ws, msg) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); }

function broadcast(entry) {
  const { game, sockets } = entry;
  for (const [pid, set] of sockets) {
    const state = game.stateFor(pid);
    for (const ws of set) send(ws, { type: 'state', state });
  }
  scheduleBots(entry);
}

// ---------------- computer players ----------------
function scheduleBots(entry) {
  const { game } = entry;
  if (entry.botTimer || game.phase !== 'playing' || entry.sockets.size === 0) return; // pause when nobody is watching
  const actorId = game.pending ? game.pending.pid : game.currentPlayer()?.id;
  const bot = game.playerById(actorId);
  if (!bot?.bot) return;
  entry.botTimer = setTimeout(() => {
    entry.botTimer = null;
    if (games.get(game.code) !== entry) return;
    const key = `${game.turnNumber}:${bot.id}`;
    if (entry.botTurn !== key) { entry.botTurn = key; entry.botSteps = 0; }
    let action = nextAction(game, bot);
    if (action && ++entry.botSteps > 80 && !game.pending) action = { type: 'endTurn' }; // never loop forever
    if (action) {
      try { game.act(bot.id, action); }
      catch (e) {
        console.warn(`bot ${bot.name} tried ${JSON.stringify(action)}: ${e.message}`);
        try { if (game.pending?.pid === bot.id) game.act(bot.id, { type: 'resolve', value: game.pending.options[0].value }); else game.act(bot.id, { type: 'endTurn' }); }
        catch (e2) { console.error('bot recovery failed', e2); }
      }
      entry.lastActivity = Date.now();
    }
    broadcast(entry);
  }, game.pending ? BOT_DELAY * 1.2 : BOT_DELAY);
}

function attach(ws, entry, player) {
  if (ws.gameCode) detach(ws); // a socket holds one seat at a time
  ws.gameCode = entry.game.code;
  ws.playerId = player.id;
  if (!entry.sockets.has(player.id)) entry.sockets.set(player.id, new Set());
  entry.sockets.get(player.id).add(ws);
  player.connected = true;
  send(ws, { type: 'joined', code: entry.game.code, playerId: player.id, token: player.token });
  broadcast(entry);
}

function detach(ws) {
  const entry = games.get(ws.gameCode);
  if (!entry) return;
  const set = entry.sockets.get(ws.playerId);
  if (set) { set.delete(ws); if (set.size === 0) { entry.sockets.delete(ws.playerId); const p = entry.game.playerById(ws.playerId); if (p) p.connected = false; } }
  if (entry.game.phase === 'lobby' && !entry.sockets.has(ws.playerId)) entry.game.removePlayer(ws.playerId);
  if (entry.game.players.every((p) => p.bot)) { clearTimeout(entry.botTimer); games.delete(entry.game.code); return; } // only bots left
  entry.lastActivity = Date.now();
  broadcast(entry);
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try {
      switch (msg.type) {
        case 'create': {
          let code = randomCode();
          while (games.has(code)) code = randomCode();
          const game = new Game(code);
          const entry = { game, sockets: new Map(), kicked: new Set(), lastActivity: Date.now() };
          games.set(code, entry);
          const p = game.addPlayer(msg.name);
          attach(ws, entry, p);
          break;
        }
        case 'join': {
          const code = String(msg.code || '').toUpperCase().trim();
          const entry = games.get(code);
          if (!entry) throw new GameError(`No game with code ${code}`);
          if (msg.token && entry.kicked.has(msg.token)) throw new GameError('You were removed from this game by the host');
          let p = msg.token ? entry.game.players.find((x) => x.token === msg.token) : null;
          if (!p) p = entry.game.addPlayer(msg.name);
          attach(ws, entry, p);
          break;
        }
        case 'start': {
          const entry = games.get(ws.gameCode);
          if (!entry) throw new GameError('Not in a game');
          if (entry.game.players[0]?.id !== ws.playerId) throw new GameError('Only the host can start');
          const { game } = entry;
          // use the deck as saved now, in case it was edited after it was picked
          const deck = getDeck(game.options.deck);
          if (!deck) game.log(`The "${game.options.deckName}" deck is gone; using the base game's cards.`);
          game.setDeck(deck);
          game.start();
          broadcast(entry);
          break;
        }
        case 'option': {
          const entry = games.get(ws.gameCode);
          if (!entry) throw new GameError('Not in a game');
          if (entry.game.players[0]?.id !== ws.playerId) throw new GameError('Only the host can change options');
          if (msg.key === 'deck') {
            const deck = getDeck(String(msg.value || ''));
            if (!deck) throw new GameError('No such deck');
            entry.game.setDeck(deck);
          } else entry.game.setOption(msg.key, msg.value);
          broadcast(entry);
          break;
        }
        case 'addBot': {
          const entry = games.get(ws.gameCode);
          if (!entry) throw new GameError('Not in a game');
          const { game } = entry;
          if (game.players[0]?.id !== ws.playerId) throw new GameError('Only the host can add computer players');
          const taken = new Set(game.players.map((p) => p.name));
          const name = BOT_NAMES.filter((n) => !taken.has(n))[Math.floor(Math.random() * BOT_NAMES.filter((n) => !taken.has(n)).length)] || 'Bot';
          game.addPlayer(name, { bot: true });
          broadcast(entry);
          break;
        }
        case 'kick': {
          const entry = games.get(ws.gameCode);
          if (!entry) throw new GameError('Not in a game');
          const { game } = entry;
          if (game.phase !== 'lobby') throw new GameError('Players can only be kicked before the game starts');
          if (game.players[0]?.id !== ws.playerId) throw new GameError('Only the host can kick');
          const target = game.playerById(msg.playerId);
          if (!target) throw new GameError('No such player');
          if (target.id === ws.playerId) throw new GameError('You cannot kick yourself');
          entry.kicked.add(target.token);
          for (const sock of entry.sockets.get(target.id) || []) { send(sock, { type: 'kicked', code: game.code }); sock.gameCode = null; sock.playerId = null; }
          entry.sockets.delete(target.id);
          game.removePlayer(target.id, 'was kicked by the host');
          broadcast(entry);
          break;
        }
        case 'action': {
          const entry = games.get(ws.gameCode);
          if (!entry) throw new GameError('Not in a game');
          entry.lastActivity = Date.now();
          entry.game.act(ws.playerId, msg.action || {});
          broadcast(entry);
          break;
        }
        case 'leave': detach(ws); ws.gameCode = null; break;
        default: break;
      }
    } catch (e) {
      if (e instanceof GameError) send(ws, { type: 'error', message: e.message });
      else { console.error(e); send(ws, { type: 'error', message: 'Server error: ' + e.message }); }
    }
  });
  ws.on('close', () => detach(ws));
});

// purge idle games
setInterval(() => {
  const cutoff = Date.now() - 6 * 3600 * 1000;
  for (const [code, e] of games) if (e.lastActivity < cutoff && e.sockets.size === 0) games.delete(code);
}, 600000).unref();

server.listen(PORT, HOST, () => {
  const ifaces = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Clank! server listening on http://localhost:${PORT}`);
  for (const ip of ifaces) console.log(`  LAN: http://${ip}:${PORT}`);
  console.log('  For play over the internet, forward TCP port', PORT, 'on your router to this machine.');
});
