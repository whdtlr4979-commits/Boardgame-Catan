// 요즘 카탄(5·6판) 나무 말을 WebGL로 한 번 입체로 그려 그림(스프라이트)으로 만들어 둔다.
// 개척지: 뾰족 지붕 집 / 도시: 박공 탑 + 긴 집 / 도로: 나무 막대 / 도둑: 회색 말
// 보드는 이 그림을 붙여 그리기만 하므로 매 프레임 비용이 거의 없다.

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

// ---------- 모양 만들기 (y 위, 바닥 y=0) ----------
// 오각형(집 옆모습)을 z 방향으로 늘린 각기둥. 면마다 법선이 따로 (각진 나무 말)
function housePrism(w, wall, roof, depth, { x = 0, z = 0, yaw = 0 } = {}) {
  const prof = [[-w / 2, 0], [w / 2, 0], [w / 2, wall], [0, wall + roof], [-w / 2, wall]];
  const tris = [];
  const front = prof.map(([px, py]) => [px, py, depth / 2]);
  const back = prof.map(([px, py]) => [px, py, -depth / 2]);
  // 앞뒤 박공 (부채꼴로 나눈 삼각형)
  for (let i = 1; i < 4; i++) {
    tris.push([front[0], front[i], front[i + 1]]);
    tris.push([back[0], back[i + 1], back[i]]);
  }
  // 옆면·지붕 (바닥은 보이지 않으므로 생략)
  for (let i = 1; i < 5; i++) {
    const a = i;
    const b = (i + 1) % 5;
    tris.push([front[a], back[a], back[b]]);
    tris.push([front[a], back[b], front[b]]);
  }
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return tris.map((t) => t.map(([px, py, pz]) => [px * c + pz * s + x, py, -px * s + pz * c + z]));
}

function box(w, h, d, { x = 0, y = 0, z = 0 } = {}) {
  const v = (sx, sy, sz) => [x + (sx * w) / 2, y + sy * h, z + (sz * d) / 2];
  const quads = [
    [v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1)], // 위
    [v(-1, 0, 1), v(1, 0, 1), v(1, 1, 1), v(-1, 1, 1)], // 앞
    [v(1, 0, -1), v(-1, 0, -1), v(-1, 1, -1), v(1, 1, -1)], // 뒤
    [v(1, 0, 1), v(1, 0, -1), v(1, 1, -1), v(1, 1, 1)], // 오른쪽
    [v(-1, 0, -1), v(-1, 0, 1), v(-1, 1, 1), v(-1, 1, -1)], // 왼쪽
  ];
  return quads.flatMap(([a, b, c2, d2]) => [[a, b, c2], [a, c2, d2]]);
}

// 각진 삼각형 → [위치, 법선] 배열 (면 법선)
function flatShade(tris) {
  const out = [];
  for (const [a, b, c] of tris) {
    const n = norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
    for (const p of [a, b, c]) out.push(...p, ...n);
  }
  return out;
}

// 단면 곡선을 돌려 만든 매끈한 회전체 (도둑 말)
function lathe(profile, seg = 40) {
  const out = [];
  const pt = (i, j) => {
    const [r, y] = profile[i];
    const a = (j / seg) * Math.PI * 2;
    return [r * Math.cos(a), y, r * Math.sin(a)];
  };
  // 단면의 각 점 법선: 이웃 점을 이은 방향에 수직
  const nrm = (i, j) => {
    const p0 = profile[Math.max(0, i - 1)];
    const p1 = profile[Math.min(profile.length - 1, i + 1)];
    const dr = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const a = (j / seg) * Math.PI * 2;
    const nr = dy;
    const ny = -dr;
    const l = Math.hypot(nr, ny) || 1;
    return [(nr / l) * Math.cos(a), ny / l, (nr / l) * Math.sin(a)];
  };
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const quad = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const [a, b] = quad[k];
        out.push(...pt(a, b), ...nrm(a, b));
      }
    }
  }
  return out;
}

