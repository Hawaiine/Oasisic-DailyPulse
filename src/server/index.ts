import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { sources } from '../sources/index';
import type { HotItem, Source } from '../types';
import { FileStore, type Snap } from './store';
import { createApi, sanitize } from './api';
import { CATEGORY_LABEL } from '../sources/index';

const PORT = Number(process.env.PORT || 8790);
const PUBLIC = process.env.PUBLIC_DIR || join(process.cwd(), 'public');
const DATA = process.env.DATA_DIR || join(process.cwd(), 'data');

const store = new FileStore(DATA);
const mem = new Map<string, Snap>();
const inflight = new Map<string, Promise<Snap>>();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function msg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const se = e as { stage?: string; status?: number; message: string };
    return `${se.stage || 'error'}${se.status ? `(${se.status})` : ''}: ${se.message}`;
  }
  return String(e);
}

/** 抓一个源：抓取 → 清洗校验 → 落盘 + 内存 + 历史 */
async function refresh(src: Source): Promise<Snap> {
  const t0 = Date.now();
  try {
    const raw = await src.fetch();
    const items = sanitize(src, raw || []);
    if (!items.length) throw new Error('empty after sanitize');
    const snap: Snap = { items, updated: Date.now(), status: 'ok', latency: Date.now() - t0 };
    store.write(src.id, snap);
    store.appendHistory(src.id, snap.updated, items);
    mem.set(src.id, snap);
    return snap;
  } catch (e) {
    const prev = mem.get(src.id) ?? store.read(src.id);
    const err = msg(e);
    const snap: Snap = prev
      ? { ...prev, status: 'degraded', error: err, latency: Date.now() - t0 }
      : { items: [], updated: 0, status: 'blocked', error: err, latency: Date.now() - t0 };
    store.write(src.id, snap);
    mem.set(src.id, snap);
    return snap;
  }
}

function getSnap(src: Source, force = false): Promise<Snap> {
  const cached = mem.get(src.id) ?? store.read(src.id) ?? undefined;
  if (cached) mem.set(src.id, cached);
  if (!force && cached && Date.now() - cached.updated < src.ttl * 1000 && cached.items.length) {
    return Promise.resolve(cached);
  }
  let p = inflight.get(src.id);
  if (!p) {
    p = refresh(src).finally(() => inflight.delete(src.id));
    inflight.set(src.id, p);
  }
  return p;
}

const api = createApi({ store, refresh, peek: (id) => mem.get(id) });

/** 定时刷新：到 TTL 就刷，全局并发 4；每 5 分钟写一次整包快照 */
let lastPack = 0;
async function tick() {
  const due = sources.filter((s) => {
    const snap = mem.get(s.id) ?? store.read(s.id);
    return !snap || Date.now() - snap.updated > s.ttl * 1000;
  });
  let i = 0;
  const worker = async () => {
    while (i < due.length) {
      const s = due[i++];
      try {
        await refresh(s);
      } catch {
        /* refresh 内部已兜底 */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, due.length || 1) }, worker));
  if (Date.now() - lastPack > 5 * 60_000) {
    lastPack = Date.now();
    try {
      const res = await api(new Request('http://local/api/bootstrap?limit=12&fresh=1'));
      const pack = await res.json();
      store.writePack(pack);
    } catch (e) {
      console.log('pack failed:', msg(e));
    }
  }
}

async function serveStatic(pathname: string): Promise<{ body: Buffer; type: string; cache: string } | null> {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(PUBLIC)) return null;
  try {
    const st = await stat(file);
    if (st.isDirectory()) return null;
    const body = await readFile(file);
    const ext = extname(file);
    const cache = /\/logos\//.test(file) ? 'public, max-age=604800, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    return { body, type: MIME[ext] || 'application/octet-stream', cache };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url || '/', 'http://localhost');
  const gate = process.env.PULSE_TOKEN || '';
  if (gate && req.headers['x-pulse-token'] !== gate) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('403 Forbidden - this origin is private');
    return;
  }
  // B站角标图代理：CDN 校验 referer，必须服务端带 referer 取回并缓存
  if (url.pathname === '/api/badge') {
    const raw = url.searchParams.get('u') || '';
    let host = '';
    try { host = new URL(raw).hostname; } catch { /* ignore */ }
    if (!/^i[0-9]\.hdslb\.com$/.test(host)) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('bad host');
      return;
    }
    try {
      const up = await fetch(raw, {
        headers: {
          Referer: 'https://www.bilibili.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        },
      });
      if (!up.ok) { res.writeHead(502); res.end('upstream ' + up.status); return; }
      const buf = Buffer.from(await up.arrayBuffer());
      res.writeHead(200, {
        'content-type': up.headers.get('content-type') || 'image/png',
        'cache-control': 'public, max-age=86400',
        'content-length': String(buf.length),
      });
      res.end(buf);
      return;
    } catch (e) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('badge fetch failed');
      return;
    }
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      const body = await new Promise<Buffer>((resolve) => {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
      });
      const request = new Request(`http://localhost${url.pathname}${url.search}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body,
      });
      const response = await api(request);
      res.writeHead(response.status, Object.fromEntries(response.headers as never));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }

    const file = await serveStatic(url.pathname);
    if (file) {
      res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': file.cache, 'X-Response-Time': `${Date.now() - started}ms` });
      res.end(file.body);
      return;
    }
    const index = await serveStatic('/');
    if (index) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(index.body);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: msg(e) }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`每日热搜榜 listening on :${PORT}  public=${PUBLIC} data=${DATA} sources=${sources.length} categories=${Object.keys(CATEGORY_LABEL).length}`);
  // 启动即预热（不阻塞监听）
  void tick();
  setInterval(() => void tick(), 60_000);
});
