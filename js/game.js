// 카탄 규칙 엔진: 직렬화 가능한 state 객체 위에서 동작한다.
import {
  RESOURCES, RESOURCE_NAMES, TERRAIN_RESOURCE, COSTS, PIECE_LIMITS, BANK_PER_RESOURCE,
  DEV_DECK, DEV_NAMES, WIN_POINTS, LONGEST_ROAD_MIN, LARGEST_ARMY_MIN,
} from './constants.js';
import { TOPO, generateBoard, shuffle } from './board.js';

export class RuleError extends Error {}

const emptyHand = () => Object.fromEntries(RESOURCES.map((r) => [r, 0]));
// 온라인 화면에서는 상대 손패가 { hidden: 장수 } 형태로 가려져 온다
const total = (hand) => (hand.hidden !== undefined ? hand.hidden : RESOURCES.reduce((s, r) => s + (hand[r] || 0), 0));
const fmtCards = (cards) =>
  RESOURCES.filter((r) => cards[r] > 0).map((r) => `${RESOURCE_NAMES[r]} ${cards[r]}`).join(', ');

export function handTotal(hand) {
  return total(hand);
}

export function formatCards(cards) {
  return fmtCards(cards);
}

export function createGameState({ players, rng = Math.random, firstPlayer } = {}) {
  if (!players || players.length < 2 || players.length > 4) throw new RuleError('플레이어는 2~4명이어야 합니다.');
  const n = players.length;
  const first = firstPlayer ?? Math.floor(rng() * n);
  const order = [];
  for (let i = 0; i < n; i++) order.push((first + i) % n);
  const setupOrder = order.concat(order.slice().reverse());

  const devDeck = [];
  for (const [type, count] of Object.entries(DEV_DECK)) for (let i = 0; i < count; i++) devDeck.push(type);

  return {
    version: 1,
    board: generateBoard(rng),
    players: players.map((p, i) => ({
      name: p.name,
      color: p.color ?? i,
      isAI: !!p.isAI,
      resources: emptyHand(),
      devCards: [],
      knights: 0,
      roadsLeft: PIECE_LIMITS.road,
      settlementsLeft: PIECE_LIMITS.settlement,
      citiesLeft: PIECE_LIMITS.city,
    })),
    buildings: {},
    roads: {},
    bank: Object.fromEntries(RESOURCES.map((r) => [r, BANK_PER_RESOURCE])),
    devDeck: shuffle(devDeck, rng),
    turn: 0,
    firstPlayer: first,
    current: setupOrder[0],
    phase: 'setup',
    setup: { order: setupOrder, index: 0, step: 'settlement', lastSettlement: null },
    dice: null,
    pendingDiscards: {},
    returnPhase: null,
    devPlayedThisTurn: false,
    freeRoads: 0,
    longestRoad: { holder: null, lengths: players.map(() => 0) },
    largestArmy: { holder: null },
    winner: null,
    log: [],
    lastProduction: null,
  };
}

export class Game {
  constructor(state, rng = Math.random) {
    this.state = state;
    this.rng = rng;
  }

  static create(opts) {
    return new Game(createGameState(opts), opts.rng);
  }

  // ---------- 조회 ----------
  get current() {
    return this.state.current;
  }

  player(i) {
    return this.state.players[i];
  }

  nextEventId() {
    this.state.eventId = (this.state.eventId || 0) + 1;
    return this.state.eventId;
  }

  log(text, player = null) {
    this.state.log.push({ text, player });
    if (this.state.log.length > 300) this.state.log.splice(0, this.state.log.length - 300);
  }

  hexResource(hexId) {
    return TERRAIN_RESOURCE[this.state.board.hexes[hexId].terrain];
  }

  ownsPortType(p, type) {
    return this.state.board.ports.some(
      (port) => port.type === type && port.vertices.some((v) => this.state.buildings[v]?.player === p),
    );
  }

  tradeRatio(p, resource) {
    if (this.ownsPortType(p, resource)) return 2;
    if (this.ownsPortType(p, 'generic')) return 3;
    return 4;
  }

  canAfford(p, cost) {
    const res = this.state.players[p].resources;
    return Object.entries(cost).every(([r, n]) => res[r] >= n);
  }

