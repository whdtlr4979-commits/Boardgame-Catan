// 주사위 연출 (모두의 마블 느낌):
// 보드를 비스듬히 내려다보는 카메라 앞으로 모서리가 둥근 카탄 주사위 두 개를 던지면
// 통통 튀며 앞으로 굴러가다 → 결과가 정해지면 그 눈이 윗면으로 오도록 데굴 넘어가 멈추고
// → 착지 순간 화면이 살짝 흔들리며 합계가 크게 튀어나온 뒤 → 위쪽 주사위 자리로 날아간다.
// 주사위는 WebGL로 그려 픽셀마다 빛을 계산하므로 표면이 매끈하고 반짝인다.
// 기기의 '애니메이션 줄이기' 설정과 상관없이 항상 보여 준다.
import { h } from './dom.js';

const PIP_LAYOUT = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function dieEl(n, red = false, extra = '') {
  const d = h('div', { class: `die${red ? ' red' : ''}${extra ? ` ${extra}` : ''}`, 'aria-label': `주사위 ${n}` });
  for (let i = 0; i < 9; i++) d.append(h('i', { class: PIP_LAYOUT[n]?.includes(i) ? 'on' : '' }));
  return d;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const easeOut = (t) => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- 벡터·쿼터니언 (월드 좌표: x 오른쪽, y 위, z 화면 쪽) ----------
const UP = [0, 1, 0];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const norm4 = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return q.map((x) => x / l); };
const qAxis = (axis, angle) => { const s = Math.sin(angle / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)]; };
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
function qSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((x) => -x) : b;
  d = Math.abs(d);
  if (d > 0.9995) return norm4(a.map((x, i) => x + (bb[i] - x) * t));
  const th = Math.acos(d);
  const sa = Math.sin((1 - t) * th) / Math.sin(th);
  const sb = Math.sin(t * th) / Math.sin(th);
  return a.map((x, i) => x * sa + bb[i] * sb);
}
// 쿼터니언 → 3×3 회전 행렬 (행 우선)
function qMat(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}
const rotate = (q, v) => { const m = qMat(q); return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; };
// 두 방향 사이의 가장 짧은 회전
function qBetween(from, to, fallbackAxis) {
  const c = dot(from, to);
  if (c < -0.9999) return qAxis(fallbackAxis, Math.PI);
  const ax = cross(from, to);
  return norm4([ax[0], ax[1], ax[2], 1 + c]);
}

// 눈 → 그 눈이 있는 면의 바깥 방향 (주사위 자체 좌표, 마주 보는 면의 합은 7)
const FACE_NORMAL = { 1: [0, 0, 1], 6: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0], 2: [0, 1, 0], 5: [0, -1, 0] };
// 모서리 둥글기 (반 변 길이 대비)
const ROUND = 0.3;

// ---------- 모서리가 둥근 정육면체 메시 ----------
// 정육면체 겉면의 격자점을 안쪽 상자에서 반지름만큼 밀어내면 매끈한 둥근 상자가 된다.
function roundedBox() {
  const r = ROUND;
  const f = 1 - r;
  const coords = [];
  const R = 8;
  const F = 4;
  for (let k = R; k >= 1; k--) coords.push(-(f + r * Math.tan((k / R) * (Math.PI / 4))));
  for (let k = 0; k <= F; k++) coords.push(-f + (2 * f * k) / F);
  for (let k = 1; k <= R; k++) coords.push(f + r * Math.tan((k / R) * (Math.PI / 4)));
  const n = coords.length;
  const data = [];
  const index = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [1, -1]) {
      const base = data.length / 6;
      const a1 = (axis + 1) % 3;
      const a2 = (axis + 2) % 3;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const p = [0, 0, 0];
          p[axis] = sign;
          p[a1] = coords[i];
          p[a2] = coords[j];
          const inner = p.map((x) => Math.max(-f, Math.min(f, x)));
          const nv = norm([p[0] - inner[0], p[1] - inner[1], p[2] - inner[2]]);
          data.push(inner[0] + nv[0] * r, inner[1] + nv[1] * r, inner[2] + nv[2] * r, nv[0], nv[1], nv[2]);
        }
      }
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - 1; j++) {
          const v = base + i * n + j;
          index.push(v, v + n, v + 1, v + 1, v + n, v + n + 1);
        }
      }
    }
  }
  return { data: new Float32Array(data), index: new Uint16Array(index) };
}

