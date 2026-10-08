// 카탄 특별판의 조각된 플라스틱 말을 WebGL로 한 번 입체로 그려 그림(스프라이트)으로 만들어 둔다.
// 마을(개척지): 울퉁불퉁한 언덕 위 집 두 채 / 도시: 둥근 받침 위 교회와 집들 /
// 도로: 포장 돌 깐 길과 양옆 연석 / 도둑: 나란히 선 도적 세 명.
// 보드는 이 그림을 붙여 그리기만 하므로 매 프레임 비용이 거의 없다.

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// 정점 하나 = 위치(3) + 법선(3) + 밝기(1, 창문·문처럼 파인 곳은 어둡게)
const STRIDE = 7;

// ---------- 모양 도구 (y 위, 바닥 y=0) ----------
// 놓기: 이동 + y축 회전
function placer({ x = 0, y = 0, z = 0, yaw = 0, s = 1 } = {}) {
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return {
    p: ([px, py, pz]) => [(px * c + pz * sn) * s + x, py * s + y, (-px * sn + pz * c) * s + z],
    n: ([nx, ny, nz]) => [nx * c + nz * sn, ny, -nx * sn + nz * c],
  };
}

// 각진 삼각형들 → 정점 배열 (면 법선)
function flat(tris, shade = 1, at = {}) {
  const T = placer(at);
  const out = [];
  for (const tri of tris) {
    const [a, b, c] = tri.map(T.p);
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) out.push(...p, ...n, shade);
  }
  return out;
}

const quad = (a, b, c, d) => [[a, b, c], [a, c, d]];

function boxTris(w, h, d, y0 = 0) {
  const v = (sx, sy, sz) => [(sx * w) / 2, y0 + sy * h, (sz * d) / 2];
  return [
    ...quad(v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1)),
    ...quad(v(-1, 0, 1), v(1, 0, 1), v(1, 1, 1), v(-1, 1, 1)),
    ...quad(v(1, 0, -1), v(-1, 0, -1), v(-1, 1, -1), v(1, 1, -1)),
    ...quad(v(1, 0, 1), v(1, 0, -1), v(1, 1, -1), v(1, 1, 1)),
    ...quad(v(-1, 0, -1), v(-1, 0, 1), v(-1, 1, 1), v(-1, 1, -1)),
  ];
}

// 박공지붕 (처마가 벽보다 조금 나온다): 용마루는 z 방향
function roofTris(w, d, y0, h) {
  const a = [-w / 2, y0, d / 2]; const b = [w / 2, y0, d / 2]; const top = [0, y0 + h, d / 2];
  const a2 = [-w / 2, y0, -d / 2]; const b2 = [w / 2, y0, -d / 2]; const top2 = [0, y0 + h, -d / 2];
  return [[a, b, top], [b2, a2, top2], ...quad(b, b2, top2, top), ...quad(a2, a, top, top2)];
}

// 사각뿔 (탑 꼭대기)
function spireTris(w, y0, h) {
  const t = [0, y0 + h, 0];
  const c = [[-w / 2, y0, w / 2], [w / 2, y0, w / 2], [w / 2, y0, -w / 2], [-w / 2, y0, -w / 2]];
  return [[c[0], c[1], t], [c[1], c[2], t], [c[2], c[3], t], [c[3], c[0], t]];
}