  victoryPoints(p, { includeHidden = true } = {}) {
    const s = this.state;
    let vp = 0;
    for (const b of Object.values(s.buildings)) if (b.player === p) vp += b.type === 'city' ? 2 : 1;
    if (s.longestRoad.holder === p) vp += 2;
    if (s.largestArmy.holder === p) vp += 2;
    if (includeHidden) vp += s.players[p].devCards.filter((c) => c.type === 'victoryPoint').length;
    return vp;
  }

  isVertexFreeForSettlement(v) {
    const b = this.state.buildings;
    if (b[v]) return false;
    return TOPO.vertices[v].neighbors.every((n) => !b[n]);
  }

  vertexHasOwnRoad(p, v) {
    return TOPO.vertices[v].edges.some((e) => this.state.roads[e] === p);
  }

  legalSettlementVertices(p) {
    const s = this.state;
    const pl = s.players[p];
    if (pl.settlementsLeft <= 0) return [];
    const setup = s.phase === 'setup';
    return TOPO.vertices
      .filter((v) => this.isVertexFreeForSettlement(v.id) && (setup || this.vertexHasOwnRoad(p, v.id)))
      .map((v) => v.id);
  }

  legalCityVertices(p) {
    if (this.state.players[p].citiesLeft <= 0) return [];
    return Object.entries(this.state.buildings)
      .filter(([, b]) => b.player === p && b.type === 'settlement')
      .map(([v]) => Number(v));
  }

  isEdgeConnected(p, e) {
    const s = this.state;
    return TOPO.edges[e].v.some((v) => {
      const b = s.buildings[v];
      if (b && b.player === p) return true;
      if (b && b.player !== p) return false; // 상대 건물이 길을 끊음
      return TOPO.vertices[v].edges.some((oe) => oe !== e && s.roads[oe] === p);
    });
  }

  legalRoadEdges(p) {
    const s = this.state;
    if (s.players[p].roadsLeft <= 0) return [];
    if (s.phase === 'setup') {
      const v = s.setup.lastSettlement;
      return TOPO.vertices[v].edges.filter((e) => s.roads[e] === undefined);
    }
    return TOPO.edges.filter((e) => s.roads[e.id] === undefined && this.isEdgeConnected(p, e.id)).map((e) => e.id);
  }

  legalRobberHexes() {
    return TOPO.hexes.map((h) => h.id).filter((h) => h !== this.state.board.robber);
  }

  robberVictims(hexId, p) {
    const s = this.state;
    const victims = new Set();
    for (const v of TOPO.hexes[hexId].vertices) {
      const b = s.buildings[v];
      if (b && b.player !== p && total(s.players[b.player].resources) > 0) victims.add(b.player);
    }
    return [...victims];
  }

  playableDevCards(p) {
    const s = this.state;
    if (p !== s.current || s.devPlayedThisTurn) return [];
    if (s.phase !== 'main' && s.phase !== 'roll') return [];
    const types = new Set();
    for (const c of s.players[p].devCards) {
      if (c.type !== 'victoryPoint' && c.turn < s.turn) types.add(c.type);
    }
    return [...types];
  }

  longestRoadLength(p) {
    const s = this.state;
    let best = 0;
    const used = new Set();
    const blocked = (v) => {
      const b = s.buildings[v];
      return b && b.player !== p;
    };
    const dfs = (v, len) => {
      if (len > best) best = len;
      if (len > 0 && blocked(v)) return;
      for (const e of TOPO.vertices[v].edges) {
        if (s.roads[e] !== p || used.has(e)) continue;
        used.add(e);
        const [a, b] = TOPO.edges[e].v;
        dfs(a === v ? b : a, len + 1);
        used.delete(e);
      }
    };
    const starts = new Set();
    for (const [e, owner] of Object.entries(s.roads)) if (owner === p) TOPO.edges[e].v.forEach((v) => starts.add(v));
    for (const v of starts) dfs(v, 0);
    return best;
  }

  // ---------- 상태 변경 도우미 ----------
  pay(p, cost) {
    const s = this.state;
    for (const [r, n] of Object.entries(cost)) {
      s.players[p].resources[r] -= n;
      s.bank[r] += n;
    }
  }

  gain(p, r, n) {
    const s = this.state;
    const amount = Math.min(n, s.bank[r]);
    s.players[p].resources[r] += amount;
    s.bank[r] -= amount;
    return amount;
  }

