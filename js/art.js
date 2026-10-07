// 보드게임 일러스트 스타일 그림 도구: 지형 장식, 말, 아이콘 (모두 벡터로 그린다)

export const RES_COLORS = {
  wood: '#3f7d3a',
  brick: '#c0623a',
  wool: '#8cc152',
  grain: '#e6b53c',
  ore: '#7d8794',
};

export const TERRAIN_STYLE = {
  forest: { light: '#4f8a3f', dark: '#24522a' },
  pasture: { light: '#b8de6c', dark: '#6fa63e' },
  fields: { light: '#f5d56e', dark: '#c99231' },
  hills: { light: '#e38d54', dark: '#a24b28' },
  mountains: { light: '#9ba4af', dark: '#535c68' },
  desert: { light: '#f5e4b0', dark: '#d3b06d' },
};

// ---------- 공용 도우미 ----------
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

// ---------- 지형 장식 (기준점은 바닥 가운데) ----------
// 침엽수: 층마다 왼쪽은 햇빛을 받아 밝고 오른쪽은 그늘진다
export function drawTree(ctx, x, y, s, round = false, tone = 0) {
  ellipse(ctx, x + 1.8 * s, y + 0.1 * s, 4.4 * s, 1.3 * s, 'rgba(8,28,8,0.38)');
  ctx.fillStyle = '#5a3a20';
  ctx.fillRect(x - 0.7 * s, y - 2.8 * s, 1.4 * s, 2.9 * s);
  if (round) {
    const light = shade('#7cb85a', tone);
    const dark = shade('#2c6230', tone);
    for (const [dx, dy, r] of [[-2.5, -5.4, 3.1], [2.5, -5.6, 3.1], [0, -5.2, 3.3], [-0.6, -8.6, 3.5], [1.6, -8, 2.6]]) {
      const cx = x + dx * s;
      const cy = y + dy * s;
      const g = ctx.createRadialGradient(cx - r * 0.45 * s, cy - r * 0.5 * s, 0.2 * s, cx, cy, r * 1.05 * s);
      g.addColorStop(0, light);
      g.addColorStop(1, dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  const L = shade('#6aa952', tone);
  const M = shade('#3a7a38', tone);
  const D = shade('#1f4d26', tone);
  for (let i = 0; i < 3; i++) {
    const base = y - 2.2 * s - i * 2.9 * s;
    const hw = (4.9 - i * 1.3) * s;
    const top = base - (5.8 - i * 0.5) * s;
    const lift = 1.1 * s;
    // 가장자리가 처진 한 층
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.quadraticCurveTo(x + hw * 0.55, base - lift * 2.2, x + hw, base + 0.3 * s);
    ctx.quadraticCurveTo(x + hw * 0.4, base - lift, x, base - lift * 0.4);
    ctx.quadraticCurveTo(x - hw * 0.4, base - lift, x - hw, base + 0.3 * s);
    ctx.quadraticCurveTo(x - hw * 0.55, base - lift * 2.2, x, top);
    ctx.fillStyle = D;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + 0.4 * s, base - lift * 0.5);
    ctx.quadraticCurveTo(x - hw * 0.4, base - lift, x - hw, base + 0.3 * s);
    ctx.quadraticCurveTo(x - hw * 0.55, base - lift * 2.2, x, top);
    const g = ctx.createLinearGradient(x - hw, top, x, base);
    g.addColorStop(0, L);
    g.addColorStop(1, M);
    ctx.fillStyle = g;
    ctx.fill();
  }
}

export function drawSheep(ctx, x, y, s, flip = false) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ellipse(ctx, 0.8 * s, 0.1 * s, 4.6 * s, 1.2 * s, 'rgba(30,55,15,0.35)');
  ctx.strokeStyle = '#2f2926';
  ctx.lineWidth = 0.8 * s;
  ctx.lineCap = 'round';
  for (const dx of [-2.3, -1, 1.3, 2.5]) {
    ctx.beginPath();
    ctx.moveTo(dx * s, -1.8 * s);
    ctx.lineTo(dx * s, -0.1 * s);
    ctx.stroke();
  }
  // 털 뭉치: 아래는 그늘, 위는 밝게
  ellipse(ctx, 0, -2.9 * s, 4 * s, 2.3 * s, '#d9d3c2');
  for (const [dx, dy, r] of [[-2.4, -3.4, 1.8], [-0.6, -4.2, 2], [1.4, -4, 1.9], [2.6, -3.1, 1.6], [-1.4, -2.8, 1.6], [0.9, -2.7, 1.7]]) {
    const g = ctx.createRadialGradient((dx - 0.5) * s, (dy - 0.6) * s, 0.1 * s, dx * s, dy * s, r * s);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#ebe5d6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(dx * s, dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(4 * s, -3.7 * s);
  ctx.rotate(0.3);
  ellipse(ctx, 0, 0, 1.6 * s, 1.15 * s, '#2f2926');
  ellipse(ctx, -0.7 * s, -1 * s, 0.8 * s, 0.4 * s, '#2f2926');
  ctx.restore();
  ellipse(ctx, 4.5 * s, -4 * s, 0.28 * s, 0.28 * s, '#ffffff');
  ctx.restore();
}

export function drawTuft(ctx, x, y, s, color = '#5f9b38') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.55 * s;
  ctx.lineCap = 'round';
  for (const [dx, h] of [[-1, 2.2], [0, 3], [1, 2.4]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * 0.5 * s, y);
    ctx.quadraticCurveTo(x + dx * s, y - h * 0.6 * s, x + dx * 1.4 * s, y - h * s);
    ctx.stroke();
  }
}

export function drawWheat(ctx, x, y, s) {
  ellipse(ctx, x + 0.6 * s, y, 3.2 * s, 0.9 * s, 'rgba(110,70,10,0.3)');
  for (const [dx, lean] of [[-1.4, -0.35], [0, 0], [1.4, 0.35]]) {
    const tx = x + dx * s + lean * 3 * s;
    const ty = y - 8 * s;
    ctx.strokeStyle = '#a8741c';
    ctx.lineWidth = 0.45 * s;
    ctx.beginPath();
    ctx.moveTo(x + dx * 0.4 * s, y);
    ctx.quadraticCurveTo(x + dx * s, y - 4 * s, tx, ty + 3 * s);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const gy = ty + 3 * s - i * 1.1 * s;
      ellipse(ctx, tx - 0.55 * s, gy, 0.55 * s, 0.85 * s, '#f8da74');
      ellipse(ctx, tx + 0.55 * s, gy - 0.4 * s, 0.55 * s, 0.85 * s, '#dfa93e');
    }
  }
}