// 집 한 채: 벽 + 처마 있는 지붕 + 굴뚝 + 문·창문(살짝 파인 어두운 면)
function house(w, h, d, roof, at, { chimney = true, windows = 2 } = {}) {
  const out = [];
  out.push(...flat(boxTris(w, h, d), 1, at));
  out.push(...flat(roofTris(w * 1.18, d * 1.1, h - 0.01, roof), 1, at));
  if (chimney) out.push(...flat(boxTris(w * 0.16, roof * 0.9, w * 0.16, h + roof * 0.3).map((t) => t.map(([x, y, z]) => [x + w * 0.22, y, z - d * 0.15])), 1, at));
  // 앞 박공의 문, 옆벽의 창문
  const front = d / 2 + 0.006;
  out.push(...flat(quad([-w * 0.12, 0, front], [w * 0.12, 0, front], [w * 0.12, h * 0.55, front], [-w * 0.12, h * 0.55, front]), 0.45, at));
  out.push(...flat(quad([-w * 0.08, h * 0.95, front], [w * 0.08, h * 0.95, front], [w * 0.08, h * 0.95 + roof * 0.35, front], [-w * 0.08, h * 0.95 + roof * 0.35, front]), 0.5, at));
  const side = w / 2 + 0.006;
  for (let i = 0; i < windows; i++) {
    const zc = -d / 2 + ((i + 1) * d) / (windows + 1);
    out.push(...flat(quad([side, h * 0.45, zc + 0.06], [side, h * 0.45, zc - 0.06], [side, h * 0.78, zc - 0.06], [side, h * 0.78, zc + 0.06]), 0.5, at));
    out.push(...flat(quad([-side, h * 0.45, zc - 0.06], [-side, h * 0.45, zc + 0.06], [-side, h * 0.78, zc + 0.06], [-side, h * 0.78, zc - 0.06]), 0.5, at));
  }
  return out;
}

// 매개변수 곡면 (u, v → 점) 을 매끈한 법선으로
function surface(nu, nv, fn, { wrapV = false, shade = () => 1, flip = false } = {}) {
  const P = [];
  for (let i = 0; i <= nu; i++) {
    P.push([]);
    for (let j = 0; j <= nv; j++) P[i].push(fn(i / nu, (wrapV ? j % nv : j) / nv));
  }
  const N = P.map((row, i) => row.map((p, j) => {
    const du = sub(P[Math.min(nu, i + 1)][j], P[Math.max(0, i - 1)][j]);
    const dv = sub(P[i][Math.min(nv, j + 1)], P[i][Math.max(0, j - 1)]);
    return norm(flip ? cross(du, dv) : cross(dv, du));
  }));
  const out = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) {
        out.push(...P[a][b], ...N[a][b], shade(a / nu, b / nv));
      }
    }
  }
  return out;
}

const wobble = (t, seed, amp) => amp * (Math.sin(3 * t + seed) * 0.6 + Math.sin(5 * t + seed * 1.7) * 0.3 + Math.sin(9 * t + seed * 2.3) * 0.15);

// 울퉁불퉁한 언덕 받침: 가장자리는 바닥에 붙고 가운데가 솟는다
function mound(rx, rz, hgt, seed) {
  return surface(10, 48, (u, v) => {
    const r = Math.max(0.03, u);
    const t = v * Math.PI * 2;
    const k = 1 + wobble(t, seed, 0.12);
    const x = rx * r * k * Math.cos(t);
    const z = rz * r * k * Math.sin(t);
    const bump = 1 + 0.18 * Math.sin(x * 9 + seed) * Math.sin(z * 11 - seed);
    return [x, hgt * (1 - r ** 3) ** 0.7 * bump, z];
  }, { wrapV: true, shade: (u) => 0.82 + 0.18 * (1 - u) });
}
const moundHeight = (rx, rz, hgt, x, z) => hgt * (1 - Math.min(1, Math.hypot(x / rx, z / rz)) ** 3) ** 0.7;

// 작은 덤불 (둥근 덩어리)
function bush(r, at) {
  return move(surface(8, 14, (u, v) => {
    const a = u * Math.PI;
    const t = v * Math.PI * 2;
    return [r * Math.sin(a) * Math.cos(t), r * 0.72 * (1 - Math.cos(a)), r * Math.sin(a) * Math.sin(t)];
  }, { wrapV: true, flip: true }), at);
}

