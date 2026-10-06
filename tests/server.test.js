import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, RoomManager, RoomError } from '../server/rooms.js';
import { createServer } from '../server/server.js';
import { chooseAction } from '../js/ai.js';

function setupRoom() {
  const room = new Room('TEST', { autoAI: false });
  const a = room.join('철수');
  const b = room.join('영희');
  room.lobby(a.token, 'addAI');
  room.lobby(a.token, 'start');
  return { room, a, b };
}

// 사람 차례는 AI 판단을 빌려 자동으로 진행한다
function playUntil(room, tokens, cond, limit = 5000) {
  for (let i = 0; i < limit && !cond(); i++) {
    const s = room.game.state;
    if (room.pendingAI() !== null) {
      room.aiStep();
      continue;
    }
    let p = s.current;
    if (s.phase === 'discard') p = Number(Object.keys(s.pendingDiscards)[0]);
    room.act(tokens[p], chooseAction(room.game, p));
  }
}

test('대기실: 방장만 시작, 3명 이상 필요', () => {
  const room = new Room('ABCD', { autoAI: false });
  const a = room.join('철수');
  const b = room.join('영희');
  assert.throws(() => room.lobby(b.token, 'start'), (e) => e instanceof RoomError && e.status === 403);
  assert.throws(() => room.lobby(a.token, 'start'), /3명 이상/);
  room.lobby(a.token, 'addAI');
  room.lobby(a.token, 'start');
  assert.ok(room.started);
  assert.throws(() => room.join('늦은 사람'), /이미 시작/);
});

test('차례가 아니면 행동할 수 없고, 실패한 행동은 상태를 바꾸지 않는다', () => {
  const { room, a, b } = setupRoom();
  const s = room.game.state;
  const tokens = { 0: a.token, 1: b.token };
  const other = s.current === 0 ? 1 : 0;
  while (room.pendingAI() !== null) room.aiStep();
  const cur = room.game.state.current;
  assert.equal(room.game.state.players[cur].isAI, false);
  const notMe = tokens[cur === 0 ? 1 : 0];
  assert.throws(() => room.act(notMe, { type: 'placeSettlement', vertex: 0 }), /차례/);
  const before = JSON.stringify(room.game.state);
  assert.throws(() => room.act(tokens[cur], { type: 'placeRoad', edge: 0 }));
  assert.throws(() => room.act(tokens[cur], { type: 'playerTrade', partner: other }), /허용되지/);
  assert.equal(JSON.stringify(room.game.state), before);
});

test('상대 손패와 발전 카드는 가려진다', () => {
  const { room, a, b } = setupRoom();
  const tokens = { 0: a.token, 1: b.token };
  playUntil(room, tokens, () => room.game.state.phase === 'main');
  const s = room.game.state;
  s.players[1].resources.ore = 3;
  s.players[1].devCards.push({ type: 'victoryPoint', turn: 0 });
  const v0 = room.view(0);
  assert.equal(v0.you, 0);
  assert.equal(v0.state.players[1].resources.ore, 0);
  assert.ok(v0.state.players[1].resources.hidden >= 3);
  assert.deepEqual(v0.state.players[1].devCards.map((c) => c.type), ['hidden']);
  assert.ok(v0.state.devDeck.every((c) => c === 'hidden'));
  const v1 = room.view(1);
  assert.equal(v1.state.players[1].resources.ore, s.players[1].resources.ore);
  assert.equal(v1.state.players[1].devCards[0].type, 'victoryPoint');
});

