// 화면과 게임 진행을 연결하는 컨트롤러
import {
  RESOURCES, RESOURCE_NAMES, COSTS, DEV_NAMES, DEV_DESCRIPTIONS, PLAYER_COLORS, WIN_POINTS,
} from './constants.js';
import { Game, RuleError, handTotal } from './game.js';
import { chooseAction, respondToTrade } from './ai.js';
import { BoardRenderer, LOGICAL_W, LOGICAL_H } from './render.js';
import { iconURL, pieceColors, drawLogo as paintLogo } from './art.js';
import { h, $ } from './dom.js';
import { RULES_HTML } from './rules.js';
import { serverAvailable, createRoom, joinRoom, OnlineSession } from './net.js';

const SAVE_KEY = 'pixel-catan-save-v1';
const PREF_KEY = 'pixel-catan-prefs-v1';
const ONLINE_KEY = 'pixel-catan-online-v1';
const DEFAULT_NAMES = ['나', '컴퓨터 1', '컴퓨터 2', '컴퓨터 3'];

const app = {
  game: null,
  renderer: null,
  mode: null,
  selected: null,
  hover: null,
  viewer: null,
  aiTimer: null,
  blink: true,
  rolling: false,
  modalOpen: false,
  prevHand: null,
  dialog: null,
  // 온라인 상태
  net: null,
  room: null,
  stateKey: null,
  seen: null,
  justRolled: false,
  discardSent: null,
  sending: false,
  shownGameOver: false,
  prefs: { speed: 'normal', playerCount: 4, seats: null },
};

// ---------- 저장 ----------
function storage(fn, fallback = null) {
  try {
    return fn(window.localStorage);
  } catch {
    return fallback;
  }
}

function save() {
  if (!app.game || app.net) return;
  storage((ls) => ls.setItem(SAVE_KEY, JSON.stringify({ state: app.game.state, viewer: app.viewer })));
}

function loadSave() {
  const raw = storage((ls) => ls.getItem(SAVE_KEY));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data?.state?.version === 1 ? data : null;
  } catch {
    return null;
  }
}

function savePrefs() {
  storage((ls) => ls.setItem(PREF_KEY, JSON.stringify(app.prefs)));
}

function loadPrefs() {
  const raw = storage((ls) => ls.getItem(PREF_KEY));
  if (!raw) return;
  try {
    Object.assign(app.prefs, JSON.parse(raw));
  } catch {
    /* 무시 */
  }
}

// ---------- 도우미 ----------
const G = () => app.game;
const S = () => app.game.state;
const color = (p) => PLAYER_COLORS[S().players[p].color];
const humans = () => S().players.map((pl, i) => (pl.isAI ? -1 : i)).filter((i) => i >= 0);
const isHumanTurn = () => !S().players[S().current].isAI && app.viewer === S().current;
const resIcon = (r, size) => h('img', { class: 'px', src: iconURL(r), alt: RESOURCE_NAMES[r], width: size, height: size });

function costIcons(cost) {
  const span = h('span', { class: 'cost' });
  for (const [r, n] of Object.entries(cost)) for (let i = 0; i < n; i++) span.append(resIcon(r, 12));
  return span;
}

let toastTimer = null;
function toast(msg, ms = 1800) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function aiDelay(base) {
  const f = { slow: 1.6, normal: 1, fast: 0.4 }[app.prefs.speed] ?? 1;
  return base * f;
}

// ---------- 모달 ----------
function openModal(build, { dismissable = false, name = 'misc' } = {}) {
  const modal = $('#modal');
  const box = modal.querySelector('.modal-box');
  box.replaceChildren();
  build(box);
  modal.classList.remove('hidden');
  app.modalOpen = true;
  app.dialog = name;
  modal.onclick = dismissable ? (e) => e.target === modal && closeModal() : null;
  const first = box.querySelector('button:not(:disabled)');
  if (first && window.matchMedia('(pointer: fine)').matches) first.focus();
}

function closeModal() {
  $('#modal').classList.add('hidden');
  app.modalOpen = false;
  app.dialog = null;
}

// ---------- 시작 화면 ----------
function drawLogo() {
  paintLogo($('#logo'), PLAYER_COLORS);
}

function defaultSeats() {
  return DEFAULT_NAMES.map((name, i) => ({ name, isAI: i !== 0 }));
}

function renderSeats() {
  const list = $('#seat-list');
  list.replaceChildren();
  const seats = app.prefs.seats || defaultSeats();
  app.prefs.seats = seats;
  for (let i = 0; i < app.prefs.playerCount; i++) {
    const seat = seats[i];
    const input = h('input', { type: 'text', value: seat.name, maxlength: 8, 'aria-label': `플레이어 ${i + 1} 이름` });
    input.addEventListener('input', () => {
      seat.name = input.value;
      savePrefs();
    });
    const sel = h('select', { 'aria-label': `플레이어 ${i + 1} 종류` },
      h('option', { value: 'human', selected: !seat.isAI }, '사람'),
      h('option', { value: 'ai', selected: seat.isAI }, '컴퓨터'));
    sel.addEventListener('change', () => {
      seat.isAI = sel.value === 'ai';
      savePrefs();
    });
    list.append(h('div', { class: 'seat' },
      h('span', { class: 'swatch', style: { background: PLAYER_COLORS[i].main } }), input, sel));
  }
  document.querySelectorAll('#player-count button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === app.prefs.playerCount));
}

function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id);
}

function showStart() {
  clearTimeout(app.aiTimer);
  closeModal();
  showScreen('start-screen');
  $('#btn-continue').classList.toggle('hidden', !loadSave());
  $('#btn-rejoin').classList.toggle('hidden', !loadOnlineSession());
  renderSeats();
  drawLogo();
}

function startNewGame() {
  const seats = app.prefs.seats.slice(0, app.prefs.playerCount).map((s, i) => ({
    name: (s.name || '').trim() || DEFAULT_NAMES[i],
    isAI: s.isAI,
    color: i,
  }));
  app.game = Game.create({ players: seats });
  app.viewer = null;
  enterGame();
}

function continueGame() {
  const data = loadSave();
  if (!data) return;
  app.game = new Game(data.state);
  app.viewer = data.viewer ?? null;
  enterGame();
}

function enterGame() {
  app.mode = null;
  app.selected = null;
  app.prevHand = null;
  showScreen('game-screen');
  $('#players').style.setProperty('--np', S().players.length);
  if (humans().length === 1) app.viewer = humans()[0];
  layout();
  advance();
}

// ---------- 진행 ----------
function schedule(fn, ms) {
  clearTimeout(app.aiTimer);
  app.aiTimer = setTimeout(fn, ms);
}

function advance() {
  if (app.net) {
    onlineAdvance();
    return;
  }
  save();
  const s = S();
  app.mode = null;
  app.selected = null;
  if (s.phase === 'gameOver') {
    refresh();
    showGameOver();
    return;
  }
  if (s.phase === 'discard') {
    const pending = Object.keys(s.pendingDiscards).map(Number);
    const aiP = pending.find((p) => s.players[p].isAI);
    refresh();
    if (aiP !== undefined) {
      schedule(() => perform(aiP, chooseAction(G(), aiP)), aiDelay(350));
      return;
    }
    ensureViewer(pending[0], () => showDiscardDialog(pending[0]));
    return;
  }
  const cur = s.current;
  if (s.players[cur].isAI) {
    refresh();
    const base = s.phase === 'setup' ? 450 : s.phase === 'roll' ? 600 : 650;
    schedule(aiStep, aiDelay(base));
    return;
  }
  ensureViewer(cur, () => {
    setHumanMode();
    refresh();
  });
}