// 정점 배열 전체를 옮기고 돌린다
function move(data, at) {
  const T = placer(at);
  const out = [];
  for (let i = 0; i < data.length; i += STRIDE) {
    out.push(...T.p([data[i], data[i + 1], data[i + 2]]), ...T.n([data[i + 3], data[i + 4], data[i + 5]]), data[i + 6]);
  }
  return out;
}

// 회전체 (도적의 망토·머리·모자)
function lathe(profile, at, seg = 28) {
  return move(surface(profile.length - 1, seg, (u, v) => {
    const [r, y] = profile[Math.round(u * (profile.length - 1))];
    const t = v * Math.PI * 2;
    return [r * Math.cos(t), y, r * Math.sin(t)];
  }, { wrapV: true, flip: true }), at);
}

// 마을: 언덕 위 큰 집과 작은 집, 덤불
function SETTLEMENT() {
  const rx = 0.64; const rz = 0.5; const H = 0.14;
  const on = (x, z) => moundHeight(rx, rz, H, x, z) - 0.02;
  return [
    ...mound(rx, rz, H, 1.3),
    ...house(0.42, 0.38, 0.5, 0.3, { x: -0.15, y: on(-0.15, -0.06), z: -0.06, yaw: 0.35 }),
    ...house(0.32, 0.3, 0.36, 0.24, { x: 0.27, y: on(0.27, 0.1), z: 0.1, yaw: -0.5 }, { chimney: false, windows: 1 }),
    ...bush(0.09, { x: 0.02, y: on(0.02, 0.32), z: 0.32 }),
    ...bush(0.07, { x: -0.46, y: on(-0.46, 0.2), z: 0.2 }),
  ];
}

// 도시: 넓은 받침 위 종탑이 있는 교회와 집 세 채
function CITY() {
  const rx = 0.86; const rz = 0.66; const H = 0.18;
  const on = (x, z) => moundHeight(rx, rz, H, x, z) - 0.02;
  const out = [...mound(rx, rz, H, 2.1)];
  // 교회: 긴 본당 + 종탑 + 첨탑
  const church = { x: -0.12, y: on(-0.12, -0.12), z: -0.12, yaw: 0.25 };
  out.push(...house(0.36, 0.42, 0.62, 0.26, church, { chimney: false, windows: 3 }));
  out.push(...flat(boxTris(0.24, 0.78, 0.24).map((t) => t.map(([x, y, z]) => [x, y, z - 0.38])), 1, church));
  out.push(...flat(spireTris(0.3, 0.78, 0.36).map((t) => t.map(([x, y, z]) => [x, y, z - 0.38])), 1, church));
  // 종탑 창문
  for (const zf of [0.121, -0.121]) {
    out.push(...flat(quad([-0.05, 0.5, zf - 0.38], [0.05, 0.5, zf - 0.38], [0.05, 0.66, zf - 0.38], [-0.05, 0.66, zf - 0.38]).map((t) => (zf > 0 ? t : t.slice().reverse())), 0.4, church));
  }
  out.push(...house(0.3, 0.32, 0.34, 0.22, { x: 0.42, y: on(0.42, 0.02), z: 0.02, yaw: -0.4 }));
  out.push(...house(0.26, 0.28, 0.3, 0.2, { x: 0.22, y: on(0.22, 0.38), z: 0.38, yaw: 0.1 }, { windows: 1 }));
  out.push(...house(0.24, 0.26, 0.28, 0.18, { x: -0.48, y: on(-0.48, 0.22), z: 0.22, yaw: 0.6 }, { chimney: false, windows: 1 }));
  out.push(...bush(0.07, { x: 0.55, y: on(0.55, -0.3), z: -0.3 }));
  return out;
}

