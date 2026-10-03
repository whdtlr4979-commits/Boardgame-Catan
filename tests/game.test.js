import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOPO, generateBoard } from '../js/board.js';
import { Game, RuleError } from '../js/game.js';
import { chooseAction } from '../js/ai.js';
import { PIPS } from '../js/constants.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const players = (n, ai = true) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isAI: ai }));

test('보드 위상: 헥스 19, 꼭짓점 54, 변 72, 해안 30', () => {
  assert.equal(TOPO.hexes.length, 19);
  assert.equal(TOPO.vertices.length, 54);
  assert.equal(TOPO.edges.length, 72);
  assert.equal(TOPO.coastEdges.length, 30);
});

test('보드 생성: 지형/숫자/항구 개수와 6·8 비인접', () => {
  for (let i = 0; i < 30; i++) {
    const b = generateBoard(seeded(i));
    const count = {};
    b.hexes.forEach((h) => (count[h.terrain] = (count[h.terrain] || 0) + 1));
    assert.deepEqual(count, { forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 3, desert: 1 });
    assert.equal(b.hexes.filter((h) => h.number).length, 18);
    assert.equal(b.hexes[b.robber].terrain, 'desert');
    assert.equal(b.ports.length, 9);
    const portVertices = b.ports.flatMap((p) => p.vertices);
    assert.equal(new Set(portVertices).size, 18);
    for (const h of TOPO.hexes) {
      const n = b.hexes[h.id].number;
      if (n === 6 || n === 8) {
        for (const nb of h.neighbors) assert.ok(![6, 8].includes(b.hexes[nb].number));
      }
    }
    assert.ok(b.hexes.every((h) => h.number === null || PIPS[h.number]));
  }
});

function setupGame(seed = 1) {
  const game = Game.create({ players: players(3), rng: seeded(seed), firstPlayer: 0 });
  return game;
}

test('초기 배치: 거리 규칙과 스네이크 순서, 두 번째 개척지 자원', () => {
  const game = setupGame();
  const s = game.state;
  assert.deepEqual(s.setup.order, [0, 1, 2, 2, 1, 0]);
  const v0 = 0;
  game.act(0, { type: 'placeSettlement', vertex: v0 });
  assert.throws(() => game.act(0, { type: 'placeSettlement', vertex: 1 }), RuleError);
  const nb = TOPO.vertices[v0].neighbors[0];
  game.act(0, { type: 'placeRoad', edge: TOPO.vertices[v0].edges[0] });
  assert.equal(s.current, 1);
  assert.throws(() => game.act(1, { type: 'placeSettlement', vertex: nb }), /개척지/);
  while (s.phase === 'setup') {
    const p = s.current;
    game.act(p, chooseAction(game, p));
  }
  assert.equal(s.phase, 'roll');
  assert.equal(s.current, 0);
  for (let p = 0; p < 3; p++) {
    assert.equal(s.players[p].settlementsLeft, 3);
    assert.equal(s.players[p].roadsLeft, 13);
  }
  const totalCards = s.players.reduce((a, pl) => a + Object.values(pl.resources).reduce((x, y) => x + y, 0), 0);
  const bankTotal = Object.values(s.bank).reduce((a, b) => a + b, 0);
  assert.equal(totalCards + bankTotal, 95);
});

test('주사위 생산: 개척지 1장, 도시 2장, 도둑 칸 제외', () => {
  const game = setupGame(3);
  const s = game.state;
  while (s.phase === 'setup') game.act(s.current, chooseAction(game, s.current));
  // 숫자 칸 하나를 골라 수동 검증
  const hexId = TOPO.hexes.findIndex((h, i) => s.board.hexes[i].number && h.vertices.some((v) => s.buildings[v]) && s.board.robber !== i);
  const hex = s.board.hexes[hexId];
  const before = s.players.map((p) => ({ ...p.resources }));
  const sum = hex.number;
  const d1 = Math.min(6, sum - 1);
  game.act(0, { type: 'rollDice', dice: [d1, sum - d1] });
  const r = { forest: 'wood', hills: 'brick', pasture: 'wool', fields: 'grain', mountains: 'ore' }[hex.terrain];
  for (const v of TOPO.hexes[hexId].vertices) {
    const b = s.buildings[v];
    if (b) assert.ok(s.players[b.player].resources[r] > before[b.player][r]);
  }
});