function ensureViewer(p, then) {
  if (app.viewer === p || humans().length <= 1) {
    app.viewer = humans().length <= 1 ? humans()[0] ?? null : p;
    then();
    return;
  }
  app.viewer = null;
  refresh();
  const s = S();
  openModal((box) => {
    box.append(
      h('h2', {}, '플레이어 교대'),
      h('div', { class: 'curtain-name', style: { color: color(p).dark } }, `${s.players[p].name}`),
      h('p', {}, s.phase === 'discard' ? '카드를 버릴 차례입니다.' : '당신의 차례입니다. 다른 사람은 화면을 보지 말아 주세요!'),
      h('div', { class: 'modal-actions' }, h('button', {
        class: 'btn primary',
        onclick: () => {
          closeModal();
          app.viewer = p;
          save();
          then();
        },
      }, '준비 완료')),
    );
  });
}

function setHumanMode() {
  const s = S();
  if (s.phase === 'setup') app.mode = s.setup.step === 'settlement' ? 'settlement' : 'road';
  else if (s.phase === 'robber') app.mode = 'robber';
  else if (s.phase === 'roadBuilding') app.mode = 'road';
  else app.mode = null;
}

function aiStep() {
  const s = S();
  const p = s.current;
  if (!s.players[p].isAI || s.phase === 'gameOver') return;
  perform(p, chooseAction(G(), p));
}

function perform(p, action, animated = false) {
  if (!action) return;
  if (action.type === 'rollDice' && !animated) {
    if (app.rolling || app.sending) return;
    app.rolling = true;
    renderDice(true);
    renderActions();
    setTimeout(() => {
      app.rolling = false;
      perform(p, action, true);
    }, 550);
    return;
  }
  if (app.net) {
    sendOnline(action);
    return;
  }
  const s = S();
  const before = app.viewer !== null ? { ...s.players[app.viewer].resources } : null;
  try {
    G().act(p, action);
  } catch (err) {
    if (err instanceof RuleError) {
      if (s.players[p].isAI) {
        console.warn('AI 행동 실패', action, err.message);
        if (s.phase === 'main') G().act(p, { type: 'endTurn' });
      } else {
        toast(err.message);
        refresh();
        return;
      }
    } else {
      throw err;
    }
  }
  app.prevHand = before;
  afterAction(p, action);
  advance();
}

function afterAction(p, action) {
  const s = S();
  const v = app.viewer;
  if (action.type === 'rollDice' && s.dice && s.dice[0] + s.dice[1] === 7) toast('7! 도둑이 나타났습니다!');
  if (action.type === 'moveRobber' && s.lastSteal && v !== null) {
    const { thief, victim, resource } = s.lastSteal;
    if (thief === v && victim !== undefined) toast(`${s.players[victim].name}에게서 ${RESOURCE_NAMES[resource]}을(를) 빼앗았습니다!`);
    else if (victim === v) toast(`${s.players[thief].name}이(가) ${RESOURCE_NAMES[resource]}을(를) 빼앗아 갔습니다!`);
    s.lastSteal = null;
  }
  if (action.type === 'buyDevCard' && s.lastDevBought?.player === v) toast(`발전 카드: [${DEV_NAMES[s.lastDevBought.type]}]`);
}

// ---------- 화면 갱신 ----------
function refresh() {
  if (!app.game) return;
  renderTopbar();
  renderDice(app.rolling);
  renderPlayers();
  renderHand();
  renderActions();
  renderPrompt();
  renderLog();
  renderBoard();
}

function boardView() {
  const s = S();
  const view = { blink: app.blink, showRoll: s.phase !== 'setup' && s.dice, hover: app.selected || app.hover };
  if (!isHumanTurn() || app.modalOpen) return view;
  const p = s.current;
  const g = G();
  if (app.mode === 'settlement') view.vertices = g.legalSettlementVertices(p);
  else if (app.mode === 'road') view.edges = g.legalRoadEdges(p);
  else if (app.mode === 'city') view.cityVertices = g.legalCityVertices(p);
  else if (app.mode === 'robber') view.hexes = g.legalRobberHexes();
  if (app.selected?.startsWith('e')) {
    view.ghostEdge = Number(app.selected.slice(1));
    view.ghostColor = s.players[p].color;
  }
  return view;
}

function renderBoard() {
  app.renderer.render(S(), boardView());
}

function renderTopbar() {
  const s = S();
  const cur = s.players[s.current];
  let text;
  if (s.phase === 'gameOver') text = `${s.players[s.winner].name} 승리!`;
  else if (s.phase === 'setup') text = `초기 배치 · ${cur.name}`;
  else text = `${s.turn}턴 · ${cur.name}의 차례`;
  $('#turn-info').textContent = text;
}

const PIP_LAYOUT = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function dieEl(n, red, rolling) {
  const d = h('div', { class: `die${red ? ' red' : ''}${rolling ? ' rolling' : ''}`, 'aria-label': `주사위 ${n}` });
  for (let i = 0; i < 9; i++) d.append(h('i', { class: PIP_LAYOUT[n]?.includes(i) ? 'on' : '' }));
  return d;
}

function renderDice(rolling) {
  const el = $('#dice');
  const s = S();
  el.replaceChildren();
  if (rolling) {
    el.append(dieEl(1 + Math.floor(Math.random() * 6), false, true), dieEl(1 + Math.floor(Math.random() * 6), true, true));
  } else if (s.dice) {
    el.append(dieEl(s.dice[0], false, false), dieEl(s.dice[1], true, false));
  }
}

function renderPlayers() {
  const s = S();
  const g = G();
  const wrap = $('#players');
  wrap.replaceChildren();
  s.players.forEach((pl, i) => {
    const pub = g.victoryPoints(i, { includeHidden: false });
    const all = g.victoryPoints(i);
    const showHidden = (i === app.viewer || s.phase === 'gameOver') && all > pub;
    const card = h('div', { class: `pcard panel${i === s.current ? ' current' : ''}` },
      h('div', { class: 'pname' },
        h('span', { class: 'swatch', style: { background: color(i).main } }),
        h('span', { class: 'nm' }, pl.name),
        h('span', { class: 'vp', title: '승리 점수' }, showHidden ? `${pub}+${all - pub}` : `${pub}`)),
      h('div', { class: 'stats' },
        h('span', { title: '자원 카드' }, h('img', { class: 'px', src: iconURL('cards'), alt: '' }), handTotal(pl.resources)),
        h('span', { title: '발전 카드' }, h('img', { class: 'px', src: iconURL('devBack'), alt: '' }), pl.devCards.length),
        h('span', { title: '사용한 기사' }, h('img', { class: 'px', src: iconURL('knight'), alt: '' }), pl.knights),
        h('span', { title: '가장 긴 도로' }, h('img', { class: 'px', src: iconURL('roadBuilding', { m: color(i).main }), alt: '' }), s.longestRoad.lengths[i] ?? 0)),
      h('div', { class: 'badges' },
        s.longestRoad.holder === i ? h('span', { class: 'badge' }, '최장 교역로') : null,
        s.largestArmy.holder === i ? h('span', { class: 'badge army' }, '최강 기사단') : null,
        pl.isAI ? h('span', { class: 'badge ai' }, 'AI') : null,
        app.net && !pl.isAI && app.room?.seats[i]?.online === false ? h('span', { class: 'badge off' }, '접속 끊김') : null,
        app.net && i === app.viewer ? h('span', { class: 'badge army' }, '나') : null));
    card.style.setProperty('--pc', color(i).main);
    wrap.append(card);
  });
}

