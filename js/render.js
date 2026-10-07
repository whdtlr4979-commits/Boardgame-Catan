// 보드 렌더러: 화면 해상도 그대로 벡터로 그린다 (바다 틀·지형·토큰·항구는 캐시, 말과 강조 표시는 매 프레임)
import { TOPO, HEX_DY, CORNER_OFFSETS } from './board.js';
import { PIPS, PLAYER_COLORS } from './constants.js';
import { RES_COLORS, seeded, drawSettlement, drawCity, drawRoad, drawRobber, iconURL } from './art.js';
import { paintTile, TILE_SCALE } from './terrain.js';

export const LOGICAL_W = 304;
export const LOGICAL_H = 292;
const OX = LOGICAL_W / 2;
const OY = LOGICAL_H / 2;
const TOKEN_R = 10;
const NUMBER_FONT = 'Georgia, "Times New Roman", serif';
// 바다 틀: 위아래가 평평한 큰 육각형 (실제 카탄의 바다 틀 모양)
const FRAME_R = 151;
const FRAME_RIM = 3.2;

function hexPath(ctx, cx, cy, scale) {
  ctx.beginPath();
  CORNER_OFFSETS.forEach(([dx, dy], i) => {
    const x = cx + dx * scale;
    const y = cy + dy * scale;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
}

function framePath(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function drawToken(ctx, cx, cy, n, k) {
  // 두꺼운 종이 토큰: 옆면 → 윗면
  ctx.save();
  ctx.shadowColor = 'rgba(30,18,6,0.45)';
  ctx.shadowBlur = 2 * k;
  ctx.shadowOffsetY = 1 * k;
  ctx.beginPath();
  ctx.arc(cx, cy + 1, TOKEN_R, 0, Math.PI * 2);
  ctx.fillStyle = '#b39667';
  ctx.fill();
  ctx.restore();
  const g = ctx.createRadialGradient(cx - 3.5, cy - 4, 1, cx, cy, TOKEN_R);
  g.addColorStop(0, '#fffbef');
  g.addColorStop(0.75, '#f4e6c3');
  g.addColorStop(1, '#e6d2a4');
  ctx.beginPath();
  ctx.arc(cx, cy, TOKEN_R, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#a98b5a';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(169,139,90,0.45)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.arc(cx, cy, TOKEN_R - 1.5, 0, Math.PI * 2);
  ctx.stroke();
  const red = n === 6 || n === 8;
  ctx.fillStyle = red ? '#c62f22' : '#2e2118';
  ctx.font = `bold ${red ? 10 : 8.8}px ${NUMBER_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), cx, cy - 1.3);
  const pips = PIPS[n];
  for (let i = 0; i < pips; i++) {
    ctx.beginPath();
    ctx.arc(cx + (i - (pips - 1) / 2) * 1.7, cy + 5.2, 0.66, 0, Math.PI * 2);
    ctx.fill();
  }
}

const iconImages = new Map();
function iconImage(name) {
  if (!iconImages.has(name)) {
    const img = new Image();
    img.src = iconURL(name);
    iconImages.set(name, img);
  }
  return iconImages.get(name);
}

// 항구 토큰 위치: 해안 변 가운데에서 바다 쪽으로
function portSpot(edgeId) {
  const e = TOPO.edges[edgeId];
  const h = TOPO.hexes[e.hexes[0]];
  const nx = e.x - h.x;
  const ny = e.y - h.y;
  const len = Math.hypot(nx, ny);
  return { x: e.x + (nx / len) * 15.5, y: e.y + (ny / len) * 15.5 };
}

// 나무 잔교: 판자와 말뚝
function drawPier(ctx, x1, y1, x2, y2) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
  ctx.fillStyle = 'rgba(0,30,50,0.3)';
  ctx.fillRect(0.6, -1.1, len, 3.2);
  for (let d = 2; d < len; d += 3.2) {
    for (const side of [-1.9, 1.9]) {
      ctx.beginPath();
      ctx.arc(d, side, 0.6, 0, Math.PI * 2);
      ctx.fillStyle = '#4a2f18';
      ctx.fill();
    }
  }
  ctx.fillStyle = '#b07a44';
  ctx.fillRect(0, -1.5, len, 3);
  ctx.strokeStyle = '#6e4724';
  ctx.lineWidth = 0.3;
  for (let d = 0.8; d < len; d += 1.1) {
    ctx.beginPath();
    ctx.moveTo(d, -1.5);
    ctx.lineTo(d, 1.5);
    ctx.stroke();
  }
  ctx.strokeRect(0, -1.5, len, 3);
  ctx.restore();
}

function drawPort(ctx, port, k) {
  const g = portSpot(port.edge);
  for (const v of port.vertices) {
    const vv = TOPO.vertices[v];
    const tx = vv.x + (g.x - vv.x) * 0.16;
    const ty = vv.y + (g.y - vv.y) * 0.16;
    drawPier(ctx, g.x, g.y, tx, ty);
  }
  const ring = port.type === 'generic' ? '#2f6f9a' : RES_COLORS[port.type];
  ctx.save();
  ctx.shadowColor = 'rgba(0,25,45,0.45)';
  ctx.shadowBlur = 2 * k;
  ctx.shadowOffsetY = 0.8 * k;
  ctx.beginPath();
  ctx.arc(g.x, g.y + 0.9, 8.4, 0, Math.PI * 2);
  ctx.fillStyle = '#b39667';
  ctx.fill();
  ctx.restore();
  const face = ctx.createRadialGradient(g.x - 3, g.y - 3, 1, g.x, g.y, 8.4);
  face.addColorStop(0, '#fffbef');
  face.addColorStop(1, '#eedfb8');
  ctx.beginPath();
  ctx.arc(g.x, g.y, 8.4, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ring;
  ctx.beginPath();
  ctx.arc(g.x, g.y, 7.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2e2118';
  if (port.type === 'generic') {
    ctx.font = `bold 4px ${NUMBER_FONT}`;
    ctx.fillStyle = '#2f6f9a';
    ctx.fillText('?', g.x, g.y - 3.6);
    ctx.fillStyle = '#2e2118';
    ctx.font = `bold 5.6px ${NUMBER_FONT}`;
    ctx.fillText('3:1', g.x, g.y + 1.2);
  } else {
    const img = iconImage(port.type);
    if (img.complete) ctx.drawImage(img, g.x - 4.4, g.y - 7.2, 8.8, 8.8);
    ctx.font = `bold 4.6px ${NUMBER_FONT}`;
    ctx.fillText('2:1', g.x, g.y + 4.3);
  }
}

// 바다 틀과 얕은 물가
function drawSea(ctx, k) {
  ctx.save();
  ctx.shadowColor = 'rgba(20,10,0,0.55)';
  ctx.shadowBlur = 6 * k;
  ctx.shadowOffsetY = 3 * k;
  framePath(ctx, FRAME_R);
  ctx.fillStyle = '#163f63';
  ctx.fill();
  ctx.restore();
  const sea = ctx.createRadialGradient(0, 0, 80, 0, 0, FRAME_R);
  sea.addColorStop(0, '#3f9cc6');
  sea.addColorStop(1, '#2468a0');
  framePath(ctx, FRAME_R - FRAME_RIM);
  ctx.fillStyle = sea;
  ctx.fill();
  ctx.save();
  framePath(ctx, FRAME_R - FRAME_RIM);
  ctx.clip();
  // 물결 무늬
  const rnd = seeded(99);
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = (rnd() - 0.5) * FRAME_R * 2;
    const y = (rnd() - 0.5) * FRAME_R * 1.8;
    const r = 2.5 + rnd() * 2.5;
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + rnd() * 0.14})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.bezierCurveTo(x - r * 0.4, y - r * 0.5, x + r * 0.4, y + r * 0.5, x + r, y);
    ctx.stroke();
  }
  // 틀 조각 사이 이음매
  ctx.strokeStyle = 'rgba(10,40,70,0.35)';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 118, Math.sin(a) * 118);
    ctx.lineTo(Math.cos(a) * FRAME_R, Math.sin(a) * FRAME_R);
    ctx.stroke();
  }
  ctx.restore();
  // 틀 가장자리 빛
  framePath(ctx, FRAME_R - FRAME_RIM);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  framePath(ctx, FRAME_R - 0.5);
  ctx.strokeStyle = 'rgba(120,170,210,0.5)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // 섬 둘레의 얕은 물과 물거품
  for (const [scale, fill] of [[1.22, 'rgba(110,200,220,0.28)'], [1.12, 'rgba(160,230,235,0.35)']]) {
    ctx.fillStyle = fill;
    for (const h of TOPO.hexes) {
      hexPath(ctx, h.x, h.y, scale);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const h of TOPO.hexes) {
    hexPath(ctx, h.x, h.y, 1.045);
    ctx.fill();
  }
}

export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.baseKey = null;
    this.k = 1; // 논리 좌표 1 = 장치 픽셀 k
    this.state = null;
    this.view = {};
    this.raf = null;
  }

  // ---------- 정적 보드 ----------
  buildBase(board) {
    const key = JSON.stringify([board.hexes, board.ports, this.canvas.width, this.canvas.height]);
    if (key === this.baseKey) return;
    // 항구 아이콘 이미지가 아직 안 불러졌으면 불러온 뒤 다시 그린다
    const pending = board.ports.filter((p) => p.type !== 'generic').map((p) => iconImage(p.type)).filter((img) => !img.complete);
    if (pending.length) {
      Promise.all(pending.map((img) => new Promise((r) => { img.onload = r; img.onerror = r; }))).then(() => {
        this.baseKey = null;
        this.draw();
      });
    }
    this.baseKey = pending.length ? null : key;
    const base = this.base;
    base.width = this.canvas.width;
    base.height = this.canvas.height;
    const ctx = base.getContext('2d');
    const k = this.k;
    ctx.setTransform(k, 0, 0, k, 0, 0);

    // 바다 틀
    ctx.translate(OX, OY);
    drawSea(ctx, k);
    for (const port of board.ports) drawPort(ctx, port, k);

    // 타일 사이 틈
    ctx.fillStyle = '#4a3622';
    for (const h of TOPO.hexes) {
      hexPath(ctx, h.x, h.y, 1.005);
      ctx.fill();
    }

    // 지형 타일
    for (const h of TOPO.hexes) {
      const terrain = board.hexes[h.id].terrain;
      ctx.save();
      hexPath(ctx, h.x, h.y, TILE_SCALE);
      ctx.clip();
      paintTile(ctx, terrain, h.x, h.y, h.id);
      // 두꺼운 타일 가장자리: 위는 밝고 아래는 어둡게
      const bevel = ctx.createLinearGradient(h.x - 16, h.y - 26, h.x + 16, h.y + 26);
      bevel.addColorStop(0, 'rgba(255,250,225,0.6)');
      bevel.addColorStop(0.48, 'rgba(255,255,255,0)');
      bevel.addColorStop(0.52, 'rgba(0,0,0,0)');
      bevel.addColorStop(1, 'rgba(30,15,0,0.5)');
      hexPath(ctx, h.x, h.y, TILE_SCALE);
      ctx.strokeStyle = bevel;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.restore();
      hexPath(ctx, h.x, h.y, TILE_SCALE);
      ctx.strokeStyle = 'rgba(35,22,10,0.6)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    for (const h of TOPO.hexes) {
      const n = board.hexes[h.id].number;
      if (n) drawToken(ctx, h.x, h.y, n, k);
    }
  }

  // ---------- 장면 ----------
  render(state, view = {}) {
    this.state = state;
    this.view = view;
    this.draw();
  }

  hasHighlights() {
    const v = this.view;
    return !!(v.vertices?.length || v.edges?.length || v.hexes?.length || v.cityVertices?.length);
  }

  draw(now = performance.now()) {
    if (!this.state) return;
    const state = this.state;
    const view = this.view;
    this.buildBase(state.board);
    const ctx = this.ctx;
    const k = this.k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(k, 0, 0, k, OX * k, OY * k);

    // 방금 나온 숫자 강조
    if (state.dice && view.showRoll) {
      const sum = state.dice[0] + state.dice[1];
      for (const h of TOPO.hexes) {
        if (state.board.hexes[h.id].number !== sum) continue;
        const blocked = state.board.robber === h.id;
        ctx.save();
        ctx.shadowColor = blocked ? '#ff5a4a' : '#ffe680';
        ctx.shadowBlur = 6 * k;
        ctx.strokeStyle = blocked ? '#e74c3c' : '#ffd84a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(h.x, h.y, TOKEN_R + 1.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const [e, p] of Object.entries(state.roads)) {
      const [a, b] = TOPO.edges[e].v.map((v) => TOPO.vertices[v]);
      drawRoad(ctx, a.x, a.y, b.x, b.y, PLAYER_COLORS[state.players[p].color], k);
    }
    if (view.ghostEdge != null) {
      const [a, b] = TOPO.edges[view.ghostEdge].v.map((v) => TOPO.vertices[v]);
      ctx.globalAlpha = 0.6;
      drawRoad(ctx, a.x, a.y, b.x, b.y, PLAYER_COLORS[view.ghostColor], k);
      ctx.globalAlpha = 1;
    }

    const rh = TOPO.hexes[state.board.robber];
    drawRobber(ctx, rh.x - 15, rh.y + 7);

    const sorted = Object.entries(state.buildings).sort((a, b) => TOPO.vertices[a[0]].y - TOPO.vertices[b[0]].y);
    for (const [v, b] of sorted) {
      const vv = TOPO.vertices[v];
      const color = PLAYER_COLORS[state.players[b.player].color];
      if (b.type === 'city') drawCity(ctx, vv.x, vv.y, color);
      else drawSettlement(ctx, vv.x, vv.y, color);
    }

    // 선택할 수 있는 곳: 은은하게 맥박치는 빛
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    const glow = (fn, hover) => {
      ctx.save();
      ctx.shadowColor = hover ? '#ffffff' : '#ffe27a';
      ctx.shadowBlur = (hover ? 8 : 4 + pulse * 5) * k;
      fn(hover);
      ctx.restore();
    };
    for (const v of view.vertices || []) {
      const vv = TOPO.vertices[v];
      const hover = view.hover === `v${v}`;
      glow((hv) => {
        ctx.beginPath();
        ctx.arc(vv.x, vv.y, hv ? 4.2 : 3 + pulse * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = hv ? '#ffffff' : `rgba(255,248,220,${0.75 + pulse * 0.25})`;
        ctx.fill();
        ctx.lineWidth = 0.9;
        ctx.strokeStyle = '#d99a1e';
        ctx.stroke();
      }, hover);
    }
    for (const e of view.edges || []) {
      const ee = TOPO.edges[e];
      const [a, b] = ee.v.map((v) => TOPO.vertices[v]);
      const hover = view.hover === `e${e}`;
      glow((hv) => {
        ctx.save();
        ctx.translate(ee.x, ee.y);
        ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-5, -1.9, 10, 3.8, 1.9) : ctx.rect(-5, -1.9, 10, 3.8);
        ctx.fillStyle = hv ? '#ffffff' : `rgba(255,248,220,${0.7 + pulse * 0.3})`;
        ctx.fill();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = '#d99a1e';
        ctx.stroke();
        ctx.restore();
      }, hover);
    }
    for (const v of view.cityVertices || []) {
      const vv = TOPO.vertices[v];
      const hover = view.hover === `v${v}`;
      glow((hv) => {
        ctx.beginPath();
        ctx.arc(vv.x, vv.y, 8.5, 0, Math.PI * 2);
        ctx.lineWidth = hv ? 2 : 1.3;
        ctx.strokeStyle = hv ? '#ffffff' : '#ffd84a';
        ctx.stroke();
      }, hover);
    }
    for (const hx of view.hexes || []) {
      const h = TOPO.hexes[hx];
      const hover = view.hover === `h${hx}`;
      glow((hv) => {
        ctx.beginPath();
        ctx.arc(h.x, h.y, TOKEN_R + 3, 0, Math.PI * 2);
        ctx.lineWidth = hv ? 2.4 : 1.6;
        ctx.strokeStyle = hv ? '#ffffff' : `rgba(255,216,74,${0.6 + pulse * 0.4})`;
        ctx.stroke();
      }, hover);
    }

    // 강조할 곳이 있으면 다음 프레임 예약
    if (this.hasHighlights()) {
      if (!this.raf) {
        this.raf = requestAnimationFrame((t) => {
          this.raf = null;
          this.draw(t);
        });
      }
    }
  }

  // ---------- 크기 ----------
  resize(availW, availH) {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.max(0.5, Math.min(availW / LOGICAL_W, availH / LOGICAL_H));
    const cssW = Math.round(LOGICAL_W * scale);
    const cssH = Math.round(LOGICAL_H * scale);
    // 크기가 그대로면 다시 만들지 않는다 (ResizeObserver 반복 방지)
    if (this.cssW === cssW && this.cssH === cssH && this.dpr === dpr) return;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.k = this.canvas.width / LOGICAL_W;
    this.baseKey = null;
    this.draw();
  }

  toLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * LOGICAL_W - OX,
      y: ((clientY - rect.top) / rect.height) * LOGICAL_H - OY,
    };
  }

  // 화면 좌표에서 가장 가까운 후보 찾기
  pick(clientX, clientY, view) {
    const { x, y } = this.toLogical(clientX, clientY);
    let best = null;
    let bestD = Infinity;
    const consider = (key, px, py, maxD) => {
      const d = Math.hypot(px - x, py - y);
      if (d < maxD && d < bestD) {
        bestD = d;
        best = key;
      }
    };
    for (const v of view.vertices || []) consider(`v${v}`, TOPO.vertices[v].x, TOPO.vertices[v].y, 14);
    for (const v of view.cityVertices || []) consider(`v${v}`, TOPO.vertices[v].x, TOPO.vertices[v].y, 14);
    for (const e of view.edges || []) consider(`e${e}`, TOPO.edges[e].x, TOPO.edges[e].y, 13);
    for (const h of view.hexes || []) consider(`h${h}`, TOPO.hexes[h].x, TOPO.hexes[h].y, HEX_DY * 0.6);
    return best;
  }
}
