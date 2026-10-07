// 지형 타일 그림: 실제 카탄 타일처럼 바탕 질감 위에 숲·목초지·밀밭·점토 언덕·산·사막을 그린다
import { CORNER_OFFSETS } from './board.js';
import {
  TERRAIN_STYLE, seeded, shade,
  drawTree, drawSheep, drawTuft, drawWheat, drawBricks, drawKiln, drawPeak, drawMine, drawDune, drawCactus, drawRock, drawHouse,
} from './art.js';

const HALF_W = CORNER_OFFSETS[1][0];
const TOP = -CORNER_OFFSETS[0][1];
const SIDE = -CORNER_OFFSETS[1][1];

// 타일 사이에 가는 틈이 보이도록 조금 작게 그린다
export const TILE_SCALE = 0.965;

// 타일 중심 기준 (x, y)가 안쪽으로 inset만큼 들어간 헥스 안에 있는가
function inHex(x, y, inset = 0) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > HALF_W * TILE_SCALE - inset) return false;
  const edgeY = (TOP - ((TOP - SIDE) / HALF_W) * ax) * TILE_SCALE;
  return ay <= edgeY - inset * 1.15;
}

// 서로 너무 붙지 않게 흩뿌린 점들 (토큰 자리는 비운다)
function scatter(rnd, n, { minD = 6, avoid = 12, inset = 4 } = {}) {
  const pts = [];
  for (let t = 0; t < 600 && pts.length < n; t++) {
    const x = (rnd() - 0.5) * 2 * HALF_W;
    const y = (rnd() - 0.5) * 2 * TOP;
    if (!inHex(x, y, inset)) continue;
    if (Math.hypot(x, y * 1.1) < avoid) continue;
    if (pts.some(([px, py]) => Math.hypot(px - x, (py - y) * 1.4) < minD)) continue;
    pts.push([x, y]);
  }
  return pts.sort((a, b) => a[1] - b[1]);
}