function renderHand() {
  const el = $('#hand');
  el.replaceChildren();
  const s = S();
  const v = app.viewer;
  if (v === null || v === undefined) {
    el.append(h('h3', {}, '손패'), h('p', { class: 'hand-note' }, humans().length ? '다음 플레이어를 기다리는 중…' : '관전 모드'));
    return;
  }
  const pl = s.players[v];
  el.append(h('h3', {}, `${pl.name}의 손패 (${handTotal(pl.resources)}장)`));
  const row = h('div', { class: 'hand-row' });
  for (const r of RESOURCES) {
    const n = pl.resources[r];
    const got = app.prevHand && n > app.prevHand[r];
    row.append(h('div', { class: `rcard${n === 0 ? ' zero' : ''}${got ? ' gain' : ''}`, title: RESOURCE_NAMES[r], 'data-res': r },
      resIcon(r, 28), h('span', { class: 'n' }, n), h('span', { class: 'nm' }, RESOURCE_NAMES[r])));
  }
  el.append(row);
  app.prevHand = null;

  const devs = h('div', { class: 'dev-row' });
  if (pl.devCards.length === 0) devs.append(h('span', { class: 'hand-note' }, '발전 카드 없음'));
  const counts = {};
  for (const c of pl.devCards) {
    const key = c.type + (c.turn >= s.turn && c.type !== 'victoryPoint' ? '_new' : '');
    counts[key] = (counts[key] || 0) + 1;
  }
  for (const [key, n] of Object.entries(counts)) {
    const [type, isNew] = key.split('_');
    devs.append(h('span', { class: `dcard${isNew ? ' new' : ''}`, title: DEV_DESCRIPTIONS[type] },
      h('img', { class: 'px', src: iconURL(type), alt: '' }), `${DEV_NAMES[type]}${n > 1 ? ` ×${n}` : ''}${isNew ? ' (새 카드)' : ''}`));
  }
  el.append(devs);
  const ports = [];
  for (const r of RESOURCES) {
    const ratio = G().tradeRatio(v, r);
    if (ratio < 4) ports.push(`${RESOURCE_NAMES[r]} ${ratio}:1`);
  }
  el.append(h('div', { class: 'hand-note' }, `남은 말: 도로 ${pl.roadsLeft} · 개척지 ${pl.settlementsLeft} · 도시 ${pl.citiesLeft}${ports.length ? ` · 항구: ${ports.join(', ')}` : ''}`));
}

function actionButton(label, { onclick, disabled, cls = '', cost, icon, title } = {}) {
  return h('button', { type: 'button', class: `btn ${cls}`, onclick, disabled, title },
    icon ? h('img', { class: 'px', src: icon, alt: '' }) : null, label, cost ? costIcons(cost) : null);
}

function renderActions() {
  const el = $('#actions');
  el.replaceChildren();
  const s = S();
  const g = G();
  if (s.phase === 'gameOver') {
    el.append(actionButton('결과 보기', { cls: 'primary wide', onclick: showGameOver }));
    return;
  }
  if (!isHumanTurn() || !['roll', 'main'].includes(s.phase) || app.rolling) {
    const cur = s.players[s.current];
    const msg = app.rolling ? '주사위 굴리는 중…' : cur.isAI ? `${cur.name}이(가) 생각 중…` : app.net && s.current !== app.viewer ? `${cur.name}의 차례를 기다리는 중…` : '';
    if (msg) el.append(h('div', { class: 'wide hand-note', style: { color: '#fff8e4' } }, msg));
    return;
  }
  const p = s.current;
  const playable = g.playableDevCards(p);
  const devBtn = actionButton('발전 카드 사용', {
    icon: iconURL('knight'),
    disabled: playable.length === 0,
    onclick: showDevDialog,
  });
  if (s.phase === 'roll') {
    el.append(actionButton('주사위 굴리기', { cls: 'primary wide', icon: iconURL('dice'), onclick: () => perform(p, { type: 'rollDice' }) }), devBtn);
    return;
  }
  const pl = s.players[p];
  const modeBtn = (mode, label, cost, possible, icon) => actionButton(label, {
    cls: app.mode === mode ? 'active' : '',
    cost,
    icon,
    disabled: !g.canAfford(p, cost) || !possible,
    onclick: () => {
      app.mode = app.mode === mode ? null : mode;
      app.selected = null;
      refresh();
    },
  });
  el.append(
    modeBtn('road', '도로', COSTS.road, g.legalRoadEdges(p).length > 0),
    modeBtn('settlement', '개척지', COSTS.settlement, g.legalSettlementVertices(p).length > 0),
    modeBtn('city', '도시', COSTS.city, g.legalCityVertices(p).length > 0),
    actionButton('카드 구매', {
      cost: COSTS.devCard,
      disabled: !g.canAfford(p, COSTS.devCard) || s.devDeck.length === 0,
      onclick: () => perform(p, { type: 'buyDevCard' }),
      title: `남은 발전 카드 ${s.devDeck.length}장`,
    }),
    devBtn,
    actionButton('교역', { disabled: handTotal(pl.resources) === 0, onclick: () => showTradeDialog('bank') }),
    actionButton('턴 종료', { cls: 'primary wide', onclick: () => perform(p, { type: 'endTurn' }) }),
  );
}

function renderPrompt() {
  const el = $('#prompt');
  el.replaceChildren();
  const s = S();
  if (s.phase === 'gameOver') {
    el.textContent = `${s.players[s.winner].name}님이 승리했습니다!`;
    return;
  }
  if (!isHumanTurn()) {
    if (s.phase === 'discard') el.textContent = '카드를 버리는 중…';
    return;
  }
  const touch = !window.matchMedia('(pointer: fine)').matches;
  const pick = touch ? (app.selected ? '한 번 더 탭하면 확정' : '빛나는 곳을 탭하세요') : '빛나는 곳을 클릭하세요';
  let text = '';
  let cancel = false;
  if (s.phase === 'setup') {
    const round = s.setup.index >= s.players.length ? 2 : 1;
    text = s.setup.step === 'settlement' ? `초기 배치(${round}/2): 개척지를 놓으세요 · ${pick}` : `초기 배치(${round}/2): 개척지에 붙여 도로를 놓으세요`;
  } else if (s.phase === 'robber') text = `도둑을 옮길 지형을 고르세요 · ${pick}`;
  else if (s.phase === 'roadBuilding') text = `무료 도로를 놓으세요 (남은 ${s.freeRoads}개)`;
  else if (s.phase === 'roll') text = '주사위를 굴리세요!';
  else if (app.mode === 'road') (text = `도로를 지을 곳 · ${pick}`), (cancel = true);
  else if (app.mode === 'settlement') (text = `개척지를 지을 곳 · ${pick}`), (cancel = true);
  else if (app.mode === 'city') (text = `도시로 바꿀 개척지 · ${pick}`), (cancel = true);
  else text = '건설하거나 교역한 뒤 턴을 마치세요.';
  el.append(text);
  if (app.selected) el.append(h('button', { class: 'btn small primary cancel', onclick: () => confirmSelection() }, '확정'));
  if (cancel) {
    el.append(h('button', {
      class: 'btn small cancel',
      onclick: () => {
        app.mode = null;
        app.selected = null;
        refresh();
      },
    }, '취소'));
  }
  if (s.phase === 'roadBuilding') {
    el.append(h('button', { class: 'btn small cancel', onclick: () => perform(s.current, { type: 'endRoadBuilding' }) }, '그만 놓기'));
  }
}

