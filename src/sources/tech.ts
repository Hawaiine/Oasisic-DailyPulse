import type { HotItem, Source } from '../types';
import { clip, getJSON, getText, parseHot, unescapeHtml } from '../lib/http';
import mashdigi from './mashdigi';
import landian from './landian';

const github: Source = {
  id: 'github',
  name: 'GitHub Trending',
  category: 'tech',
  kind: 'hottest',
  home: 'https://github.com/trending',
  ttl: 1800,
  async fetch() {
    const html = await getText('https://github.com/trending?since=daily', {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    const chunks = html.split('<article class="Box-row">').slice(1, 31);
    const items: HotItem[] = [];
    for (const c of chunks) {
      const href = c.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"?]+)"/);
      const titleM = c.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
      if (!href || !titleM) continue;
      const repo = href[1].replace(/\s+/g, '');
      const title = titleM[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const stars = c.match(/href="\/[^"]+\/stargazers"[^>]*>\s*([\d,]+)/);
      const today = c.match(/([\d,]+)\s+stars?\s+today/);
      items.push({
        rank: items.length + 1,
        title: title || repo,
        url: `https://github.com/${repo}`,
        hot: parseHot(stars?.[1]),
        desc: today ? `今日 +${today[1]}` : clip(repo, 60),
      });
    }
    return items;
  },
};

const juejin: Source = {
  id: 'juejin',
  name: '稀土掘金',
  category: 'tech',
  kind: 'hottest',
  home: 'https://juejin.cn/',
  ttl: 600,
  async fetch() {
    const j = await getJSON<any>('https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot&spider=0', {
      referer: 'https://juejin.cn/',
    });
    const list: any[] = j?.data ?? [];
    return list
      .map((x, i) => ({
        rank: i + 1,
        title: String(x?.content?.title || ''),
        url: `https://juejin.cn/post/${x?.content?.content_id}`,
        hot: parseHot(x?.content_counter?.view),
        desc: clip(x?.author?.name, 40),
      }))
      .filter((x) => x.title);
  },
};

const sspai: Source = {
  id: 'sspai',
  name: '少数派',
  category: 'tech',
  kind: 'hottest',
  home: 'https://sspai.com/',
  ttl: 900,
  async fetch() {
    const j = await getJSON<any>('https://sspai.com/api/v1/article/index/page/get?limit=30&offset=0', {
      referer: 'https://sspai.com/',
      timeout: 15000,
    });
    const list: any[] = j?.data ?? [];
    return list
      .filter((x) => x?.title)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.title),
        url: `https://sspai.com/post/${x.id}`,
        hot: parseHot(x.like_count),
        desc: clip(x.summary, 110),
        tag: x.corner && x.corner.name ? String(x.corner.name).trim() : undefined,
        ts: x.released_time ? Number(x.released_time) : undefined,
      }));
  },
};

const bilibili: Source = {
  id: 'bilibili',
  name: '哔哩哔哩',
  category: 'ent',
  kind: 'hottest',
  home: 'https://www.bilibili.com/',
  ttl: 600,
  async fetch() {
    // B 站对 Cloudflare 出口 IP 常见 412：先取 buvid 指纹，再依次尝试 web / app 接口
    let cookie = '';
    try {
      const spi = await getJSON<any>('https://api.bilibili.com/x/frontend/finger/spi', {
        referer: 'https://www.bilibili.com/',
        timeout: 6000,
      });
      const b3 = spi?.data?.b_3;
      const b4 = spi?.data?.b_4;
      if (b3) cookie = `buvid3=${b3}${b4 ? `; buvid4=${b4}` : ''}`;
    } catch {
      /* 指纹接口也可能 412，忽略 */
    }
    const headers: Record<string, string> = cookie ? { Cookie: cookie } : {};
    const candidates: { url: string; pick: (j: any) => any[] }[] = [
      { url: 'https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all', pick: (j) => j?.data?.list ?? [] },
      { url: 'https://app.bilibili.com/x/v2/rank?order=all&pn=1&ps=20', pick: (j) => j?.data ?? [] },
      { url: 'https://api.bilibili.com/x/web-interface/popular?ps=30&pn=1', pick: (j) => j?.data?.list ?? [] },
    ];
    let list: any[] = [];
    let lastErr: unknown = null;
    for (const c of candidates) {
      try {
        const j = await getJSON<any>(c.url, { referer: 'https://www.bilibili.com/', headers, timeout: 8000 });
        const got = c.pick(j);
        if (Array.isArray(got) && got.length) {
          list = got;
          break;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    if (!list.length) throw lastErr || new Error('all bilibili endpoints blocked');
    return list
      .filter((x) => x?.title)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.title),
        url: x.bvid ? `https://www.bilibili.com/video/${x.bvid}` : 'https://www.bilibili.com/',
        hot: parseHot(x?.stat?.view ?? x?.play),
        desc: clip(x?.owner?.name ?? x?.author, 40),
        ts: x.pubdate ? Number(x.pubdate) : undefined,
      }));
  },
};