// 도로: 끝이 둥근 납작한 길바닥 위에 네모 포장 돌을 엇갈려 깔고, 양옆에 연석을 둔다
function ROAD() {
  const L = 1.84; const W = 0.46; const H = 0.1;
  const out = [];
  // 길바닥: 끝이 둥근 판 (옆면은 조금 어둡게, 윗면은 자갈 사이 틈이라 더 어둡게)
  const half = L / 2 - W / 2;
  const outline = (t) => {
    // 둘레를 따라 0~1: 오른쪽 반원 → 위쪽 직선 → 왼쪽 반원 → 아래쪽 직선
    const per = 2 * Math.PI * (W / 2) + 4 * half;
    let d = t * per;
    const arc = Math.PI * (W / 2);
    if (d < arc) { const a = -Math.PI / 2 + d / (W / 2); return [half + (W / 2) * Math.cos(a), (W / 2) * Math.sin(a)]; }
    d -= arc;
    if (d < 2 * half) return [half - d, W / 2];
    d -= 2 * half;
    if (d < arc) { const a = Math.PI / 2 + d / (W / 2); return [-half + (W / 2) * Math.cos(a), (W / 2) * Math.sin(a)]; }
    d -= arc;
    return [-half + d, -W / 2];
  };
  // 옆면: 아래는 바닥, 위 가장자리는 살짝 둥글게
  out.push(...surface(4, 64, (u, v) => {
    const [x, z] = outline(v);
    const inset = u < 0.75 ? 0 : (u - 0.75) * 0.12;
    const k = 1 - inset / (W / 2);
    return [x * (1 - inset / L), Math.min(u, 0.75) / 0.75 * H * 0.9 + (u > 0.75 ? (u - 0.75) * 4 * H * 0.1 : 0), z * k];
  }, { wrapV: true, flip: true, shade: () => 0.82 }));
  // 윗면 (자갈 사이로 보이는 바닥)
  out.push(...surface(1, 64, (u, v) => {
    const [x, z] = outline(v);
    const k = u === 0 ? 0 : 0.97;
    return [x * k, H, z * k];
  }, { wrapV: true, shade: () => 0.5 }));
  // 포장 돌: 두 줄로 엇갈려 깐 납작한 네모 돌 (모서리를 깎아 틈이 보이게)
  const slab = (cx, cz, w, d) => {
    const h = 0.03; const bev = 0.012; const y0 = H - 0.005;
    const tw = w / 2 - bev; const td = d / 2 - bev;
    const P = (x, y, z) => [cx + x, y0 + y, cz + z];
    const top = [P(-tw, h, td), P(tw, h, td), P(tw, h, -td), P(-tw, h, -td)];
    const bot = [P(-w / 2, 0, d / 2), P(w / 2, 0, d / 2), P(w / 2, 0, -d / 2), P(-w / 2, 0, -d / 2)];
    const tris = [...quad(top[0], top[1], top[2], top[3])];
    for (let i = 0; i < 4; i++) tris.push(...quad(bot[i], bot[(i + 1) % 4], top[(i + 1) % 4], top[i]));
    return flat(tris, 1);
  };
  const lane = (W - 0.16) / 2;
  [-lane / 2, lane / 2].forEach((z, ri) => {
    const len = 0.2;
    for (let x = -half - 0.08 + (ri ? len / 2 : 0); x < half + 0.1; x += len) {
      const x0 = Math.max(x, -half - 0.1);
      const x1 = Math.min(x + len, half + 0.1);
      if (x1 - x0 < 0.06) continue;
      // 둥근 끝 안쪽으로 들어가도록 끝 쪽 돌은 폭을 줄인다
      const edge = Math.max(0, Math.abs((x0 + x1) / 2) - half);
      const w = lane - 0.02 - edge * 0.9;
      if (w < 0.05) continue;
      out.push(...slab((x0 + x1) / 2, z, x1 - x0 - 0.022, w));
    }
  });
  // 양옆 돌 턱: 길보다 확실히 높은 연석
  for (const side of [-1, 1]) {
    out.push(...surface(28, 10, (u, v) => {
      const x = (u - 0.5) * (2 * half + 0.1);
      const t = v * Math.PI;
      const lump = 1 + 0.1 * Math.sin(u * 41 + side) * Math.sin(u * 13);
      const r = 0.055 * lump;
      return [x, H + r * 1.3 * Math.sin(t), side * (W / 2 - 0.045) + r * 0.8 * Math.cos(t)];
    }, { flip: side > 0, shade: () => 1 }));
  }
  return out;
}

