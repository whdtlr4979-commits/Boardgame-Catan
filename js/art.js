// 보드게임 일러스트 스타일 그림 도구: 지형 장식, 말, 아이콘 (모두 벡터로 그린다)

export const RES_COLORS = {
  wood: '#3f7d3a',
  brick: '#c0623a',
  wool: '#8cc152',
  grain: '#e6b53c',
  ore: '#7d8794',
};

export const TERRAIN_STYLE = {
  forest: { light: '#5f9e4c', dark: '#2d6230' },
  pasture: { light: '#b8de72', dark: '#7db146' },
  fields: { light: '#f8d877', dark: '#d9a538' },
  hills: { light: '#e3955f', dark: '#b05c34' },
  mountains: { light: '#b7bfc8', dark: '#77828f' },
  desert: { light: '#f4e5b6', dark: '#d8bd82' },
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
export function drawTree(ctx, x, y, s, round = false) {
  ellipse(ctx, x + 0.8 * s, y, 4.2 * s, 1.3 * s, 'rgba(18,40,12,0.35)');
  ctx.fillStyle = '#6b4426';
  ctx.fillRect(x - 0.8 * s, y - 3 * s, 1.6 * s, 3 * s);
  if (round) {
    const g = ctx.createLinearGradient(x - 5 * s, y - 11 * s, x + 5 * s, y - 3 * s);
    g.addColorStop(0, '#7fb85c');
    g.addColorStop(1, '#2f6a2e');
    ctx.fillStyle = g;
    for (const [dx, dy, r] of [[-2.2, -5.2, 3], [2.2, -5.2, 3], [0, -8.2, 3.6]]) {
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ellipse(ctx, x - 1.2 * s, y - 9.2 * s, 1.3 * s, 0.9 * s, 'rgba(255,255,255,0.25)');
    return;
  }
  for (let i = 0; i < 3; i++) {
    const base = y - 2.4 * s - i * 3 * s;
    const hw = (4.6 - i * 1.2) * s;
    const top = base - 5.2 * s;
    const g = ctx.createLinearGradient(x - hw, top, x + hw, base);
    g.addColorStop(0, '#6aa954');
    g.addColorStop(0.55, '#3a7d37');
    g.addColorStop(1, '#1f4f25');
    ctx.fillStyle = g;
    poly(ctx, [[x - hw, base], [x, top], [x + hw, base]]);
    ctx.fill();
  }
}

export function drawSheep(ctx, x, y, s) {
  ellipse(ctx, x + 0.5 * s, y, 4.4 * s, 1.2 * s, 'rgba(40,60,20,0.3)');
  ctx.strokeStyle = '#3a3330';
  ctx.lineWidth = 0.7 * s;
  ctx.lineCap = 'round';
  for (const dx of [-2.2, -0.8, 1.2, 2.4]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y - 1.6 * s);
    ctx.lineTo(x + dx * s, y - 0.1 * s);
    ctx.stroke();
  }
  ctx.fillStyle = '#fffdf5';
  for (const [dx, dy, r] of [[-2.2, -3.2, 1.9], [0, -3.8, 2.1], [2, -3.2, 1.9], [-1, -2.4, 1.8], [1.2, -2.4, 1.8]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ellipse(ctx, x - 0.6 * s, y - 4.6 * s, 1.4 * s, 0.7 * s, 'rgba(255,255,255,0.9)');
  ellipse(ctx, x + 1.4 * s, y - 2 * s, 2.4 * s, 0.8 * s, 'rgba(160,150,120,0.25)');
  ctx.save();
  ctx.translate(x + 3.9 * s, y - 3.5 * s);
  ctx.rotate(0.25);
  ellipse(ctx, 0, 0, 1.5 * s, 1.1 * s, '#3a3330');
  ellipse(ctx, -0.6 * s, -1 * s, 0.7 * s, 0.4 * s, '#3a3330');
  ctx.restore();
  ellipse(ctx, x + 4.3 * s, y - 3.8 * s, 0.25 * s, 0.25 * s, '#ffffff');
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
  ellipse(ctx, x, y, 3 * s, 0.9 * s, 'rgba(120,80,10,0.25)');
  for (const [dx, lean] of [[-1.4, -0.35], [0, 0], [1.4, 0.35]]) {
    const tx = x + dx * s + lean * 3 * s;
    const ty = y - 8 * s;
    ctx.strokeStyle = '#b07f22';
    ctx.lineWidth = 0.45 * s;
    ctx.beginPath();
    ctx.moveTo(x + dx * 0.4 * s, y);
    ctx.quadraticCurveTo(x + dx * s, y - 4 * s, tx, ty + 3 * s);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const gy = ty + 3 * s - i * 1.1 * s;
      ellipse(ctx, tx - 0.55 * s, gy, 0.55 * s, 0.85 * s, '#f6d46a');
      ellipse(ctx, tx + 0.55 * s, gy - 0.4 * s, 0.55 * s, 0.85 * s, '#e9b84a');
    }
  }
}

export function drawBricks(ctx, x, y, s) {
  ellipse(ctx, x + 0.5 * s, y, 5.5 * s, 1.2 * s, 'rgba(80,30,10,0.3)');
  const rows = [[-4.8, 0], [-1.6, 0], [1.6, 0], [-3.2, 1], [0, 1], [-1.6, 2]];
  for (const [bx, row] of rows) {
    const yy = y - (row + 1) * 2.1 * s;
    const g = ctx.createLinearGradient(0, yy, 0, yy + 2 * s);
    g.addColorStop(0, '#d9724a');
    g.addColorStop(1, '#9c3f24');
    ctx.fillStyle = g;
    roundRect(ctx, x + bx * s, yy, 3.1 * s, 1.9 * s, 0.35 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,200,0.6)';
    ctx.lineWidth = 0.25 * s;
    ctx.stroke();
  }
}

export function drawMound(ctx, x, y, s) {
  const g = ctx.createLinearGradient(x, y - 3 * s, x, y);
  g.addColorStop(0, '#d98656');
  g.addColorStop(1, '#a8532d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, 4.2 * s, 2.6 * s, 0, Math.PI, 0);
  ctx.fill();
}

export function drawPeak(ctx, x, y, w, h) {
  const apex = [x + w * 0.05, y - h];
  ellipse(ctx, x + w * 0.1, y, w * 0.55, h * 0.12, 'rgba(40,45,55,0.25)');
  poly(ctx, [[x - w / 2, y], apex, [x + w * 0.05, y]]);
  ctx.fillStyle = '#a9b2bd';
  ctx.fill();
  poly(ctx, [[x + w * 0.05, y], apex, [x + w / 2, y]]);
  ctx.fillStyle = '#606a77';
  ctx.fill();
  const sh = h * 0.32;
  const t = sh / h;
  poly(ctx, [
    [apex[0] - (apex[0] - (x - w / 2)) * t, apex[1] + sh],
    apex,
    [apex[0] + (x + w / 2 - apex[0]) * t, apex[1] + sh],
    [apex[0] + w * 0.08, apex[1] + sh * 0.7],
    [apex[0], apex[1] + sh * 1.05],
    [apex[0] - w * 0.1, apex[1] + sh * 0.75],
  ]);
  ctx.fillStyle = '#f7f9fc';
  ctx.fill();
}

export function drawDune(ctx, x, y, s) {
  ctx.strokeStyle = 'rgba(170,130,70,0.55)';
  ctx.lineWidth = 0.6 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 5 * s, y);
  ctx.quadraticCurveTo(x, y - 3 * s, x + 5 * s, y);
  ctx.stroke();
}

export function drawCactus(ctx, x, y, s) {
  ellipse(ctx, x + 0.6 * s, y, 2.6 * s, 0.8 * s, 'rgba(120,90,40,0.3)');
  ctx.strokeStyle = '#5f8f3f';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 6.5 * s);
  ctx.moveTo(x, y - 3 * s);
  ctx.quadraticCurveTo(x - 2.4 * s, y - 3 * s, x - 2.4 * s, y - 5 * s);
  ctx.moveTo(x, y - 4 * s);
  ctx.quadraticCurveTo(x + 2.2 * s, y - 4 * s, x + 2.2 * s, y - 5.8 * s);
  ctx.stroke();
}

export function drawRock(ctx, x, y, s) {
  ellipse(ctx, x + 0.4 * s, y, 2.4 * s, 0.7 * s, 'rgba(90,70,40,0.3)');
  poly(ctx, [[x - 2 * s, y], [x - 1.4 * s, y - 1.8 * s], [x + 0.4 * s, y - 2.3 * s], [x + 2 * s, y - 0.8 * s], [x + 1.8 * s, y]]);
  ctx.fillStyle = '#bba57c';
  ctx.fill();
}

// ---------- 플레이어 말 ----------
// 정면 오각형 + 오른쪽 옆면을 그려 나무 말처럼 입체감을 준다
function drawBlock(ctx, x, y, w, wallH, roofH, color, dx = 2.2, dy = -1.5) {
  const front = [[x, y], [x + w, y], [x + w, y - wallH], [x + w / 2, y - wallH - roofH], [x, y - wallH]];
  const side = [[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + dy - wallH], [x + w, y - wallH]];
  const roof = [[x + w / 2, y - wallH - roofH], [x + w / 2 + dx, y + dy - wallH - roofH], [x + w + dx, y + dy - wallH], [x + w, y - wallH]];
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(25,15,8,0.55)';
  ctx.lineWidth = 0.45;
  poly(ctx, side);
  ctx.fillStyle = color.dark;
  ctx.fill();
  ctx.stroke();
  poly(ctx, roof);
  ctx.fillStyle = shade(color.main, 0.12);
  ctx.fill();
  ctx.stroke();
  const g = ctx.createLinearGradient(x, y - wallH - roofH, x + w, y);
  g.addColorStop(0, color.light);
  g.addColorStop(0.6, color.main);
  g.addColorStop(1, shade(color.main, -0.12));
  poly(ctx, front);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.stroke();
}

export function drawSettlement(ctx, x, y, color, k = 1) {
  ctx.save();
  ellipse(ctx, x + 1.8, y + 5.4, 8, 2.2, 'rgba(0,0,0,0.3)');
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 1.5 * k;
  drawBlock(ctx, x - 5.6, y + 5.2, 10.4, 6, 5, color, 2.8, -1.9);
  ctx.restore();
}

export function drawCity(ctx, x, y, color, k = 1) {
  ctx.save();
  ellipse(ctx, x + 1.8, y + 6, 10.8, 2.6, 'rgba(0,0,0,0.3)');
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 1.5 * k;
  drawBlock(ctx, x - 9, y + 6, 7, 12, 4.2, color, 2.8, -1.9);
  drawBlock(ctx, x - 2.3, y + 6, 10.4, 6.5, 3.9, color, 2.8, -1.9);
  ctx.restore();
}

export function drawRoad(ctx, ax, ay, bx, by, color, k = 1) {
  const len = Math.hypot(bx - ax, by - ay);
  ctx.save();
  ctx.translate((ax + bx) / 2, (ay + by) / 2);
  ctx.rotate(Math.atan2(by - ay, bx - ax));
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 1.5 * k;
  ctx.shadowOffsetY = 0.6 * k;
  const L = len * 0.62;
  const H = 3.4;
  const g = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
  g.addColorStop(0, color.light);
  g.addColorStop(0.45, color.main);
  g.addColorStop(1, color.dark);
  roundRect(ctx, -L / 2, -H / 2, L, H, 1.2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(25,15,8,0.55)';
  ctx.lineWidth = 0.45;
  ctx.stroke();
  ctx.restore();
}

export function drawRobber(ctx, x, y, k = 1) {
  ctx.save();
  ellipse(ctx, x + 1, y + 0.6, 4.6, 1.5, 'rgba(0,0,0,0.35)');
  const g = ctx.createLinearGradient(x - 4, 0, x + 4, 0);
  g.addColorStop(0, '#7a7a86');
  g.addColorStop(0.45, '#45454f');
  g.addColorStop(1, '#1f1f25');
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 1.5 * k;
  ctx.beginPath();
  ctx.ellipse(x, y, 3.9, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 3.4, y);
  ctx.bezierCurveTo(x - 3.2, y - 4, x - 1.3, y - 5.5, x - 1.4, y - 8.4);
  ctx.lineTo(x + 1.4, y - 8.4);
  ctx.bezierCurveTo(x + 1.3, y - 5.5, x + 3.2, y - 4, x + 3.4, y);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - 10.3, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ellipse(ctx, x - 0.9, y - 11.1, 0.8, 0.6, 'rgba(255,255,255,0.35)');
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
    drawRoad(ctx, 2, 20, 22, 6, c, 4);
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
    ctx.translate(11, 12.5);
    ctx.scale(0.8, 0.8);
    drawSettlement(ctx, 0, 0, pieceFromIcon(colors), 3);
    ctx.restore();
  },
  city(ctx, colors) {
    ctx.save();
    ctx.translate(11.5, 12);
    ctx.scale(0.75, 0.75);
    drawCity(ctx, 0, 0, pieceFromIcon(colors), 3);
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