const bilibiliHot: Source = {
  id: 'bilibili-hot',
  name: 'B站热搜',
  category: 'ent',
  kind: 'hottest',
  home: 'https://search.bilibili.com/',
  ttl: 300,
  async fetch() {
    const j = await getJSON<any>('https://api.bilibili.com/x/web-interface/search/square?limit=30', {
      referer: 'https://www.bilibili.com/',
    });
    const list: any[] = j?.data?.trending?.list ?? [];
    return list
      .filter((x) => x && (x.show_name || x.keyword))
      .slice(0, 30)
      .map((x, i) => {
        const kw = String(x.show_name || x.keyword);
        const icon = String(x.icon || '').replace(/^http:\/\//, 'https://');
        return {
          rank: i + 1,
          title: kw,
          url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(String(x.keyword || kw))}`,
          tagIcon: /^https:\/\//.test(icon) ? `/api/badge?u=${encodeURIComponent(icon)}` : undefined,
        };
      });
  },
};


/** 从 HTML 里按 URL 模式抓「链接 + 文本」，去重保序 */
function linkList(html: string, urlRe: RegExp, max: number): HotItem[] {
  const out: HotItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(`<a[^>]+href="(${urlRe.source})"[^>]*>([^<]{4,90})</a>`, 'g');
  while ((m = re.exec(html)) && out.length < max) {
    const url = m[1];
    const title = unescapeHtml(m[2].trim());
    if (!title || seen.has(url)) continue;
    seen.add(url);
    out.push({ rank: out.length + 1, title, url });
  }
  return out;
}


const gcores: Source = {
  id: 'gcores',
  name: '机核',
  category: 'ent',
  kind: 'hottest',
  home: 'https://www.gcores.com/',
  ttl: 600,
  async fetch() {
    const j = await getJSON<any>('https://www.gcores.com/gapi/v1/articles?page[limit]=24&sort=-published-at', {
      referer: 'https://www.gcores.com/',
    });
    const list: any[] = j?.data ?? [];
    return list
      .map((x, i) => {
        const a = x?.attributes ?? {};
        const raw = a['published-at'];
        const t = raw ? Math.floor(new Date(String(raw)).getTime() / 1000) : 0;
        return {
          rank: i + 1,
          title: String(a.title || ''),
          url: `https://www.gcores.com/articles/${x.id}`,
          desc: clip(String(a.desc || a.summary || ''), 110),
          ts: t > 0 ? t : undefined,
          tag: a.category === 'news' ? '资讯' : undefined,
        };
      })
      .filter((x) => x.title);
  },
};

const gamersky: Source = {
  id: 'gamersky',
  name: '游民星空',
  category: 'ent',
  kind: 'hottest',
  home: 'https://www.gamersky.com/news/',
  ttl: 600,
  async fetch() {
    const html = await getText('https://www.gamersky.com/news/', { referer: 'https://www.gamersky.com/' });
    const out: HotItem[] = [];
    const re = /<a([^>]*\bclass="tt"[^>]*)>([^<]{4,90})<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < 30) {
      const href = /href="([^"]+)"/.exec(m[1])?.[1] || '';
      const title = unescapeHtml(m[2].trim());
      if (!/^https?:\/\//.test(href) || !title) continue;
      out.push({ rank: out.length + 1, title, url: href });
    }
    return out;
  },
};

