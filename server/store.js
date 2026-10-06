// 방 상태 저장소: Postgres(DATABASE_URL) 또는 파일 폴더(ROOMS_DIR)
import fs from 'node:fs/promises';
import path from 'node:path';

const CODE_RE = /^[A-Z]{4}$/;

function checkCode(code) {
  if (!CODE_RE.test(code)) throw new Error(`잘못된 방 코드: ${code}`);
  return code;
}

// 방 하나를 JSON 파일 하나로 저장한다. 디스크가 유지되는 서버(VPS, 내 PC)용.
export class FileStore {
  constructor(dir) {
    this.kind = 'file';
    this.dir = path.resolve(dir);
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  file(code) {
    return path.join(this.dir, `${checkCode(code)}.json`);
  }

  async load(code) {
    try {
      return JSON.parse(await fs.readFile(this.file(code), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(code, json) {
    // 쓰는 도중 꺼져도 파일이 깨지지 않도록 임시 파일에 쓴 뒤 바꿔치기
    const target = this.file(code);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, json);
    await fs.rename(tmp, target);
  }

  async remove(code) {
    await fs.rm(this.file(code), { force: true });
  }

  async cleanup(maxAgeMs) {
    const now = Date.now();
    for (const name of await fs.readdir(this.dir)) {
      if (!/^[A-Z]{4}\.json$/.test(name)) continue;
      const file = path.join(this.dir, name);
      const { mtimeMs } = await fs.stat(file);
      if (now - mtimeMs > maxAgeMs) await fs.rm(file, { force: true });
    }
  }

  async close() {}
}

// Postgres 테이블 하나에 방 코드별 JSON을 저장한다. Render·Neon·Supabase 등.
export class PostgresStore {
  constructor(connectionString, { ssl } = {}) {
    this.kind = 'postgres';
    this.connectionString = connectionString;
    this.ssl = ssl;
    this.pool = null;
  }

  async init() {
    const { default: pg } = await import('pg');
    this.pool = new pg.Pool({ connectionString: this.connectionString, ssl: this.ssl, max: 5 });
    this.pool.on('error', (err) => console.error('[db] 연결 오류', err.message));
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS catan_rooms (
        code TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
  }

  async load(code) {
    const { rows } = await this.pool.query('SELECT data FROM catan_rooms WHERE code = $1', [checkCode(code)]);
    return rows[0]?.data ?? null;
  }

  async save(code, json) {
    await this.pool.query(
      `INSERT INTO catan_rooms (code, data, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [checkCode(code), json],
    );
  }

  async remove(code) {
    await this.pool.query('DELETE FROM catan_rooms WHERE code = $1', [checkCode(code)]);
  }

  async cleanup(maxAgeMs) {
    await this.pool.query("DELETE FROM catan_rooms WHERE updated_at < now() - ($1 * interval '1 millisecond')", [maxAgeMs]);
  }

  async close() {
    await this.pool?.end();
  }
}

// 환경 변수로 저장소를 고른다. 아무것도 없으면 null (메모리에만 보관).
export function createStore(env = process.env) {
  if (env.DATABASE_URL) {
    const ssl = env.DATABASE_SSL === 'no-verify' ? { rejectUnauthorized: false } : undefined;
    return new PostgresStore(env.DATABASE_URL, { ssl });
  }
  if (env.ROOMS_DIR) return new FileStore(env.ROOMS_DIR);
  return null;
}
