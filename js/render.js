// 저해상도 캔버스에 보드를 픽셀 단위로 그린 뒤 확대해서 표시한다.
import { TOPO, HEX_DX, HEX_DY, CORNER_OFFSETS, axialRing, hexCenter, portGeometry } from './board.js';
import { PIPS, PLAYER_COLORS } from './constants.js';
import {
  PAL, TERRAIN_COLORS, TERRAIN_DECOR, SETTLEMENT, CITY, ROBBER, ICONS,
  drawSprite, spriteSize, drawText, textWidth, pieceColors,
} from './sprites.js';

export const LOGICAL_W = 304;
export const LOGICAL_H = 292;
const OX = LOGICAL_W / 2;
const OY = LOGICAL_H / 2;
const TOKEN_R = 11;

function hash(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function seededRng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function fillCircle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y + r * 0.8));
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}

function ringCircle(ctx, cx, cy, r, color, width = 1) {
  ctx.fillStyle = color;
  const r2o = r * r + r * 0.8;
  const ri = r - width;
  const r2i = ri * ri + ri * 0.8;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d <= r2o && d > r2i) ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
}

function thickLine(ctx, x1, y1, x2, y2, radius, color) {
  ctx.fillStyle = color;
  const minX = Math.floor(Math.min(x1, x2) - radius - 1);
  const maxX = Math.ceil(Math.max(x1, x2) + radius + 1);
  const minY = Math.floor(Math.min(y1, y2) - radius - 1);
  const maxY = Math.ceil(Math.max(y1, y2) + radius + 1);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let t = ((px - x1) * dx + (py - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const ex = x1 + t * dx - px;
      const ey = y1 + t * dy - py;
      if (ex * ex + ey * ey <= radius * radius) ctx.fillRect(x, y, 1, 1);
    }
  }
}

const SIDE = HEX_DX / 2;
const TOP = -CORNER_OFFSETS[0][1];
const SLOPE = (TOP + CORNER_OFFSETS[1][1]) / SIDE;
function insideHex(x, y, margin) {
  const ax = Math.abs(x);
  return ax <= SIDE - margin && Math.abs(y) <= TOP - ax * SLOPE - margin * 1.2;
}