  updateLongestRoad() {
    const s = this.state;
    const lengths = s.players.map((_, i) => this.longestRoadLength(i));
    s.longestRoad.lengths = lengths;
    const max = Math.max(...lengths);
    const holder = s.longestRoad.holder;
    let next = null;
    if (max >= LONGEST_ROAD_MIN) {
      if (holder !== null && lengths[holder] === max) next = holder;
      else {
        const leaders = lengths.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0);
        next = leaders.length === 1 ? leaders[0] : null;
      }
    }
    if (next !== holder) {
      s.longestRoad.holder = next;
      if (next !== null) this.log(`${s.players[next].name}: 최장 교역로 획득! (${max})`, next);
      else this.log('최장 교역로 카드가 주인을 잃었습니다.');
    }
  }

  updateLargestArmy(p) {
    const s = this.state;
    const k = s.players[p].knights;
    const holder = s.largestArmy.holder;
    if (holder === p || k < LARGEST_ARMY_MIN) return;
    if (holder === null || k > s.players[holder].knights) {
      s.largestArmy.holder = p;
      this.log(`${s.players[p].name}: 최강 기사단 획득! (기사 ${k})`, p);
    }
  }

  checkWinner() {
    const s = this.state;
    if (s.phase === 'setup' || s.winner !== null) return;
    const p = s.current;
    if (this.victoryPoints(p) >= WIN_POINTS) {
      s.winner = p;
      s.phase = 'gameOver';
      this.log(`${s.players[p].name} 승리! (${this.victoryPoints(p)}점)`, p);
    }
  }

  // ---------- 액션 ----------
  act(p, action) {
    const s = this.state;
    if (s.phase === 'gameOver') throw new RuleError('게임이 끝났습니다.');
    if (action.type === 'discard') {
      this.doDiscard(p, action.cards);
      return;
    }
    if (p !== s.current) throw new RuleError('당신의 차례가 아닙니다.');
    const handler = {
      placeSettlement: () => this.doSetupSettlement(p, action.vertex),
      placeRoad: () => this.doSetupRoad(p, action.edge),
      rollDice: () => this.doRoll(p, action.dice),
      moveRobber: () => this.doMoveRobber(p, action.hex, action.victim),
      buildRoad: () => this.doBuildRoad(p, action.edge),
      buildSettlement: () => this.doBuildSettlement(p, action.vertex),
      buildCity: () => this.doBuildCity(p, action.vertex),
      buyDevCard: () => this.doBuyDev(p),
      playDev: () => this.doPlayDev(p, action),
      bankTrade: () => this.doBankTrade(p, action.give, action.get),
      playerTrade: () => this.doPlayerTrade(p, action.partner, action.give, action.get),
      endRoadBuilding: () => this.doEndRoadBuilding(p),
      endTurn: () => this.doEndTurn(p),
    }[action.type];
    if (!handler) throw new RuleError(`알 수 없는 행동: ${action.type}`);
    handler();
    this.checkWinner();
  }

  requirePhase(...phases) {
    if (!phases.includes(this.state.phase)) throw new RuleError('지금은 할 수 없는 행동입니다.');
  }

  doSetupSettlement(p, v) {
    const s = this.state;
    this.requirePhase('setup');
    if (s.setup.step !== 'settlement') throw new RuleError('도로를 먼저 놓아야 합니다.');
    if (!this.legalSettlementVertices(p).includes(v)) throw new RuleError('그곳에는 개척지를 지을 수 없습니다.');
    s.buildings[v] = { player: p, type: 'settlement' };
    s.players[p].settlementsLeft--;
    s.setup.lastSettlement = v;
    s.setup.step = 'road';
    const secondRound = s.setup.index >= s.players.length;
    if (secondRound) {
      const got = emptyHand();
      for (const h of TOPO.vertices[v].hexes) {
        const r = this.hexResource(h);
        if (r) got[r] += this.gain(p, r, 1);
      }
      this.log(`${s.players[p].name}: 두 번째 개척지 건설, 초기 자원 획득 (${fmtCards(got) || '없음'})`, p);
    } else {
      this.log(`${s.players[p].name}: 개척지 건설`, p);
    }
  }

  doSetupRoad(p, e) {
    const s = this.state;
    this.requirePhase('setup');
    if (s.setup.step !== 'road') throw new RuleError('개척지를 먼저 놓아야 합니다.');
    if (!this.legalRoadEdges(p).includes(e)) throw new RuleError('방금 지은 개척지에 붙여서 도로를 놓으세요.');
    s.roads[e] = p;
    s.players[p].roadsLeft--;
    s.setup.index++;
    s.setup.step = 'settlement';
    s.setup.lastSettlement = null;
    if (s.setup.index >= s.setup.order.length) {
      s.phase = 'roll';
      s.turn = 1;
      s.current = s.firstPlayer;
      this.updateLongestRoad();
      this.log(`초기 배치 완료! ${s.players[s.current].name}부터 시작합니다.`);
    } else {
      s.current = s.setup.order[s.setup.index];
    }
  }

  doRoll(p, forced) {
    const s = this.state;
    this.requirePhase('roll');
    const d = forced ?? [1 + Math.floor(this.rng() * 6), 1 + Math.floor(this.rng() * 6)];
    s.dice = d;
    s.rollId = this.nextEventId();
    const sum = d[0] + d[1];
    this.log(`${s.players[p].name}: 주사위 ${d[0]} + ${d[1]} = ${sum}`, p);
    if (sum === 7) {
      s.lastProduction = null;
      const pending = {};
      s.players.forEach((pl, i) => {
        const t = total(pl.resources);
        if (t > 7) pending[i] = Math.floor(t / 2);
      });
      s.pendingDiscards = pending;
      s.returnPhase = 'main';
      if (Object.keys(pending).length > 0) {
        s.phase = 'discard';
        this.log('7! 카드가 8장 이상인 플레이어는 절반을 버립니다.');
      } else {
        s.phase = 'robber';
        this.log('7! 도둑을 옮기세요.');
      }
      return;
    }
    this.produce(sum);
    s.phase = 'main';
  }

  produce(sum) {
    const s = this.state;
    // 자원별 요청량 집계 (은행 부족 규칙 적용)
    const demand = {};
    for (const r of RESOURCES) demand[r] = s.players.map(() => 0);
    TOPO.hexes.forEach((h) => {
      const hex = s.board.hexes[h.id];
      if (hex.number !== sum || s.board.robber === h.id) return;
      const r = TERRAIN_RESOURCE[hex.terrain];
      for (const v of h.vertices) {
        const b = s.buildings[v];
        if (b) demand[r][b.player] += b.type === 'city' ? 2 : 1;
      }
    });
    const gained = s.players.map(() => emptyHand());
    for (const r of RESOURCES) {
      const want = demand[r].reduce((a, b) => a + b, 0);
      if (want === 0) continue;
      const claimants = demand[r].map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
      if (want <= s.bank[r]) {
        claimants.forEach((i) => (gained[i][r] += this.gain(i, r, demand[r][i])));
      } else if (claimants.length === 1) {
        const i = claimants[0];
        gained[i][r] += this.gain(i, r, demand[r][i]);
        this.log(`은행의 ${RESOURCE_NAMES[r]}이(가) 부족합니다.`);
      } else {
        this.log(`은행의 ${RESOURCE_NAMES[r]}이(가) 부족하여 아무도 받지 못합니다.`);
      }
    }
    s.lastProduction = gained;
    gained.forEach((g, i) => {
      if (total(g) > 0) this.log(`${s.players[i].name}: ${fmtCards(g)} 획득`, i);
    });
    if (gained.every((g) => total(g) === 0)) this.log('아무도 자원을 얻지 못했습니다.');
  }

  doDiscard(p, cards) {
    const s = this.state;
    this.requirePhase('discard');
    const need = s.pendingDiscards[p];
    if (!need) throw new RuleError('버릴 카드가 없습니다.');
    const n = total(cards);
    if (n !== need) throw new RuleError(`정확히 ${need}장을 버려야 합니다.`);
    const res = s.players[p].resources;
    for (const r of RESOURCES) if ((cards[r] || 0) < 0 || (cards[r] || 0) > res[r]) throw new RuleError('가지고 있지 않은 카드입니다.');
    const paid = {};
    for (const r of RESOURCES) if (cards[r]) paid[r] = cards[r];
    this.pay(p, paid);
    delete s.pendingDiscards[p];
    this.log(`${s.players[p].name}: 카드 ${need}장 버림`, p);
    if (Object.keys(s.pendingDiscards).length === 0) s.phase = 'robber';
  }

  doMoveRobber(p, hex, victim) {
    const s = this.state;
    this.requirePhase('robber');
    if (!this.legalRobberHexes().includes(hex)) throw new RuleError('도둑은 다른 지형으로 옮겨야 합니다.');
    const victims = this.robberVictims(hex, p);
    if (victims.length > 0 && !victims.includes(victim)) throw new RuleError('자원을 빼앗을 플레이어를 고르세요.');
    s.board.robber = hex;
    this.log(`${s.players[p].name}: 도둑을 옮김`, p);
    if (victims.length > 0) {
      const vr = s.players[victim].resources;
      const bag = [];
      for (const r of RESOURCES) for (let i = 0; i < vr[r]; i++) bag.push(r);
      const r = bag[Math.floor(this.rng() * bag.length)];
      vr[r]--;
      s.players[p].resources[r]++;
      s.lastSteal = { thief: p, victim, resource: r, id: this.nextEventId() };
      this.log(`${s.players[p].name}: ${s.players[victim].name}에게서 카드 1장을 빼앗음`, p);
    }
    s.phase = s.returnPhase || 'main';
    s.returnPhase = null;
  }

  doBuildRoad(p, e) {
    const s = this.state;
    this.requirePhase('main', 'roadBuilding');
    const free = s.phase === 'roadBuilding';
    if (!free && !this.canAfford(p, COSTS.road)) throw new RuleError('자원이 부족합니다.');
    if (!this.legalRoadEdges(p).includes(e)) throw new RuleError('그곳에는 도로를 놓을 수 없습니다.');
    if (!free) this.pay(p, COSTS.road);
    s.roads[e] = p;
    s.players[p].roadsLeft--;
    this.log(`${s.players[p].name}: 도로 건설${free ? ' (무료)' : ''}`, p);
    if (free) {
      s.freeRoads--;
      if (s.freeRoads <= 0 || this.legalRoadEdges(p).length === 0) this.finishRoadBuilding();
    }
    this.updateLongestRoad();
  }

  finishRoadBuilding() {
    const s = this.state;
    s.freeRoads = 0;
    s.phase = s.returnPhase || 'main';
    s.returnPhase = null;
  }

  doEndRoadBuilding() {
    this.requirePhase('roadBuilding');
    this.finishRoadBuilding();
  }

  doBuildSettlement(p, v) {
    const s = this.state;
    this.requirePhase('main');
    if (!this.canAfford(p, COSTS.settlement)) throw new RuleError('자원이 부족합니다.');
    if (!this.legalSettlementVertices(p).includes(v)) throw new RuleError('그곳에는 개척지를 지을 수 없습니다.');
    this.pay(p, COSTS.settlement);
    s.buildings[v] = { player: p, type: 'settlement' };
    s.players[p].settlementsLeft--;
    this.log(`${s.players[p].name}: 개척지 건설`, p);
    this.updateLongestRoad(); // 상대 도로가 끊길 수 있음
  }

  doBuildCity(p, v) {
    const s = this.state;
    this.requirePhase('main');
    if (!this.canAfford(p, COSTS.city)) throw new RuleError('자원이 부족합니다.');
    if (!this.legalCityVertices(p).includes(v)) throw new RuleError('자신의 개척지만 도시로 바꿀 수 있습니다.');
    this.pay(p, COSTS.city);
    s.buildings[v] = { player: p, type: 'city' };
    s.players[p].citiesLeft--;
    s.players[p].settlementsLeft++;
    this.log(`${s.players[p].name}: 도시 건설`, p);
  }

  doBuyDev(p) {
    const s = this.state;
    this.requirePhase('main');
    if (s.devDeck.length === 0) throw new RuleError('발전 카드가 모두 떨어졌습니다.');
    if (!this.canAfford(p, COSTS.devCard)) throw new RuleError('자원이 부족합니다.');
    this.pay(p, COSTS.devCard);
    const type = s.devDeck.pop();
    s.players[p].devCards.push({ type, turn: s.turn });
    s.lastDevBought = { player: p, type, id: this.nextEventId() };
    this.log(`${s.players[p].name}: 발전 카드 구매`, p);
  }

  doPlayDev(p, action) {
    const s = this.state;
    this.requirePhase('main', 'roll');
    const { card } = action;
    if (!this.playableDevCards(p).includes(card)) throw new RuleError('지금 사용할 수 없는 카드입니다.');
    const pl = s.players[p];

    // 검증을 먼저 끝낸 뒤 카드를 소모한다
    if (card === 'yearOfPlenty') {
      const picks = action.resources || [];
      if (picks.length !== 2 || !picks.every((r) => RESOURCES.includes(r))) throw new RuleError('자원 2개를 고르세요.');
      const want = {};
      picks.forEach((r) => (want[r] = (want[r] || 0) + 1));
      if (Object.entries(want).some(([r, n]) => s.bank[r] < n)) throw new RuleError('은행에 그 자원이 부족합니다.');
    }
    if (card === 'monopoly' && !RESOURCES.includes(action.resource)) throw new RuleError('자원을 고르세요.');
    if (card === 'roadBuilding' && (pl.roadsLeft === 0 || this.legalRoadEdges(p).length === 0)) {
      throw new RuleError('도로를 놓을 수 있는 곳이 없습니다.');
    }

    const idx = pl.devCards.findIndex((c) => c.type === card && c.turn < s.turn);
    pl.devCards.splice(idx, 1);
    s.devPlayedThisTurn = true;
    this.log(`${pl.name}: [${DEV_NAMES[card]}] 카드 사용`, p);

    if (card === 'knight') {
      pl.knights++;
      this.updateLargestArmy(p);
      s.returnPhase = s.phase;
      s.phase = 'robber';
    } else if (card === 'roadBuilding') {
      s.returnPhase = s.phase;
      s.freeRoads = Math.min(2, pl.roadsLeft);
      s.phase = 'roadBuilding';
    } else if (card === 'yearOfPlenty') {
      action.resources.forEach((r) => this.gain(p, r, 1));
      this.log(`${pl.name}: ${action.resources.map((r) => RESOURCE_NAMES[r]).join(', ')} 획득`, p);
    } else if (card === 'monopoly') {
      const r = action.resource;
      let taken = 0;
      s.players.forEach((other, i) => {
        if (i === p) return;
        taken += other.resources[r];
        other.resources[r] = 0;
      });
      pl.resources[r] += taken;
      this.log(`${pl.name}: ${RESOURCE_NAMES[r]} ${taken}장 독점`, p);
    }
  }

  doBankTrade(p, give, get) {
    const s = this.state;
    this.requirePhase('main');
    if (!RESOURCES.includes(give) || !RESOURCES.includes(get) || give === get) throw new RuleError('교역할 자원을 고르세요.');
    const ratio = this.tradeRatio(p, give);
    if (s.players[p].resources[give] < ratio) throw new RuleError(`${RESOURCE_NAMES[give]} ${ratio}장이 필요합니다.`);
    if (s.bank[get] < 1) throw new RuleError('은행에 그 자원이 없습니다.');
    this.pay(p, { [give]: ratio });
    this.gain(p, get, 1);
    this.log(`${s.players[p].name}: 해상 교역 ${RESOURCE_NAMES[give]} ${ratio} → ${RESOURCE_NAMES[get]} 1`, p);
  }

  validatePlayerTrade(p, partner, give, get) {
    const s = this.state;
    if (partner === p || !s.players[partner]) throw new RuleError('교역 상대가 올바르지 않습니다.');
    if (total(give) === 0 || total(get) === 0) throw new RuleError('주고받는 카드가 모두 있어야 합니다.');
    for (const r of RESOURCES) {
      if ((give[r] || 0) > 0 && (get[r] || 0) > 0) throw new RuleError('같은 자원을 주고받을 수 없습니다.');
      if ((give[r] || 0) > s.players[p].resources[r]) throw new RuleError('제안한 카드가 부족합니다.');
      if ((get[r] || 0) > s.players[partner].resources[r]) throw new RuleError('상대의 카드가 부족합니다.');
    }
  }

  doPlayerTrade(p, partner, give, get) {
    const s = this.state;
    this.requirePhase('main');
    this.validatePlayerTrade(p, partner, give, get);
    for (const r of RESOURCES) {
      const g = give[r] || 0;
      const t = get[r] || 0;
      s.players[p].resources[r] += t - g;
      s.players[partner].resources[r] += g - t;
    }
    this.log(`${s.players[p].name} ⇄ ${s.players[partner].name}: ${fmtCards(give)} ↔ ${fmtCards(get)}`, p);
  }

  doEndTurn(p) {
    const s = this.state;
    this.requirePhase('main');
    s.current = (p + 1) % s.players.length;
    s.turn++;
    s.phase = 'roll';
    s.dice = null;
    s.devPlayedThisTurn = false;
    s.lastProduction = null;
    this.log(`— ${s.players[s.current].name}의 차례 —`, s.current);
  }
}
