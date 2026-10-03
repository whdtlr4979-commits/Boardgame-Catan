// 온라인 방: 대기실, 서버 권한 게임 진행, 플레이어 간 교역 제안, AI 진행, 비밀 정보 가리기
import crypto from 'node:crypto';
import { Game, RuleError, handTotal } from '../js/game.js';
import { chooseAction, respondToTrade } from '../js/ai.js';
import { RESOURCES } from '../js/constants.js';

export class RoomError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 4;
const AI_NAMES = ['컴퓨터 A', '컴퓨터 B', '컴퓨터 C', '컴퓨터 D'];

// 클라이언트가 직접 보낼 수 있는 엔진 행동
const CLIENT_ACTIONS = new Set([
  'placeSettlement', 'placeRoad', 'rollDice', 'discard', 'moveRobber', 'buildRoad', 'buildSettlement',
  'buildCity', 'buyDevCard', 'playDev', 'bankTrade', 'endRoadBuilding', 'endTurn',
]);

function cleanName(name, fallback) {
  const n = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10);
  return n || fallback;
}

function cleanCards(cards) {
  const out = {};
  for (const r of RESOURCES) {
    const n = Number(cards?.[r] ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 19) throw new RoomError('카드 수가 올바르지 않습니다.');
    out[r] = n;
  }
  return out;
}

export class Room {
  constructor(code, { aiDelay = 700, autoAI = true, rng = Math.random } = {}) {
    this.code = code;
    this.seats = []; // { name, isAI, token, connections }
    this.game = null;
    this.trade = null;
    this.version = 0;
    this.listeners = new Set();
    this.aiDelay = aiDelay;
    this.autoAI = autoAI;
    this.rng = rng;
    this.aiTimer = null;
    this.touched = Date.now();
  }

  get started() {
    return this.game !== null;
  }

  newToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  // ---------- 대기실 ----------
  join(name) {
    if (this.started) throw new RoomError('이미 시작한 게임입니다.', 409);
    if (this.seats.length >= MAX_PLAYERS) throw new RoomError('방이 가득 찼습니다.', 409);
    const token = this.newToken();
    this.seats.push({ name: cleanName(name, `플레이어 ${this.seats.length + 1}`), isAI: false, token, connections: 0 });
    this.changed();
    return { token, seat: this.seats.length - 1 };
  }

  seatOf(token) {
    const i = this.seats.findIndex((s) => s.token && s.token === token);
    if (i < 0) throw new RoomError('이 방의 참가자가 아닙니다.', 403);
    return i;
  }

  requireHost(token) {
    const i = this.seatOf(token);
    if (i !== 0) throw new RoomError('방장만 할 수 있습니다.', 403);
    return i;
  }

  lobby(token, op, data = {}) {
    if (op === 'leave') return this.leave(token);
    this.requireHost(token);
    if (op === 'takeover') return this.takeover(data.seat);
    if (this.started) throw new RoomError('이미 시작한 게임입니다.', 409);
    if (op === 'addAI') {
      if (this.seats.length >= MAX_PLAYERS) throw new RoomError('방이 가득 찼습니다.');
      const used = new Set(this.seats.map((s) => s.name));
      const name = AI_NAMES.find((n) => !used.has(n)) ?? `컴퓨터 ${this.seats.length + 1}`;
      this.seats.push({ name, isAI: true, token: null, connections: 0 });
    } else if (op === 'remove') {
      const i = Number(data.seat);
      if (!Number.isInteger(i) || i <= 0 || i >= this.seats.length) throw new RoomError('내보낼 수 없는 자리입니다.');
      this.seats.splice(i, 1);
    } else if (op === 'start') {
      if (this.seats.length < MIN_PLAYERS) throw new RoomError(`${MIN_PLAYERS}명 이상이어야 시작할 수 있습니다. 컴퓨터를 추가해 보세요.`);
      this.game = Game.create({
        players: this.seats.map((s, i) => ({ name: s.name, isAI: s.isAI, color: i })),
        rng: this.rng,
      });
      this.game.log('온라인 게임을 시작합니다!');
    } else {
      throw new RoomError('알 수 없는 요청입니다.');
    }
    this.changed();
    return null;
  }

  leave(token) {
    const i = this.seatOf(token);
    if (!this.started) {
      if (i === 0) {
        // 방장이 나가면 대기실을 닫는다
        this.seats = [];
        this.closed = true;
      } else {
        this.seats.splice(i, 1);
      }
      this.changed();
    }
    return null;
  }