export function drawBricks(ctx, x, y, s) {
  ellipse(ctx, x + 0.8 * s, y + 0.2 * s, 5.8 * s, 1.3 * s, 'rgba(70,25,8,0.35)');
  const rows = [[-4.8, 0], [-1.6, 0], [1.6, 0], [-3.2, 1], [0, 1], [-1.6, 2]];
  for (const [bx, row] of rows) {
    const yy = y - (row + 1) * 2.1 * s;
    const g = ctx.createLinearGradient(0, yy, 0, yy + 2 * s);
    g.addColorStop(0, '#e07a4e');
    g.addColorStop(1, '#963a20');
    ctx.fillStyle = g;
    roundRect(ctx, x + bx * s, yy, 3.1 * s, 1.9 * s, 0.35 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,190,0.65)';
    ctx.lineWidth = 0.25 * s;
    ctx.stroke();
  }
}

// 벽돌 굽는 가마: 둥근 지붕과 아궁이, 굴뚝 연기
export function drawKiln(ctx, x, y, s) {
  ellipse(ctx, x + 1 * s, y + 0.2 * s, 5.4 * s, 1.4 * s, 'rgba(70,25,8,0.35)');
  ctx.fillStyle = '#7d3a22';
  ctx.fillRect(x + 1.4 * s, y - 8.6 * s, 1.6 * s, 3.4 * s);
  const g = ctx.createLinearGradient(x - 4.5 * s, y - 7 * s, x + 4.5 * s, y);
  g.addColorStop(0, '#d9794c');
  g.addColorStop(1, '#8d3a20');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 4.6 * s, y);
  ctx.bezierCurveTo(x - 4.6 * s, y - 8 * s, x + 4.6 * s, y - 8 * s, x + 4.6 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2b1610';
  ctx.beginPath();
  ctx.moveTo(x - 1.5 * s, y);
  ctx.bezierCurveTo(x - 1.5 * s, y - 3 * s, x + 1.5 * s, y - 3 * s, x + 1.5 * s, y);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, x, y - 0.6 * s, 0.9 * s, 0.5 * s, '#f0a23a');
  for (const [dx, dy, r] of [[2.4, -10.2, 1.2], [3.4, -11.8, 1.5], [4.8, -13.2, 1.7]]) ellipse(ctx, x + dx * s, y + dy * s, r * s, r * 0.8 * s, 'rgba(240,235,230,0.55)');
}

