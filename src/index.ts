import type { HotItem, Source } from './types';
import { sourceMap, sources, CATEGORY_LABEL } from './sources/index';
import { load, peek, readPacked, stateOf, warmAll, writePacked } from './lib/cache';
import { mergeByEvent, xmlEscape } from './lib/text';
import type { Env } from './lib/cache';

export type { Env };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200, maxAge = 30): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 10}`,
      ...CORS,
    },
  });
}

function fail(code: string, message: string, status = 502, maxAge = 0): Response {
  return json({ ok: false, error: { code, message } }, status, maxAge);
}

function mapError(e: unknown): Response {
  const err = e as { stage?: string; status?: number; message?: string };
  const status = err?.status || 0;
  if (status === 403 || status === 412 || status === 429) return fail('upstream_blocked', err.message || 'upstream blocked', 502);
  if (status === 0 && /timeout|network|connection/i.test(err?.message || '')) return fail('timeout', err.message || 'timeout', 504);
  if (err?.stage === 'parse' || err?.stage === 'shape') return fail('upstream_changed', err.message || 'parse failed', 502);
  return fail('upstream_error', err?.message || 'unknown error', 502);
}

function sourceBase(s: Source) {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    categoryLabel: CATEGORY_LABEL[s.category],
    kind: s.kind,
    home: s.home,
    ttl: s.ttl,
  };
}

async function buildAggregate(category: string | null, limit: number) {
  const pool = category ? sources.filter((s) => s.category === category) : sources;
  const results = await Promise.allSettled(pool.map((s) => load(s)));
  const merged = [] as { title: string; url: string; hot?: HotItem['hot']; from: string; sourceId: string }[];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    for (const it of r.value.items.slice(0, 12)) {
      merged.push({ title: it.title, url: it.url, hot: it.hot, from: pool[i].name, sourceId: pool[i].id });
    }
  });
  return mergeByEvent(merged, limit);
}

function rss(s: Source, r: { items: HotItem[]; updated: number }): Response {
  const items = r.items
    .map(
      (it) =>
        `    <item>\n      <title>${xmlEscape(it.title)}</title>\n      <link>${xmlEscape(it.url)}</link>\n      <guid isPermaLink="false">${xmlEscape(`${s.id}:${it.title}`)}</guid>\n      <pubDate>${new Date(r.updated).toUTCString()}</pubDate>\n      ${it.desc ? `<description>${xmlEscape(it.desc)}</description>` : ''}\n    </item>`,
    )
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(s.name)} · 热榜</title>
    <link>${xmlEscape(s.home)}</link>
    <description>${xmlEscape(s.name)} 热榜（HotWave 聚合）</description>
    <language>zh-cn</language>
    <lastBuildDate>${new Date(r.updated).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...CORS },
  });
}

interface PrevPack {
  blocks?: { id: string; items?: { title: string; rank?: number }[] }[];
}

/** 首屏整包：内存命中就用内存，缺的并发抓；返回前按上一份快照算 delta/isNew */
async function buildPayload(env: Env, limit: number, prev?: PrevPack | null) {
  const missing = sources.filter((s) => !peek(s.id)?.items.length);
  if (missing.length) {
    // 冷启动兜底：最多等 3.5 秒，没回来的先标 pending，前端 2.5 秒后自动补拉
    await Promise.allSettled(
      missing.map((s) => Promise.race([load(s), new Promise((resolve) => setTimeout(resolve, 3500))])),
    );
  }

  const prevRank = new Map<string, Map<string, number>>();
  for (const b of prev?.blocks ?? []) {
    const m = new Map<string, number>();
    for (const it of b.items ?? []) if (it.rank) m.set(it.title, it.rank);
    prevRank.set(b.id, m);
  }

  const blocks = sources.map((s) => {
    const snap = peek(s.id);
    const items = snap?.items ?? [];
    const before = prevRank.get(s.id);
    const out = items.slice(0, limit).map(({ desc, ...rest }, i) => {
      const rank = rest.rank ?? i + 1;
      const was = before?.get(rest.title);
      return {
        ...rest,
        rank,
        delta: was ? was - rank : undefined,
        isNew: before && before.size > 0 ? was === undefined : false,
      };
    });
    return {
      ...sourceBase(s),
      status: items.length ? (snap!.status === 'ok' ? 'ok' : 'degraded') : (snap?.status ?? 'pending'),
      updated: Math.floor((snap?.updated ?? 0) / 1000),
      stale: snap?.status !== 'ok',
      error: snap?.error ?? null,
      total: items.length,
      items: out,
    };
  });

  const timeline: (HotItem & { from: string })[] = [];
  blocks.forEach((b) => {
    if (b.kind !== 'realtime' && !['ithome', 'netease', 'sspai'].includes(b.id)) return;
    for (const it of b.items) if (it.ts) timeline.push({ ...it, from: b.name });
  });
  timeline.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  // 直接用上面已经拿到的 items 做合并，避免二次回源
  const feed = [] as { title: string; url: string; hot?: HotItem['hot']; from: string; sourceId: string }[];
  blocks.forEach((b) => {
    for (const it of b.items.slice(0, 12)) feed.push({ title: it.title, url: it.url, hot: it.hot, from: b.name, sourceId: b.id });
  });
  const aggregate = mergeByEvent(feed, 6);

  return {
    ok: true,
    generated: Math.floor(Date.now() / 1000),
    total: sources.length,
    categories: CATEGORY_LABEL,
    blocks,
    timeline: timeline.slice(0, 24),
    aggregate,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      if (path === '/api/bootstrap') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 8), 3), 30);
        const fresh = url.searchParams.get('fresh') === '1';
        const t0 = Date.now();
        const packed = fresh ? null : await readPacked(env);
        const usePacked = packed && Date.now() / 1000 - (packed.generated || 0) < 900;
        const payload = usePacked ? packed : await buildPayload(env, limit, packed as unknown as PrevPack | null);
        const res = json(payload, 200, 20);
        res.headers.set('Server-Timing', `boot;dur=${Date.now() - t0}, src;desc="${usePacked ? 'kv' : 'live'}"`);
        return res;
      }

      if (path === '/api/sources') {
        return json(
          {
            ok: true,
            total: sources.length,
            categories: CATEGORY_LABEL,
            sources: sources.map((s) => {
              const st = stateOf(s.id);
              return { ...sourceBase(s), status: st?.status ?? 'idle', updated: Math.floor((st?.updated ?? 0) / 1000), count: st?.count ?? 0 };
            }),
          },
          200,
          60,
        );
      }

      if (path === '/api/status') {
        const states: Record<string, unknown> = {};
        let degraded = 0;
        for (const s of sources) {
          const st = stateOf(s.id);
          states[s.id] = st;
          if (!st || st.status !== 'ok') degraded++;
        }
        return json({ ok: true, sources: sources.length, degraded, states }, 200, 15);
      }

      if (path === '/api/hot' || path.startsWith('/api/hot/')) {
        const id = path.replace('/api/hot', '').replace(/^\//, '') || url.searchParams.get('id') || '';
        const src = sourceMap.get(id);
        if (!src) return fail('not_found', `unknown source: ${id || '(empty)'}`, 404);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 30), 1), 100);
        const force = url.searchParams.get('force') === '1';
        const r = await load(src, ctx, force);
        return json(
          {
            ok: true,
            ...sourceBase(src),
            updated: Math.floor(r.updated / 1000),
            cached: r.cached,
            stale: r.stale,
            error: r.error,
            total: r.items.length,
            items: r.items.slice(0, limit).map((it, i) => ({ ...it, rank: it.rank ?? i + 1 })),
          },
          200,
          30,
        );
      }

      if (path === '/api/batch') {
        const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12);
        if (!ids.length) return fail('bad_request', 'ids required', 400);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100);
        const out = await Promise.all(
          ids.map(async (id) => {
            const src = sourceMap.get(id);
            if (!src) return { ok: false, id, error: { code: 'not_found', message: 'unknown source' } };
            const r = await load(src, ctx);
            return { ok: true, ...sourceBase(src), updated: Math.floor(r.updated / 1000), stale: r.stale, total: r.items.length, items: r.items.slice(0, limit) };
          }),
        );
        return json({ ok: true, results: out }, 200, 30);
      }

      if (path === '/api/aggregate') {
        const category = url.searchParams.get('category');
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 40), 1), 100);
        const items = await buildAggregate(category, limit);
        return json({ ok: true, category: category || 'all', count: items.length, items }, 200, 60);
      }

      if (path === '/api/timeline') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 60), 1), 200);
        const pool = sources.filter((s) => s.kind === 'realtime' || ['ithome', 'netease', 'sspai'].includes(s.id));
        const results = await Promise.allSettled(pool.map((s) => load(s, ctx)));
        const items: (HotItem & { from: string })[] = [];
        results.forEach((r, i) => {
          if (r.status !== 'fulfilled') return;
          for (const it of r.value.items) if (it.ts) items.push({ ...it, from: pool[i].name });
        });
        items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        return json({ ok: true, count: items.slice(0, limit).length, items: items.slice(0, limit) }, 200, 30);
      }

      if (path === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        if (!q) return fail('bad_request', 'q required', 400);
        // 先用内存里的数据；内存太少再补抓，但最多等 2.5 秒（避免冷启动把搜索拖死）
        const inMem = sources.reduce((n, s) => n + (peek(s.id)?.items.length ?? 0), 0);
        if (inMem < 50) {
          await Promise.allSettled(
            sources.filter((s) => !peek(s.id)?.items.length).map((s) => Promise.race([load(s, ctx), new Promise((r) => setTimeout(r, 2500))])),
          );
        }
        const hits: (HotItem & { from: string; sourceId: string })[] = [];
        for (const s of sources) {
          const snap = peek(s.id);
          if (!snap) continue;
          for (const it of snap.items) {
            if (it.title.toLowerCase().includes(q)) hits.push({ ...it, from: s.name, sourceId: s.id });
          }
        }
        return json({ ok: true, q, count: hits.length, items: hits.slice(0, 60) }, 200, 60);
      }

      if (path.startsWith('/api/rss/')) {
        const id = path.replace('/api/rss/', '');
        const src = sourceMap.get(id);
        if (!src) return fail('not_found', `unknown source: ${id}`, 404);
        return rss(src, await load(src, ctx));
      }

      if (path === '/api/health') return json({ ok: true, ts: Date.now(), sources: sources.length, kv: !!env.HOT });

      return fail('not_found', `no route: ${path}`, 404);
    } catch (e) {
      return mapError(e);
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const prev = await readPacked(env);
        const warm = await warmAll(6);
        const payload = await buildPayload(env, 12, prev as PrevPack | null);
        const wrote = await writePacked(env, payload);
        console.log(`warm ok=${warm.ok} failed=${warm.failed} packed=${wrote} sources=${payload.blocks.filter((b) => b.items.length).length}/${payload.total}`);
      })(),
    );
  },
};