  // 연결이 끊긴 사람 자리를 컴퓨터에게 넘긴다
  takeover(seat) {
    const i = Number(seat);
    const s = this.seats[i];
    if (!this.started || !s || s.isAI || i === 0) throw new RoomError('대체할 수 없는 자리입니다.');
    if (s.connections > 0) throw new RoomError('접속 중인 플레이어입니다.');
    s.isAI = true;
    s.token = null;
    this.game.state.players[i].isAI = true;
    this.game.log(`${s.name}의 자리를 컴퓨터가 이어받습니다.`);
    if (this.trade && this.trade.responses[i] === 'pending') this.trade.responses[i] = 'decline';
    this.changed();
    return null;
  }

  // ---------- 게임 ----------
  act(token, action) {
    const p = this.seatOf(token);
    if (!this.started) throw new RoomError('게임이 아직 시작되지 않았습니다.');
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new RoomError('잘못된 요청입니다.');
    switch (action.type) {
      case 'offerTrade':
        return this.offerTrade(p, action);
      case 'respondTrade':
        return this.respondTrade(p, !!action.accept);
      case 'confirmTrade':
        return this.confirmTrade(p, Number(action.partner));
      case 'cancelTrade':
        if (!this.trade || this.trade.from !== p) throw new RoomError('취소할 제안이 없습니다.');
        this.trade = null;
        this.changed();
        return null;
      default:
        if (!CLIENT_ACTIONS.has(action.type)) throw new RoomError('허용되지 않는 행동입니다.');
        this.applyGameAction(p, sanitizeAction(action));
        return null;
    }
  }

  applyGameAction(p, action) {
    const snapshot = structuredClone(this.game.state);
    try {
      this.game.act(p, action);
    } catch (err) {
      // 실패하면 상태를 그대로 되돌린다
      this.game.state = snapshot;
      if (err instanceof RuleError) throw new RoomError(err.message);
      throw new RoomError('잘못된 요청입니다.');
    }
    // 교역 제안은 제안자의 상태가 바뀌면 무효
    if (this.trade && action.type !== 'discard') this.trade = null;
    this.changed();
  }

  offerTrade(p, action) {
    const s = this.game.state;
    if (s.phase !== 'main' || s.current !== p) throw new RoomError('자기 차례에 주사위를 굴린 뒤 제안할 수 있습니다.');
    const give = cleanCards(action.give);
    const get = cleanCards(action.get);
    if (handTotal(give) === 0 || handTotal(get) === 0) throw new RoomError('주고받는 카드가 모두 있어야 합니다.');
    for (const r of RESOURCES) {
      if (give[r] && get[r]) throw new RoomError('같은 자원을 주고받을 수 없습니다.');
      if (give[r] > s.players[p].resources[r]) throw new RoomError('제안한 카드가 부족합니다.');
    }
    const responses = {};
    s.players.forEach((pl, i) => {
      if (i === p) return;
      const hasCards = RESOURCES.every((r) => get[r] <= pl.resources[r]);
      if (!hasCards) responses[i] = 'cannot';
      else if (pl.isAI) responses[i] = respondToTrade(this.game, i, p, give, get) ? 'accept' : 'decline';
      else responses[i] = 'pending';
    });
    this.trade = { id: this.game.nextEventId(), from: p, give, get, responses };
    this.changed();
    return null;
  }

  respondTrade(p, accept) {
    const t = this.trade;
    if (!t || t.from === p || t.responses[p] === undefined) throw new RoomError('응답할 제안이 없습니다.');
    if (t.responses[p] === 'cannot') throw new RoomError('카드가 부족해 수락할 수 없습니다.');
    if (accept) {
      const res = this.game.state.players[p].resources;
      if (!RESOURCES.every((r) => t.get[r] <= res[r])) throw new RoomError('카드가 부족해 수락할 수 없습니다.');
    }
    t.responses[p] = accept ? 'accept' : 'decline';
    this.changed();
    return null;
  }

  confirmTrade(p, partner) {
    const t = this.trade;
    if (!t || t.from !== p) throw new RoomError('진행 중인 제안이 없습니다.');
    if (t.responses[partner] !== 'accept') throw new RoomError('수락한 플레이어와만 교역할 수 있습니다.');
    this.trade = null;
    this.applyGameAction(p, { type: 'playerTrade', partner, give: t.give, get: t.get });
    return null;
  }