// 바위산 봉우리: 왼쪽 면은 밝고 오른쪽 면은 그늘, 꼭대기에 눈
export function drawPeak(ctx, x, y, w, h, rnd = Math.random, far = false) {
  const ax = x + (rnd() - 0.4) * w * 0.15;
  const ay = y - h;
  const rx = ax + w * 0.08;
  ellipse(ctx, x + w * 0.1, y, w * 0.55, h * 0.1, 'rgba(30,35,45,0.3)');
  // 능선 (지그재그)
  const ridge = [[ax, ay]];
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    ridge.push([ax + (rx - ax) * t + (i % 2 ? 1 : -1) * w * 0.04, ay + h * t]);
  }
  const lit = ctx.createLinearGradient(x - w / 2, ay, ax, y);
  lit.addColorStop(0, far ? '#c9d0d8' : '#bec6cf');
  lit.addColorStop(1, far ? '#9aa4af' : '#86909c');
  poly(ctx, [[x - w / 2, y], ...ridge.slice().reverse()]);
  ctx.fillStyle = lit;
  ctx.fill();
  const dark = ctx.createLinearGradient(ax, ay, x + w / 2, y);
  dark.addColorStop(0, far ? '#7d8794' : '#646e7b');
  dark.addColorStop(1, far ? '#5c6571' : '#3f4752');
  poly(ctx, [...ridge, [x + w / 2, y]]);
  ctx.fillStyle = dark;
  ctx.fill();
  // 바위 결
  ctx.strokeStyle = 'rgba(40,45,55,0.35)';
  ctx.lineWidth = 0.45;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const t = 0.35 + i * 0.2;
    const sx = ax + (x + w / 2 - ax) * t * 0.7;
    const sy = ay + h * t;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + w * 0.08, sy + h * 0.14);
    ctx.stroke();
    const lx = ax - (ax - (x - w / 2)) * t * 0.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(lx, sy);
    ctx.lineTo(lx - w * 0.06, sy + h * 0.12);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,45,55,0.35)';
  }
  // 눈 덮인 꼭대기
  const sh = h * 0.3;
  const leftX = ax - (ax - (x - w / 2)) * (sh / h);
  const rightX = ax + (x + w / 2 - ax) * (sh / h);
  const split = [ax + (rx - ax) * 0.3 + w * 0.02, ay + sh * 0.9];
  poly(ctx, [[leftX, ay + sh], [ax, ay], split, [leftX + (ax - leftX) * 0.45, ay + sh * 0.65], [leftX + (ax - leftX) * 0.2, ay + sh * 1.05]]);
  ctx.fillStyle = '#f9fbfd';
  ctx.fill();
  poly(ctx, [[ax, ay], [rightX, ay + sh], [ax + (rightX - ax) * 0.55, ay + sh * 0.75], split]);
  ctx.fillStyle = '#cdd6e0';
  ctx.fill();
}