function renderLog() {
  const el = $('#log');
  el.replaceChildren();
  const log = S().log.slice(-80);
  for (const entry of log) {
    el.prepend(h('li', {},
      h('span', { class: 'dot', style: { background: entry.player !== null ? color(entry.player).main : 'transparent', borderColor: entry.player !== null ? '#120c08' : 'transparent' } }),
      h('span', {}, entry.text)));
  }
}

// ---------- 보드 입력 ----------
function handlePick(key) {
  if (!key) return;
  const s = S();
  const p = s.current;
  const kind = key[0];
  const id = Number(key.slice(1));
  if (kind === 'v') {
    if (app.mode === 'city') perform(p, { type: 'buildCity', vertex: id });
    else if (s.phase === 'setup') perform(p, { type: 'placeSettlement', vertex: id });
    else perform(p, { type: 'buildSettlement', vertex: id });
  } else if (kind === 'e') {
    if (s.phase === 'setup') perform(p, { type: 'placeRoad', edge: id });
    else perform(p, { type: 'buildRoad', edge: id });
  } else if (kind === 'h') {
    const victims = G().robberVictims(id, p);
    if (victims.length <= 1) perform(p, { type: 'moveRobber', hex: id, victim: victims[0] });
    else showVictimDialog(id, victims);
  }
}

function confirmSelection() {
  const key = app.selected;
  app.selected = null;
  handlePick(key);
}

function onBoardPointer(e) {
  if (!isHumanTurn() || app.modalOpen) return;
  const key = app.renderer.pick(e.clientX, e.clientY, boardView());
  if (!key) {
    if (app.selected) {
      app.selected = null;
      refresh();
    }
    return;
  }
  if (e.pointerType === 'mouse' || app.selected === key) {
    app.selected = null;
    handlePick(key);
  } else {
    app.selected = key;
    refresh();
  }
}

function onBoardHover(e) {
  if (e.pointerType !== 'mouse' || !isHumanTurn()) return;
  const key = app.renderer.pick(e.clientX, e.clientY, boardView());
  if (key !== app.hover) {
    app.hover = key;
    renderBoard();
  }
}

// ---------- 대화상자 ----------
function counterGrid({ values, max, min = () => 0, onChange, sub }) {
  const grid = h('div', { class: 'counter-grid' });
  for (const r of RESOURCES) {
    const n = h('span', { class: 'n' }, values[r]);
    const minus = h('button', { type: 'button', 'aria-label': `${RESOURCE_NAMES[r]} 빼기` }, '−');
    const plus = h('button', { type: 'button', 'aria-label': `${RESOURCE_NAMES[r]} 더하기` }, '+');
    const update = () => {
      n.textContent = values[r];
      minus.disabled = values[r] <= min(r);
      plus.disabled = values[r] >= max(r);
    };
    minus.onclick = () => {
      values[r]--;
      onChange();
    };
    plus.onclick = () => {
      values[r]++;
      onChange();
    };
    grid.append(h('div', { class: 'counter' }, resIcon(r, 26), n, h('div', { class: 'row' }, minus, plus), sub ? h('span', { class: 'have' }, sub(r)) : null));
    grid.updaters = (grid.updaters || []).concat(update);
  }
  grid.refresh = () => grid.updaters.forEach((u) => u());
  grid.refresh();
  return grid;
}

function showDiscardDialog(p) {
  const s = S();
  const need = s.pendingDiscards[p];
  const res = s.players[p].resources;
  const values = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  refresh();
  openModal((box) => {
    const status = h('p', {});
    const ok = h('button', { class: 'btn primary', onclick: () => {
      closeModal();
      app.discardSent = s.rollId;
      perform(p, { type: 'discard', cards: { ...values } });
    } }, '버리기');
    const total = () => RESOURCES.reduce((a, r) => a + values[r], 0);
    const grid = counterGrid({
      values,
      max: (r) => Math.min(res[r], values[r] + need - total()),
      onChange: () => update(),
      sub: (r) => `보유 ${res[r]}`,
    });
    const update = () => {
      grid.refresh();
      status.textContent = `${total()} / ${need}장 선택`;
      ok.disabled = total() !== need;
    };
    box.append(h('h2', {}, `${s.players[p].name}: 카드 ${need}장 버리기`),
      h('p', {}, '7이 나왔고 카드가 8장 이상이라 절반을 버려야 합니다.'), grid, status,
      h('div', { class: 'modal-actions' }, ok));
    update();
  }, { name: 'discard' });
}

function showVictimDialog(hex, victims) {
  const s = S();
  openModal((box) => {
    box.append(h('h2', {}, '누구에게서 빼앗을까요?'));
    const list = h('div', { class: 'response-list' });
    for (const v of victims) {
      list.append(h('div', { class: 'response' },
        h('span', { class: 'swatch', style: { width: '14px', height: '14px', border: '2px solid #120c08', background: color(v).main } }),
        h('span', { class: 'who' }, `${s.players[v].name} (카드 ${handTotal(s.players[v].resources)}장)`),
        h('button', { class: 'btn small primary', onclick: () => {
          closeModal();
          perform(s.current, { type: 'moveRobber', hex, victim: v });
        } }, '선택')));
    }
    box.append(list, h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => {
      closeModal();
      refresh();
    } }, '다른 곳 고르기')));
  });
}

function showDevDialog() {
  const s = S();
  const p = s.current;
  const g = G();
  const playable = g.playableDevCards(p);
  const owned = [...new Set(s.players[p].devCards.map((c) => c.type))].filter((t) => t !== 'victoryPoint');
  openModal((box) => {
    box.append(h('h2', {}, '발전 카드 사용'));
    if (s.devPlayedThisTurn) box.append(h('p', {}, '이번 차례에는 이미 발전 카드를 사용했습니다.'));
    const list = h('div', { class: 'response-list' });
    for (const type of owned) {
      const can = playable.includes(type);
      list.append(h('div', { class: 'response' },
        h('img', { class: 'px', src: iconURL(type), alt: '', width: 24, height: 24 }),
        h('span', { class: 'who' }, DEV_NAMES[type], h('br'), h('small', { style: { fontWeight: 400 } }, can ? DEV_DESCRIPTIONS[type] : '이번 차례에 산 카드는 다음 차례부터 사용 가능')),
        h('button', { class: 'btn small primary', disabled: !can, onclick: () => playDev(type) }, '사용')));
    }
    box.append(list, h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: closeModal }, '닫기')));
  }, { dismissable: true });
}

function playDev(type) {
  const p = S().current;
  if (type === 'knight' || type === 'roadBuilding') {
    closeModal();
    perform(p, { type: 'playDev', card: type });
  } else if (type === 'yearOfPlenty') {
    showYearOfPlenty();
  } else if (type === 'monopoly') {
    showMonopoly();
  }
}