export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.base = makeCanvas(LOGICAL_W, LOGICAL_H);
    this.scene = makeCanvas(LOGICAL_W, LOGICAL_H);
    this.boardKey = null;
    this.scale = 1;
  }

  // ---------- 정적 보드 ----------
  buildBase(board) {
    const key = JSON.stringify([board.hexes, board.ports]);
    if (key === this.boardKey) return;
    this.boardKey = key;
    const ctx = this.base.getContext('2d');
    const img = ctx.createImageData(LOGICAL_W, LOGICAL_H);
    const centers = axialRing(4).map(([q, r]) => {
      const c = hexCenter(q, r);
      const land = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 2;
      const id = land ? TOPO.hexes.findIndex((h) => h.q === q && h.r === r) : -1;
      return { ...c, land, id };
    });
    const hexColor = (hex) => TERRAIN_COLORS[board.hexes[hex].terrain];
    const rgb = (hexStr) => [1, 3, 5].map((i) => parseInt(hexStr.slice(i, i + 2), 16));

    for (let py = 0; py < LOGICAL_H; py++) {
      for (let px = 0; px < LOGICAL_W; px++) {
        const x = px - OX + 0.5;
        const y = py - OY + 0.5;
        let a = null;
        let b = null;
        let da = Infinity;
        let db = Infinity;
        for (const c of centers) {
          const d = (c.x - x) ** 2 + (c.y - y) ** 2;
          if (d < da) {
            b = a;
            db = da;
            a = c;
            da = d;
          } else if (d < db) {
            b = c;
            db = d;
          }
        }
        const sep = Math.hypot(a.x - b.x, a.y - b.y);
        const edgeDist = (db - da) / (2 * sep);
        let color;
        if (a.land) {
          if ((b.land && edgeDist < 0.55) || (!b.land && edgeDist < 1.2)) color = PAL.outline;
          else {
            const cols = hexColor(a.id);
            const n = hash(px, py, a.id);
            const dither = (px + py) % 2 === 0;
            color = n < 0.12 ? cols[1] : n > 0.9 ? cols[2] : dither && n > 0.8 ? cols[2] : cols[0];
          }
        } else {
          const coastDist = b.land ? edgeDist : Infinity;
          if (coastDist < 2.2) color = PAL.foam;
          else if (coastDist < 5) color = (px + py) % 2 ? PAL.seaLight : PAL.sea;
          else {
            const n = hash(Math.floor(px / 6), py, 7);
            const wave = n > 0.94 && py % 4 === 0;
            color = wave ? PAL.seaLight : hash(px, py, 3) < 0.08 ? PAL.seaDark : PAL.sea;
          }
        }
        const [r, g, bl] = rgb(color);
        const i = (py * LOGICAL_W + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = bl;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // 지형 장식
    for (const h of TOPO.hexes) {
      const terrain = board.hexes[h.id].terrain;
      const decor = TERRAIN_DECOR[terrain];
      const rng = seededRng(h.id * 31 + terrain.length * 7);
      const placed = [];
      for (let tries = 0; tries < 200 && placed.length < decor.count; tries++) {
        const sprite = decor.sprites[placed.length % decor.sprites.length];
        const { w, h: sh } = spriteSize(sprite);
        const x = Math.round((rng() * 2 - 1) * SIDE);
        const y = Math.round((rng() * 2 - 1) * TOP);
        const corners = [[x - w / 2, y - sh], [x + w / 2, y - sh], [x - w / 2, y], [x + w / 2, y]];
        if (!corners.every(([cx, cy]) => insideHex(cx, cy, 2))) continue;
        if (Math.hypot(x, y - sh / 2) < TOKEN_R + 4 + w / 3) continue;
        if (placed.some((p) => Math.abs(p.x - x) < (w + p.w) / 2 + 1 && Math.abs(p.y - y) < Math.max(sh, p.h) - 1)) continue;
        placed.push({ x, y, w, h: sh, sprite });
      }
      placed.sort((p, q) => p.y - q.y);
      for (const p of placed) drawSprite(ctx, p.sprite, OX + h.x + p.x - Math.floor(p.w / 2), OY + h.y + p.y - p.h);
    }

    // 항구
    for (const port of board.ports) {
      const g = portGeometry(port.edge);
      for (const v of port.vertices) {
        const vv = TOPO.vertices[v];
        const sx = OX + vv.x + (g.x - vv.x) * 0.15;
        const sy = OY + vv.y + (g.y - vv.y) * 0.15;
        thickLine(ctx, sx, sy, OX + g.x, OY + g.y, 1.6, PAL.dockDark);
        thickLine(ctx, sx, sy, OX + g.x, OY + g.y, 0.8, PAL.dock);
      }
      const cx = OX + g.x;
      const cy = OY + g.y;
      fillCircle(ctx, cx, cy, 10, PAL.tokenEdge);
      fillCircle(ctx, cx, cy, 9, port.type === 'generic' ? '#f6efd8' : PAL.tokenFill);
      if (port.type === 'generic') {
        drawText(ctx, '3:1', cx - Math.floor(textWidth('3:1') / 2), cy - 2, PAL.tokenText);
        drawText(ctx, '?', cx - 1, cy - 9 + 1, PAL.tokenEdge);
      } else {
        drawSprite(ctx, ICONS[port.type], cx - 4, cy - 8);
        drawText(ctx, '2:1', cx - Math.floor(textWidth('2:1') / 2), cy + 2, PAL.tokenText);
      }
    }

    // 숫자 토큰
    for (const h of TOPO.hexes) {
      const n = board.hexes[h.id].number;
      if (!n) continue;
      const cx = OX + h.x;
      const cy = OY + h.y;
      fillCircle(ctx, cx, cy + 1, TOKEN_R, '#00000055');
      fillCircle(ctx, cx, cy, TOKEN_R, PAL.tokenEdge);
      fillCircle(ctx, cx, cy, TOKEN_R - 1, PAL.tokenFill);
      const red = n === 6 || n === 8;
      const color = red ? PAL.tokenRed : PAL.tokenText;
      const tw = textWidth(n, 2);
      drawText(ctx, n, cx - Math.floor(tw / 2), cy - 7, color, 2);
      const pips = PIPS[n];
      const pw = pips * 2 - 1;
      ctx.fillStyle = color;
      for (let i = 0; i < pips; i++) ctx.fillRect(cx - Math.floor(pw / 2) + i * 2, cy + 5, 1, 1);
    }
  }

  // ---------- 동적 장면 ----------
  render(state, view = {}) {
    this.buildBase(state.board);
    const ctx = this.scene.getContext('2d');
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.drawImage(this.base, 0, 0);
    const blink = view.blink ?? true;

    // 방금 굴린 숫자 강조
    if (state.dice && view.showRoll) {
      const sum = state.dice[0] + state.dice[1];
      for (const h of TOPO.hexes) {
        if (state.board.hexes[h.id].number === sum) {
          ringCircle(ctx, OX + h.x, OY + h.y, TOKEN_R + 2, state.board.robber === h.id ? '#e04040' : PAL.highlight, 2);
        }
      }
    }

    // 도로
    for (const [e, p] of Object.entries(state.roads)) this.drawRoad(ctx, Number(e), PLAYER_COLORS[state.players[p].color]);
    if (view.ghostEdge != null) this.drawRoad(ctx, view.ghostEdge, PLAYER_COLORS[view.ghostColor], true);

    // 도둑
    const rh = TOPO.hexes[state.board.robber];
    drawSprite(ctx, ROBBER, OX + rh.x - 19, OY + rh.y - 8);

    // 건물
    const sorted = Object.entries(state.buildings).sort((a, b) => TOPO.vertices[a[0]].y - TOPO.vertices[b[0]].y);
    for (const [v, b] of sorted) {
      const vv = TOPO.vertices[v];
      const color = PLAYER_COLORS[state.players[b.player].color];
      const sprite = b.type === 'city' ? CITY : SETTLEMENT;
      const { w, h } = spriteSize(sprite);
      drawSprite(ctx, sprite, OX + vv.x - Math.floor(w / 2), OY + vv.y - Math.floor(h / 2) - 1, pieceColors(color));
    }

    // 선택 가능 위치 표시 (두 색으로 깜빡임)
    const hl = blink ? PAL.highlight : '#f0a028';
    {
      for (const v of view.vertices || []) {
        const vv = TOPO.vertices[v];
        fillCircle(ctx, OX + vv.x, OY + vv.y, 4, PAL.outline);
        fillCircle(ctx, OX + vv.x, OY + vv.y, 3, view.hover === `v${v}` ? '#ffffff' : hl);
      }
      for (const e of view.edges || []) {
        const ee = TOPO.edges[e];
        const x = Math.round(OX + ee.x);
        const y = Math.round(OY + ee.y);
        ctx.fillStyle = PAL.outline;
        ctx.fillRect(x - 3, y - 3, 7, 7);
        ctx.fillStyle = view.hover === `e${e}` ? '#ffffff' : hl;
        ctx.fillRect(x - 2, y - 2, 5, 5);
      }
      for (const v of view.cityVertices || []) {
        const vv = TOPO.vertices[v];
        ringCircle(ctx, OX + vv.x, OY + vv.y, 8, view.hover === `v${v}` ? '#ffffff' : hl, 1);
      }
      for (const hx of view.hexes || []) {
        const h = TOPO.hexes[hx];
        ringCircle(ctx, OX + h.x, OY + h.y, TOKEN_R + 3, view.hover === `h${hx}` ? '#ffffff' : hl, 2);
      }
    }

    this.present();
  }

  drawRoad(ctx, e, color, ghost = false) {
    const [a, b] = TOPO.edges[e].v.map((v) => TOPO.vertices[v]);
    const shrink = 0.2;
    const x1 = OX + a.x + (b.x - a.x) * shrink;
    const y1 = OY + a.y + (b.y - a.y) * shrink;
    const x2 = OX + b.x + (a.x - b.x) * shrink;
    const y2 = OY + b.y + (a.y - b.y) * shrink;
    thickLine(ctx, x1, y1, x2, y2, 2.6, ghost ? '#ffffff' : '#1a1410');
    thickLine(ctx, x1, y1, x2, y2, 1.5, color.main);
    if (!ghost) thickLine(ctx, x1 - 0.5, y1 - 0.8, x2 - 0.5, y2 - 0.8, 0.5, color.light);
  }

  // ---------- 표시용 캔버스로 확대 ----------
  resize(availW, availH) {
    const dpr = window.devicePixelRatio || 1;
    let scale = Math.min(availW / LOGICAL_W, availH / LOGICAL_H);
    // 데스크톱에서는 정수 배율로 맞춰 픽셀을 선명하게
    if (scale * dpr >= 2) scale = Math.floor(scale * dpr) / dpr;
    scale = Math.max(scale, 0.5);
    this.scale = scale;
    const cssW = Math.round(LOGICAL_W * scale);
    const cssH = Math.round(LOGICAL_H * scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.present();
  }

  present() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.scene, 0, 0, this.canvas.width, this.canvas.height);
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