function blob(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

const PAINTERS = {
  forest(ctx, cx, cy, rnd) {
    // 숲 바닥의 그늘과 이끼
    for (let i = 0; i < 16; i++) {
      blob(ctx, cx + (rnd() - 0.5) * 46, cy + (rnd() - 0.5) * 54, 3 + rnd() * 4, 2 + rnd() * 2, `rgba(10,40,12,${0.15 + rnd() * 0.15})`);
    }
    for (let i = 0; i < 8; i++) {
      blob(ctx, cx + (rnd() - 0.5) * 46, cy + (rnd() - 0.5) * 54, 2 + rnd() * 3, 1 + rnd() * 1.5, `rgba(150,200,90,${0.12 + rnd() * 0.1})`);
    }
    for (const [x, y] of scatter(rnd, 19, { minD: 6.4, avoid: 8, inset: -2 })) {
      drawTree(ctx, cx + x, cy + y + 3, 0.78 + rnd() * 0.32, rnd() < 0.22, (rnd() - 0.5) * 0.22);
    }
  },

  pasture(ctx, cx, cy, rnd) {
    // 완만한 풀밭 언덕
    const hills = [[-12, -15, 20, 9], [12, -6, 18, 8], [-10, 13, 22, 9], [13, 21, 17, 7]];
    for (const [dx, dy, rx, ry] of hills) {
      const x = cx + dx + (rnd() - 0.5) * 4;
      const y = cy + dy + (rnd() - 0.5) * 3;
      const g = ctx.createLinearGradient(0, y - ry, 0, y + 1);
      g.addColorStop(0, '#cdee8a');
      g.addColorStop(0.6, '#97c95a');
      g.addColorStop(1, '#78ad44');
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      blob(ctx, x + 2, y + 0.6, rx * 0.9, 1.4, 'rgba(60,100,25,0.25)');
    }
    // 들꽃과 풀
    for (let i = 0; i < 24; i++) {
      const x = cx + (rnd() - 0.5) * 44;
      const y = cy + (rnd() - 0.5) * 50;
      if (rnd() < 0.55) drawTuft(ctx, x, y, 0.9 + rnd() * 0.5, rnd() < 0.5 ? '#5d9a34' : '#4a8429');
      else blob(ctx, x, y, 0.6, 0.6, rnd() < 0.5 ? '#fffbe8' : '#ffe066');
    }
    // 나무 울타리
    const fx = cx + (rnd() < 0.5 ? -21 : 6);
    const fy = cy + (rnd() < 0.5 ? 5 : -4);
    ctx.strokeStyle = '#7a5230';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.55;
    for (const off of [-2.2, -0.9]) {
      ctx.beginPath();
      ctx.moveTo(fx, fy + off);
      ctx.lineTo(fx + 15, fy + 4 + off);
      ctx.stroke();
    }
    ctx.lineWidth = 0.75;
    for (let i = 0; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(fx + i * 3, fy + i * 0.8 - 3);
      ctx.lineTo(fx + i * 3, fy + i * 0.8 + 0.2);
      ctx.stroke();
    }
    for (const [x, y] of scatter(rnd, 5, { minD: 10, avoid: 12, inset: 5 })) {
      drawSheep(ctx, cx + x, cy + y, 0.78 + rnd() * 0.16, rnd() < 0.4);
    }
  },

  fields(ctx, cx, cy, rnd) {
    // 색이 조금씩 다른 밭 서너 뙈기와 밭고랑
    const px = cx + (rnd() - 0.5) * 10;
    const py = cy + (rnd() - 0.5) * 10;
    const n = rnd() < 0.5 ? 3 : 4;
    const a0 = rnd() * Math.PI * 2;
    const angles = Array.from({ length: n }, (_, i) => a0 + (i * Math.PI * 2) / n + (rnd() - 0.5) * 0.5);
    const tones = [['#f7da78', '#e0ad45'], ['#e8c055', '#c48d2c'], ['#e2d47c', '#b9a748'], ['#f3c862', '#d39a37']];
    const far = 70;
    for (let i = 0; i < n; i++) {
      const a = angles[i];
      const b = angles[(i + 1) % n] + (i === n - 1 ? Math.PI * 2 : 0);
      const mid = (a + b) / 2;
      const [c1, c2] = tones[(i + Math.floor(rnd() * 4)) % tones.length];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (const t of [a, (a + mid) / 2, mid, (mid + b) / 2, b]) ctx.lineTo(px + Math.cos(t) * far, py + Math.sin(t) * far);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = c1;
      ctx.fillRect(cx - 40, cy - 40, 80, 80);
      const rowA = mid + Math.PI / 2 + (rnd() - 0.5) * 0.6;
      ctx.translate(px, py);
      ctx.rotate(rowA);
      ctx.strokeStyle = c2;
      ctx.lineWidth = 0.9;
      for (let r = -40; r <= 40; r += 2.3) {
        ctx.beginPath();
        ctx.moveTo(-60, r);
        ctx.lineTo(60, r);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 밭 사이의 흙길과 덤불
    ctx.lineCap = 'round';
    for (const a of angles) {
      ctx.strokeStyle = 'rgba(140,100,45,0.75)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a) * far, py + Math.sin(a) * far);
      ctx.stroke();
      for (let d = 6; d < 34; d += 4 + rnd() * 3) {
        blob(ctx, px + Math.cos(a) * d + 1, py + Math.sin(a) * d - 0.6, 1.2, 1, '#6f9a3c');
      }
    }
    // 밀 다발
    for (const [x, y] of scatter(rnd, 4, { minD: 9, avoid: 12, inset: 5 })) drawWheat(ctx, cx + x, cy + y, 0.62 + rnd() * 0.12);
    // 농가 한 채
    const [hx, hy] = scatter(rnd, 1, { avoid: 15, inset: 8 })[0] || [10, 16];
    drawHouse(ctx, cx + hx - 4, cy + hy + 2, 4.6, 3.2, 2.4, 6, { main: '#efe1c0' }, '#b8462e');
  },

  hills(ctx, cx, cy, rnd) {
    // 계단식 점토 채굴장
    const qx = cx + (rnd() - 0.5) * 6;
    const qy = cy - 2 + (rnd() - 0.5) * 4;
    const rings = [34, 26, 19, 12];
    rings.forEach((r, i) => {
      const y = qy + i * 2.2;
      blob(ctx, qx, y + 1.8, r, r * 0.64, shade('#a24b28', -0.08 - i * 0.04));
      const g = ctx.createLinearGradient(0, y - r * 0.64, 0, y + r * 0.64);
      g.addColorStop(0, shade('#e8956a', -i * 0.05));
      g.addColorStop(1, shade('#c4673b', -i * 0.06));
      blob(ctx, qx, y, r, r * 0.64, g);
    });
    // 점토 덩이와 마른 풀
    for (let i = 0; i < 14; i++) {
      const x = cx + (rnd() - 0.5) * 44;
      const y = cy + (rnd() - 0.5) * 50;
      if (rnd() < 0.5) blob(ctx, x, y, 1.6 + rnd(), 0.9, 'rgba(120,45,18,0.45)');
      else drawTuft(ctx, x, y, 0.8, '#9c8a3c');
    }
    const pts = scatter(rnd, 3, { minD: 12, avoid: 13, inset: 6 });
    pts.forEach(([x, y], i) => {
      if (i === 0) drawKiln(ctx, cx + x, cy + y, 0.85);
      else drawBricks(ctx, cx + x, cy + y, 0.75);
    });
  },

  mountains(ctx, cx, cy, rnd) {
    // 자갈 질감
    for (let i = 0; i < 18; i++) {
      blob(ctx, cx + (rnd() - 0.5) * 46, cy + (rnd() - 0.5) * 54, 1 + rnd() * 2, 0.6 + rnd(), `rgba(50,55,65,${0.15 + rnd() * 0.15})`);
    }
    const peaks = [
      [-10, -10, 20, 21, true], [9, -12, 22, 24, true], [20, 0, 13, 15, true],
      [-19, 6, 14, 13, false], [-3, 24, 18, 14, false], [15, 22, 15, 12, false], [-14, 22, 11, 9, false],
    ];
    for (const [dx, dy, w, h, far] of peaks) drawPeak(ctx, cx + dx + (rnd() - 0.5) * 2, cy + dy, w, h, rnd, far);
    drawMine(ctx, cx + 4 + (rnd() - 0.5) * 3, cy + 14, 0.85);
    for (let i = 0; i < 4; i++) {
      const [x, y] = [cx + (rnd() - 0.5) * 30, cy + 8 + rnd() * 14];
      drawRock(ctx, x, y, 0.6, '#8d96a2');
    }
  },

  desert(ctx, cx, cy, rnd) {
    const dunes = [[-10, -12, 26, 7], [12, -2, 24, 6], [-8, 12, 28, 7], [10, 24, 22, 6]];
    for (const [dx, dy, w, h] of dunes) drawDune(ctx, cx + dx + (rnd() - 0.5) * 4, cy + dy, w, h);
    // 바람 무늬
    ctx.strokeStyle = 'rgba(170,125,60,0.35)';
    ctx.lineWidth = 0.4;
    for (let i = 0; i < 12; i++) {
      const x = cx + (rnd() - 0.5) * 40;
      const y = cy + (rnd() - 0.5) * 46;
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.quadraticCurveTo(x, y - 1.2, x + 3, y);
      ctx.stroke();
    }
    const pts = scatter(rnd, 5, { minD: 9, avoid: 13, inset: 5 });
    pts.forEach(([x, y], i) => {
      if (i % 2 === 0) drawCactus(ctx, cx + x, cy + y, 0.85 + rnd() * 0.2);
      else drawRock(ctx, cx + x, cy + y, 1, '#c8ab78');
    });
  },
};

// 클립이 걸린 상태에서 타일 한 장을 칠한다
export function paintTile(ctx, terrain, cx, cy, id) {
  const st = TERRAIN_STYLE[terrain];
  const g = ctx.createRadialGradient(cx - 8, cy - 12, 3, cx, cy, 34);
  g.addColorStop(0, st.light);
  g.addColorStop(1, st.dark);
  ctx.fillStyle = g;
  ctx.fillRect(cx - 30, cy - 34, 60, 68);
  const rnd = seeded(id * 31 + terrain.length * 7 + 3);
  // 붓 자국 같은 얼룩
  for (let i = 0; i < 36; i++) {
    const light = rnd() < 0.5;
    blob(ctx, cx + (rnd() - 0.5) * 50, cy + (rnd() - 0.5) * 58, 2 + rnd() * 5, 1 + rnd() * 2.5,
      light ? `rgba(255,255,230,${0.04 + rnd() * 0.06})` : `rgba(30,20,0,${0.04 + rnd() * 0.06})`);
  }
  PAINTERS[terrain](ctx, cx, cy, rnd);
}
