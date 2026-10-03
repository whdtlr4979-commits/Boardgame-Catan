// 컴퓨터 플레이어: 휴리스틱으로 다음 행동을 고른다.
import { RESOURCES, COSTS, PIPS, TERRAIN_RESOURCE } from './constants.js';
import { TOPO } from './board.js';
import { handTotal } from './game.js';

const RESOURCE_WEIGHT = { wood: 1.0, brick: 1.0, wool: 0.85, grain: 1.0, ore: 1.0 };

function hexPips(game, h) {
  const hex = game.state.board.hexes[h];
  return hex.number ? PIPS[hex.number] : 0;
}

// 꼭짓점의 생산 가치
export function vertexScore(game, v, p) {
  const s = game.state;
  let score = 0;
  const produced = new Set();
  for (const h of TOPO.vertices[v].hexes) {
    const r = TERRAIN_RESOURCE[s.board.hexes[h].terrain];
    if (!r) continue;
    const pips = hexPips(game, h) * (s.board.robber === h ? 0.4 : 1);
    score += pips * RESOURCE_WEIGHT[r];
    produced.add(r);
  }
  // 이미 가진 생산 자원과 겹치지 않으면 가산점
  const owned = new Set();
  if (p !== undefined) {
    for (const [ov, b] of Object.entries(s.buildings)) {
      if (b.player !== p) continue;
      for (const h of TOPO.vertices[ov].hexes) {
        const r = TERRAIN_RESOURCE[s.board.hexes[h].terrain];
        if (r) owned.add(r);
      }
    }
  }
  for (const r of produced) score += owned.has(r) ? 0.6 : 1.6;
  for (const port of s.board.ports) {
    if (!port.vertices.includes(v)) continue;
    if (port.type === 'generic') score += 1.2;
    else if (produced.has(port.type) || owned.has(port.type)) score += 2;
    else score += 0.4;
  }
  return score;
}

function production(game, v) {
  return TOPO.vertices[v].hexes.reduce((s, h) => s + hexPips(game, h), 0);
}

function missingFor(hand, cost) {
  let m = 0;
  for (const [r, n] of Object.entries(cost)) m += Math.max(0, n - hand[r]);
  return m;
}

function afterTrade(hand, give, get) {
  const h = { ...hand };
  for (const r of RESOURCES) h[r] += (get[r] || 0) - (give[r] || 0);
  return h;
}

// 지금 노릴 건설 목표
function chooseGoal(game, p) {
  const s = game.state;
  const pl = s.players[p];
  const hand = pl.resources;
  const goals = [];
  if (game.legalCityVertices(p).length > 0) goals.push({ kind: 'city', cost: COSTS.city, prio: 0 });
  const spots = game.legalSettlementVertices(p);
  if (spots.length > 0) goals.push({ kind: 'settlement', cost: COSTS.settlement, prio: 1 });
  else if (pl.roadsLeft > 0 && game.legalRoadEdges(p).length > 0 && pl.settlementsLeft > 0) {
    goals.push({ kind: 'road', cost: COSTS.road, prio: 2 });
  }
  if (s.devDeck.length > 0) goals.push({ kind: 'devCard', cost: COSTS.devCard, prio: 3 });
  if (goals.length === 0) return null;
  goals.sort((a, b) => missingFor(hand, a.cost) + a.prio * 0.6 - (missingFor(hand, b.cost) + b.prio * 0.6));
  return goals[0];
}

