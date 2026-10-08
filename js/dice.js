// 주사위 연출 (모두의 마블 느낌):
// 입체 주사위 두 개를 보드 아래쪽에서 던지면 통통 튀며 굴러오고 → 결과가 정해지면 그 면이 보이게 멈춘 뒤
// 착지 순간 화면이 살짝 흔들리고 합계가 크게 튀어나온다 → 위쪽 주사위 자리로 날아간다.
// 기기의 '애니메이션 줄이기' 설정과 상관없이 항상 보여 준다.
import { h } from './dom.js';

const PIP_LAYOUT = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function dieEl(n, red = false, extra = '') {
  const d = h('div', { class: `die${red ? ' red' : ''}${extra ? ` ${extra}` : ''}`, 'aria-label': `주사위 ${n}` });
  for (let i = 0; i < 9; i++) d.append(h('i', { class: PIP_LAYOUT[n]?.includes(i) ? 'on' : '' }));
  return d;
}

// 정육면체 면 배치: 앞 1, 뒤 6, 오른쪽 3, 왼쪽 4, 위 2, 아래 5 (마주 보는 면의 합은 7)
const FACES = [
  [1, '', [0, 0, 1]], [6, 'rotateY(180deg)', [0, 0, -1]], [3, 'rotateY(90deg)', [1, 0, 0]],
  [4, 'rotateY(-90deg)', [-1, 0, 0]], [2, 'rotateX(90deg)', [0, -1, 0]], [5, 'rotateX(-90deg)', [0, 1, 0]],
];
// 값 v가 앞(화면 쪽)을 보게 하는 정육면체 회전 [x, y]
const SHOW = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
// 살짝 위에서 내려다보는 각도: 결과 면과 함께 윗면·옆면이 조금 보인다
const TILT_X = -24;
const TILT_Y = 22;
// 둥근 모서리: 반지름(반 변 길이 대비)과 둥근 부분을 나누는 조각 수
const ROUND = 0.32;
const SEG = 6;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const easeOut = (t) => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- 3차원 계산 (CSS와 같은 좌표: x 오른쪽, y 아래, z 화면 쪽) ----------
const RAD = Math.PI / 180;
const rotX = (d) => { const c = Math.cos(d * RAD); const s = Math.sin(d * RAD); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = (d) => { const c = Math.cos(d * RAD); const s = Math.sin(d * RAD); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (d) => { const c = Math.cos(d * RAD); const s = Math.sin(d * RAD); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
function mul(A, B) {
  const C = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return C;
}
const apply = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const add = (...vs) => [0, 1, 2].map((i) => vs.reduce((acc, v) => acc + v[i], 0));
const scale = (v, k) => v.map((x) => x * k);
const TILT_M = mul(rotX(TILT_X), rotY(TILT_Y));
// 빛은 보는 사람 쪽 조금 위에서 온다 (결과가 보이는 앞면이 가장 밝게)
const LIGHT = norm([0.05, -0.4, 0.92]);
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

// 모서리가 둥근 정육면체 (반 변 길이 1): 평평한 면 6개 + 모서리 원기둥 12개 + 꼭짓점 구 조각 8개
function buildMesh() {
  const r = ROUND;
  const flat = 1 - r;
  const polys = [];
  const faces = [];
  const E = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const [value, , n] of FACES) {
    const k = n.findIndex((x) => x !== 0);
    const u = E[(k + 1) % 3];
    const v = cross(n, u);
    const c = scale(n, 1);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(c, scale(u, a * flat), scale(v, b * flat)));
    const face = { pts, n, value, u, v, c };
    polys.push(face);
    faces.push(face);
  }
  // 모서리: 두 축(i, j) 방향 사이를 SEG개의 띠로 나눈 4분의 1 원기둥
  const radial = (i, j, si, sj, t) => { const d = [0, 0, 0]; d[i] = si * Math.cos(t); d[j] = sj * Math.sin(t); return d; };
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const k = 3 - i - j;
      for (const si of [-1, 1]) {
        for (const sj of [-1, 1]) {
          const axis = [0, 0, 0];
          axis[i] = si * flat;
          axis[j] = sj * flat;
          for (let m = 0; m < SEG; m++) {
            const t0 = (m / SEG) * Math.PI / 2;
            const t1 = ((m + 1) / SEG) * Math.PI / 2;
            const d0 = radial(i, j, si, sj, t0);
            const d1 = radial(i, j, si, sj, t1);
            const ends = [-flat, flat].map((z) => { const e = [0, 0, 0]; e[k] = z; return e; });
            polys.push({
              pts: [add(axis, scale(d0, r), ends[0]), add(axis, scale(d1, r), ends[0]), add(axis, scale(d1, r), ends[1]), add(axis, scale(d0, r), ends[1])],
              n: norm(add(d0, d1)),
            });
          }
        }
      }
    }
  }
  // 꼭짓점: 구의 8분의 1을 삼각형으로 나눈다 (경계가 모서리 띠와 정확히 맞도록 각도를 고르게)
  const S = (x) => Math.sin((x / SEG) * Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const center = [sx * flat, sy * flat, sz * flat];
        const dir = (a, b) => norm([sx * S(a), sy * S(b), sz * S(SEG - a - b)]);
        const vert = (a, b) => add(center, scale(dir(a, b), r));
        for (let a = 0; a < SEG; a++) {
          for (let b = 0; b < SEG - a; b++) {
            const tris = [[[a, b], [a + 1, b], [a, b + 1]]];
            if (b < SEG - a - 1) tris.push([[a + 1, b], [a + 1, b + 1], [a, b + 1]]);
            for (const tri of tris) {
              polys.push({ pts: tri.map(([p, q]) => vert(p, q)), n: norm(add(...tri.map(([p, q]) => dir(p, q)))) });
            }
          }
        }
      }
    }
  }
  return { polys, faces };
}
const MESH = buildMesh();
const PIP_POS = [-1, 0, 1];