function showYearOfPlenty() {
  const s = S();
  const values = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  openModal((box) => {
    const total = () => RESOURCES.reduce((a, r) => a + values[r], 0);
    const ok = h('button', { class: 'btn primary', onclick: () => {
      const picks = RESOURCES.flatMap((r) => Array(values[r]).fill(r));
      closeModal();
      perform(s.current, { type: 'playDev', card: 'yearOfPlenty', resources: picks });
    } }, '받기');
    const grid = counterGrid({
      values,
      max: (r) => Math.min(s.bank[r], values[r] + 2 - total()),
      onChange: () => update(),
      sub: (r) => `은행 ${s.bank[r]}`,
    });
    const update = () => {
      grid.refresh();
      ok.disabled = total() !== 2;
    };
    box.append(h('h2', {}, '풍년: 자원 2장 고르기'), grid,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: showDevDialog }, '뒤로'), ok));
    update();
  });
}

function showMonopoly() {
  const s = S();
  openModal((box) => {
    box.append(h('h2', {}, '독점: 자원 1종류 선언'), h('p', {}, '모든 상대가 그 자원을 전부 당신에게 줍니다.'));
    const grid = h('div', { class: 'counter-grid' });
    for (const r of RESOURCES) {
      grid.append(h('button', { type: 'button', class: 'counter pick', onclick: () => {
        closeModal();
        perform(s.current, { type: 'playDev', card: 'monopoly', resource: r });
      } }, resIcon(r, 26), h('span', { class: 'have' }, RESOURCE_NAMES[r])));
    }
    box.append(grid, h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: showDevDialog }, '뒤로')));
  });
}

function showTradeDialog(tab) {
  const s = S();
  const p = s.current;
  const g = G();
  openModal((box) => {
    const tabs = h('div', { class: 'tabs' },
      h('button', { class: tab === 'bank' ? 'on' : '', onclick: () => showTradeDialog('bank') }, '은행 / 항구'),
      h('button', { class: tab === 'player' ? 'on' : '', onclick: () => showTradeDialog('player') }, '플레이어'));
    box.append(h('h2', {}, '교역'), tabs);
    if (tab === 'bank') buildBankTrade(box, p, g);
    else buildPlayerTrade(box, p, g);
  }, { dismissable: true });
}

function buildBankTrade(box, p, g) {
  const s = S();
  const res = s.players[p].resources;
  let give = null;
  let get = null;
  const giveGrid = h('div', { class: 'counter-grid' });
  const getGrid = h('div', { class: 'counter-grid' });
  const ok = h('button', { class: 'btn primary' }, '교환');
  const draw = () => {
    giveGrid.replaceChildren();
    getGrid.replaceChildren();
    for (const r of RESOURCES) {
      const ratio = g.tradeRatio(p, r);
      giveGrid.append(h('button', {
        type: 'button',
        class: `counter pick${give === r ? ' sel' : ''}`,
        disabled: res[r] < ratio,
        onclick: () => {
          give = r;
          if (get === r) get = null;
          draw();
        },
      }, resIcon(r, 26), h('span', { class: 'n' }, `${ratio}:1`), h('span', { class: 'have' }, `보유 ${res[r]}`)));
      getGrid.append(h('button', {
        type: 'button',
        class: `counter pick${get === r ? ' sel' : ''}`,
        disabled: s.bank[r] === 0 || give === r,
        onclick: () => {
          get = r;
          draw();
        },
      }, resIcon(r, 26), h('span', { class: 'have' }, `은행 ${s.bank[r]}`)));
    }
    ok.disabled = !give || !get;
    ok.textContent = give && get ? `${RESOURCE_NAMES[give]} ${g.tradeRatio(p, give)}장 → ${RESOURCE_NAMES[get]} 1장` : '교환';
  };
  ok.onclick = () => {
    ok.disabled = true;
    instantAction({ type: 'bankTrade', give, get })
      .then(() => {
        refresh();
        showTradeDialog('bank');
        toast('교환 완료!', 1000);
      })
      .catch((err) => {
        toast(err.message);
        ok.disabled = false;
      });
  };
  box.append(h('div', { class: 'section-title' }, '줄 자원'), giveGrid, h('div', { class: 'section-title' }, '받을 자원'), getGrid,
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => { closeModal(); refresh(); } }, '닫기'), ok));
  draw();
}

function buildPlayerTrade(box, p, g) {
  const s = S();
  const res = s.players[p].resources;
  const give = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  const get = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  const results = h('div', { class: 'response-list' });
  const propose = h('button', { class: 'btn primary' }, '제안하기');
  const update = () => {
    giveGrid.refresh();
    getGrid.refresh();
    const ok = handTotal(give) > 0 && handTotal(get) > 0 && RESOURCES.every((r) => !(give[r] && get[r]));
    propose.disabled = !ok;
    results.replaceChildren();
  };
  const giveGrid = counterGrid({ values: give, max: (r) => res[r], onChange: update, sub: (r) => `보유 ${res[r]}` });
  const getGrid = counterGrid({ values: get, max: () => 9, onChange: update });
  propose.onclick = () => {
    results.replaceChildren();
    const offer = { give: { ...give }, get: { ...get } };
    if (app.net) {
      propose.disabled = true;
      closeModal();
      app.net.act({ type: 'offerTrade', ...offer }).catch((err) => toast(err.message));
      return;
    }
    s.players.forEach((pl, i) => {
      if (i === p) return;
      const hasCards = RESOURCES.every((r) => (offer.get[r] || 0) <= pl.resources[r]);
      const doTrade = () => {
        try {
          g.act(p, { type: 'playerTrade', partner: i, give: offer.give, get: offer.get });
          save();
          closeModal();
          refresh();
          toast(`${pl.name}와(과) 교역 완료!`);
        } catch (err) {
          toast(err.message);
        }
      };
      const row = h('div', { class: 'response' }, h('span', { class: 'who' }, pl.name));
      if (pl.isAI) {
        const yes = respondToTrade(g, i, p, offer.give, offer.get);
        row.append(yes ? h('span', { class: 'ok' }, '수락') : h('span', { class: 'no' }, '거절'));
        if (yes) row.append(h('button', { class: 'btn small primary', onclick: doTrade }, '교역'));
      } else if (!hasCards) {
        row.append(h('span', { class: 'no' }, '카드 부족'));
      } else {
        // 같은 기기의 사람 플레이어: 직접 수락 여부를 누른다
        row.append(h('button', { class: 'btn small primary', onclick: doTrade }, `${pl.name} 수락`),
          h('button', { class: 'btn small', onclick: () => row.replaceChildren(h('span', { class: 'who' }, pl.name), h('span', { class: 'no' }, '거절')) }, '거절'));
      }
      results.append(row);
    });
  };
  box.append(h('div', { class: 'section-title' }, '내가 줄 카드'), giveGrid, h('div', { class: 'section-title' }, '내가 받을 카드'), getGrid, results,
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => { closeModal(); refresh(); } }, '닫기'), propose));
  update();
}