  // ---------- AI ----------
  pendingAI() {
    if (!this.started) return null;
    const s = this.game.state;
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'discard') {
      const p = Object.keys(s.pendingDiscards).map(Number).find((i) => s.players[i].isAI);
      return p ?? null;
    }
    return s.players[s.current].isAI ? s.current : null;
  }

  aiStep() {
    const p = this.pendingAI();
    if (p === null) return false;
    const action = chooseAction(this.game, p);
    const snapshot = structuredClone(this.game.state);
    try {
      this.game.act(p, action);
    } catch (err) {
      this.game.state = snapshot;
      if (this.game.state.phase === 'main' && this.game.state.current === p) this.game.act(p, { type: 'endTurn' });
      else throw err;
    }
    this.trade = null;
    this.changed();
    return true;
  }

  scheduleAI() {
    if (!this.autoAI || this.aiTimer || this.pendingAI() === null) return;
    const s = this.game.state;
    const delay = s.phase === 'setup' ? this.aiDelay * 0.7 : this.aiDelay;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      try {
        this.aiStep();
      } catch (err) {
        console.error(`[room ${this.code}] AI 오류`, err);
      }
    }, delay);
  }

  // ---------- 동기화 ----------
  changed() {
    this.version++;
    this.touched = Date.now();
    for (const l of this.listeners) {
      const seat = this.seats.findIndex((s) => s.token === l.token);
      l.send(seat < 0 ? { code: this.code, version: this.version, removed: true, closed: !!this.closed } : this.view(seat));
    }
    this.scheduleAI();
  }

  subscribe(token, send) {
    this.seatOf(token);
    const listener = { token, send };
    this.listeners.add(listener);
    this.seats.find((s) => s.token === token).connections++;
    this.changed();
    return () => {
      this.listeners.delete(listener);
      const seat = this.seats.find((s) => s.token === token);
      if (seat) seat.connections--;
      this.changed();
    };
  }

  view(seat) {
    const meta = {
      code: this.code,
      version: this.version,
      you: seat,
      host: 0,
      closed: !!this.closed,
      seats: this.seats.map((s) => ({ name: s.name, isAI: s.isAI, online: s.isAI || s.connections > 0 })),
      started: this.started,
      trade: this.trade,
    };
    if (!this.started) return { ...meta, state: null };
    const st = structuredClone(this.game.state);
    const reveal = st.phase === 'gameOver';
    st.players.forEach((pl, i) => {
      if (i === seat || reveal) return;
      pl.resources = { ...Object.fromEntries(RESOURCES.map((r) => [r, 0])), hidden: handTotal(pl.resources) };
      pl.devCards = pl.devCards.map((c) => ({ type: 'hidden', turn: c.turn }));
    });
    st.devDeck = st.devDeck.map(() => 'hidden');
    if (st.lastSteal && seat !== st.lastSteal.thief && seat !== st.lastSteal.victim) st.lastSteal = { ...st.lastSteal, resource: null };
    if (st.lastDevBought && st.lastDevBought.player !== seat) st.lastDevBought = { ...st.lastDevBought, type: null };
    return { ...meta, state: st };
  }
}

// 클라이언트 입력에서 필요한 필드만 골라낸다
function sanitizeAction(a) {
  const num = (v) => (v === undefined || v === null ? undefined : Number(v));
  const out = { type: a.type };
  if ('vertex' in a) out.vertex = num(a.vertex);
  if ('edge' in a) out.edge = num(a.edge);
  if ('hex' in a) out.hex = num(a.hex);
  if ('victim' in a) out.victim = num(a.victim);
  if ('card' in a) out.card = String(a.card);
  if ('resource' in a) out.resource = String(a.resource);
  if ('give' in a) out.give = typeof a.give === 'string' ? a.give : undefined;
  if ('get' in a) out.get = typeof a.get === 'string' ? a.get : undefined;
  if (Array.isArray(a.resources)) out.resources = a.resources.slice(0, 2).map(String);
  if (a.type === 'discard') out.cards = cleanCards(a.cards);
  return out;
}

export class RoomManager {
  constructor(opts = {}) {
    this.rooms = new Map();
    this.opts = opts;
  }

  create(name) {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, this.opts);
    this.rooms.set(code, room);
    const { token, seat } = room.join(name);
    return { room, token, seat };
  }

  get(code) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room || room.closed) throw new RoomError('방을 찾을 수 없습니다. 코드를 확인해 주세요.', 404);
    return room;
  }

  // 오래 비어 있는 방 정리
  sweep(maxIdleMs = 6 * 60 * 60 * 1000) {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const empty = room.listeners.size === 0;
      if (room.closed || (empty && now - room.touched > maxIdleMs)) {
        clearTimeout(room.aiTimer);
        this.rooms.delete(code);
      }
    }
  }
}
