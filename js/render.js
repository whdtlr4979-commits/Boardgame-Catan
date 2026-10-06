// 보드 렌더러: 화면 해상도 그대로 벡터로 그린다 (지형·토큰·항구는 캐시, 말과 강조 표시는 매 프레임)
import { TOPO, HEX_DY, CORNER_OFFSETS, portGeometry } from './board.js';
import { PIPS, PLAYER_COLORS } from './constants.js';
import {
  TERRAIN_STYLE, RES_COLORS, seeded, shade,
  drawTree, drawSheep, drawTuft, drawWheat, drawBricks, drawMound, drawPeak, drawDune, drawCactus, drawRock,
  drawSettlement, drawCity, drawRoad, drawRobber, iconURL,
} from './art.js';

export const LOGICAL_W = 304;
export const LOGICAL_H = 292;
const OX = LOGICAL_W / 2;
const OY = LOGICAL_H / 2;
const TOKEN_R = 10;
const NUMBER_FONT = 'Georgia, "Times New Roman", serif';

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

// 지형별 장식 위치 (타일 중심 기준, 숫자 토큰을 피한다)
const ANCHORS = [[-12, -15], [5, -19], [14, -9], [-17, -1], [16, 6], [-13, 12], [0, 19], [10, 16]];

function decorateTile(ctx, terrain, cx, cy, id) {
  const rnd = seeded(id * 7 + terrain.length);
  const jitter = () => (rnd() - 0.5) * 2.4;
  const items = [];
  const at = (i) => [cx + ANCHORS[i][0] + jitter(), cy + ANCHORS[i][1] + jitter()];

  if (terrain === 'forest') {
    // 바닥 질감
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(20,60,20,${0.12 + rnd() * 0.1})`;
      ctx.beginPath();
      ctx.arc(cx + (rnd() - 0.5) * 44, cy + (rnd() - 0.5) * 50, 2 + rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ANCHORS.forEach((_, i) => {
      const [x, y] = at(i);
      items.push([y, () => drawTree(ctx, x, y, 0.85 + rnd() * 0.25, rnd() < 0.3)]);
    });
  } else if (terrain === 'pasture') {
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = `rgba(255,255,220,${0.12 + rnd() * 0.12})`;
      ctx.beginPath();
      ctx.arc(cx + (rnd() - 0.5) * 44, cy + (rnd() - 0.5) * 50, 1 + rnd() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    [0, 2, 6].forEach((i) => {
      const [x, y] = at(i);
      items.push([y, () => drawSheep(ctx, x - 1, y, 0.85)]);
    });
    [1, 3, 4, 5, 7].forEach((i) => {
      const [x, y] = at(i);
      items.push([y, () => drawTuft(ctx, x, y, 1.2)]);
    });
  } else if (terrain === 'fields') {
    // 밭고랑
    ctx.strokeStyle = 'rgba(176,120,30,0.28)';
    ctx.lineWidth = 1.1;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy + i * 4.2 - 12);
      ctx.lineTo(cx + 30, cy + i * 4.2 + 12);
      ctx.stroke();
    }
    ANCHORS.forEach((_, i) => {
      if (i === 3 || i === 4) return;
      const [x, y] = at(i);
      items.push([y, () => drawWheat(ctx, x, y + 2, 0.8)]);
    });
  } else if (terrain === 'hills') {
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(120,50,20,${0.1 + rnd() * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(cx + (rnd() - 0.5) * 44, cy + (rnd() - 0.5) * 50, 3 + rnd() * 3, 1.5 + rnd(), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    [0, 7].forEach((i) => {
      const [x, y] = at(i);
      items.push([y, () => drawBricks(ctx, x, y, 0.85)]);
    });
    [1, 2, 3, 4, 5, 6].forEach((i) => {
      const [x, y] = at(i);
      items.push([y, () => drawMound(ctx, x, y, 0.8 + rnd() * 0.3)]);
    });
  } else if (terrain === 'mountains') {
    for (const [dx, dy, w, h] of [[-9, -8, 17, 14], [7, -9, 18, 15.5], [-14, 15, 12, 9], [12, 17, 12, 9.5]]) {
      const x = cx + dx + jitter() * 0.5;
      const y = cy + dy;
      items.push([y, () => drawPeak(ctx, x, y, w, h)]);
    }
  } else if (terrain === 'desert') {
    [0, 2, 5, 7].forEach((i) => {
      const [x, y] = at(i);
      items.push([y - 5, () => drawDune(ctx, x, y, 1)]);
    });
    [1, 6].forEach((i) => {
      const [x, y] = at(i);
      items.push([y, () => drawCactus(ctx, x, y, 0.9)]);
    });
    [3, 4].forEach((i) => {
      const [x, y] = at(i);
      items.push([y, () => drawRock(ctx, x, y, 1)]);
    });
  }
  items.sort((a, b) => a[0] - b[0]).forEach(([, draw]) => draw());
}

function drawToken(ctx, cx, cy, n, k) {
  ctx.save();
  ctx.shadowColor = 'rgba(40,25,10,0.45)';
  ctx.shadowBlur = 2.2 * k;
  ctx.shadowOffsetY = 0.8 * k;
  const g = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, TOKEN_R);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(1, '#ecdcb4');
  ctx.beginPath();
  ctx.arc(cx, cy, TOKEN_R, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#c4ab7c';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, TOKEN_R - 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(196,171,124,0.5)';
  ctx.beginPath();
  ctx.arc(cx, cy, TOKEN_R - 1.6, 0, Math.PI * 2);
  ctx.stroke();
  const red = n === 6 || n === 8;
  ctx.fillStyle = red ? '#c0392b' : '#3b2a1e';
  ctx.font = `bold ${red ? 9.6 : 8.6}px ${NUMBER_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), cx, cy - 1.4);
  const pips = PIPS[n];
  for (let i = 0; i < pips; i++) {
    ctx.beginPath();
    ctx.arc(cx + (i - (pips - 1) / 2) * 1.7, cy + 5, 0.62, 0, Math.PI * 2);
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

function drawPort(ctx, port, k) {
  const g = portGeometry(port.edge);
  // 나무 부두
  for (const v of port.vertices) {
    const vv = TOPO.vertices[v];
    const sx = vv.x + (g.x - vv.x) * 0.12;
    const sy = vv.y + (g.y - vv.y) * 0.12;
    ctx.strokeStyle = '#5a3a1c';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(g.x, g.y);
    ctx.stroke();
    ctx.strokeStyle = '#b07a44';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  const ring = port.type === 'generic' ? '#2f6f9a' : RES_COLORS[port.type];
  ctx.save();
  ctx.shadowColor = 'rgba(0,30,50,0.4)';
  ctx.shadowBlur = 2 * k;
  ctx.shadowOffsetY = 0.7 * k;
  ctx.beginPath();
  ctx.arc(g.x, g.y, 8.6, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = ring;
  ctx.beginPath();
  ctx.arc(g.x, g.y, 7.9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3b2a1e';
  if (port.type === 'generic') {
    ctx.font = `bold 6px ${NUMBER_FONT}`;
    ctx.fillText('3:1', g.x, g.y + 0.3);
  } else {
    const img = iconImage(port.type);
    if (img.complete) ctx.drawImage(img, g.x - 4.4, g.y - 7.2, 8.8, 8.8);
    ctx.font = `bold 4.6px ${NUMBER_FONT}`;
    ctx.fillText('2:1', g.x, g.y + 4.4);
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

    // 바다
    const sea = ctx.createRadialGradient(OX, OY, 40, OX, OY, 210);
    sea.addColorStop(0, '#5fb8d8');
    sea.addColorStop(1, '#276f9c');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    const rnd = seeded(99);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const x = rnd() * LOGICAL_W;
      const y = rnd() * LOGICAL_H;
      ctx.beginPath();
      ctx.arc(x, y, 3 + rnd() * 2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    ctx.translate(OX, OY);
    // 물거품과 모래사장
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (const h of TOPO.hexes) {
      hexPath(ctx, h.x, h.y, 1.24);
      ctx.fill();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,40,60,0.35)';
    ctx.shadowBlur = 4 * k;
    ctx.fillStyle = '#ecd9a6';
    for (const h of TOPO.hexes) {
      hexPath(ctx, h.x, h.y, 1.14);
      ctx.fill();
    }
    ctx.restore();

    for (const port of board.ports) drawPort(ctx, port, k);

    // 지형 타일
    for (const h of TOPO.hexes) {
      const terrain = board.hexes[h.id].terrain;
      const st = TERRAIN_STYLE[terrain];
      ctx.save();
      ctx.shadowColor = 'rgba(70,45,15,0.45)';
      ctx.shadowBlur = 2.5 * k;
      ctx.shadowOffsetY = 0.8 * k;
      hexPath(ctx, h.x, h.y, 0.95);
      const g = ctx.createLinearGradient(h.x - 18, h.y - 26, h.x + 18, h.y + 26);
      g.addColorStop(0, st.light);
      g.addColorStop(1, st.dark);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      ctx.save();
      hexPath(ctx, h.x, h.y, 0.95);
      ctx.clip();
      decorateTile(ctx, terrain, h.x, h.y, h.id);
      ctx.restore();
      hexPath(ctx, h.x, h.y, 0.9);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      hexPath(ctx, h.x, h.y, 0.95);
      ctx.strokeStyle = shade(st.dark, -0.35);
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
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
    drawRobber(ctx, rh.x - 15, rh.y + 6, k);

    const sorted = Object.entries(state.buildings).sort((a, b) => TOPO.vertices[a[0]].y - TOPO.vertices[b[0]].y);
    for (const [v, b] of sorted) {
      const vv = TOPO.vertices[v];
      const color = PLAYER_COLORS[state.players[b.player].color];
      if (b.type === 'city') drawCity(ctx, vv.x, vv.y, color, k);
      else drawSettlement(ctx, vv.x, vv.y, color, k);
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