function bestRoadEdge(game, p) {
  const edges = game.legalRoadEdges(p);
  let best = null;
  let bestScore = -Infinity;
  for (const e of edges) {
    let score = 0;
    for (const v of TOPO.edges[e].v) {
      if (game.isVertexFreeForSettlement(v)) score = Math.max(score, vertexScore(game, v, p));
      for (const n of TOPO.vertices[v].neighbors) {
        if (game.isVertexFreeForSettlement(n)) score = Math.max(score, vertexScore(game, n, p) * 0.7);
      }
    }
    score += Math.random() * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function bestSettlement(game, p) {
  const spots = game.legalSettlementVertices(p);
  let best = null;
  let bestScore = -Infinity;
  for (const v of spots) {
    const sc = vertexScore(game, v, p) + Math.random() * 0.2;
    if (sc > bestScore) {
      bestScore = sc;
      best = v;
    }
  }
  return best;
}

function leader(game, p) {
  const s = game.state;
  let best = null;
  let bestVp = -1;
  s.players.forEach((_, i) => {
    if (i === p) return;
    const vp = game.victoryPoints(i, { includeHidden: false });
    if (vp > bestVp) {
      bestVp = vp;
      best = i;
    }
  });
  return best;
}

export function chooseRobberMove(game, p) {
  const s = game.state;
  let best = null;
  let bestScore = -Infinity;
  for (const h of game.legalRobberHexes()) {
    let score = 0;
    let mine = false;
    for (const v of TOPO.hexes[h].vertices) {
      const b = s.buildings[v];
      if (!b) continue;
      if (b.player === p) mine = true;
      else {
        const vp = game.victoryPoints(b.player, { includeHidden: false });
        score += hexPips(game, h) * (b.type === 'city' ? 2 : 1) * (1 + vp / 6);
      }
    }
    if (mine) score -= 20;
    if (game.robberVictims(h, p).length > 0) score += 2;
    score += Math.random() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  const victims = game.robberVictims(best, p);
  let victim;
  if (victims.length > 0) {
    victim = victims.reduce((a, b) => {
      const va = game.victoryPoints(a, { includeHidden: false }) * 10 + handTotal(s.players[a].resources);
      const vb = game.victoryPoints(b, { includeHidden: false }) * 10 + handTotal(s.players[b].resources);
      return vb > va ? b : a;
    });
  }
  return { type: 'moveRobber', hex: best, victim };
}

export function chooseDiscard(game, p) {
  const s = game.state;
  const need = s.pendingDiscards[p];
  const hand = { ...s.players[p].resources };
  const goal = chooseGoal(game, p);
  const keep = goal ? goal.cost : {};
  const cards = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  for (let i = 0; i < need; i++) {
    let pick = null;
    let pickScore = -Infinity;
    for (const r of RESOURCES) {
      if (hand[r] <= 0) continue;
      const sc = hand[r] - (keep[r] || 0) * 1.5;
      if (sc > pickScore) {
        pickScore = sc;
        pick = r;
      }
    }
    hand[pick]--;
    cards[pick]++;
  }
  return { type: 'discard', cards };
}

// 상대가 제안한 교역에 응할지
export function respondToTrade(game, p, offerer, give, get) {
  const s = game.state;
  // give/get은 제안자 기준 → AI는 get을 내주고 give를 받는다
  const hand = s.players[p].resources;
  if (RESOURCES.some((r) => (get[r] || 0) > hand[r])) return false;
  if (game.victoryPoints(offerer, { includeHidden: false }) >= 8) return false;
  const goal = chooseGoal(game, p);
  if (!goal) return false;
  const before = missingFor(hand, goal.cost);
  const after = missingFor(afterTrade(hand, get, give), goal.cost);
  const giveCount = handTotal(get);
  const recvCount = handTotal(give);
  if (after < before) return recvCount >= giveCount - 1;
  if (after === before && recvCount > giveCount) return true;
  return false;
}

function bankTradeToward(game, p, cost) {
  const s = game.state;
  const hand = s.players[p].resources;
  const missing = RESOURCES.filter((r) => hand[r] < (cost[r] || 0) && s.bank[r] > 0);
  if (missing.length === 0) return null;
  let best = null;
  let bestSurplus = -Infinity;
  for (const r of RESOURCES) {
    const surplus = hand[r] - (cost[r] || 0);
    if (surplus >= game.tradeRatio(p, r) && surplus > bestSurplus) {
      best = r;
      bestSurplus = surplus;
    }
  }
  if (!best) return null;
  return { type: 'bankTrade', give: best, get: missing[0] };
}

function chooseDevPlay(game, p) {
  const s = game.state;
  const playable = game.playableDevCards(p);
  if (playable.length === 0) return null;
  const pl = s.players[p];

  if (playable.includes('knight')) {
    const robberHex = TOPO.hexes[s.board.robber];
    const blocked = robberHex.vertices.some((v) => s.buildings[v]?.player === p);
    const others = Math.max(0, ...s.players.map((o, i) => (i === p ? 0 : o.knights)));
    const armyRace = pl.knights + 1 >= 3 && pl.knights + 1 > others && s.largestArmy.holder !== p;
    if (blocked || armyRace || (s.phase === 'main' && Math.random() < 0.25)) return { type: 'playDev', card: 'knight' };
  }
  if (s.phase !== 'main') return null;
  const goal = chooseGoal(game, p);
  if (playable.includes('roadBuilding') && pl.roadsLeft >= 2 && game.legalRoadEdges(p).length > 0) {
    return { type: 'playDev', card: 'roadBuilding' };
  }
  if (playable.includes('yearOfPlenty') && goal) {
    const hand = pl.resources;
    const picks = [];
    for (const [r, n] of Object.entries(goal.cost)) {
      for (let i = hand[r]; i < n && picks.length < 2; i++) if (s.bank[r] - picks.filter((x) => x === r).length > 0) picks.push(r);
    }
    while (picks.length < 2) {
      const r = RESOURCES.find((x) => s.bank[x] - picks.filter((y) => y === x).length > 0);
      if (!r) break;
      picks.push(r);
    }
    if (picks.length === 2) return { type: 'playDev', card: 'yearOfPlenty', resources: picks };
  }
  if (playable.includes('monopoly')) {
    const othersCards = s.players.reduce((a, o, i) => a + (i === p ? 0 : handTotal(o.resources)), 0);
    if (othersCards >= 7) {
      const want = goal ? Object.keys(goal.cost).sort((a, b) => goal.cost[b] - goal.cost[a])[0] : 'ore';
      return { type: 'playDev', card: 'monopoly', resource: want };
    }
  }
  return null;
}

export function chooseAction(game, p) {
  const s = game.state;
  const pl = s.players[p];

  if (s.phase === 'setup') {
    if (s.setup.step === 'settlement') return { type: 'placeSettlement', vertex: bestSettlement(game, p) };
    return { type: 'placeRoad', edge: bestRoadEdge(game, p) };
  }
  if (s.phase === 'discard') return s.pendingDiscards[p] ? chooseDiscard(game, p) : null;
  if (s.phase === 'robber') return chooseRobberMove(game, p);
  if (s.phase === 'roadBuilding') {
    const e = bestRoadEdge(game, p);
    return e === null ? { type: 'endRoadBuilding' } : { type: 'buildRoad', edge: e };
  }
  if (s.phase === 'roll') {
    const dev = chooseDevPlay(game, p);
    if (dev && dev.card === 'knight') return dev;
    return { type: 'rollDice' };
  }
  if (s.phase !== 'main') return null;

  const dev = chooseDevPlay(game, p);
  if (dev) return dev;

  if (game.canAfford(p, COSTS.city)) {
    const cities = game.legalCityVertices(p);
    if (cities.length > 0) {
      const v = cities.reduce((a, b) => (production(game, b) > production(game, a) ? b : a));
      return { type: 'buildCity', vertex: v };
    }
  }
  if (game.canAfford(p, COSTS.settlement)) {
    const v = bestSettlement(game, p);
    if (v !== null) return { type: 'buildSettlement', vertex: v };
  }
  const goal = chooseGoal(game, p);
  if (goal && goal.kind === 'road' && game.canAfford(p, COSTS.road)) {
    const e = bestRoadEdge(game, p);
    if (e !== null) return { type: 'buildRoad', edge: e };
  }
  if (goal && goal.kind === 'devCard' && game.canAfford(p, COSTS.devCard)) return { type: 'buyDevCard' };

  if (goal) {
    const trade = bankTradeToward(game, p, goal.cost);
    if (trade) return trade;
  }

  // 손패가 많으면 7에 대비해 소비
  if (handTotal(pl.resources) > 7) {
    if (game.canAfford(p, COSTS.devCard) && s.devDeck.length > 0) return { type: 'buyDevCard' };
    if (game.canAfford(p, COSTS.road)) {
      const e = bestRoadEdge(game, p);
      if (e !== null) return { type: 'buildRoad', edge: e };
    }
  }
  return { type: 'endTurn' };
}
