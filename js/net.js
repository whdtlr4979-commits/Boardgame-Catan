// 온라인 서버와의 통신 (fetch + Server-Sent Events)
import { SERVER_URL } from './config.js';

export class NetError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(SERVER_URL + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new NetError('서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.', 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new NetError(json.error || `요청 실패 (${res.status})`, res.status);
  return json;
}

export async function serverAvailable() {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`, { cache: 'no-store' });
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

export const createRoom = (name) => request('POST', '/api/rooms', { name });
export const joinRoom = (code, name) => request('POST', `/api/rooms/${encodeURIComponent(code)}/join`, { name });

export class OnlineSession {
  constructor(code, token, { onView, onStatus }) {
    this.code = code;
    this.token = token;
    this.onView = onView;
    this.onStatus = onStatus;
    this.version = -1;
    this.epoch = null;
    this.es = null;
  }

  connect() {
    this.close();
    const url = `${SERVER_URL}/api/rooms/${encodeURIComponent(this.code)}/events?token=${encodeURIComponent(this.token)}`;
    const es = new EventSource(url);
    this.es = es;
    es.addEventListener('view', (e) => this.accept(JSON.parse(e.data)));
    es.onopen = () => this.onStatus('online');
    es.onerror = async () => {
      if (this.es !== es) return;
      this.onStatus('reconnecting');
      // 서버가 방을 잃었거나 자리가 없어진 경우에는 재연결하지 않는다
      try {
        await request('GET', `/api/rooms/${encodeURIComponent(this.code)}?token=${encodeURIComponent(this.token)}`);
        if (es.readyState === EventSource.CLOSED) setTimeout(() => this.es === es && this.connect(), 2000);
      } catch (err) {
        if (err.status === 404 || err.status === 403) {
          this.close();
          this.onStatus('gone', err.message);
        } else if (es.readyState === EventSource.CLOSED) {
          setTimeout(() => this.es === es && this.connect(), 3000);
        }
      }
    };
  }

  accept(view) {
    // 서버가 다시 켜져 방을 저장소에서 불러오면 epoch가 바뀐다
    if (view.epoch !== undefined && view.epoch !== this.epoch) {
      this.epoch = view.epoch;
      this.version = -1;
    }
    if (view.version !== undefined && view.version < this.version) return;
    if (view.version !== undefined) this.version = view.version;
    this.onView(view);
  }

  async post(path, body) {
    const view = await request('POST', `/api/rooms/${encodeURIComponent(this.code)}/${path}`, { token: this.token, ...body });
    this.accept(view);
    return view;
  }

  act(action) {
    return this.post('act', { action });
  }

  lobby(op, data = {}) {
    return this.post('lobby', { op, ...data });
  }

  close() {
    if (this.es) this.es.close();
    this.es = null;
  }
}