// 광산 입구
export function drawMine(ctx, x, y, s) {
  ellipse(ctx, x + 0.6 * s, y + 0.3 * s, 4.6 * s, 1.2 * s, 'rgba(25,25,30,0.35)');
  ctx.fillStyle = '#23201f';
  ctx.beginPath();
  ctx.moveTo(x - 2.6 * s, y);
  ctx.lineTo(x - 2.6 * s, y - 3.4 * s);
  ctx.quadraticCurveTo(x, y - 5.6 * s, x + 2.6 * s, y - 3.4 * s);
  ctx.lineTo(x + 2.6 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8a5a2e';
  ctx.lineWidth = 0.9 * s;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x - 2.6 * s, y);
  ctx.lineTo(x - 2.6 * s, y - 4 * s);
  ctx.lineTo(x + 2.6 * s, y - 4 * s);
  ctx.lineTo(x + 2.6 * s, y);
  ctx.stroke();
  // 광석 수레
  ctx.fillStyle = '#6b5340';
  ctx.fillRect(x + 3.4 * s, y - 2.2 * s, 3 * s, 1.8 * s);
  ellipse(ctx, x + 4.9 * s, y - 2.4 * s, 1.4 * s, 0.6 * s, '#9fb6c8');
  ellipse(ctx, x + 4 * s, y - 0.3 * s, 0.5 * s, 0.5 * s, '#2a2220');
  ellipse(ctx, x + 5.8 * s, y - 0.3 * s, 0.5 * s, 0.5 * s, '#2a2220');
}

// 사구: 바람 받는 쪽은 밝고 반대쪽은 그늘
export function drawDune(ctx, x, y, w, h) {
  const rx = x + w * 0.12;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.2, y - h * 0.9, rx, y - h);
  ctx.quadraticCurveTo(rx + w * 0.05, y - h * 0.4, x - w * 0.05, y + h * 0.05);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,248,222,0.75)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(rx, y - h);
  ctx.quadraticCurveTo(x + w * 0.3, y - h * 0.75, x + w / 2, y);
  ctx.lineTo(x - w * 0.05, y + h * 0.05);
  ctx.quadraticCurveTo(rx + w * 0.05, y - h * 0.4, rx, y - h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(190,145,75,0.45)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,105,45,0.55)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(rx, y - h);
  ctx.quadraticCurveTo(rx + w * 0.05, y - h * 0.4, x - w * 0.05, y + h * 0.05);
  ctx.stroke();
}

