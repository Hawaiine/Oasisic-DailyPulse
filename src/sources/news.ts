import type { HotItem, Source } from '../types';
import { clip, getJSON, getText, parseHot, unescapeHtml } from '../lib/http';

const thepaper: Source = {
  id: 'thepaper',
  name: '澎湃新闻',
  category: 'news',
  kind: 'hottest',
  home: 'https://www.thepaper.cn/',
  ttl: 600,
  async fetch() {
    const j = await getJSON<any>('https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar', {
      referer: 'https://www.thepaper.cn/',
    });
    const list: any[] = j?.data?.hotNews ?? [];
    return list
      .filter((x) => x?.name)
      .slice(0, 30)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.name),
        url: x.contId ? `https://www.thepaper.cn/newsDetail_forward_${x.contId}` : 'https://www.thepaper.cn/',
        hot: parseHot(x.praiseTimes),
        desc: clip(x.nodeInfo?.name, 40),
        tag: x.pubTime ? String(x.pubTime) : undefined,
      }));
  },
};

const wallstreetcn: Source = {
  id: 'wallstreetcn',
  name: '华尔街见闻',
  category: 'news',
  kind: 'realtime',
  home: 'https://wallstreetcn.com/live/global',
  ttl: 120,
  async fetch() {
    const j = await getJSON<any>('https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=40', {
      referer: 'https://wallstreetcn.com/',
    });
    const list: any[] = j?.data?.items ?? [];
    return list
      .filter((x) => x?.content_text)
      .map((x, i) => ({
        rank: i + 1,
        title: clip(x.content_text, 90) || '',
        url: x.id ? `https://wallstreetcn.com/livenews/${x.id}` : 'https://wallstreetcn.com/live/global',
        ts: x.display_time ? Number(x.display_time) : undefined,
        desc: clip(x.content_text, 160),
      }));
  },
};

const kr36: Source = {
  id: '36kr',
  name: '36氪',
  category: 'news',
  kind: 'hottest',
  home: 'https://36kr.com/',
  ttl: 600,
  async fetch() {
    const j = await getJSON<any>('https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot', {
      referer: 'https://36kr.com/',
      origin: 'https://36kr.com',
      body: { partner_id: 'wap', param: { siteId: 1, platformId: 2 }, timestamp: Date.now() },
    });
    const list: any[] = j?.data?.hotRankList ?? [];
    return list
      .map((x, i) => {
        const m = x?.templateMaterial || {};
        return {
          rank: i + 1,
          title: String(m.widgetTitle || ''),
          url: x?.itemId ? `https://36kr.com/p/${x.itemId}` : 'https://36kr.com/',
          hot: parseHot(m.statRead ?? m.statFormat),
        };
      })
      .filter((x) => x.title);
  },
};

const ithome: Source = {
  id: 'ithome',
  name: 'IT之家',
  category: 'news',
  kind: 'hottest',
  home: 'https://www.ithome.com/',
  ttl: 300,
  async fetch() {
    const j = await getJSON<any>('https://api.ithome.com/json/newslist/news', { referer: 'https://www.ithome.com/' });
    const list: any[] = [...(j?.toplist ?? []), ...(j?.newslist ?? [])];
    const seen = new Set<string>();
    return list
      .filter((x) => x?.title && !seen.has(String(x.title)) && seen.add(String(x.title)))
      .slice(0, 40)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.title),
        url: `https://www.ithome.com/0/${Math.floor(Number(x.newsid) / 1000)}/${Number(x.newsid) % 1000}.htm`,
        hot: parseHot(x.hitcount),
        desc: clip(x.description, 110),
        ts: x.postdate ? Math.floor(new Date(String(x.postdate).replace(/(\.\d+)?$/, '+08:00')).getTime() / 1000) || undefined : undefined,
      }));
  },
};

const tencent: Source = {
  id: 'tencent',
  name: '腾讯新闻',
  category: 'news',
  kind: 'hottest',
  home: 'https://news.qq.com/',
  ttl: 600,
  async fetch() {
    const j = await getJSON<any>('https://r.inews.qq.com/gw/event/hot_ranking_list?page_size=50', {
      referer: 'https://news.qq.com/',
    });
    const list: any[] = j?.idlist?.[0]?.newslist ?? [];
    return list
      .filter((x) => x?.title && x?.url)
      .slice(0, 40)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.title),
        url: String(x.url),
        hot: parseHot(x.hotScore),
        desc: clip(x.abstract, 110),
        tag: x.label ? String(x.label) : undefined,
      }));
  },
};

const netease: Source = {
  id: 'netease',
  name: '网易新闻',
  category: 'news',
  kind: 'hottest',
  home: 'https://news.163.com/',
  ttl: 300,
  async fetch() {
    const j = await getJSON<any>('https://m.163.com/fe/api/hot/news/flow', { referer: 'https://news.163.com/' });
    const list: any[] = j?.data?.list ?? [];
    return list
      .filter((x) => x?.title)
      .slice(0, 40)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.title),
        url: String(x.url || `https://3g.163.com/news/article/${x.docid}.html`),
        desc: clip(x.source, 30),
        tag: x.source ? String(x.source) : undefined,
      }));
  },
};

