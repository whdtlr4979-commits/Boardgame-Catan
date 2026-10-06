import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Room, RoomManager } from '../server/rooms.js';
import { FileStore, PostgresStore, createStore } from '../server/store.js';
import { createServer } from '../server/server.js';
import { chooseAction } from '../js/ai.js';

// 사람 차례는 AI 판단을 빌려 진행한다
function play(room, tokens, steps) {
  for (let i = 0; i < steps; i++) {
    const s = room.game.state;
    if (s.phase === 'gameOver') return;
    if (room.pendingAI() !== null) {
      room.aiStep();
      continue;
    }
    const p = s.phase === 'discard' ? Number(Object.keys(s.pendingDiscards)[0]) : s.current;
    room.act(tokens[p], chooseAction(room.game, p));
  }
}

async function startedRoom(manager) {
  const host = await manager.create('철수');
  const room = host.room;
  const guest = room.join('영희');
  room.lobby(host.token, 'addAI');
  room.lobby(host.token, 'start');
  const tokens = { 0: host.token, 1: guest.token };
  play(room, tokens, 60);
  return { room, tokens, code: room.code };
}

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'catan-rooms-'));
}

test('방 직렬화: 저장했다가 복원해도 같은 게임이 이어진다', () => {
  const room = new Room('ABCD', { autoAI: false });
  const a = room.join('철수');
  const b = room.join('영희');
  room.lobby(a.token, 'addAI');
  room.lobby(a.token, 'start');
  const tokens = { 0: a.token, 1: b.token };
  play(room, tokens, 40);

  const json = JSON.stringify(room);
  const copy = Room.fromJSON(JSON.parse(json), { autoAI: false });
  assert.deepEqual(copy.game.state, room.game.state);
  assert.equal(copy.version, room.version);
  assert.notEqual(copy.epoch, room.epoch);
  assert.equal(copy.seatOf(b.token), 1);
  assert.equal(copy.seats[1].connections, 0);
  // 복원한 방에서 계속 진행
  play(copy, tokens, 200);
  assert.ok(copy.game.state.turn >= room.game.state.turn);
  assert.throws(() => Room.fromJSON({ format: 99 }), /저장 형식/);
});

async function restartScenario(makeStore) {
  const store1 = makeStore();
  await store1.init();
  const m1 = new RoomManager({ store: store1, autoAI: false, saveDelay: 5 });
  const { room, tokens, code } = await startedRoom(m1);
  const before = JSON.parse(JSON.stringify(room.game.state));
  await m1.flushAll();
  await store1.close();

  // 서버 재시작: 새 저장소 연결, 새 관리자
  const store2 = makeStore();
  await store2.init();
  try {
    const m2 = new RoomManager({ store: store2, autoAI: false, saveDelay: 5 });
    const [r1, r2] = await Promise.all([m2.get(code), m2.get(code.toLowerCase())]);
    assert.equal(r1, r2, '동시에 불러와도 같은 방 객체');
    assert.deepEqual(r1.game.state, before);
    assert.equal(r1.seatOf(tokens[1]), 1);

    // 재시작 뒤 진행한 내용도 다시 저장된다
    play(r1, tokens, 30);
    await m2.flushAll();
    const saved = await store2.load(code);
    assert.deepEqual(saved.state, JSON.parse(JSON.stringify(r1.game.state)));

    // 없는 방, 잘못된 코드
    await assert.rejects(m2.get('ZZZZ'), /찾을 수 없습니다/);
    await assert.rejects(m2.get('../x'), /찾을 수 없습니다/);

    // 방장이 대기실을 닫으면 저장소에서도 지운다
    const lobby = await m2.create('혼자');
    await m2.flushAll();
    assert.ok(await store2.load(lobby.room.code));
    lobby.room.lobby(lobby.token, 'leave');
    await m2.flushAll();
    assert.equal(await store2.load(lobby.room.code), null);

    // 오래된 방 정리
    await m2.sweep({ maxIdleMs: 0, storeMaxAgeMs: 0 });
    assert.equal(m2.rooms.size, 0);
    assert.equal(await store2.load(code), null);
  } finally {
    await store2.close();
  }
}

