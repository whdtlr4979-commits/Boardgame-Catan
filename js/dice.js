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
  [1, ''], [6, 'rotateY(180deg)'], [3, 'rotateY(90deg)'], [4, 'rotateY(-90deg)'], [2, 'rotateX(90deg)'], [5, 'rotateX(-90deg)'],
];
// 값 v가 앞(화면 쪽)을 보게 하는 정육면체 회전 [x, y]
const SHOW = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
// 살짝 위에서 내려다보는 각도: 결과 면과 함께 윗면·옆면이 조금 보인다
const TILT = 'rotateX(-24deg) rotateY(22deg)';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const easeOut = (t) => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;

function makeDie(red, size) {
  const cube = h('div', { class: 'cube' });
  // 둥근 모서리 틈을 메우는 조금 작은 속 정육면체 (면과 겹치거나 서로 교차하지 않는다)
  const inner = size / 2 - 2;
  for (const [, rot] of FACES) cube.append(h('i', { class: 'core', style: { inset: '2px', transform: `${rot} translateZ(${inner}px)` } }));
  for (const [n, rot] of FACES) {
    const face = h('div', { class: 'face', style: { transform: `${rot} translateZ(${size / 2}px)` } });
    for (let i = 0; i < 9; i++) face.append(h('b', { class: PIP_LAYOUT[n].includes(i) ? 'on' : '' }));
    cube.append(face);
  }
  const squash = h('div', { class: 'squash' }, cube);
  const body = h('div', { class: `die3d${red ? ' red' : ''}` }, squash);
  const shadow = h('div', { class: 'die-shadow' });
  return { body, squash, cube, shadow };
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
  const stage = h('div', { class: 'dice-stage', 'aria-hidden': 'true', style: { '--ds': `${size}px` } }, field, total);
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
    d.cube.style.transform = `${TILT} rotateZ(${d.a[2]}deg) rotateX(${d.a[0]}deg) rotateY(${d.a[1]}deg)`;
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