const dm3: Source = {
  id: '3dm',
  name: '3DM',
  category: 'ent',
  kind: 'hottest',
  home: 'https://www.3dmgame.com/news/',
  ttl: 600,
  async fetch() {
    const html = await getText('https://www.3dmgame.com/news/', { referer: 'https://www.3dmgame.com/' });
    return linkList(html, /https:\/\/www\.3dmgame\.com\/news\/\d{6}\/\d+\.html/g, 30);
  },
};

const mydrivers: Source = {
  id: 'mydrivers',
  name: '快科技',
  category: 'tech',
  kind: 'hottest',
  home: 'https://news.mydrivers.com/',
  ttl: 600,
  async fetch() {
    const html = await getText('https://news.mydrivers.com/', { referer: 'https://news.mydrivers.com/' });
    return linkList(html, /https:\/\/news\.mydrivers\.com\/1\/\d+\/\d+\.htm/g, 30);
  },
};

const huxiu: Source = {
  id: 'huxiu', name: '虎嗅', category: 'tech', kind: 'hottest', home: 'https://www.huxiu.com', ttl: 600,
  async fetch() {
    const r = await fetch('https://moment-api.huxiu.com/web-v3/moment/feed?platform=www', {timeout:15000});
    if (!r.ok) throw new Error('huxiu '+r.status);
    const j = await r.json();
    return (j.data?.moment_list?.datalist||[]).slice(0,30).map((v: any, i: number) => {
      const t = String(v.content||'').split(/[。\n]/)[0]?.trim()||'';
      return {rank:i+1, title:t, url:'https://www.huxiu.com/moment/'+v.object_id+'.html', hot:v.count_info?.agree_num};
    }).filter((x: any) => x.title);
  }
};
const ifanr: Source = {
  id: 'ifanr', name: '爱范儿', category: 'tech', kind: 'hottest', home: 'https://www.ifanr.com', ttl: 600,
  async fetch() {
    const r = await fetch('https://sso.ifanr.com/api/v5/wp/buzz/?limit=20', {timeout:15000});
    if (!r.ok) throw new Error('ifanr '+r.status);
    const j = await r.json();
    return (j.objects||[]).map((v: any, i: number) => ({
      rank:i+1, title:String(v.post_title||'').trim(),
      url:v.buzz_original_url||'https://www.ifanr.com/'+v.post_id, hot:v.like_count
    })).filter((x: any) => x.title);
  }
};
const v2ex: Source = {
  id: 'v2ex', name: 'V2EX', category: 'tech', kind: 'hottest', home: 'https://www.v2ex.com', ttl: 600,
  async fetch() {
    const r = await fetch('https://www.v2ex.com/api/topics/hot.json', {timeout:20000});
    if (!r.ok) throw new Error('v2ex '+r.status);
    const j = await r.json();
    return (j || []).map((v: any, i: number) => ({
      rank:i+1, title:String(v.title||'').trim(), url:v.url, hot:v.replies
    })).filter((x: any) => x.title);
  }
};
const guokr: Source = {
  id: 'guokr', name: '果壳', category: 'tech', kind: 'hottest', home: 'https://www.guokr.com', ttl: 600,
  async fetch() {
    const r = await fetch('https://www.guokr.com/beta/proxy/science_api/articles?retrieve_type=by_subject&limit=20', {timeout:15000});
    if (!r.ok) throw new Error('guokr '+r.status);
    const j = await r.json();
    return (Array.isArray(j) ? j : []).map((v: any, i: number) => ({
      rank:i+1, title:String(v.title||'').trim(), url:'https://www.guokr.com/article/'+v.id+'/', hot:v.replies_count
    })).filter((x: any) => x.title);
  }
};
export const techSources: Source[] = [bilibiliHot, github, juejin, sspai, bilibili, gcores, gamersky, dm3, mydrivers, huxiu, ifanr, v2ex, guokr,
  mashdigi
,
  landian
];