export function drawCactus(ctx, x, y, s) {
  ellipse(ctx, x + 1 * s, y + 0.1 * s, 2.8 * s, 0.8 * s, 'rgba(110,80,30,0.35)');
  ctx.lineCap = 'round';
  for (const [color, off] of [['#3f6f2c', 0.3], ['#6ea24a', -0.3]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = (off > 0 ? 1.9 : 0.9) * s;
    ctx.beginPath();
    ctx.moveTo(x + off * s, y);
    ctx.lineTo(x + off * s, y - 7 * s);
    ctx.moveTo(x + off * s, y - 3 * s);
    ctx.quadraticCurveTo(x - 2.5 * s + off * s, y - 3 * s, x - 2.5 * s + off * s, y - 5.4 * s);
    ctx.moveTo(x + off * s, y - 4.2 * s);
    ctx.quadraticCurveTo(x + 2.3 * s + off * s, y - 4.2 * s, x + 2.3 * s + off * s, y - 6.2 * s);
    ctx.stroke();
  }
}

export function drawRock(ctx, x, y, s, color = '#bba57c') {
  ellipse(ctx, x + 0.6 * s, y + 0.1 * s, 2.5 * s, 0.7 * s, 'rgba(70,50,25,0.35)');
  poly(ctx, [[x - 2 * s, y], [x - 1.4 * s, y - 1.8 * s], [x + 0.4 * s, y - 2.3 * s], [x + 2 * s, y - 0.8 * s], [x + 1.8 * s, y]]);
  ctx.fillStyle = color;
  ctx.fill();
  poly(ctx, [[x + 0.4 * s, y - 2.3 * s], [x + 2 * s, y - 0.8 * s], [x + 1.8 * s, y], [x + 0.2 * s, y]]);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill();
}

// ---------- 플레이어 말 (나무 말을 비스듬히 위에서 본 모습) ----------
const OUTLINE = 'rgba(26,14,6,0.7)';

function face(ctx, pts, fill) {
  poly(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

// 박공지붕 집 한 채. (x, y)는 앞쪽 박공 벽의 왼쪽 아래, 깊이는 오른쪽 위로 들어간다.
// 빛은 왼쪽 위에서 온다: 왼쪽 지붕이 가장 밝고, 오른쪽 옆벽이 가장 어둡다.
export function drawHouse(ctx, x, y, W, H, R, D, color, roofColor = null) {
  const dx = D * 0.6;
  const dy = -D * 0.5;
  const eave = y - H;
  const apex = [x + W / 2, eave - R];
  const apexB = [apex[0] + dx, apex[1] + dy];
  const roofBase = roofColor || color.main;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.45;
  // 왼쪽 지붕 (앞 박공 뒤로 살짝 보인다)
  face(ctx, [[x - 0.3, eave + 0.2], apex, apexB, [x - 0.3 + dx, eave + 0.2 + dy]], shade(roofBase, 0.34));
  // 오른쪽 옆벽
  face(ctx, [[x + W, y], [x + W + dx, y + dy], [x + W + dx, eave + dy], [x + W, eave]], shade(color.main, -0.32));
  // 앞 박공 벽
  const front = ctx.createLinearGradient(0, apex[1], 0, y);
  front.addColorStop(0, shade(color.main, 0.1));
  front.addColorStop(1, shade(color.main, -0.1));
  face(ctx, [[x, y], [x + W, y], [x + W, eave], apex, [x, eave]], front);
  // 오른쪽 지붕
  const roof = ctx.createLinearGradient(apex[0], apex[1], x + W + dx, eave + dy);
  roof.addColorStop(0, shade(roofBase, 0.2));
  roof.addColorStop(1, shade(roofBase, -0.02));
  face(ctx, [apex, apexB, [x + W + dx + 0.3, eave + dy + 0.25], [x + W + 0.3, eave + 0.25]], roof);
  // 용마루와 앞 모서리의 빛
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(apex[0] + 0.2, apex[1] + 0.1);
  ctx.lineTo(apexB[0] - 0.2, apexB[1] + 0.1);
  ctx.moveTo(x + 0.25, y - 0.3);
  ctx.lineTo(x + 0.25, eave + 0.1);
  ctx.lineTo(apex[0], apex[1] + 0.35);
  ctx.stroke();
}

function pieceShadow(ctx, x, y, rx, ry) {
  ellipse(ctx, x, y, rx + 1.2, ry + 0.6, 'rgba(0,0,0,0.14)');
  ellipse(ctx, x, y, rx, ry, 'rgba(0,0,0,0.26)');
}

// 개척지: 꼭짓점 (x, y) 위에 놓인 작은 집
export function drawSettlement(ctx, x, y, color) {
  const W = 8;
  const D = 8;
  const x0 = x - (W + D * 0.6) / 2;
  const y0 = y + 5.2;
  pieceShadow(ctx, x + 1.6, y0 - 1.6, 7.6, 2.8);
  drawHouse(ctx, x0, y0, W, 5.4, 4.2, D, color);
}

// 도시: 높은 탑 건물 옆에 낮은 건물이 붙은 모양
export function drawCity(ctx, x, y, color) {
  const D = 8;
  const x0 = x - 9.8;
  const y0 = y + 6.2;
  pieceShadow(ctx, x + 2, y0 - 1.8, 10.8, 3.2);
  drawHouse(ctx, x0 + 6.4, y0 - 0.6, 8.4, 5.4, 3.8, D, color);
  drawHouse(ctx, x0, y0, 7, 10.4, 4.4, D * 0.85, color);
}

function hull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// 도로: 두께가 있는 나무 막대
export function drawRoad(ctx, ax, ay, bx, by, color, k = 1, { length = 0.66, width = 3.3, thick = 1.9 } = {}) {
  const len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const L = len * length;
  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2 - thick * 0.45;
  const px = (-uy * width) / 2;
  const py = (ux * width) / 2;
  const hx = (ux * L) / 2;
  const hy = (uy * L) / 2;
  const top = [[cx - hx + px, cy - hy + py], [cx + hx + px, cy + hy + py], [cx + hx - px, cy + hy - py], [cx - hx - px, cy - hy - py]];
  const low = top.map(([x, y]) => [x, y + thick]);
  const body = hull(top.concat(low));
  ctx.lineJoin = 'round';
  poly(ctx, body.map(([x, y]) => [x + 1.1, y + 0.9]));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.45;
  face(ctx, body, shade(color.main, -0.32));
  const g = ctx.createLinearGradient(cx + px, cy + py, cx - px, cy - py);
  g.addColorStop(0, shade(color.main, -0.04));
  g.addColorStop(1, shade(color.main, 0.24));
  face(ctx, top, g);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(cx - hx * 0.8, cy - hy * 0.8);
  ctx.lineTo(cx + hx * 0.8, cy + hy * 0.8);
  ctx.stroke();
}

// 도둑: 회색 나무 말
export function drawRobber(ctx, x, y) {
  ctx.save();
  ellipse(ctx, x + 1.6, y + 0.8, 5.6, 1.9, 'rgba(0,0,0,0.32)');
  const lit = (x0, y0, r) => {
    const g = ctx.createRadialGradient(x0 - r * 0.45, y0 - r * 0.5, r * 0.1, x0, y0, r * 1.3);
    g.addColorStop(0, '#a4a4ae');
    g.addColorStop(0.55, '#5c5c66');
    g.addColorStop(1, '#2a2a31');
    return g;
  };
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.45;
  // 받침
  ctx.beginPath();
  ctx.ellipse(x, y + 0.8, 4.6, 1.6, 0, 0, Math.PI);
  ctx.lineTo(x - 4.6, y - 0.2);
  ctx.ellipse(x, y - 0.2, 4.6, 1.6, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = '#2f2f36';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y - 0.2, 4.6, 1.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = lit(x, y - 0.2, 4.6);
  ctx.fill();
  ctx.stroke();
  // 몸통
  ctx.beginPath();
  ctx.moveTo(x - 3.5, y - 0.6);
  ctx.bezierCurveTo(x - 3.9, y - 4.6, x - 1.4, y - 6.2, x - 1.5, y - 9.2);
  ctx.lineTo(x + 1.5, y - 9.2);
  ctx.bezierCurveTo(x + 1.4, y - 6.2, x + 3.9, y - 4.6, x + 3.5, y - 0.6);
  ctx.quadraticCurveTo(x, y + 0.6, x - 3.5, y - 0.6);
  ctx.fillStyle = lit(x, y - 4, 5);
  ctx.fill();
  ctx.stroke();
  // 목 장식과 머리
  ctx.beginPath();
  ctx.ellipse(x, y - 9.3, 2.5, 0.85, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3c3c44';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - 12.1, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = lit(x, y - 12.1, 2.8);
  ctx.fill();
  ctx.stroke();
  ellipse(ctx, x - 1, y - 13.1, 0.9, 0.6, 'rgba(255,255,255,0.45)');
  ctx.restore();
}

// ---------- 아이콘 (24x24 상자) ----------
const ICON_DRAW = {
  wood(ctx) {
    drawTree(ctx, 8, 21, 1.35);
    drawTree(ctx, 15.5, 22, 1.6);
  },
  brick(ctx) {
    drawBricks(ctx, 12, 19.5, 2);
  },
  wool(ctx) {
    drawSheep(ctx, 10.5, 19, 2);
  },
  grain(ctx) {
    drawWheat(ctx, 12, 22, 2.25);
  },
  ore(ctx) {
    ellipse(ctx, 12.5, 20.5, 9, 2, 'rgba(0,0,0,0.25)');
    poly(ctx, [[3.5, 20], [6, 11], [11, 6.5], [17, 8], [20.5, 14], [20, 20]]);
    ctx.fillStyle = '#8b95a3';
    ctx.fill();
    poly(ctx, [[11, 6.5], [17, 8], [20.5, 14], [13, 13]]);
    ctx.fillStyle = '#b8c1cc';
    ctx.fill();
    poly(ctx, [[13, 13], [20.5, 14], [20, 20], [12, 20]]);
    ctx.fillStyle = '#5c6572';
    ctx.fill();
    poly(ctx, [[8, 14], [10, 10.5], [12, 13.5], [10, 16.5]]);
    ctx.fillStyle = '#9fd3ec';
    ctx.fill();
  },
  knight(ctx) {
    ctx.beginPath();
    ctx.moveTo(12, 3);
    ctx.lineTo(20, 6);
    ctx.quadraticCurveTo(20, 16, 12, 21.5);
    ctx.quadraticCurveTo(4, 16, 4, 6);
    ctx.closePath();
    const g = ctx.createLinearGradient(4, 3, 20, 21);
    g.addColorStop(0, '#5f86d6');
    g.addColorStop(1, '#2c4a92');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#e8c35a';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = '#f5d778';
    ctx.fillRect(11, 6.5, 2, 11);
    ctx.fillRect(7.5, 9.5, 9, 2);
  },
  victoryPoint(ctx) {
    ctx.fillStyle = '#c9952c';
    ctx.fillRect(9, 15, 6, 3);
    roundRect(ctx, 6.5, 18, 11, 3, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(5, 4);
    ctx.lineTo(19, 4);
    ctx.quadraticCurveTo(19, 15, 12, 15.5);
    ctx.quadraticCurveTo(5, 15, 5, 4);
    const g = ctx.createLinearGradient(5, 4, 19, 15);
    g.addColorStop(0, '#ffe58a');
    g.addColorStop(1, '#d9a62e');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#d9a62e';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(4.8, 7.5, 2.4, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(19.2, 7.5, 2.4, Math.PI * 1.5, Math.PI * 0.5);
    ctx.stroke();
  },
  roadBuilding(ctx, colors) {
    const c = { main: colors?.m || '#c88a4a', light: colors?.l || shade(colors?.m || '#c88a4a', 0.35), dark: colors?.d || shade(colors?.m || '#c88a4a', -0.35) };
    drawRoad(ctx, 3, 19, 21, 7, c, 4, { length: 0.95, width: 4.6, thick: 2.6 });
  },
  // 남은 말 상자에 세워 둔 도로 막대
  road(ctx, colors) {
    drawRoad(ctx, 12, 1.5, 12, 23, pieceFromIcon(colors), 4, { length: 0.92, width: 5.2, thick: 2.6 });
  },
  yearOfPlenty(ctx) {
    const star = (cx, cy, r) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rr = i % 2 ? r * 0.32 : r;
        ctx.lineTo(cx + Math.sin(a) * rr, cy - Math.cos(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = '#f2c14a';
    star(11, 12, 9);
    ctx.fillStyle = '#ffe9a3';
    star(19, 5, 3.4);
    star(19.5, 19, 2.6);
  },
  monopoly(ctx) {
    ctx.beginPath();
    ctx.moveTo(9, 7);
    ctx.quadraticCurveTo(3, 13, 5, 19);
    ctx.quadraticCurveTo(12, 23, 19, 19);
    ctx.quadraticCurveTo(21, 13, 15, 7);
    ctx.closePath();
    const g = ctx.createLinearGradient(4, 7, 20, 21);
    g.addColorStop(0, '#d8b07a');
    g.addColorStop(1, '#94693a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = '#7b542c';
    ctx.fillRect(9, 5, 6, 2.4);
    ellipse(ctx, 12, 14.5, 3.2, 3.2, '#f6cf4f');
    ctx.fillStyle = '#b8892a';
    ctx.font = 'bold 4.6px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('₩', 12, 14.7);
  },
  devBack(ctx) {
    roundRect(ctx, 5, 2.5, 14, 19, 2.2);
    const g = ctx.createLinearGradient(5, 2.5, 19, 21.5);
    g.addColorStop(0, '#7e62c4');
    g.addColorStop(1, '#44307f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#e8c35a';
    ctx.lineWidth = 0.9;
    roundRect(ctx, 6.6, 4.1, 10.8, 15.8, 1.4);
    ctx.stroke();
    ctx.fillStyle = '#f5d778';
    ctx.font = 'bold 10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 12, 12.5);
  },
  cards(ctx) {
    for (const [x, y, rot, c] of [[9, 12, -0.25, '#efe2c4'], [14, 12.5, 0.18, '#fffaf0']]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      roundRect(ctx, -5, -8, 10, 15, 1.6);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = '#a58b62';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
  },
  dice(ctx) {
    roundRect(ctx, 3.5, 3.5, 17, 17, 3.5);
    ctx.fillStyle = '#fffdf8';
    ctx.fill();
    ctx.strokeStyle = '#b9ab95';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (const [x, y] of [[8, 8], [12, 12], [16, 16]]) ellipse(ctx, x, y, 1.6, 1.6, '#3b2a1e');
  },
  settlement(ctx, colors) {
    ctx.save();
    ctx.translate(12, 13.6);
    ctx.scale(1.5, 1.5);
    drawSettlement(ctx, 0, 0, pieceFromIcon(colors));
    ctx.restore();
  },
  city(ctx, colors) {
    ctx.save();
    ctx.translate(12, 15.2);
    ctx.scale(1.1, 1.1);
    drawCity(ctx, 0, 0, pieceFromIcon(colors));
    ctx.restore();
  },
};

function pieceFromIcon(colors) {
  const m = colors?.m || '#c0392b';
  return { main: m, light: colors?.l || shade(m, 0.35), dark: colors?.d || shade(m, -0.35) };
}

export function pieceColors(color) {
  return { m: color.main, l: color.light, d: color.dark };
}

const iconCache = new Map();
export function iconURL(name, colors) {
  const key = name + JSON.stringify(colors || {});
  if (iconCache.has(key)) return iconCache.get(key);
  const draw = ICON_DRAW[name];
  if (!draw) return '';
  const size = 96;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.scale(size / 24, size / 24);
  ctx.save();
  ctx.translate(12, 12);
  ctx.scale(1.12, 1.12);
  ctx.translate(-12, -12);
  draw(ctx, colors);
  ctx.restore();
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

// 시작 화면 그림: 작은 섬 하나
export function drawLogo(canvas, colors) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 300;
  const cssH = canvas.clientHeight || 110;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  const k = canvas.width / 150;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, 150, 55);
  ellipse(ctx, 75, 38, 72, 15, 'rgba(61,143,181,0.35)');
  ellipse(ctx, 75, 37, 58, 11, '#ecd9a6');
  const hex = (cx, cy, r, terrain) => {
    const st = TERRAIN_STYLE[terrain];
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, st.light);
    g.addColorStop(1, st.dark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  };
  hex(47, 36, 15, 'forest');
  hex(75, 33, 15, 'fields');
  hex(103, 36, 15, 'hills');
  drawTree(ctx, 41, 36, 1);
  drawTree(ctx, 50, 38, 1.2, true);
  drawWheat(ctx, 70, 35, 0.9);
  drawWheat(ctx, 80, 36, 0.9);
  drawBricks(ctx, 104, 38, 0.9);
  drawRoad(ctx, 58, 27, 69, 22, colors[1], 2);
  ctx.save();
  ctx.translate(60, 22);
  ctx.scale(0.8, 0.8);
  drawSettlement(ctx, 0, 0, colors[0], 2);
  ctx.restore();
  ctx.save();
  ctx.translate(90, 21);
  ctx.scale(0.8, 0.8);
  drawCity(ctx, 0, 0, colors[2], 2);
  ctx.restore();
  drawRobber(ctx, 118, 31, 2);
  drawSheep(ctx, 28, 39, 0.9);
}