test('교역 제안 → 수락 → 확정', () => {
  const { room, a, b } = setupRoom();
  const tokens = { 0: a.token, 1: b.token };
  playUntil(room, tokens, () => {
    const s = room.game.state;
    return s.phase === 'main' && !s.players[s.current].isAI;
  });
  const s = room.game.state;
  const me = s.current;
  const you = me === 0 ? 1 : 0;
  s.players[me].resources = { wood: 2, brick: 0, wool: 0, grain: 0, ore: 0 };
  s.players[you].resources = { wood: 0, brick: 0, wool: 0, grain: 0, ore: 1 };
  assert.throws(() => room.act(tokens[you], { type: 'offerTrade', give: { ore: 1 }, get: { wood: 1 } }), /자기 차례/);
  room.act(tokens[me], { type: 'offerTrade', give: { wood: 2 }, get: { ore: 1 } });
  assert.equal(room.trade.responses[you], 'pending');
  assert.throws(() => room.act(tokens[me], { type: 'confirmTrade', partner: you }), /수락한/);
  room.act(tokens[you], { type: 'respondTrade', accept: true });
  room.act(tokens[me], { type: 'confirmTrade', partner: you });
  assert.equal(s.players[me].resources.ore, 1);
  assert.equal(s.players[you].resources.wood, 2);
  assert.equal(room.trade, null);
});

test('사람 둘 + 컴퓨터 하나가 온라인으로 끝까지 플레이', () => {
  const { room, a, b } = setupRoom();
  const tokens = { 0: a.token, 1: b.token };
  playUntil(room, tokens, () => room.game.state.phase === 'gameOver', 30000);
  assert.equal(room.game.state.phase, 'gameOver');
  // 게임이 끝나면 모든 정보 공개
  const v = room.view(0);
  assert.equal(v.state.players[1].resources.hidden, undefined);
});

test('연결이 끊긴 자리를 방장이 컴퓨터로 대체', () => {
  const { room, a, b } = setupRoom();
  assert.throws(() => room.lobby(b.token, 'takeover', { seat: 1 }), /방장/);
  room.lobby(a.token, 'takeover', { seat: 1 });
  assert.equal(room.game.state.players[1].isAI, true);
  assert.throws(() => room.act(b.token, { type: 'endTurn' }), /참가자가 아닙니다/);
});

test('HTTP API와 SSE 실시간 전달', async () => {
  const manager = new RoomManager({ autoAI: false });
  const server = createServer({ manager, log: { error() {} } });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  try {
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert.equal(health.ok, true);
    const html = await fetch(`${base}/`).then((r) => r.text());
    assert.match(html, /카탄 개척자/);
    assert.equal((await fetch(`${base}/server/rooms.js`)).status, 404);
    assert.equal((await fetch(`${base}/js/../server/rooms.js`)).status, 404);

    const host = (await post('/api/rooms', { name: '방장' })).json;
    assert.match(host.code, /^[A-Z]{4}$/);
    const guest = (await post(`/api/rooms/${host.code.toLowerCase()}/join`, { name: '손님' })).json;
    assert.equal(guest.seat, 1);
    assert.equal((await post('/api/rooms/ZZZZ/join', { name: 'x' })).status, 404);

    // 손님이 SSE로 구독
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/rooms/${host.code}/events?token=${guest.token}`, { signal: ctrl.signal });
    assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const reader = res.body.getReader();
    const views = [];
    let buf = '';
    const readUntil = async (pred) => {
      while (!views.some(pred)) {
        const { value } = await reader.read();
        buf += new TextDecoder().decode(value);
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (data) views.push(JSON.parse(data.slice(6)));
        }
      }
      return views.find(pred);
    };
    const first = await readUntil((v) => v.seats);
    assert.equal(first.you, 1);
    assert.equal(first.seats[1].online, true);

    assert.equal((await post(`/api/rooms/${host.code}/lobby`, { token: guest.token, op: 'start' })).status, 403);
    await post(`/api/rooms/${host.code}/lobby`, { token: host.token, op: 'addAI' });
    const started = await post(`/api/rooms/${host.code}/lobby`, { token: host.token, op: 'start' });
    assert.equal(started.json.started, true);
    const live = await readUntil((v) => v.started);
    assert.equal(live.state.players.length, 3);

    const bad = await post(`/api/rooms/${host.code}/act`, { token: 'nope', action: { type: 'endTurn' } });
    assert.equal(bad.status, 403);
    ctrl.abort();
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