// 개척지: 폭 1, 벽 0.62, 지붕 0.45, 깊이 0.8
const SETTLEMENT = () => flatShade(housePrism(1, 0.62, 0.46, 0.82));
// 도시: 왼쪽에 좁고 높은 박공 탑, 오른쪽에 낮고 긴 집 (용마루가 가로)
const CITY = () => flatShade([
  ...housePrism(0.72, 1.12, 0.42, 0.82, { x: -0.5 }),
  ...housePrism(0.82, 0.6, 0.38, 1.16, { x: 0.28, yaw: Math.PI / 2 }),
]);
// 도로: 길이 1.7, 폭 0.32, 높이 0.3
const ROAD = () => flatShade(box(1.7, 0.3, 0.32));
// 도둑: 받침 → 넓은 몸통 → 목 → 둥근 머리
function ROBBER() {
  const prof = [[0, 0], [0.44, 0], [0.46, 0.05], [0.44, 0.11], [0.36, 0.15], [0.33, 0.3], [0.28, 0.5], [0.21, 0.68], [0.17, 0.78], [0.25, 0.81], [0.25, 0.85], [0.15, 0.89]];
  // 머리: 목에서 이어지는 구
  for (let k = 0; k <= 12; k++) {
    const a = (-50 + (k / 12) * 140) * (Math.PI / 180);
    prof.push([Math.max(0.0001, 0.2 * Math.cos(a)), 1.06 + 0.2 * Math.sin(a)]);
  }
  return lathe(prof);
}

const VERT = `
attribute vec3 aPos;
attribute vec3 aNorm;
uniform mat4 uMVP;
uniform mat3 uRot;
varying vec3 vN;
varying vec3 vP;
void main() {
  vN = uRot * aNorm;
  vP = aPos;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

// 칠한 나무: 은은한 나뭇결 + 반광택 + 가장자리 살짝 어둡게
const FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uLight;
uniform vec3 uView;
uniform float uGrain;
varying vec3 vN;
varying vec3 vP;
void main() {
  vec3 n = normalize(vN);
  vec3 l = normalize(uLight);
  vec3 v = normalize(uView);
  float grain = sin((vP.y * 1.6 + vP.x * 0.5 + sin(vP.z * 4.0 + vP.x * 2.0) * 0.3) * 16.0);
  float rings = sin((vP.x * 1.3 + vP.z * 0.8 + vP.y * 0.3) * 5.0);
  vec3 base = uColor * (1.0 + uGrain * (0.035 * grain + 0.03 * rings));
  float diff = max(dot(n, l), 0.0);
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), 24.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.0);
  vec3 col = base * (0.55 + 0.6 * diff) + vec3(0.18) * spec;
  col *= 1.0 - 0.15 * rim;
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}`;

// 보드를 비스듬히 내려다보는 시점 (보드 그림과 어울리게)
export const VIEW = { elevation: 52 * (Math.PI / 180), yaw: -28 * (Math.PI / 180) };
const UNIT_PX = 80; // 스프라이트에서 월드 1단위 = 80px
const SPRITE = 256;

// 시점 행렬 (회전만): 월드 → 화면 [x 오른쪽, y 위, z 화면 밖]
function viewRotation(yaw, elev) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const ce = Math.cos(elev);
  const se = Math.sin(elev);
  // 먼저 y축으로 yaw, 다음 x축으로 elev만큼 기울여 위에서 내려다본다
  return [
    cy, 0, sy,
    sy * se, ce, -cy * se,
    -sy * ce, se, cy * ce,
  ];
}

let shared = null;
function context() {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE;
  canvas.height = SPRITE;
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const loc = (n) => gl.getUniformLocation(prog, n);
  shared = {
    canvas, gl, prog,
    aPos: gl.getAttribLocation(prog, 'aPos'),
    aNorm: gl.getAttribLocation(prog, 'aNorm'),
    u: { mvp: loc('uMVP'), rot: loc('uRot'), color: loc('uColor'), light: loc('uLight'), view: loc('uView'), grain: loc('uGrain') },
    buf: gl.createBuffer(),
  };
  gl.enable(gl.DEPTH_TEST);
  return shared;
}

const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