const sina: Source = {
  id: 'sina',
  name: '新浪热榜',
  category: 'news',
  kind: 'hottest',
  home: 'https://sinanews.sina.cn/h5/top_news_list.d.html',
  ttl: 300,
  async fetch() {
    const j = await getJSON<any>('https://newsapp.sina.cn/api/hotlist?newsId=HB-1-snhs/top_news_list-all', {
      referer: 'https://news.sina.cn/',
    });
    const list: any[] = j?.data?.hotList ?? [];
    return list
      .map((x, i) => {
        const b = x?.base?.base || {};
        const decos: any[] = x?.base?.decoration ?? [];
        const hotDeco = decos.find((d) => d?.hotValue !== undefined);
        return {
          rank: i + 1,
          title: String(x?.base?.dynamicName || ''),
          url: String(b.url || 'https://news.sina.cn/'),
          hot: parseHot(hotDeco?.hotValue),
          tag: String(x?.info?.showTag || '').trim() || undefined,
        };
      })
      .filter((x) => x.title);
  },
};

const zhihuDaily: Source = {
  id: 'zhihu-daily',
  name: '知乎日报',
  category: 'news',
  kind: 'hottest',
  home: 'https://daily.zhihu.com/',
  ttl: 1800,
  async fetch() {
    // news-at.zhihu.com 在 Cloudflare→Cloudflare 场景下会返 530，优先用 daily 主域
    let j: any;
    try {
      j = await getJSON<any>('https://daily.zhihu.com/api/4/news/latest', { referer: 'https://daily.zhihu.com/' });
    } catch {
      j = await getJSON<any>('https://news-at.zhihu.com/api/4/news/latest', { referer: 'https://daily.zhihu.com/' });
    }
    const list: any[] = j?.stories ?? [];
    return list
      .filter((x) => x?.title)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.title),
        url: String(x.url || `https://daily.zhihu.com/story/${x.id}`),
        desc: clip(x.hint, 80),
      }));
  },
};


/** 通用 RSS 解析（<item> 结构） */
function rssItems(xml: string, max = 30): HotItem[] {
  const out: HotItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && out.length < max) {
    const blk = m[1];
    const strip = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const title = unescapeHtml(strip(/<title>([\s\S]*?)<\/title>/.exec(blk)?.[1] || ''));
    const link = strip(/<link>([\s\S]*?)<\/link>/.exec(blk)?.[1] || '');
    const pub = /<pubDate>([^<]+)<\/pubDate>/.exec(blk)?.[1];
    const desc = unescapeHtml(strip(/<description>([\s\S]*?)<\/description>/.exec(blk)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const t = pub ? Math.floor(new Date(pub).getTime() / 1000) : 0;
    if (!title || !/^https?:\/\//.test(link)) continue;
    out.push({ rank: out.length + 1, title, url: link, desc: clip(desc, 110), ts: t > 0 ? t : undefined });
  }
  return out;
}

const sinaTech: Source = {
  id: 'sina-tech',
  name: '新浪科技',
  category: 'tech',
  kind: 'hottest',
  home: 'https://tech.sina.com.cn/',
  ttl: 600,
  async fetch() {
    const j = await getJSON<any>('https://feed.mix.sina.com.cn/api/roll/get?pageid=372&lid=2431&num=30&page=1', {
      referer: 'https://tech.sina.com.cn/',
    });
    const list: any[] = j?.result?.data ?? [];
    return list
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.title || ''),
        url: String(x.url || ''),
        desc: clip(x.intro, 110),
        ts: x.ctime ? Number(x.ctime) : undefined,
      }))
      .filter((x) => x.title && /^https?:\/\//.test(x.url));
  },
};

const bbcZh: Source = {
  id: 'bbc-zh',
  name: 'BBC 中文',
  category: 'news',
  kind: 'hottest',
  home: 'https://www.bbc.com/zhongwen/simp',
  ttl: 900,
  async fetch() {
    const xml = await getText('https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', {
      referer: 'https://www.bbc.com/zhongwen/simp',
    });
    return rssItems(xml, 20);
  },
};

const nytZh: Source = {
  id: 'nyt-zh',
  name: '纽约时报中文',
  category: 'news',
  kind: 'hottest',
  home: 'https://cn.nytimes.com/',
  ttl: 900,
  async fetch() {
    const xml = await getText('https://cn.nytimes.com/rss/', { referer: 'https://cn.nytimes.com/' });
    return rssItems(xml, 20);
  },
};

export const newsSources: Source[] = [thepaper, wallstreetcn, kr36, ithome, tencent, netease, sina, zhihuDaily, sinaTech, bbcZh, nytZh];
