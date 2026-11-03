import type { HotItem, Source, SourceMeta } from '../types';

export interface Env {
  ASSETS: Fetcher;
  HOT: KVNamespace;
}

interface Snap {
  items: HotItem[];
  updated: number;
  error?: string;
  status: SourceMeta['status'];
}

export interface LoadResult {
  items: HotItem[];
  updated: number;
  cached: boolean;
  stale: boolean;
  error?: string;
}

/** 内存层：每 isolate 保存最新一次抓取结果（KV 只用来放整包快照，省写配额） */
const mem = new Map<string, Snap>();
const inflight = new Map<string, Promise<LoadResult>>();
const MEM_TTL = 60_000;

const PACK_KEY = 'boot:v2';

function msg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const se = e as { stage?: string; status?: number; message: string };
    return `${se.stage || 'error'}${se.status ? `(${se.status})` : ''}: ${se.message}`;
  }
  return String(e);
}

/** 单源抓取（同源单飞） */
export function load(src: Source, ctx?: ExecutionContext, force = false): Promise<LoadResult> {
  const now = Date.now();
  const m = mem.get(src.id);
  if (!force && m && now - m.updated < Math.min(src.ttl * 1000, MEM_TTL) && m.items.length) {
    return Promise.resolve({ items: m.items, updated: m.updated, cached: true, stale: false });
  }
  let p = inflight.get(src.id);
  if (!p) {
    p = src
      .fetch()
      .then((raw) => {
        const items = (raw || []).filter((i) => i && typeof i.title === 'string' && i.title.trim());
        if (!items.length) throw new Error('empty result');
        const snap: Snap = { items, updated: Date.now(), status: 'ok' };
        mem.set(src.id, snap);
        return { items, updated: snap.updated, cached: false, stale: false };
      })
      .catch((e) => {
        const prev = mem.get(src.id);
        const err = msg(e);
        if (prev && prev.items.length) {
          mem.set(src.id, { ...prev, status: 'degraded', error: err });
          return { items: prev.items, updated: prev.updated, cached: true, stale: true, error: err };
        }
        mem.set(src.id, { items: [], updated: 0, status: 'blocked', error: err });
        return { items: [], updated: 0, cached: false, stale: true, error: err };
      })
      .finally(() => inflight.delete(src.id));
    inflight.set(src.id, p);
  }
  return p;
}

/** 只读内存，不触发抓取（首屏拼装用） */
export function peek(id: string): Snap | undefined {
  return mem.get(id);
}

export function stateOf(id: string): SourceMeta | null {
  const m = mem.get(id);
  if (!m) return null;
  return { status: m.status, updated: m.updated, fails: m.status === 'ok' ? 0 : 1, count: m.items.length, lastError: m.error };
}

export async function readPacked(env: Env): Promise<({ generated: number } & Record<string, unknown>) | null> {
  return env.HOT.get<{ generated: number } & Record<string, unknown>>(PACK_KEY, 'json').catch(() => null);
}

/** cron 专用：整包快照只写一个 key，1 次写 / 轮 */
export async function writePacked(env: Env, payload: unknown): Promise<boolean> {
  try {
    await env.HOT.put(PACK_KEY, JSON.stringify(payload), { expirationTtl: 3_600 });
    return true;
  } catch (e) {
    console.log(`packed write failed: ${msg(e)}`);
    return false;
  }
}

/** 并发抓取全部源（cron 预热 / 冷启动兜底） */
export async function warmAll(concurrency = 6): Promise<{ ok: number; failed: number }> {
  const { sources } = await import('../sources/index');
  let ok = 0;
  let failed = 0;
  let i = 0;
  const worker = async () => {
    while (i < sources.length) {
      const src = sources[i++];
      const r = await load(src, undefined, true);
      if (r.items.length && !r.stale) ok++;
      else failed++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ok, failed };
}