function showGameOver() {
  const s = S();
  const g = G();
  const order = s.players.map((_, i) => i).sort((a, b) => g.victoryPoints(b) - g.victoryPoints(a));
  openModal((box) => {
    box.append(h('h2', {}, `${s.players[s.winner].name} 승리!`),
      h('p', {}, `${WIN_POINTS}점을 먼저 달성했습니다.`));
    const list = h('ol', { class: 'score-list' });
    for (const i of order) {
      const pl = s.players[i];
      const vpCards = pl.devCards.filter((c) => c.type === 'victoryPoint').length;
      const extras = [s.longestRoad.holder === i ? '최장 교역로' : null, s.largestArmy.holder === i ? '최강 기사단' : null, vpCards ? `점수 카드 ${vpCards}` : null].filter(Boolean);
      list.append(h('li', {}, h('span', { class: 'swatch', style: { background: color(i).main } }), h('span', {}, pl.name, extras.length ? h('small', {}, ` (${extras.join(', ')})`) : null), h('span', { class: 'sc' }, `${g.victoryPoints(i)}점`)));
    }
    box.append(list, h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', onclick: closeModal }, '보드 보기'),
      h('button', { class: 'btn primary', onclick: () => {
        closeModal();
        if (app.net) {
          leaveOnline({ forget: true });
          return;
        }
        storage((ls) => ls.removeItem(SAVE_KEY));
        showStart();
      } }, '새 게임')));
  }, { name: 'gameOver' });
}

function showCostTable() {
  openModal((box) => {
    const row = (icon, name, cost, note) => h('tr', {},
      h('td', {}, h('img', { class: 'px', src: icon, alt: '' })), h('td', {}, h('b', {}, name), note ? h('br') : null, note ? h('small', {}, note) : null),
      h('td', {}, ...Object.entries(cost).flatMap(([r, n]) => Array(n).fill(0).map(() => resIcon(r, 18)))));
    box.append(h('h2', {}, '건설 비용'), h('table', { class: 'cost-table' },
      row(iconURL('roadBuilding', { m: '#c88a4a' }), '도로', COSTS.road, '0점'),
      row(iconURL('settlement', pieceColors(PLAYER_COLORS[0])), '개척지', COSTS.settlement, '1점'),
      row(iconURL('city', pieceColors(PLAYER_COLORS[0])), '도시', COSTS.city, '2점 · 자원 2배'),
      row(iconURL('devBack'), '발전 카드', COSTS.devCard, '')),
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: closeModal }, '닫기')));
  }, { dismissable: true });
}

function showRules(back) {
  openModal((box) => {
    box.append(h('h2', {}, '게임 규칙'), h('div', { html: RULES_HTML }),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: back || closeModal }, '닫기')));
  }, { dismissable: true });
}

function showMenu() {
  openModal((box) => {
    const speeds = { slow: '느림', normal: '보통', fast: '빠름' };
    const speedSeg = h('div', { class: 'seg' }, ...Object.entries(speeds).map(([k, label]) => h('button', {
      type: 'button',
      class: app.prefs.speed === k ? 'on' : '',
      onclick: () => {
        app.prefs.speed = k;
        savePrefs();
        showMenu();
      },
    }, label)));
    // 온라인: 방장은 접속이 끊긴 사람 자리를 컴퓨터에게 넘길 수 있다
    const takeovers = [];
    if (app.net && app.room?.you === 0 && S().phase !== 'gameOver') {
      app.room.seats.forEach((seat, i) => {
        if (i === 0 || seat.isAI || seat.online) return;
        takeovers.push(h('button', { class: 'btn', onclick: () => {
          app.net.lobby('takeover', { seat: i }).then(() => closeModal()).catch((err) => toast(err.message));
        } }, `${seat.name} 자리를 컴퓨터로 대체`));
      });
    }
    box.append(h('h2', {}, app.net ? `메뉴 · 방 ${app.room?.code ?? ''}` : '메뉴'),
      app.net ? null : h('div', { class: 'setting-row' }, h('span', { class: 'label' }, '컴퓨터 속도'), speedSeg),
      h('div', { class: 'start-actions' },
        h('button', { class: 'btn primary', onclick: () => { closeModal(); advance(); } }, '계속하기'),
        ...takeovers,
        h('button', { class: 'btn', onclick: showCostTable }, '건설 비용'),
        h('button', { class: 'btn', onclick: () => showRules(showMenu) }, '게임 규칙'),
        h('button', { class: 'btn danger', onclick: () => {
          closeModal();
          if (app.net) {
            leaveOnline({ forget: false });
            return;
          }
          save();
          showStart();
        } }, app.net ? '나가기 (나중에 다시 참가 가능)' : '처음 화면으로')));
  });
  if (!app.net) clearTimeout(app.aiTimer);
}

// ---------- 온라인 ----------
function loadOnlineSession() {
  const raw = storage((ls) => ls.getItem(ONLINE_KEY));
  try {
    const data = raw ? JSON.parse(raw) : null;
    return data?.code && data?.token ? data : null;
  } catch {
    return null;
  }
}

function saveOnlineSession(data) {
  storage((ls) => ls.setItem(ONLINE_KEY, JSON.stringify(data)));
}

function forgetOnlineSession() {
  storage((ls) => ls.removeItem(ONLINE_KEY));
}

// 즉시 처리되는 행동 (은행 교역): 로컬은 바로 적용, 온라인은 서버 응답을 기다린다
function instantAction(action) {
  if (app.net) return app.net.act(action);
  return new Promise((resolve) => {
    G().act(S().current, action);
    save();
    resolve();
  });
}

function sendOnline(action) {
  if (app.sending) return;
  app.sending = true;
  if (action.type === 'rollDice') app.justRolled = true;
  app.net.act(action)
    .catch((err) => {
      app.justRolled = false;
      app.discardSent = null;
      toast(err.message);
      onlineAdvance();
    })
    .finally(() => {
      app.sending = false;
    });
}

function setNetStatus(status, message) {
  const el = $('#net-status');
  if (status === 'gone') {
    leaveOnline({ forget: true, message: message || '방에 연결할 수 없습니다.' });
    return;
  }
  el.classList.toggle('hidden', status === 'online');
  el.classList.toggle('bad', status !== 'online');
  el.textContent = status === 'online' ? '' : '재연결 중…';
  const lobbyStatus = $('#lobby-status');
  if (status !== 'online' && !$('#lobby-screen').classList.contains('hidden')) lobbyStatus.textContent = '서버와 다시 연결하는 중…';
}

function connectOnline(code, token, name) {
  if (app.net) app.net.close();
  saveOnlineSession({ code, token, name });
  app.room = null;
  app.game = null;
  app.seen = null;
  app.stateKey = null;
  app.shownGameOver = false;
  app.net = new OnlineSession(code, token, { onView, onStatus: setNetStatus });
  app.net.connect();
}

function leaveOnline({ forget = false, message } = {}) {
  if (app.net) app.net.close();
  app.net = null;
  app.room = null;
  app.game = null;
  if (forget) forgetOnlineSession();
  $('#net-status').classList.add('hidden');
  showStart();
  if (message) toast(message, 2600);
}

function onView(view) {
  if (view.removed || view.closed) {
    leaveOnline({ forget: true, message: view.closed ? '방장이 방을 닫았습니다.' : '방에서 나왔습니다.' });
    return;
  }
  app.room = view;
  if (!view.started) {
    renderLobby();
    return;
  }
  const prev = app.game?.state ?? null;
  app.game = new Game(view.state);
  app.viewer = view.you;
  if ($('#game-screen').classList.contains('hidden')) {
    closeModal();
    enterGame();
    onlineEvents(null, view.state);
    return;
  }
  onlineEvents(prev, view.state);
  onlineAdvance();
}

