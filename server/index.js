import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game, GameError } from './game/engine.js';
import { randomCode } from './game/util.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const STATIC_DATA = JSON.stringify(Game.staticData());
const games = new Map(); // code -> { game, sockets: Map<playerId, Set<ws>> }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
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
          entry.game.start();
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