test('파일 저장소: 서버를 다시 켜도 방이 남아 있다', async () => {
  const dir = await tempDir();
  try {
    await restartScenario(() => new FileStore(dir));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Postgres 저장소: 서버를 다시 켜도 방이 남아 있다', { skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL이 없어 건너뜀' }, async () => {
  const url = process.env.TEST_DATABASE_URL;
  const setup = new PostgresStore(url);
  await setup.init();
  await setup.pool.query('DELETE FROM catan_rooms');
  await setup.close();
  await restartScenario(() => new PostgresStore(url));
});

test('저장소 선택: DATABASE_URL > ROOMS_DIR > 메모리', () => {
  assert.equal(createStore({ DATABASE_URL: 'postgres://x', ROOMS_DIR: '/tmp/x' }).kind, 'postgres');
  assert.equal(createStore({ ROOMS_DIR: '/tmp/x' }).kind, 'file');
  assert.equal(createStore({}), null);
  assert.deepEqual(createStore({ DATABASE_URL: 'postgres://x', DATABASE_SSL: 'no-verify' }).ssl, { rejectUnauthorized: false });
});

test('저장에 실패하면 다음에 다시 시도한다', async () => {
  let fail = true;
  const saved = [];
  const store = {
    kind: 'test',
    async load() { return null; },
    async save(code, json) {
      if (fail) throw new Error('DB 끊김');
      saved.push(JSON.parse(json));
    },
    async remove() {},
    async cleanup() {},
  };
  const errors = console.error;
  console.error = () => {};
  try {
    const m = new RoomManager({ store, autoAI: false, saveDelay: 5 });
    const { room } = await m.create('철수');
    await m.flushRoom(room);
    assert.equal(room.dirty, true, '실패한 저장은 다시 표시된다');
    fail = false;
    await m.flushRoom(room);
    assert.equal(room.dirty, false);
    assert.equal(saved.length, 1);
    clearTimeout(room.saveTimer);
  } finally {
    console.error = errors;
  }
});

test('HTTP: 서버를 다시 켠 뒤 같은 토큰으로 이어서 접속', async () => {
  const dir = await tempDir();
  const quiet = { error() {} };
  const listen = async (manager) => {
    const server = createServer({ manager, log: quiet });
    await new Promise((r) => server.listen(0, r));
    return { server, base: `http://127.0.0.1:${server.address().port}` };
  };
  const stop = async (server) => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  };
  const post = async (base, p, body) => {
    const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  try {
    const m1 = new RoomManager({ store: new FileStore(dir), autoAI: false, saveDelay: 5 });
    await m1.store.init();
    const a = await listen(m1);
    const host = (await post(a.base, '/api/rooms', { name: '철수' })).json;
    const guest = (await post(a.base, `/api/rooms/${host.code}/join`, { name: '영희' })).json;
    await post(a.base, `/api/rooms/${host.code}/lobby`, { token: host.token, op: 'addAI' });
    const started = (await post(a.base, `/api/rooms/${host.code}/lobby`, { token: host.token, op: 'start' })).json;
    assert.equal(started.started, true);
    const health = await fetch(`${a.base}/api/health`).then((r) => r.json());
    assert.equal(health.storage, 'file');
    await m1.flushAll();
    await stop(a.server);

    const m2 = new RoomManager({ store: new FileStore(dir), autoAI: false, saveDelay: 5 });
    await m2.store.init();
    const b = await listen(m2);
    try {
      const view = await fetch(`${b.base}/api/rooms/${host.code}?token=${guest.token}`).then((r) => r.json());
      assert.equal(view.you, 1);
      assert.equal(view.started, true);
      assert.deepEqual(view.state.board, started.state.board);
      assert.notEqual(view.epoch, started.epoch);
      const denied = await fetch(`${b.base}/api/rooms/${host.code}?token=nope`);
      assert.equal(denied.status, 403);
    } finally {
      await stop(b.server);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