// 새 상태에서 주사위·강탈·카드 구매 알림을 찾는다
function onlineEvents(prev, s) {
  const me = app.viewer;
  if (!app.seen) {
    app.seen = { roll: s.rollId, steal: s.lastSteal?.id, dev: s.lastDevBought?.id };
    return;
  }
  if (prev) app.prevHand = { ...prev.players[me].resources };
  if (s.rollId !== app.seen.roll) {
    app.seen.roll = s.rollId;
    const seven = s.dice && s.dice[0] + s.dice[1] === 7;
    if (app.justRolled) {
      app.justRolled = false;
      if (seven) toast('7! 도둑이 나타났습니다!');
    } else {
      app.rolling = true;
      renderDice(true);
      setTimeout(() => {
        app.rolling = false;
        refresh();
        if (seven) toast('7! 도둑이 나타났습니다!');
      }, 500);
    }
  }
  if (s.lastSteal && s.lastSteal.id !== app.seen.steal) {
    app.seen.steal = s.lastSteal.id;
    const { thief, victim, resource } = s.lastSteal;
    if (resource && thief === me) toast(`${s.players[victim].name}에게서 ${RESOURCE_NAMES[resource]}을(를) 빼앗았습니다!`);
    else if (resource && victim === me) toast(`${s.players[thief].name}이(가) ${RESOURCE_NAMES[resource]}을(를) 빼앗아 갔습니다!`);
  }
  if (s.lastDevBought && s.lastDevBought.id !== app.seen.dev) {
    app.seen.dev = s.lastDevBought.id;
    if (s.lastDevBought.player === me && s.lastDevBought.type) toast(`발전 카드: [${DEV_NAMES[s.lastDevBought.type]}]`);
  }
}

function onlineAdvance() {
  if (!app.game) return;
  const s = S();
  const me = app.viewer;
  const key = [s.phase, s.current, s.turn, s.setup.index, s.setup.step, s.freeRoads].join('|');
  if (key !== app.stateKey) {
    app.stateKey = key;
    app.selected = null;
    if (isHumanTurn()) setHumanMode();
    else app.mode = null;
  }
  if (!isHumanTurn()) app.mode = null;

  if (s.phase === 'gameOver') {
    refresh();
    if (!app.shownGameOver) {
      app.shownGameOver = true;
      showGameOver();
    }
    return;
  }

  // 7: 각자 동시에 버린다
  if (s.pendingDiscards[me] && app.discardSent !== s.rollId) {
    if (app.dialog !== 'discard') showDiscardDialog(me);
  } else if (app.dialog === 'discard') {
    closeModal();
  }

  // 교역 제안
  const t = app.room.trade;
  const mine = t && t.from === me;
  const askMe = t && t.responses[me] === 'pending';
  if (t && (mine || askMe || app.dialog === 'tradeStatus')) {
    if (app.dialog === 'tradeStatus' || !app.modalOpen) showTradeStatus(t);
  } else if (app.dialog === 'tradeStatus') {
    closeModal();
  }
  refresh();
}

function cardList(cards) {
  const wrap = h('span', { class: 'trade-offer' });
  for (const r of RESOURCES) for (let i = 0; i < (cards[r] || 0); i++) wrap.append(resIcon(r, 20));
  return wrap;
}

function showTradeStatus(t) {
  const s = S();
  const me = app.viewer;
  const from = s.players[t.from];
  openModal((box) => {
    if (t.from === me) {
      box.append(h('h2', {}, '교역 제안 중'),
        h('div', { class: 'trade-offer' }, '내가 주는 카드', cardList(t.give)),
        h('div', { class: 'trade-offer' }, '내가 받는 카드', cardList(t.get)));
      const list = h('div', { class: 'response-list' });
      for (const [i, r] of Object.entries(t.responses)) {
        const row = h('div', { class: 'response' }, h('span', { class: 'who' }, s.players[i].name));
        if (r === 'accept') {
          row.append(h('span', { class: 'ok' }, '수락'), h('button', { class: 'btn small primary', onclick: () => {
            app.net.act({ type: 'confirmTrade', partner: Number(i) }).then(() => toast(`${s.players[i].name}와(과) 교역 완료!`)).catch((err) => toast(err.message));
          } }, '교역하기'));
        } else if (r === 'pending') row.append(h('span', {}, '응답 기다리는 중…'));
        else row.append(h('span', { class: 'no' }, r === 'cannot' ? '카드 부족' : '거절'));
        list.append(row);
      }
      box.append(list, h('div', { class: 'modal-actions' }, h('button', { class: 'btn danger', onclick: () => {
        app.net.act({ type: 'cancelTrade' }).catch((err) => toast(err.message));
      } }, '제안 취소')));
    } else {
      const r = t.responses[me];
      box.append(h('h2', {}, `${from.name}의 교역 제안`),
        h('div', { class: 'trade-offer' }, '내가 받는 카드', cardList(t.give)),
        h('div', { class: 'trade-offer' }, '내가 주는 카드', cardList(t.get)));
      if (r === 'pending') {
        box.append(h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', onclick: () => app.net.act({ type: 'respondTrade', accept: false }).catch((err) => toast(err.message)) }, '거절'),
          h('button', { class: 'btn primary', onclick: () => app.net.act({ type: 'respondTrade', accept: true }).catch((err) => toast(err.message)) }, '수락')));
      } else {
        box.append(h('p', {}, r === 'accept' ? `수락했습니다. ${from.name}의 결정을 기다리는 중…` : r === 'cannot' ? '카드가 부족해 수락할 수 없습니다.' : '거절했습니다.'),
          h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: closeModal }, '닫기')));
      }
    }
  }, { name: 'tradeStatus' });
}

function inviteLink(code) {
  return `${location.origin}${location.pathname}?room=${code}`;
}

function renderLobby() {
  const room = app.room;
  showScreen('lobby-screen');
  closeModal();
  const host = room.you === 0;
  $('#lobby-code').textContent = room.code;
  $('#invite-link').value = inviteLink(room.code);
  const list = $('#lobby-seats');
  list.replaceChildren();
  for (let i = 0; i < 4; i++) {
    const seat = room.seats[i];
    if (!seat) {
      list.append(h('li', { class: 'empty' }, h('span', { class: 'swatch', style: { background: 'transparent', borderStyle: 'dashed' } }), h('span', { class: 'who' }, '빈 자리')));
      continue;
    }
    list.append(h('li', {},
      h('span', { class: 'swatch', style: { background: PLAYER_COLORS[i].main } }),
      h('span', { class: `online-dot${seat.online ? ' on' : ''}`, title: seat.online ? '접속 중' : '접속 끊김' }),
      h('span', { class: 'who' }, seat.name),
      i === 0 ? h('span', { class: 'tag' }, '방장') : null,
      i === room.you ? h('span', { class: 'tag me' }, '나') : null,
      seat.isAI ? h('span', { class: 'tag' }, '컴퓨터') : null,
      host && i > 0 ? h('button', { class: 'btn small', onclick: () => app.net.lobby('remove', { seat: i }).catch((err) => toast(err.message)) }, '내보내기') : null));
  }
  const n = room.seats.length;
  $('#btn-add-ai').classList.toggle('hidden', !host || n >= 4);
  $('#btn-start-online').classList.toggle('hidden', !host);
  $('#btn-start-online').disabled = n < 3;
  $('#lobby-status').textContent = host
    ? n < 3 ? '3명 이상이 모이면 시작할 수 있습니다. 빈자리는 컴퓨터로 채울 수 있어요.' : '준비되면 게임을 시작하세요!'
    : '방장이 게임을 시작하기를 기다리는 중…';
}

