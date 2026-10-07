// 주사위 연출: 화면 가운데에서 굴리고 → 결과를 보여 주고 → 위쪽 주사위 자리로 날려 보낸다
import { h } from './dom.js';

const PIP_LAYOUT = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function dieEl(n, red = false, extra = '') {
  const d = h('div', { class: `die${red ? ' red' : ''}${extra ? ` ${extra}` : ''}`, 'aria-label': `주사위 ${n}` });
  for (let i = 0; i < 9; i++) d.append(h('i', { class: PIP_LAYOUT[n]?.includes(i) ? 'on' : '' }));
  return d;
}

function setFace(die, n) {
  [...die.children].forEach((pip, i) => pip.classList.toggle('on', PIP_LAYOUT[n].includes(i)));
  die.setAttribute('aria-label', `주사위 ${n}`);
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 굴리기 시작. land(값)로 결과를 정하면 보여 준 뒤 날려 보내고 끝난다.
export function startRoll({ speed = 1, target = '#dice', over = '#board' } = {}) {
  const rnd = () => 1 + Math.floor(Math.random() * 6);
  const a = dieEl(rnd(), false, 'big');
  const b = dieEl(rnd(), true, 'big');
  const sum = h('div', { class: 'dice-sum' });
  const pair = h('div', { class: 'dice-pair tumbling' }, a, b);
  const center = h('div', { class: 'dice-center' }, pair, sum);
  const stage = h('div', { class: 'dice-stage', 'aria-hidden': 'true' }, center);
  // 보드가 보이면 보드 한가운데에서 굴린다
  const board = document.querySelector(over)?.getBoundingClientRect();
  if (board && board.width > 0 && board.bottom > 0 && board.top < window.innerHeight) {
    const cx = board.left + board.width / 2;
    const cy = Math.min(Math.max(board.top + board.height / 2, 90), window.innerHeight - 90);
    center.style.left = `${cx}px`;
    center.style.top = `${cy}px`;
    stage.style.setProperty('--cx', `${cx}px`);
    stage.style.setProperty('--cy', `${cy}px`);
  } else {
    center.style.left = '50%';
    center.style.top = '50%';
  }
  document.body.append(stage);
  requestAnimationFrame(() => stage.classList.add('show'));
  const timer = setInterval(() => {
    setFace(a, rnd());
    setFace(b, rnd());
  }, 85);
  let done = false;

  const cleanup = () => {
    done = true;
    clearInterval(timer);
    stage.remove();
  };

  return {
    // 최소 굴림 시간 (호출하는 쪽에서 기다린다)
    tumbleMs: reducedMotion() ? 0 : Math.round(650 * speed),
    async land(values) {
      if (done) return;
      clearInterval(timer);
      setFace(a, values[0]);
      setFace(b, values[1]);
      pair.classList.remove('tumbling');
      pair.classList.add('landed');
      const total = values[0] + values[1];
      sum.textContent = total === 7 ? '7 · 도둑!' : String(total);
      sum.classList.toggle('seven', total === 7);
      sum.classList.add('show');
      await wait(reducedMotion() ? 500 : Math.round(750 * speed));
      if (done) return;
      const dest = document.querySelector(target)?.getBoundingClientRect();
      const from = pair.getBoundingClientRect();
      if (!reducedMotion() && dest && dest.width > 0) {
        const dx = dest.left + dest.width / 2 - (from.left + from.width / 2);
        const dy = dest.top + dest.height / 2 - (from.top + from.height / 2);
        const scale = Math.max(0.2, dest.height / from.height);
        pair.style.transition = `transform ${Math.round(450 * speed)}ms cubic-bezier(0.55, 0, 0.3, 1)`;
        pair.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
        sum.classList.remove('show');
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