// 도둑: 모자 쓴 도적 세 명이 모여 선 조각
function ROBBER() {
  const figure = (s) => [[0, 0], [0.16, 0], [0.17, 0.04], [0.15, 0.2], [0.13, 0.36], [0.12, 0.46], [0.09, 0.52], [0.06, 0.55],
    [0.085, 0.57], [0.1, 0.62], [0.1, 0.67], [0.085, 0.72], [0.15, 0.73], [0.16, 0.75], [0.08, 0.76], [0.075, 0.84], [0.04, 0.86], [0, 0.86]].map(([r, y]) => [r * s, y * s]);
  return [
    ...lathe(figure(1.15), { x: 0, z: -0.16 }),
    ...lathe(figure(1.0), { x: -0.2, z: 0.1 }),
    ...lathe(figure(0.9), { x: 0.2, z: 0.12 }),
  ];
}

const VERT = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute float aShade;
uniform mat4 uMVP;
uniform mat3 uRot;
varying vec3 vN;
varying vec3 vP;
varying float vShade;
void main() {
  vN = uRot * aNorm;
  vP = aPos;
  vShade = aShade;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

// 반광택 플라스틱: 부드러운 빛 + 반사, 바닥 가까운 곳과 파인 곳은 어둡게
const FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uLight;
uniform vec3 uView;
uniform float uGloss;
varying vec3 vN;
varying vec3 vP;
varying float vShade;
void main() {
  vec3 n = normalize(vN);
  vec3 l = normalize(uLight);
  vec3 v = normalize(uView);
  float diff = max(dot(n, l), 0.0);
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), 36.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.0);
  float occl = (0.72 + 0.28 * smoothstep(0.0, 0.2, vP.y)) * vShade;
  vec3 col = uColor * (0.5 + 0.62 * diff) * occl + vec3(1.0) * spec * uGloss * vShade;
  col *= 1.0 - 0.12 * rim;
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
    aShade: gl.getAttribLocation(prog, 'aShade'),
    u: { mvp: loc('uMVP'), rot: loc('uRot'), color: loc('uColor'), light: loc('uLight'), view: loc('uView'), gloss: loc('uGloss') },
    buf: gl.createBuffer(),
  };
  gl.enable(gl.DEPTH_TEST);
  return shared;
}

const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

