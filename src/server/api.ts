import type { HotItem, Source } from '../types';
import { sources as ALL, sourceMap, CATEGORY_LABEL } from '../sources/index';
import { mergeByEvent, xmlEscape } from '../lib/text';
import type { Snap, Store } from './store';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200, maxAge = 20): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}`, ...CORS },
  });
}

function fail(code: string, message: string, status = 502): Response {
  return json({ ok: false, error: { code, message } }, status, 0);
}

function msg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const se = e as { stage?: string; status?: number; message: string };
    return `${se.stage || 'error'}${se.status ? `(${se.status})` : ''}: ${se.message}`;
  }
  return String(e);
}

/** 正确性校验：标题非空、URL 合法且属于该源的域名族，剔除占位/相对链接 */
const HOSTS: Record<string, string[]> = {
  weibo: ['weibo.com', 'weibo.cn'],
  zhihu: ['zhihu.com'],
  baidu: ['baidu.com', 'baiducontent.com'],
  douyin: ['douyin.com', 'iesdouyin.com'],
  toutiao: ['toutiao.com'],
  tieba: ['baidu.com'],
  'douban-movie': ['douban.com'],
  thepaper: ['thepaper.cn'],
  wallstreetcn: ['wallstreetcn.com', 'wallstcn.com'],
  '36kr': ['36kr.com'],
  ithome: ['ithome.com'],
  tencent: ['qq.com'],
  netease: ['163.com'],
  sina: ['sina.cn', 'sina.com.cn'],
  'zhihu-daily': ['zhihu.com'],
  hackernews: ['ycombinator.com', 'github.com'],
  github: ['github.com'],
  juejin: ['juejin.cn'],
  sspai: ['sspai.com'],
  xhs: ['xiaohongshu.com'],
  bilibili: ['bilibili.com'],
  'bilibili-hot': ['bilibili.com'],
  mashdigi: ['mashdigi.com'],
  landian: ['landian.news'],
  biggo: ['biggo.com.tw'],
};

/** 平台自带标签归一化：只保留真正的角标（热/新/沸/爆/荐/辟谣/解读），其余（时间、作者名）丢弃 */
const TAG_ALIAS: Record<string, string> = {
  hot: '热', new: '新', boil: '沸', boom: '爆', explode: '爆', hotsearch: '热',
  refuterumors: '辟谣', interpretation: '解读', recommend: '荐', warm: '暖',
};
const TAG_KEEP = new Set(['热', '新', '沸', '爆', '荐', '暖', '辟谣', '解读', '榜', '视频', '图文', '直播']);
function normalizeTag(v: unknown): string | undefined {
  const raw = String(v ?? '').trim();
  if (!raw) return undefined;
  const mapped = TAG_ALIAS[raw.toLowerCase()] ?? raw;
  return TAG_KEEP.has(mapped) ? mapped : undefined;
}

export function sanitize(src: Source, items: HotItem[]): HotItem[] {
  const hosts = HOSTS[src.id];
  const seen = new Set<string>();
  const out: HotItem[] = [];
  for (const it of items) {
    const title = String(it.title || '').replace(/\s+/g, ' ').trim();
    if (!title || title.length < 2 || seen.has(title)) continue;
    let url = String(it.url || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      const u = new URL(url);
      if (hosts && hosts.length && !hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) continue;
    } catch {
      continue;
    }
    seen.add(title);
    out.push({ ...it, title, url, rank: out.length + 1, tag: normalizeTag(it.tag) });
  }
  return out;
}

interface Deps {
  store: Store;
  refresh: (src: Source) => Promise<Snap>;
  peek: (id: string) => Snap | undefined;
}

export function createApi({ store, refresh, peek }: Deps) {
  const load = async (src: Source, force = false): Promise<Snap> => {
    const mem = peek(src.id);
    const disk = mem ?? store.read(src.id) ?? undefined;
    const age = disk ? Date.now() - disk.updated : Infinity;
    if (!force && disk && disk.items.length && age < src.ttl * 1000) return disk;
    if (disk && !force && age < Math.max(src.ttl * 1000, 15 * 60_000)) {
      // 过期但未超 15 分钟：先返回旧数据，后台刷新
      void refresh(src).catch(() => {});
      return disk;
    }
    return refresh(src);
  };

  const buildBlocks = async (limit: number, prev?: { blocks?: { id: string; items?: { title: string; rank?: number }[] }[] } | null) => {
    const results = await Promise.allSettled(ALL.map((s) => load(s)));
    const prevRank = new Map<string, Map<string, number>>();
    for (const b of prev?.blocks ?? []) {
      const m = new Map<string, number>();
      for (const it of b.items ?? []) if (it.rank) m.set(it.title, it.rank);
      prevRank.set(b.id, m);
    }
    return ALL.map((s, i) => {
      const r = results[i];
      const snap = r.status === 'fulfilled' ? r.value : peek(s.id) ?? store.read(s.id);
      const items = (snap?.items ?? []).slice(0, limit);
      const before = prevRank.get(s.id);
      return {
        id: s.id,
        name: s.name,
        category: s.category,
        categoryLabel: CATEGORY_LABEL[s.category],
        kind: s.kind,
        home: s.home,
        ttl: s.ttl,
        status: snap ? (snap.status === 'ok' ? (Date.now() - snap.updated > s.ttl * 2000 ? 'stale' : 'ok') : snap.status) : 'pending',
        updated: Math.floor((snap?.updated ?? 0) / 1000),
        ageSec: snap ? Math.floor((Date.now() - snap.updated) / 1000) : null,
        error: snap?.error ?? null,
        total: snap?.items.length ?? 0,
        items: items.map((it) => {
          const rank = it.rank ?? 1;
          const was = before?.get(it.title);
          return { ...it, rank, delta: was ? was - rank : undefined, isNew: !!before && before.size > 0 && was === undefined };
        }),
      };
    });
  };

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      if (path === '/api/bootstrap') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 10), 3), 40);
        const t0 = Date.now();
        const packed = url.searchParams.get('fresh') === '1' ? null : store.readPack();
        const usePacked = packed && Date.now() / 1000 - (packed.generated || 0) < 600;
        const tickerBlocks = await buildBlocks(12, null);
          const tickerSources = ['weibo', 'toutiao', 'ithome', 'thepaper', 'huxiu'];
          const tickerItems: Array<{ time: number; title: string; src: string; url: string; logo?: string }> = [];
          for (const src of tickerSources) {
            const b = tickerBlocks.find(x => x.id === src);
            if (b?.items) {
              for (const item of b.items.slice(0, 3)) {
                tickerItems.push({
                  time: item.ts || Math.floor(Date.now() / 1000),
                  title: item.title,
                  src: b.name,
                  url: item.url,
                  logo: `/logos/${src}.png`,
                });
              }
            }
          }
          tickerItems.sort((a, b) => b.time - a.time);
          const ticker = tickerItems.slice(0, 20);
          const payload = usePacked
          ? packed
          : { ok: true, generated: Math.floor(Date.now() / 1000), total: ALL.length, categories: CATEGORY_LABEL, blocks: await buildBlocks(limit, packed as never), timeline: buildTimeline(await buildBlocks(limit, null)), aggregate: buildAggregate(await buildBlocks(12, null)), ticker };
        const res = json(payload, 200, 15);
        res.headers.set('Server-Timing', `boot;dur=${Date.now() - t0}, src;desc="${usePacked ? 'file' : 'live'}"`);
        return res;
      }

      if (path === '/api/sources') {
        return json({
          ok: true,
          total: ALL.length,
          categories: CATEGORY_LABEL,
          sources: ALL.map((s) => {
            const snap = peek(s.id) ?? store.read(s.id);
            return { id: s.id, name: s.name, category: s.category, kind: s.kind, home: s.home, ttl: s.ttl, status: snap?.status ?? 'idle', updated: Math.floor((snap?.updated ?? 0) / 1000), count: snap?.items.length ?? 0, latency: snap?.latency ?? null };
          }),
        });
      }

      if (path === '/api/status') {
        const states: Record<string, unknown> = {};
        let degraded = 0;
        for (const s of ALL) {
          const snap = peek(s.id) ?? store.read(s.id);
          states[s.id] = snap ? { status: snap.status, updated: Math.floor(snap.updated / 1000), ageSec: Math.floor((Date.now() - snap.updated) / 1000), count: snap.items.length, latency: snap.latency, lastError: snap.error } : null;
          if (!snap || snap.status !== 'ok') degraded++;
        }
        return json({ ok: true, sources: ALL.length, degraded, states });
      }

      if (path.startsWith('/api/hot')) {
        const id = path.replace('/api/hot', '').replace(/^\//, '') || url.searchParams.get('id') || '';
        const src = sourceMap.get(id);
        if (!src) return fail('not_found', `unknown source: ${id}`, 404);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
        const snap = await load(src, url.searchParams.get('force') === '1');
        return json({
          ok: true,
          id: src.id,
          name: src.name,
          updated: Math.floor(snap.updated / 1000),
          ageSec: Math.floor((Date.now() - snap.updated) / 1000),
          stale: snap.status !== 'ok',
          error: snap.error ?? null,
          total: snap.items.length,
          items: snap.items.slice(0, limit),
        });
      }

      if (path === '/api/timeline') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 40), 1), 200);
        const blocks = await buildBlocks(12);
        return json({ ok: true, items: buildTimeline(blocks).slice(0, limit) });
      }

      if (path === '/api/aggregate') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 30), 1), 100);
        return json({ ok: true, items: buildAggregate(await buildBlocks(12)).slice(0, limit) });
      }

      if (path === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        if (!q) return fail('bad_request', 'q required', 400);
        const hits: (HotItem & { from: string; sourceId: string })[] = [];
        for (const s of ALL) {
          const snap = peek(s.id) ?? store.read(s.id);
          if (!snap) continue;
          for (const it of snap.items) if (it.title.toLowerCase().includes(q)) hits.push({ ...it, from: s.name, sourceId: s.id });
        }
        return json({ ok: true, q, count: hits.length, items: hits.slice(0, 80) });
      }

      if (path.startsWith('/api/rss/')) {
        const src = sourceMap.get(path.replace('/api/rss/', ''));
        if (!src) return fail('not_found', 'unknown source', 404);
        const snap = await load(src);
        const items = snap.items.map((it) => `    <item>\n      <title>${xmlEscape(it.title)}</title>\n      <link>${xmlEscape(it.url)}</link>\n      <guid isPermaLink="false">${xmlEscape(`${src.id}:${it.title}`)}</guid>\n      <pubDate>${new Date(snap.updated).toUTCString()}</pubDate>\n    </item>`).join('\n');
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${xmlEscape(src.name)} · 每日热搜榜</title><link>${xmlEscape(src.home)}</link><description>${xmlEscape(src.name)} 热榜</description><language>zh-cn</language><lastBuildDate>${new Date(snap.updated).toUTCString()}</lastBuildDate>\n${items}\n</channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...CORS } });
      }

      if (path === '/api/health') return json({ ok: true, ts: Date.now(), sources: ALL.length, store: 'file' });

      return fail('not_found', `no route: ${path}`, 404);
    } catch (e) {
      return fail('upstream_error', msg(e), 502);
    }
  };
}

function buildTimeline(blocks: { id: string; name: string; kind: string; items: (HotItem & { delta?: number })[] }[]) {
  const out: (HotItem & { from: string; sourceId: string })[] = [];
  for (const b of blocks) {
    if (b.kind !== 'realtime' && !['ithome', 'netease', 'sspai'].includes(b.id)) continue;
    for (const it of b.items) if (it.ts) out.push({ ...it, from: b.name, sourceId: b.id });
  }
  return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function buildAggregate(blocks: { id: string; name: string; items: HotItem[] }[]) {
  const feed: { title: string; url: string; hot?: HotItem['hot']; from: string; sourceId: string }[] = [];
  for (const b of blocks) for (const it of b.items.slice(0, 12)) feed.push({ title: it.title, url: it.url, hot: it.hot, from: b.name, sourceId: b.id });
  return mergeByEvent(feed, 40);
}