async function setupOnlineStart() {
  const note = $('#online-note');
  const controls = $('#online-controls');
  const nameInput = $('#online-name');
  const codeInput = $('#room-code');
  nameInput.value = loadOnlineSession()?.name || app.prefs.onlineName || '';
  const params = new URLSearchParams(location.search);
  const invited = (params.get('room') || '').toUpperCase().slice(0, 4);
  if (invited) codeInput.value = invited;

  const ok = await serverAvailable();
  if (!ok) {
    note.textContent = '온라인 대전은 게임 서버 주소로 접속했을 때 사용할 수 있습니다. (README의 서버 실행 방법 참고)';
    return;
  }
  note.textContent = invited ? `초대받은 방: ${invited} · 이름을 입력하고 참가하세요.` : '방을 만들고 친구에게 코드를 알려 주세요.';
  controls.classList.remove('hidden');

  const getName = () => {
    const name = nameInput.value.trim();
    if (!name) {
      toast('이름을 입력해 주세요.');
      nameInput.focus();
      return null;
    }
    app.prefs.onlineName = name;
    savePrefs();
    return name;
  };
  const busy = (fn) => async () => {
    const buttons = controls.querySelectorAll('button');
    buttons.forEach((b) => (b.disabled = true));
    try {
      await fn();
    } catch (err) {
      toast(err.message, 2600);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  };
  $('#btn-create-room').addEventListener('click', busy(async () => {
    const name = getName();
    if (!name) return;
    const { code, token } = await createRoom(name);
    connectOnline(code, token, name);
  }));
  $('#btn-join-room').addEventListener('click', busy(async () => {
    const name = getName();
    const code = codeInput.value.trim().toUpperCase();
    if (!name) return;
    if (!/^[A-Z]{4}$/.test(code)) {
      toast('방 코드 4글자를 입력해 주세요.');
      codeInput.focus();
      return;
    }
    const saved = loadOnlineSession();
    if (saved?.code === code) {
      connectOnline(code, saved.token, saved.name);
      return;
    }
    const { token } = await joinRoom(code, name);
    connectOnline(code, token, name);
  }));
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && $('#btn-join-room').click());
  $('#btn-rejoin').addEventListener('click', () => {
    const saved = loadOnlineSession();
    if (saved) connectOnline(saved.code, saved.token, saved.name);
  });

  // 초대 링크로 들어왔고 같은 방에 참가한 적이 있으면 바로 복귀
  const saved = loadOnlineSession();
  if (saved && (!invited || saved.code === invited)) connectOnline(saved.code, saved.token, saved.name);
  else if (invited) nameInput.focus();
}

// ---------- 레이아웃 ----------
// 보드 바깥 여백: 캔버스 margin(10px) + 나무 테두리(9px)
const BOARD_FRAME = 19;

function layout() {
  if (!app.renderer || $('#game-screen').classList.contains('hidden')) return;
  const wrap = $('#board-wrap');
  const desktop = window.matchMedia('(min-width: 960px)').matches;
  const landscapePhone = window.matchMedia('(max-width: 959px) and (orientation: landscape) and (max-height: 520px)').matches;
  const availW = wrap.clientWidth - BOARD_FRAME * 2;
  let availH;
  if (desktop || landscapePhone) {
    // 격자가 정해 준 보드 영역의 실제 높이에서 안내 문구와 테두리를 뺀다
    const style = getComputedStyle(wrap);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const prompt = $('#prompt');
    const promptH = prompt.offsetHeight + parseFloat(getComputedStyle(prompt).marginTop);
    availH = wrap.clientHeight - padding - promptH - BOARD_FRAME * 2;
  } else {
    availH = Math.max(window.innerHeight * 0.62, 260);
  }
  app.renderer.resize(availW, Math.min(availH, (availW * LOGICAL_H) / LOGICAL_W + 1));
  if (app.game) renderBoard();
}

// ---------- 시작 ----------
function init() {
  loadPrefs();
  if (!app.prefs.seats) app.prefs.seats = defaultSeats();
  app.renderer = new BoardRenderer($('#board'));

  document.querySelectorAll('#player-count button').forEach((b) => b.addEventListener('click', () => {
    app.prefs.playerCount = Number(b.dataset.n);
    savePrefs();
    renderSeats();
  }));
  $('#btn-new').addEventListener('click', () => {
    if (app.prefs.seats.slice(0, app.prefs.playerCount).some((s) => !s.isAI)) {
      startNewGame();
      return;
    }
    openModal((box) => {
      box.append(h('h2', {}, '관전 모드'), h('p', {}, '사람 플레이어가 없습니다. 컴퓨터끼리 대결하는 모습을 볼까요?'),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', onclick: closeModal }, '취소'),
          h('button', { class: 'btn primary', onclick: () => { closeModal(); startNewGame(); } }, '관전하기')));
    }, { dismissable: true });
  });
  $('#btn-continue').addEventListener('click', continueGame);
  $('#btn-rules').addEventListener('click', () => showRules());
  $('#btn-menu').addEventListener('click', showMenu);
  $('#btn-add-ai').addEventListener('click', () => app.net?.lobby('addAI').catch((err) => toast(err.message)));
  $('#btn-start-online').addEventListener('click', () => app.net?.lobby('start').catch((err) => toast(err.message)));
  $('#btn-leave-room').addEventListener('click', () => {
    const net = app.net;
    if (!net) return showStart();
    net.lobby('leave').catch(() => {}).finally(() => leaveOnline({ forget: true }));
  });
  $('#btn-copy-link').addEventListener('click', () => {
    const input = $('#invite-link');
    const done = () => toast('초대 링크를 복사했습니다.');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(input.value).then(done).catch(() => {
        input.select();
        toast('링크를 길게 눌러 복사하세요.');
      });
    } else {
      input.select();
      document.execCommand?.('copy');
      done();
    }
  });

  const board = $('#board');
  board.addEventListener('pointerup', onBoardPointer);
  board.addEventListener('pointermove', onBoardHover);
  board.addEventListener('pointerleave', () => {
    app.hover = null;
    if (app.game) renderBoard();
  });

  window.addEventListener('resize', layout);
  // 플레이어 카드나 보드 영역의 크기가 바뀌면(글꼴 로딩, 이름 길이 등) 보드 크기를 다시 맞춘다
  if (window.ResizeObserver) {
    let pending = false;
    const ro = new ResizeObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        layout();
      });
    });
    ro.observe($('#players'));
    ro.observe($('#board-wrap'));
  }
  document.fonts?.ready.then(layout);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.modalOpen && $('#modal').onclick) closeModal();
    else if (e.key === 'Escape' && app.mode && S().phase === 'main') {
      app.mode = null;
      app.selected = null;
      refresh();
    }
  });

  setInterval(() => {
    if (!app.game || $('#game-screen').classList.contains('hidden')) return;
    const v = boardView();
    if (v.vertices || v.edges || v.hexes || v.cityVertices) {
      app.blink = !app.blink;
      renderBoard();
    } else if (!app.blink) {
      app.blink = true;
      renderBoard();
    }
  }, 480);

  showStart();
  setupOnlineStart();
}

init();
if (new URLSearchParams(location.search).has('debug')) window.pixelCatan = { app, perform, advance };
