// 보드 위상(헥스·꼭짓점·변)과 무작위 보드 생성
import { TERRAIN_COUNTS, NUMBER_TOKENS, PORT_TYPES } from './constants.js';

// 픽셀 단위 헥스 격자 간격 (뾰족한 꼭대기 헥스)
export const HEX_DX = 48;
export const HEX_DY = 42;
const T = (HEX_DX * HEX_DX / 4 + HEX_DY * HEX_DY) / (2 * HEX_DY); // 중심→위 꼭짓점 거리
const S = HEX_DY - T; // 중심→옆 꼭짓점의 세로 거리

// 시계 방향, 위 꼭짓점부터
export const CORNER_OFFSETS = [
  [0, -T], [HEX_DX / 2, -S], [HEX_DX / 2, S], [0, T], [-HEX_DX / 2, S], [-HEX_DX / 2, -S],
];

export const AXIAL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

export function hexCenter(q, r) {
  return { x: HEX_DX * (q + r / 2), y: HEX_DY * r };
}

export function axialRing(radius) {
  const out = [];
  for (let r = -radius; r <= radius; r++) {
    for (let q = -radius; q <= radius; q++) {
      if (Math.abs(q + r) <= radius) out.push([q, r]);
    }
  }
  return out;
}

function buildTopology() {
  const hexes = [];
  const vertices = [];
  const edges = [];
  const vertexByKey = new Map();
  const edgeByKey = new Map();

  const vertexAt = (x, y) => {
    const key = `${Math.round(x)},${Math.round(y)}`;
    let id = vertexByKey.get(key);
    if (id === undefined) {
      id = vertices.length;
      vertexByKey.set(key, id);
      vertices.push({ id, x: Math.round(x), y: Math.round(y), hexes: [], edges: [], neighbors: [] });
    }
    return id;
  };

  const edgeBetween = (a, b) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    let id = edgeByKey.get(key);
    if (id === undefined) {
      id = edges.length;
      edgeByKey.set(key, id);
      const va = vertices[a];
      const vb = vertices[b];
      edges.push({ id, v: [a, b], hexes: [], x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2 });
      va.edges.push(id);
      vb.edges.push(id);
      va.neighbors.push(b);
      vb.neighbors.push(a);
    }
    return id;
  };

  for (const [q, r] of axialRing(2)) {
    const { x, y } = hexCenter(q, r);
    const id = hexes.length;
    const hv = CORNER_OFFSETS.map(([ox, oy]) => vertexAt(x + ox, y + oy));
    const he = hv.map((v, i) => edgeBetween(v, hv[(i + 1) % 6]));
    hv.forEach((v) => vertices[v].hexes.push(id));
    he.forEach((e) => edges[e].hexes.push(id));
    hexes.push({ id, q, r, x, y, vertices: hv, edges: he, neighbors: [] });
  }

  const hexByAxial = new Map(hexes.map((h) => [`${h.q},${h.r}`, h.id]));
  for (const h of hexes) {
    for (const [dq, dr] of AXIAL_DIRS) {
      const n = hexByAxial.get(`${h.q + dq},${h.r + dr}`);
      if (n !== undefined) h.neighbors.push(n);
    }
  }

  // 해안 변(인접 육지 헥스가 1개)을 중심 기준 각도순으로 정렬
  const coastEdges = edges
    .filter((e) => e.hexes.length === 1)
    .sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x))
    .map((e) => e.id);

  return { hexes, vertices, edges, coastEdges };
}

export const TOPO = buildTopology();

// 해안 30개 변 중 항구 9개가 놓일 위치 (간격 3,4,3,3,4,3,3,4,3)
export const PORT_SLOTS = [0, 3, 7, 10, 13, 17, 20, 23, 27];

export function portGeometry(edgeId) {
  const e = TOPO.edges[edgeId];
  const h = TOPO.hexes[e.hexes[0]];
  const nx = e.x - h.x;
  const ny = e.y - h.y;
  const len = Math.hypot(nx, ny);
  return { x: Math.round(e.x + (nx / len) * 17), y: Math.round(e.y + (ny / len) * 17), nx: nx / len, ny: ny / len };
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function redNumbersAdjacent(numbers) {
  const isRed = (n) => n === 6 || n === 8;
  return TOPO.hexes.some((h) => isRed(numbers[h.id]) && h.neighbors.some((n) => isRed(numbers[n])));
}

export function generateBoard(rng = Math.random) {
  const terrainBag = [];
  for (const [t, n] of Object.entries(TERRAIN_COUNTS)) for (let i = 0; i < n; i++) terrainBag.push(t);

  let terrains;
  let numbers;
  // 6과 8이 서로 붙지 않도록 다시 섞기
  for (let attempt = 0; attempt < 500; attempt++) {
    terrains = shuffle(terrainBag, rng);
    const tokens = shuffle(NUMBER_TOKENS, rng);
    numbers = terrains.map((t) => (t === 'desert' ? null : tokens.pop()));
    if (!redNumbersAdjacent(numbers)) break;
  }

  const portTypes = shuffle(PORT_TYPES, rng);
  const ports = PORT_SLOTS.map((slot, i) => {
    const edge = TOPO.coastEdges[slot];
    return { type: portTypes[i], edge, vertices: TOPO.edges[edge].v.slice() };
  });

  const hexes = terrains.map((terrain, i) => ({ terrain, number: numbers[i] }));
  const robber = terrains.indexOf('desert');
  return { hexes, ports, robber };
}