const VERT = `
attribute vec3 aPos;
attribute vec3 aNorm;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform vec2 uOffset;
uniform vec3 uEye;
uniform float uViewScale;
varying vec3 vView;
varying vec3 vNormal;
varying vec3 vLocal;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  // 눈까지의 방향은 정점에서 작게 줄여 넘긴다: 화면 픽셀 단위 그대로면 휴대폰 GPU의
  // 낮은 정밀도(mediump)에서 길이 계산이 넘쳐 주사위가 까맣게 칠해진다
  vView = (uEye - w.xyz) * uViewScale;
  vNormal = uNormalMat * aNorm;
  vLocal = aPos;
  gl_Position = uViewProj * w;
  gl_Position.xy += uOffset * gl_Position.w;
}`;

// 눈은 면 좌표에서 계산해 그린다 (오목하게 파인 느낌), 빛은 픽셀마다 Blinn-Phong + 가장자리 반사
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 uBase;
uniform vec3 uPip;
uniform vec3 uLight;
varying vec3 vView;
varying vec3 vNormal;
varying vec3 vLocal;
void main() {
  vec3 a = abs(vLocal);
  vec2 uv;
  float value;
  if (a.z >= a.x && a.z >= a.y) { uv = vLocal.xy; value = vLocal.z > 0.0 ? 1.0 : 6.0; }
  else if (a.x >= a.y) { uv = vLocal.zy; value = vLocal.x > 0.0 ? 3.0 : 4.0; }
  else { uv = vLocal.xz; value = vLocal.y > 0.0 ? 2.0 : 5.0; }
  float spread = 0.48;
  float pr = 0.155;
  vec2 g = clamp(floor(uv / spread + 0.5), -1.0, 1.0);
  vec2 d = uv - g * spread;
  float on = 0.0;
  if (g.x == 0.0 && g.y == 0.0) on = mod(value, 2.0);
  else if (g.x * g.y > 0.0) on = value >= 2.0 ? 1.0 : 0.0;
  else if (g.x * g.y < 0.0) on = value >= 4.0 ? 1.0 : 0.0;
  else if (g.y == 0.0) on = value == 6.0 ? 1.0 : 0.0;
  float dist = length(d);
  float pip = on * (1.0 - smoothstep(pr - 0.012, pr + 0.008, dist));
  // 파인 홈: 한쪽 가장자리는 그늘, 반대쪽은 빛이 맺힌다
  float dimple = clamp(dot(d / pr, vec2(-0.6, 0.8)), -1.0, 1.0);
  vec3 pipCol = uPip * (0.8 - 0.22 * dimple) + vec3(0.16) * smoothstep(0.55, 0.95, -dimple) * smoothstep(pr, pr * 0.5, dist);
  vec3 base = mix(uBase, pipCol, pip);

  vec3 n = normalize(vNormal);
  vec3 l = normalize(uLight);
  vec3 v = normalize(vView);
  vec3 hv = normalize(l + v);
  float diff = max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, hv), 0.0), 70.0);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 col = base * (0.4 + 0.72 * diff) + vec3(1.0) * spec * 0.6 * (1.0 - 0.6 * pip) + vec3(1.0, 0.97, 0.9) * fres * 0.18;
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}`;

// ---------- 카메라 (보드를 비스듬히 내려다본다) ----------
const PITCH = 56 * (Math.PI / 180);
const FOV = 28 * (Math.PI / 180);

function makeCamera(W, H, cx, cy) {
  // 바닥 중심에서 월드 1단위 ≈ 화면 1픽셀이 되도록 거리를 정한다
  const dist = (H / 2) / Math.tan(FOV / 2);
  const eye = [0, Math.sin(PITCH) * dist, Math.cos(PITCH) * dist];
  // 뷰 행렬 (열 우선)
  const zA = norm(eye);
  const xA = norm(cross(UP, zA));
  const yA = cross(zA, xA);
  const view = [xA[0], yA[0], zA[0], 0, xA[1], yA[1], zA[1], 0, xA[2], yA[2], zA[2], 0, -dot(xA, eye), -dot(yA, eye), -dot(zA, eye), 1];
  const near = dist * 0.3;
  const far = dist * 3;
  const fy = 1 / Math.tan(FOV / 2);
  const proj = [fy / (W / H), 0, 0, 0, 0, fy, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const viewProj = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) viewProj[c * 4 + r] = [0, 1, 2, 3].reduce((acc, k) => acc + proj[k * 4 + r] * view[c * 4 + k], 0);
  // 바닥 중심(월드 원점)이 화면의 (cx, cy)에 오도록 옮긴다
  const offset = [(cx - W / 2) / (W / 2), -(cy - H / 2) / (H / 2)];
  // 월드 점 → 화면 [x, y, 원근 배율]
  const project = (p) => {
    const m = viewProj;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [((x / w + offset[0] + 1) / 2) * W, ((1 - (y / w + offset[1])) / 2) * H, dist / w];
  };
  return { eye, viewProj, offset, project };
}

function createRenderer(canvas, W, H, camera) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  let gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) || canvas.getContext('experimental-webgl');
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  try {
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    console.warn('주사위 WebGL 준비 실패', err);
    return null;
  }
  const mesh = roundedBox();
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);
  gl.useProgram(prog);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aNorm = gl.getAttribLocation(prog, 'aNorm');
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aNorm);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 24, 12);
  const u = (name) => gl.getUniformLocation(prog, name);
  const loc = { viewProj: u('uViewProj'), model: u('uModel'), normalMat: u('uNormalMat'), offset: u('uOffset'), base: u('uBase'), pip: u('uPip'), light: u('uLight'), eye: u('uEye'), viewScale: u('uViewScale') };
  gl.uniformMatrix4fv(loc.viewProj, false, new Float32Array(camera.viewProj));
  gl.uniform2fv(loc.offset, camera.offset);
  // 빛은 왼쪽 위 앞쪽에서 온다
  gl.uniform3fv(loc.light, norm([-0.35, 1, 0.75]));
  gl.uniform3fv(loc.eye, camera.eye);
  gl.uniform1f(loc.viewScale, 1 / Math.hypot(...camera.eye));
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);

  return {
    draw(dice, half) {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      for (const d of dice) {
        const R = qMat(d.q);
        // 착지할 때 바닥 쪽으로 눌렸다 펴지는 찌그러짐 (세로로 눌리면 옆으로 퍼진다)
        const sq = [1 + (1 - d.squash) * 0.5, d.squash, 1 + (1 - d.squash) * 0.5];
        // 모델 행렬 = 이동 · 찌그러짐 · 회전 · 크기 (열 우선)
        const M = new Float32Array(16);
        for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) M[c * 4 + r] = sq[r] * R[r * 3 + c] * half;
        M[12] = d.pos[0];
        M[13] = d.pos[1];
        M[14] = d.pos[2];
        M[15] = 1;
        const N = new Float32Array(9);
        for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) N[c * 3 + r] = R[r * 3 + c] / sq[r];
        gl.uniformMatrix4fv(loc.model, false, M);
        gl.uniformMatrix3fv(loc.normalMat, false, N);
        gl.uniform3fv(loc.base, d.colors.base);
        gl.uniform3fv(loc.pip, d.colors.pip);
        gl.drawElements(gl.TRIANGLES, mesh.index.length, gl.UNSIGNED_SHORT, 0);
      }
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

// 실제 카탄 주사위: 노란 주사위에 빨간 눈, 빨간 주사위에 노란 눈
const COLORS = [
  { base: [0.95, 0.74, 0.16], pip: [0.78, 0.11, 0.08] },
  { base: [0.8, 0.13, 0.09], pip: [1, 0.84, 0.27] },
];

// 굴리기 시작. land(값)로 결과를 정하면 그 눈이 윗면으로 오게 멈춰 보여 준 뒤 날려 보내고 끝난다.
export function startRoll({ speed = 1, target = '#dice', over = '#board' } = {}) {
  // 보드 중 지금 화면에 보이는 부분 안에서 굴린다 (스크롤돼 있어도 합계가 잘리지 않게)
  const rect = document.querySelector(over)?.getBoundingClientRect();
  const W = window.innerWidth;
  const H = window.innerHeight;
  const visible = rect && rect.width > 0 && Math.min(rect.bottom, H) - Math.max(rect.top, 0) > 160;
  const top = visible ? Math.max(rect.top, 0) : 0;
  const bottom = visible ? Math.min(rect.bottom, H) : H;
  const area = visible ? { left: rect.left, width: rect.width, bottom } : { left: 0, width: W, bottom: H };
  const size = Math.round(Math.min(84, Math.max(52, area.width * 0.115)));
  const half = size / 2;
  const cx = area.left + area.width / 2;
  // 주사위 위에 합계가 들어갈 자리를 남긴다
  const cy = Math.min(Math.max((top + bottom) / 2 + size * 0.45, top + size * 2.4), bottom - size * 0.9);

  const canvas = h('canvas', { class: 'dice-gl' });
  const field = h('div', { class: 'dice-field' });
  const total = h('div', { class: 'dice-total' }, h('span', { class: 'rays' }), h('b'), h('small'));
  const stage = h('div', { class: 'dice-stage', 'aria-hidden': 'true' }, field, total);
  stage.style.setProperty('--ds', `${size}px`);
  stage.style.setProperty('--cx', `${cx}px`);
  stage.style.setProperty('--cy', `${cy}px`);

  const camera = makeCamera(W, H, cx, cy);
  const renderer = createRenderer(canvas, W, H, camera);

  const rnd = (a, b) => a + Math.random() * (b - a);
  // 화면 아래쪽(보는 사람 쪽)에서 던져 보드 안쪽으로 굴러간다
  const zStart = Math.max(size * 2.5, (Math.min(area.bottom, H) + size - cy) / Math.sin(PITCH));
  const dice = COLORS.map((colors, i) => {
    const side = i ? 1 : -1;
    const start = [side * size * rnd(0.4, 1.1), 0, zStart];
    const mid = [side * size * rnd(0.55, 1.0), 0, -size * rnd(0.2, 0.6)];
    const dir = norm([mid[0] - start[0], 0, mid[2] - start[2]]);
    // 앞으로 구르는 축 (위쪽 × 나아가는 방향, 조금 비틀어 자연스럽게)
    const axis = norm([dir[2] + rnd(-0.3, 0.3), rnd(-0.25, 0.25), -dir[0] + rnd(-0.3, 0.3)]);
    const shadow = h('div', { class: 'die-shadow' });
    field.append(shadow);
    return {
      colors,
      shadow,
      start,
      mid,
      rest: [side * size * 0.78, 0, 0],
      pos: start.slice(),
      q: norm4([rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)]),
      axis,
      omega: rnd(13, 17),
      hops: rnd(2.2, 2.6),
      squash: 1,
    };
  });
  field.append(canvas);

  // 둥근 상자가 바닥에 닿을 때 중심 높이 (기울어진 만큼 높아진다)
  const restHeight = (q) => {
    const m = qMat(q);
    return half * ((1 - ROUND) * (Math.abs(m[3]) + Math.abs(m[4]) + Math.abs(m[5])) + ROUND);
  };

  // WebGL을 쓸 수 없는 기기: 평면 주사위로 대신 보여 준다
  const flat = renderer ? null : dice.map((d, i) => {
    const el = dieEl(1 + Math.floor(Math.random() * 6), i === 1, 'fallback');
    field.append(el);
    return el;
  });

  const draw = () => {
    for (const d of dice) {
      const g = camera.project([d.pos[0], 0, d.pos[2]]);
      const lift = Math.max(0, d.pos[1] - half);
      const k = Math.max(0.35, 1 - lift / (size * 3.5));
      d.shadow.style.transform = `translate(${g[0] + lift * 0.18}px, ${g[1] + size * 0.06}px) scale(${g[2] * k})`;
      d.shadow.style.opacity = String(0.6 * k);
    }
    if (renderer) renderer.draw(dice, half);
    else {
      dice.forEach((d, i) => {
        const p = camera.project(d.pos);
        const x = rotate(d.q, [1, 0, 0]);
        flat[i].style.transform = `translate(${p[0] - 31}px, ${p[1] - 31}px) rotate(${Math.atan2(x[2], x[0])}rad)`;
      });
    }
  };

  const throwMs = Math.round(850 * speed);
  const settleMs = Math.round(620 * speed);
  const lift0 = size * 1.6;
  let phase = 'throw';
  let t0 = performance.now();
  let last = t0;
  let raf = 0;
  let done = false;
  let settled = null;
  let landedAt = 0;

  const frame = (now) => {
    if (done) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now - t0;
    for (const d of dice) {
      if (phase === 'throw') {
        const p = Math.min(1, t / throwMs);
        const e = easeOut(p);
        d.pos[0] = lerp(d.start[0], d.mid[0], e);
        d.pos[2] = lerp(d.start[2], d.mid[2], e);
        // 앞으로 구르며 데굴데굴 (튈수록 느려진다)
        const spin = p < 1 ? 1 - 0.45 * p : 0.55;
        d.q = norm4(qMul(qAxis(d.axis, d.omega * spin * dt), d.q));
        // 떨어지며 통통 튀는 높이; 결과를 기다리는 동안은 제자리에서 작게 들썩인다
        const bounce = p < 1 ? lift0 * (1 - p) ** 1.4 * Math.abs(Math.cos(Math.PI * d.hops * p)) : size * 0.08 * Math.abs(Math.sin((t - throwMs) / 85));
        d.pos[1] = restHeight(d.q) + bounce;
      } else if (phase === 'settle') {
        const u = Math.min(1, t / settleMs);
        const e = easeOut(u);
        d.pos[0] = lerp(d.from[0], d.rest[0], e);
        d.pos[2] = lerp(d.from[2], d.rest[2], e);
        // 돌던 방향으로 계속 구르다 서서히 멈추면서, 결과 눈이 윗면에 오도록 조금씩 바로잡는다
        const spun = qMul(qAxis(d.axis, d.spinTotal * (1 - (1 - u) ** 3)), d.q0);
        d.q = norm4(qMul(qSlerp([0, 0, 0, 1], d.fix, e), spun));
        const hop = d.fromHop * (1 - u) ** 2 + size * 0.42 * Math.sin(Math.PI * Math.min(1, u * 1.25)) * (1 - u);
        d.pos[1] = restHeight(d.q) + hop;
      } else if (phase === 'rest') {
        // 쿵! 눌렸다 펴진다
        const u = Math.min(1, (now - landedAt) / 340);
        d.squash = u < 0.35 ? 1 - 0.16 * Math.sin((u / 0.35) * (Math.PI / 2)) : 0.84 + 0.16 * easeOut((u - 0.35) / 0.65) + 0.05 * Math.sin(((u - 0.35) / 0.65) * Math.PI);
        d.pos[1] = restHeight(d.q) * d.squash;
      }
    }
    draw();
    if (phase === 'settle' && t >= settleMs) {
      phase = 'rest';
      landedAt = now;
      settled?.();
    }
    if (phase === 'rest' && now - landedAt > 360) {
      for (const d of dice) {
        d.squash = 1;
        d.pos[1] = restHeight(d.q);
      }
      draw();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  document.body.append(stage);
  for (const d of dice) d.pos[1] = restHeight(d.q) + lift0;
  draw();
  requestAnimationFrame(() => stage.classList.add('show'));
  raf = requestAnimationFrame(frame);

  const cleanup = () => {
    done = true;
    cancelAnimationFrame(raf);
    renderer?.destroy();
    stage.remove();
  };

  return {
    // 최소 굴림 시간 (호출하는 쪽에서 기다린다)
    tumbleMs: throwMs,
    async land(values) {
      if (done) return;
      dice.forEach((d, i) => {
        d.from = d.pos.slice();
        d.fromHop = Math.max(0, d.pos[1] - restHeight(d.q));
        d.q0 = d.q;
        // 지금 구르는 속도로 계속 구르다 서서히 멈출 때까지 도는 양
        d.spinTotal = ((d.omega * 0.55 * settleMs) / 1000 / 3) * 2.2;
        const ended = qMul(qAxis(d.axis, d.spinTotal), d.q0);
        // 그 자세에서 결과 눈의 면을 위로 세우는 가장 짧은 회전을 함께 섞는다
        d.fix = qBetween(rotate(ended, FACE_NORMAL[values[i]]), UP, d.axis);
        if (flat) {
          const el = dieEl(values[i], i === 1, 'fallback');
          flat[i].replaceWith(el);
          flat[i] = el;
        }
      });
      await new Promise((resolve) => {
        settled = resolve;
        phase = 'settle';
        t0 = performance.now();
      });
      if (done) return;
      // 착지: 화면이 살짝 흔들리고 합계가 튀어나온다
      stage.classList.add('thud');
      const sum = values[0] + values[1];
      const mid = camera.project([(dice[0].rest[0] + dice[1].rest[0]) / 2, size * 2.7, 0]);
      total.style.left = `${mid[0]}px`;
      total.style.top = `${mid[1]}px`;
      total.querySelector('b').textContent = String(sum);
      total.querySelector('small').textContent = sum === 7 ? '도둑!' : '';
      total.classList.toggle('seven', sum === 7);
      total.classList.add('show');
      await wait(Math.round(850 * speed));
      if (done) return;
      // 위쪽 주사위 자리로 날아간다
      const dest = document.querySelector(target)?.getBoundingClientRect();
      if (dest && dest.width > 0) {
        const [mx, my] = camera.project([(dice[0].rest[0] + dice[1].rest[0]) / 2, half, 0]);
        const scale = Math.max(0.2, dest.height / size);
        field.style.transformOrigin = `${mx}px ${my}px`;
        field.style.transition = `transform ${Math.round(450 * speed)}ms cubic-bezier(0.55, 0, 0.3, 1), opacity ${Math.round(450 * speed)}ms ease-in`;
        field.style.transform = `translate(${dest.left + dest.width / 2 - mx}px, ${dest.top + dest.height / 2 - my}px) scale(${scale})`;
        field.style.opacity = '0.4';
        total.classList.remove('show');
        stage.classList.add('leaving');
        await wait(Math.round(460 * speed));
      } else {
        stage.classList.remove('show');
        await wait(200);
      }
      cleanup();
    },
    cancel: cleanup,
  };
}