function makeDie(red, size) {
  const canvas = h('canvas', { class: 'die-canvas' });
  const box = size * 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(box * dpr);
  canvas.height = Math.round(box * dpr);
  canvas.style.width = `${box}px`;
  canvas.style.height = `${box}px`;
  const ctx = canvas.getContext('2d');
  const squash = h('div', { class: 'squash' }, canvas);
  const body = h('div', { class: `die3d${red ? ' red' : ' yellow'}` }, squash);
  const shadow = h('div', { class: 'die-shadow' });
  // 실제 카탄 주사위: 노란 주사위에 빨간 눈, 빨간 주사위에 노란 눈
  const colors = red ? { base: [204, 40, 30], pip: [255, 214, 70] } : { base: [244, 192, 44], pip: [196, 34, 26] };
  return { body, squash, canvas, ctx, shadow, colors, box, dpr, size };
}

// 회전 각도에 맞춰 둥근 주사위를 그린다 (볼록한 물체라 뒤를 향한 조각만 빼면 겹치지 않는다)
function render(d) {
  const { ctx, box, dpr, size, colors } = d;
  const M = mul(TILT_M, mul(rotZ(d.a[2]), mul(rotX(d.a[0]), rotY(d.a[1]))));
  const s = size / 2;
  const f = size * 8; // CSS perspective와 같은 거리
  const proj = (p) => {
    const w = apply(M, p);
    const k = f / (f - w[2] * s);
    return [box / 2 + w[0] * s * k, box / 2 + w[1] * s * k, w];
  };
  const tone = (base, n, dim = 1) => {
    const diff = Math.max(0, dot(n, LIGHT));
    const spec = Math.max(0, dot(n, HALF)) ** 28;
    const c = base.map((x) => Math.min(255, Math.round(x * (0.42 + 0.68 * diff) * dim + 255 * 0.42 * spec)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, box, box);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.7;
  for (const poly of MESH.polys) {
    const nw = apply(M, poly.n);
    const pts = poly.pts.map(proj);
    const c = pts[0][2];
    // 눈(카메라)에서 조각으로 가는 방향과 법선이 마주 볼 때만 그린다
    if (dot(nw, [-c[0] * s, -c[1] * s, f - c[2] * s]) <= 0) continue;
    const col = tone(colors.base, nw);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.strokeStyle = col; // 이웃 조각 사이 머리카락 같은 틈을 덮는다
    ctx.fill();
    ctx.stroke();
    if (!poly.value) continue;
    // 눈: 면 위의 원을 투영해 그린다 (오목한 느낌으로 아래쪽을 조금 밝게)
    const pipDim = tone(colors.pip, nw, 0.82);
    const pipLit = tone(colors.pip, nw, 1.08);
    const spread = (1 - ROUND) * 0.66;
    const pr = 0.17;
    PIP_LAYOUT[poly.value].forEach((cell) => {
      const cx = PIP_POS[cell % 3] * spread;
      const cy = PIP_POS[Math.floor(cell / 3)] * spread;
      for (const [color, off, rr] of [[pipDim, 0, pr], [pipLit, 0.03, pr * 0.62]]) {
        ctx.beginPath();
        for (let q = 0; q < 16; q++) {
          const t = (q / 16) * Math.PI * 2;
          const p = add(poly.c, scale(poly.u, cx + Math.cos(t) * rr + off), scale(poly.v, cy + Math.sin(t) * rr + off), scale(poly.n, 0.001));
          const [x, y] = proj(p);
          if (q) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
    });
  }
}

// 지금 각도 a에서 같은 방향으로 최소 270도 더 돈 뒤 target(mod 360)에 멈추는 각도
function finalAngle(a, target, dir) {
  return dir >= 0
    ? target + 360 * Math.ceil((a + 270 - target) / 360)
    : target + 360 * Math.floor((a - 270 - target) / 360);
}

// 굴리기 시작. land(값)로 결과를 정하면 그 면으로 멈춰 보여 준 뒤 날려 보내고 끝난다.
export function startRoll({ speed = 1, target = '#dice', over = '#board' } = {}) {
  // 보드 중 지금 화면에 보이는 부분 안에서 굴린다 (스크롤돼 있어도 합계가 잘리지 않게)
  const rect = document.querySelector(over)?.getBoundingClientRect();
  const vh = window.innerHeight;
  const visible = rect && rect.width > 0 && Math.min(rect.bottom, vh) - Math.max(rect.top, 0) > 160;
  const top = visible ? Math.max(rect.top, 0) : 0;
  const bottom = visible ? Math.min(rect.bottom, vh) : vh;
  const area = visible ? { left: rect.left, width: rect.width, height: bottom - top, bottom } : { left: 0, width: window.innerWidth, height: vh, bottom: vh };
  const size = Math.round(Math.min(80, Math.max(50, area.width * 0.11)));
  const cx = area.left + area.width / 2;
  // 주사위 위에 합계가 들어갈 자리를 남긴다
  const cy = Math.min(Math.max((top + bottom) / 2 + size * 0.35, top + size * 2.3), bottom - size * 0.9);
  const lift = Math.min(area.height * 0.32, 190);

  const field = h('div', { class: 'dice-field' });
  const total = h('div', { class: 'dice-total' }, h('span', { class: 'rays' }), h('b'), h('small'));
  const stage = h('div', { class: 'dice-stage', 'aria-hidden': 'true' }, field, total);
  // CSS 변수는 style 객체로는 안 들어가므로 setProperty로 넣는다 (면 위치 계산과 상자 크기가 같아야 꽉 찬 정육면체가 된다)
  stage.style.setProperty('--ds', `${size}px`);
  stage.style.setProperty('--cx', `${cx}px`);
  stage.style.setProperty('--cy', `${cy}px`);
  total.style.left = `${cx}px`;
  total.style.top = `${cy - size * 1.35}px`;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const enterY = Math.min(area.bottom + size, window.innerHeight + size * 0.5);
  const dice = [false, true].map((red, i) => {
    const side = i ? 1 : -1;
    const el = makeDie(red, size);
    field.append(el.shadow, el.body);
    return {
      ...el,
      start: [cx + side * size * rnd(0.3, 1.1), enterY],
      mid: [cx + side * size * rnd(0.55, 0.95), cy + size * rnd(-0.1, 0.35)],
      rest: [cx + side * size * 0.72, cy + size * 0.12],
      x: 0, y: 0, z: 0,
      a: [rnd(0, 360), rnd(0, 360), rnd(0, 360)],
      w: [rnd(520, 760) * (Math.random() < 0.5 ? -1 : 1), rnd(480, 720) * (Math.random() < 0.5 ? -1 : 1), rnd(-160, 160)],
      hops: rnd(2.1, 2.5),
    };
  });

  const throwMs = Math.round(800 * speed);
  const settleMs = Math.round(560 * speed);
  let phase = 'throw';
  let t0 = performance.now();
  let last = t0;
  let raf = 0;
  let done = false;
  let settled = null;

  const draw = (d) => {
    const s = 1 + d.z / 280;
    d.body.style.transform = `translate(${d.x}px, ${d.y - d.z}px) scale(${s})`;
    render(d);
    const k = Math.max(0.35, 1 - d.z / 260);
    d.shadow.style.transform = `translate(${d.x + d.z * 0.22}px, ${d.y + size * 0.42}px) scale(${k})`;
    d.shadow.style.opacity = String(0.55 * k);
  };

  const frame = (now) => {
    if (done) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now - t0;
    for (const d of dice) {
      if (phase === 'throw') {
        const p = Math.min(1, t / throwMs);
        const e = easeOut(p);
        d.x = lerp(d.start[0], d.mid[0], e);
        d.y = lerp(d.start[1], d.mid[1], e);
        // 떨어지며 튀는 높이 (튈수록 낮아진다)
        d.z = p < 1 ? lift * (1 - p) ** 1.4 * Math.abs(Math.cos(Math.PI * d.hops * p)) : 0;
        const spin = p < 1 ? 1 - 0.45 * p : 0.55;
        for (let i = 0; i < 3; i++) d.a[i] += d.w[i] * spin * dt;
        if (p >= 1) {
          // 결과를 기다리는 동안 제자리에서 작게 통통 구른다
          d.z = 6 * Math.abs(Math.sin((t - throwMs) / 85));
        }
      } else if (phase === 'settle') {
        const u = Math.min(1, t / settleMs);
        const e = easeOut(u);
        d.x = lerp(d.from[0], d.rest[0], e);
        d.y = lerp(d.from[1], d.rest[1], e);
        d.z = d.fromZ * (1 - u) ** 2 + size * 0.28 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1 - u);
        for (let i = 0; i < 3; i++) d.a[i] = lerp(d.fromA[i], d.toA[i], e);
      }
      draw(d);
    }
    if (phase === 'settle' && t >= settleMs) {
      phase = 'rest';
      settled?.();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  document.body.append(stage);
  for (const d of dice) {
    d.x = d.start[0];
    d.y = d.start[1];
    d.z = lift;
    draw(d);
  }
  requestAnimationFrame(() => stage.classList.add('show'));
  raf = requestAnimationFrame(frame);

  const cleanup = () => {
    done = true;
    cancelAnimationFrame(raf);
    stage.remove();
  };

  return {
    // 최소 굴림 시간 (호출하는 쪽에서 기다린다)
    tumbleMs: throwMs,
    async land(values) {
      if (done) return;
      // 결과 면이 앞을 보도록 멈출 각도를 정하고 마지막으로 한 번 튀며 내려앉는다
      dice.forEach((d, i) => {
        const [tx, ty] = SHOW[values[i]];
        d.from = [d.x, d.y];
        d.fromZ = d.z;
        d.fromA = d.a.slice();
        d.toA = [finalAngle(d.a[0], tx, d.w[0]), finalAngle(d.a[1], ty, d.w[1]), d.a[2] + Math.sign(d.w[2] || 1) * rnd(60, 140)];
        d.toA[2] = Math.round(d.toA[2] / 360) * 360 + rnd(-12, 12);
      });
      await new Promise((resolve) => {
        settled = resolve;
        phase = 'settle';
        t0 = performance.now();
      });
      if (done) return;
      // 쿵! 착지: 화면이 살짝 흔들리고 주사위가 눌렸다 펴진다
      stage.classList.add('thud');
      for (const d of dice) d.squash.classList.add('landed');
      const sum = values[0] + values[1];
      total.querySelector('b').textContent = String(sum);
      total.querySelector('small').textContent = sum === 7 ? '도둑!' : '';
      total.classList.toggle('seven', sum === 7);
      total.classList.add('show');
      await wait(Math.round(820 * speed));
      if (done) return;
      // 위쪽 주사위 자리로 날아간다
      const dest = document.querySelector(target)?.getBoundingClientRect();
      if (dest && dest.width > 0) {
        const mx = (dice[0].rest[0] + dice[1].rest[0]) / 2;
        const my = (dice[0].rest[1] + dice[1].rest[1]) / 2;
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
