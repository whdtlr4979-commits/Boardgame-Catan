// 픽셀 카탄 서버: 정적 파일 + 온라인 방 API (외부 의존성 없음)
//   node server/server.js   (PORT 환경 변수, 기본 8080)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomManager, RoomError } from './rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_PREFIXES = ['css/', 'js/', 'assets/'];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};
const MAX_BODY = 16 * 1024;
const HEARTBEAT_MS = 25000;

function sendJSON(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new RoomError('요청이 너무 큽니다.', 413));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new RoomError('JSON 형식이 올바르지 않습니다.'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  if (rel !== 'index.html' && !STATIC_PREFIXES.some((p) => rel.startsWith(p))) return false;
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) return false;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const type = MIME[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=86400' : 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
  return true;
}

export function createServer({ manager = new RoomManager(), log = console } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (pathname.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      try {
        await handleApi(req, res, url, manager);
      } catch (err) {
        if (err instanceof RoomError) sendJSON(res, err.status, { error: err.message });
        else {
          log.error(err);
          sendJSON(res, 500, { error: '서버 오류가 발생했습니다.' });
        }
      }
      return;
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, pathname)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  const sweeper = setInterval(() => manager.sweep(), 10 * 60 * 1000);
  sweeper.unref();
  server.on('close', () => clearInterval(sweeper));
  return server;
}

async function handleApi(req, res, url, manager) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'rooms', code, action]
  if (parts[1] === 'health') return sendJSON(res, 200, { ok: true, rooms: manager.rooms.size });
  if (parts[1] !== 'rooms') throw new RoomError('찾을 수 없는 주소입니다.', 404);

  if (parts.length === 2 && req.method === 'POST') {
    const body = await readBody(req);
    const { room, token, seat } = manager.create(body.name);
    return sendJSON(res, 200, { code: room.code, token, seat });
  }

  const room = manager.get(parts[2]);
  const op = parts[3];

  if (op === 'events' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    room.seatOf(token);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    const send = (view) => res.write(`event: view\ndata: ${JSON.stringify(view)}\n\n`);
    const unsubscribe = room.subscribe(token, send);
    const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(beat);
      unsubscribe();
    });
    return undefined;
  }

  if (!op && req.method === 'GET') {
    const seat = room.seatOf(url.searchParams.get('token'));
    return sendJSON(res, 200, room.view(seat));
  }

  if (req.method !== 'POST') throw new RoomError('찾을 수 없는 주소입니다.', 404);
  const body = await readBody(req);

  if (op === 'join') {
    const { token, seat } = room.join(body.name);
    return sendJSON(res, 200, { code: room.code, token, seat });
  }
  if (op === 'lobby') {
    room.lobby(body.token, String(body.op || ''), body);
    const seat = room.seats.findIndex((s) => s.token === body.token);
    return sendJSON(res, 200, seat < 0 ? { removed: true } : room.view(seat));
  }
  if (op === 'act') {
    room.act(body.token, body.action);
    return sendJSON(res, 200, room.view(room.seatOf(body.token)));
  }
  throw new RoomError('찾을 수 없는 주소입니다.', 404);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  createServer().listen(port, () => console.log(`픽셀 카탄 서버: http://localhost:${port}`));
}