// 모양 하나를 그려 2D 캔버스(그림자 포함)로 돌려준다. yawExtra: 바닥에서 돌린 각도 (도로 방향)
function bake(data, color, { yawExtra = 0, gloss = 0.22 } = {}) {
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
  gl.enableVertexAttribArray(c.aShade);
  gl.vertexAttribPointer(c.aPos, 3, gl.FLOAT, false, STRIDE * 4, 0);
  gl.vertexAttribPointer(c.aNorm, 3, gl.FLOAT, false, STRIDE * 4, 12);
  gl.vertexAttribPointer(c.aShade, 1, gl.FLOAT, false, STRIDE * 4, 24);
  gl.uniformMatrix4fv(c.u.mvp, false, mvp);
  gl.uniformMatrix3fv(c.u.rot, false, rot);
  gl.uniform3fv(c.u.color, hexRGB(color));
  // 빛: 화면 기준 왼쪽 위 앞
  gl.uniform3fv(c.u.light, norm([-0.35, 0.7, 0.7]));
  gl.uniform3fv(c.u.view, [0, 0, 1]);
  gl.uniform1f(c.u.gloss, gloss);
  gl.drawArrays(gl.TRIANGLES, 0, data.length / STRIDE);

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
  for (let i = 0; i < data.length; i += STRIDE) {
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

// 도로를 화면 각도 angle로 보였을 때 길이가 얼마나 짧아 보이는지 (1 = 그대로)
export function roadLength(screenAngle) {
  const se = Math.sin(VIEW.elevation);
  return 1 / Math.sqrt(Math.cos(screenAngle) ** 2 + (Math.sin(screenAngle) / se) ** 2);
}

// ---------- 게임에서 쓰는 그림 캐시 ----------
// 모양은 한 번만 만들고, 색·방향별 그림은 처음 필요할 때 그려 둔다.
const SHAPES = {};
const shape = (name, make) => (SHAPES[name] ||= make());
const sprites = new Map();
let usable = null;

// type: 'settlement' | 'city' | 'road' | 'robber'. WebGL을 못 쓰면 null (예전 2D 그림을 쓴다)
export function pieceSprite(type, colorHex = '#888888', screenAngle = 0) {
  if (usable === null) usable = webglAvailable();
  if (!usable) return null;
  // 도로는 앞뒤가 같으므로 각도를 -90°~90°로 맞춘다
  let angle = screenAngle;
  if (type === 'road') {
    while (angle > Math.PI / 2) angle -= Math.PI;
    while (angle <= -Math.PI / 2) angle += Math.PI;
  }
  const key = type === 'robber' ? 'robber' : `${type}|${colorHex}|${type === 'road' ? Math.round(angle * 100) : ''}`;
  if (!sprites.has(key)) {
    let spr = null;
    try {
      if (type === 'robber') spr = bake(shape('robber', ROBBER), '#3a3a40', { gloss: 0.35 });
      else if (type === 'road') spr = bake(shape('road', ROAD), colorHex, { yawExtra: roadYawFor(angle) });
      else if (type === 'city') spr = bake(shape('city', CITY), colorHex);
      else spr = bake(shape('settlement', SETTLEMENT), colorHex);
    } catch (err) {
      console.warn('말 그림 준비 실패', err);
      usable = false;
      return null;
    }
    if (spr && type === 'road') spr.length = roadLength(angle);
    sprites.set(key, spr);
  }
  return sprites.get(key);
}

// 그림을 (x, y)에 바닥 중심을 맞춰 붙인다. unit: 모양 1단위가 차지할 크기
export function drawSprite(ctx, spr, x, y, unit) {
  const k = unit / spr.unitPx;
  const size = spr.size * k;
  ctx.drawImage(spr.canvas, x - spr.anchor[0] * size, y - spr.anchor[1] * size, size, size);
}

// 아이콘용: 그림에서 말이 있는 부분만 정사각형으로 잘라 낸다
export function spriteIcon(spr, out = 96) {
  const c = spr.canvas;
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width; let y0 = c.height; let x1 = 0; let y1 = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > 140) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const side = Math.max(x1 - x0, y1 - y0) + 8;
  const icon = document.createElement('canvas');
  icon.width = out;
  icon.height = out;
  icon.getContext('2d').drawImage(c, (x0 + x1) / 2 - side / 2, (y0 + y1) / 2 - side / 2, side, side, 0, 0, out, out);
  return icon.toDataURL();
}

// 색 하나에 대한 말 그림 묶음 (미리보기용)
export function bakePieces(colorHex) {
  return {
    settlement: bake(SETTLEMENT(), colorHex),
    city: bake(CITY(), colorHex),
    road: (screenAngle) => bake(ROAD(), colorHex, { yawExtra: roadYawFor(screenAngle) }),
  };
}

export function bakeRobber() {
  return bake(ROBBER(), '#3a3a40', { gloss: 0.35 });
}

export function webglAvailable() {
  try {
    return !!context();
  } catch {
    return false;
  }
}