// 모양 하나를 그려 2D 캔버스(그림자 포함)로 돌려준다. yawExtra: 바닥에서 돌린 각도 (도로 방향)
function bake(data, color, { yawExtra = 0, grain = 1 } = {}) {
  const c = context();
  if (!c) return null;
  const { gl } = c;
  const R = viewRotation(VIEW.yaw + yawExtra, VIEW.elevation);
  // 직교 투영: 화면 1px = 1/UNIT_PX 단위, 깊이는 넉넉히
  const s = (2 * UNIT_PX) / SPRITE;
  // 모델은 바닥 중심이 스프라이트 가운데 조금 아래에 오게 한다
  const oy = -0.18;
  const mvp = new Float32Array([
    R[0] * s, R[3] * s, -R[6] * 0.2, 0,
    R[1] * s, R[4] * s, -R[7] * 0.2, 0,
    R[2] * s, R[5] * s, -R[8] * 0.2, 0,
    0, oy, 0, 1,
  ]);
  const rot = new Float32Array([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]);
  gl.viewport(0, 0, SPRITE, SPRITE);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.bindBuffer(gl.ARRAY_BUFFER, c.buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(c.aPos);
  gl.enableVertexAttribArray(c.aNorm);
  gl.vertexAttribPointer(c.aPos, 3, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(c.aNorm, 3, gl.FLOAT, false, 24, 12);
  gl.uniformMatrix4fv(c.u.mvp, false, mvp);
  gl.uniformMatrix3fv(c.u.rot, false, rot);
  gl.uniform3fv(c.u.color, hexRGB(color));
  // 빛: 화면 기준 왼쪽 위 앞
  gl.uniform3fv(c.u.light, norm([-0.35, 0.7, 0.7]));
  gl.uniform3fv(c.u.view, [0, 0, 1]);
  gl.uniform1f(c.u.grain, grain);
  gl.drawArrays(gl.TRIANGLES, 0, data.length / 6);

  // 그림자: 바닥 발자국을 투영해 부드럽게 깐 뒤 말을 올린다
  const out = document.createElement('canvas');
  out.width = SPRITE;
  out.height = SPRITE;
  const ctx = out.getContext('2d');
  const toScreen = (p) => {
    const x = R[0] * p[0] + R[1] * p[1] + R[2] * p[2];
    const y = R[3] * p[0] + R[4] * p[1] + R[5] * p[2];
    return [SPRITE / 2 + x * UNIT_PX, SPRITE / 2 - (y + oy / s) * UNIT_PX];
  };
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let i = 0; i < data.length; i += 6) {
    if (data[i + 1] > 0.05) continue;
    minX = Math.min(minX, data[i]); maxX = Math.max(maxX, data[i]);
    minZ = Math.min(minZ, data[i + 2]); maxZ = Math.max(maxZ, data[i + 2]);
  }
  if (Number.isFinite(minX)) {
    const [gx, gy] = toScreen([(minX + maxX) / 2 + 0.12, 0, (minZ + maxZ) / 2 + 0.1]);
    const rx = ((maxX - minX) / 2 + 0.22) * UNIT_PX;
    const ry = ((maxZ - minZ) / 2 + 0.22) * UNIT_PX * Math.sin(VIEW.elevation);
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(rx, ry));
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(1, ry / Math.max(rx, ry));
    ctx.translate(-gx, -gy);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(gx, gy, Math.max(rx, ry), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.drawImage(c.canvas, 0, 0);
  // 바닥 중심이 그림의 어디에 있는지 (붙일 때 기준점)
  const [ax, ay] = toScreen([0, 0, 0]);
  return { canvas: out, anchor: [ax / SPRITE, ay / SPRITE], unitPx: UNIT_PX, size: SPRITE };
}

// 도로를 화면에서 angle(라디안) 방향으로 보이게 하는 바닥 각도
export function roadYawFor(screenAngle) {
  // 화면 각도 → 바닥 각도 (위에서 비스듬히 보면 깊이 방향이 짧아 보인다)
  const a = Math.atan2(Math.sin(screenAngle) / Math.sin(VIEW.elevation), Math.cos(screenAngle));
  return -a - VIEW.yaw;
}

// 색 하나에 대한 말 그림 묶음
export function bakePieces(colorHex) {
  return {
    settlement: bake(SETTLEMENT(), colorHex),
    city: bake(CITY(), colorHex),
    road: (screenAngle) => bake(ROAD(), colorHex, { yawExtra: roadYawFor(screenAngle) }),
  };
}

export function bakeRobber() {
  return bake(ROBBER(), '#6e6e78', { grain: 0.3 });
}

export function webglAvailable() {
  try {
    return !!context();
  } catch {
    return false;
  }
}