test('7: 8장 이상이면 절반 버리고 도둑 이동', () => {
  const game = setupGame(4);
  const s = game.state;
  while (s.phase === 'setup') game.act(s.current, chooseAction(game, s.current));
  s.players[1].resources = { wood: 3, brick: 3, wool: 3, grain: 0, ore: 0 };
  game.act(0, { type: 'rollDice', dice: [3, 4] });
  assert.equal(s.phase, 'discard');
  assert.equal(s.pendingDiscards[1], 4);
  assert.throws(() => game.act(1, { type: 'discard', cards: { wood: 3 } }), RuleError);
  game.act(1, { type: 'discard', cards: { wood: 2, brick: 2 } });
  for (const p of Object.keys(s.pendingDiscards)) game.act(Number(p), chooseAction(game, Number(p)));
  assert.equal(s.phase, 'robber');
  assert.throws(() => game.act(0, { type: 'moveRobber', hex: s.board.robber }), RuleError);
  game.act(0, chooseAction(game, 0));
  assert.equal(s.phase, 'main');
});

test('최장 교역로: 5개 이상, 상대 개척지로 끊김', () => {
  const game = setupGame(5);
  const s = game.state;
  s.phase = 'main';
  s.turn = 1;
  // 해안을 따라 이어진 도로 6개를 깔기
  const path = [];
  let v = TOPO.hexes[0].vertices[0];
  const hex = TOPO.hexes[0];
  for (let i = 0; i < 6; i++) path.push(hex.edges[i]);
  s.buildings[v] = { player: 0, type: 'settlement' };
  path.forEach((e) => (s.roads[e] = 0));
  game.updateLongestRoad();
  assert.equal(game.longestRoadLength(0), 6);
  assert.equal(s.longestRoad.holder, 0);
  // 상대 개척지가 고리 중간을 끊음 (고리이므로 끊긴 뒤에도 5)
  s.buildings[hex.vertices[3]] = { player: 1, type: 'settlement' };
  game.updateLongestRoad();
  assert.equal(game.longestRoadLength(0), 6);
  delete s.roads[path[5]];
  game.updateLongestRoad();
  // 0-1-2-3 | 3-4-5 : 상대가 꼭짓점 3을 막음 → 3
  assert.equal(game.longestRoadLength(0), 3);
  assert.equal(s.longestRoad.holder, null);
});

test('발전 카드: 산 턴에는 사용 불가, 다음 턴부터 사용', () => {
  const game = setupGame(6);
  const s = game.state;
  while (s.phase === 'setup') game.act(s.current, chooseAction(game, s.current));
  game.act(0, { type: 'rollDice', dice: [1, 2] });
  s.players[0].resources = { wood: 0, brick: 0, wool: 1, grain: 1, ore: 1 };
  s.devDeck.push('monopoly');
  game.act(0, { type: 'buyDevCard' });
  assert.deepEqual(game.playableDevCards(0), []);
  game.act(0, { type: 'endTurn' });
  s.current = 0; // 다시 0번 차례로 가정
  s.phase = 'main';
  assert.deepEqual(game.playableDevCards(0), ['monopoly']);
  s.players[1].resources.ore = 3;
  s.players[2].resources.ore = 2;
  game.act(0, { type: 'playDev', card: 'monopoly', resource: 'ore' });
  assert.equal(s.players[0].resources.ore, 5);
  assert.deepEqual(game.playableDevCards(0), []);
});

test('해상 교역 비율: 기본 4:1', () => {
  const game = setupGame(7);
  const s = game.state;
  s.phase = 'main';
  s.players[0].resources.wood = 4;
  game.act(0, { type: 'bankTrade', give: 'wood', get: 'ore' });
  assert.equal(s.players[0].resources.wood, 0);
  assert.equal(s.players[0].resources.ore, 1);
});

test('AI끼리 끝까지 플레이하면 승자가 나온다', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const n = seed % 2 ? 4 : 3;
    const game = Game.create({ players: players(n), rng: seeded(seed * 97) });
    const s = game.state;
    let steps = 0;
    while (s.phase !== 'gameOver' && steps < 20000) {
      steps++;
      if (s.phase === 'discard') {
        const p = Number(Object.keys(s.pendingDiscards)[0]);
        game.act(p, chooseAction(game, p));
        continue;
      }
      game.act(s.current, chooseAction(game, s.current));
      // 자원 보존 법칙
      for (const r of ['wood', 'brick', 'wool', 'grain', 'ore']) {
        const sum = s.bank[r] + s.players.reduce((a, pl) => a + pl.resources[r], 0);
        assert.equal(sum, 19);
        assert.ok(s.players.every((pl) => pl.resources[r] >= 0));
      }
    }
    assert.equal(s.phase, 'gameOver', `seed ${seed} did not finish (turn ${s.turn})`);
    assert.ok(game.victoryPoints(s.winner) >= 10);
  }
});
