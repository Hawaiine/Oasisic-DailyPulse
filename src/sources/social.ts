import type { HotItem, Source } from '../types';
import { collect, getJSON, parseHot, clip } from '../lib/http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const weibo: Source = {
  id: 'weibo',
  name: '微博',
  category: 'social',
  kind: 'hottest',
  home: 'https://weibo.com',
  ttl: 180,
  async fetch() {
    const j = await getJSON<any>('https://weibo.com/ajax/side/hotSearch', { referer: 'https://weibo.com/' });
    const list: any[] = j?.data?.realtime ?? [];
    return list
      .filter((x) => x && (x.word || x.note))
      .slice(0, 50)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.note || x.word),
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${x.word || x.note}#`)}`,
        hot: typeof x.num === 'number' ? x.num : parseHot(x.num),
        tag: x.label_name || undefined,
      }));
  },
};

const zhihu: Source = {
  id: 'zhihu',
  name: '知乎',
  category: 'social',
  kind: 'hottest',
  home: 'https://www.zhihu.com/hot',
  ttl: 300,
  async fetch() {
    const j = await getJSON<any>('https://api.zhihu.com/topstory/hot-lists/total?limit=50', {
      referer: 'https://www.zhihu.com/',
    });
    const list: any[] = j?.data ?? [];
    return list
      .map((x, i) => {
        const t = x?.target || {};
        const url = String(t.url || '').replace('api.zhihu.com', 'www.zhihu.com').replace('/questions/', '/question/');
        return {
          rank: i + 1,
          title: String(t.title || ''),
          url: url || `https://www.zhihu.com/question/${t.id}`,
          hot: parseHot(x?.detail_text),
          desc: clip(t.excerpt, 110),
          // 知乎 card_label.type='hot' → 「热」；debut=true 首次上榜 → 「新」
          tag: x?.card_label?.type === 'hot' ? '热' : x?.debut ? '新' : undefined,
        };
      })
      .filter((x) => x.title);
  },
};

const baidu: Source = {
  id: 'baidu',
  name: '百度',
  category: 'social',
  kind: 'hottest',
  home: 'https://top.baidu.com/board?tab=realtime',
  ttl: 180,
  async fetch() {
    const j = await getJSON<any>('https://top.baidu.com/api/board?platform=pc&tab=realtime', {
      referer: 'https://top.baidu.com/board?tab=realtime',
    });
    const rows = j?.data?.cards?.[0]?.content ?? [];
    return rows
      .slice(0, 50)
      .map((o: any, i) => ({
        rank: i + 1,
        title: String(o.word || o.query),
        url: String(o.url || `https://www.baidu.com/s?wd=${encodeURIComponent(String(o.word || o.query))}`),
        hot: parseHot(o.hotScore ?? o.hot),
        desc: clip(o.desc, 110),
        // 百度 hotTag：1=热 2=新 3=沸（0=无）
        tag: o.isTop ? undefined : ({ 1: '热', 2: '新', 3: '沸' } as Record<string, string>)[String(o.hotTag)] || undefined,
      }))
      .filter((x) => x.title);
  },
};

const DOUYIN_LABEL: Record<number, string> = { 1: '新', 3: '热', 5: '爆' };

const douyin: Source = {
  id: 'douyin',
  name: '抖音',
  category: 'social',
  kind: 'hottest',
  home: 'https://www.douyin.com/hot',
  ttl: 240,
  async fetch() {
    const j = await getJSON<any>(
      'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1',
      { referer: 'https://www.douyin.com/' },
    );
    const list: any[] = j?.data?.word_list ?? [];
    return list
      .filter((x) => x?.word)
      .slice(0, 50)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.word),
        url: x.sentence_id ? `https://www.douyin.com/hot/${x.sentence_id}` : 'https://www.douyin.com/hot',
        hot: parseHot(x.hot_value),
        // 抖音 label: 1=新 3=热 5=爆（0=普通）
        tag: DOUYIN_LABEL[Number(x.label)] || undefined,
      }));
  },
};

const toutiao: Source = {
  id: 'toutiao',
  name: '今日头条',
  category: 'social',
  kind: 'hottest',
  home: 'https://www.toutiao.com/',
  ttl: 240,
  async fetch() {
    const j = await getJSON<any>('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', {
      referer: 'https://www.toutiao.com/',
    });
    const list: any[] = j?.data ?? [];
    return list
      .filter((x) => x?.Title)
      .slice(0, 50)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.Title),
        url: String(x.Url || 'https://www.toutiao.com/'),
        hot: parseHot(x.HotValue),
        tag: (x.LabelDesc && x.LabelDesc !== 'None' ? String(x.LabelDesc) : x.Label === 'hot' ? '热' : undefined),
      }));
  },
};

const TIEBA_TAG: Record<string, string> = { 1: '热', 2: '新', 3: '爆' };

const tieba: Source = {
  id: 'tieba',
  name: '百度贴吧',
  category: 'social',
  kind: 'hottest',
  home: 'https://tieba.baidu.com/',
  ttl: 300,
  async fetch() {
    const j = await getJSON<any>('https://tieba.baidu.com/hottopic/browse/topicList', {
      referer: 'https://tieba.baidu.com/',
    });
    const list: any[] = j?.data?.bang_topic?.topic_list ?? [];
    return list
      .filter((x) => x?.topic_name)
      .slice(0, 40)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.topic_name),
        url: String(x.topic_url || 'https://tieba.baidu.com/').replace(/&amp;/g, '&'),
        hot: parseHot(x.discuss_num),
        desc: clip(x.topic_desc, 110),
        tag: TIEBA_TAG[String(x.tag)] || undefined,
      }));
  },
};

const doubanMovie: Source = {
  id: 'douban-movie',
  name: '豆瓣电影',
  category: 'ent',
  kind: 'hottest',
  home: 'https://movie.douban.com/',
  ttl: 3600,
  async fetch() {
    const j = await getJSON<any>(
      'https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&page_limit=30&page_start=0',
      { referer: 'https://movie.douban.com/' },
    );
    const list: any[] = j?.subjects ?? [];
    return list
      .filter((x) => x?.title)
      .map((x, i) => ({
        rank: i + 1,
        title: String(x.title),
        url: String(x.url),
        hot: x.rate ? `评分 ${x.rate}` : undefined,
        tag: x.is_new ? '新' : undefined,
      }));
  },
};


const smzdm: Source = {
  id: 'smzdm',
  name: '什么值得买',
  category: 'social',
  kind: 'hottest',
  home: 'https://www.smzdm.com',
  ttl: 600,
  async fetch() {
    const script = process.cwd() + '/scripts/browser-fetch.mjs';
    const { stdout } = await execFileP(process.execPath, [script, 'smzdm'], {
      timeout: 90000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '/opt/daily-pulse/.browsers' },
    });
    const arr = JSON.parse(stdout || '[]');
    return arr
      .map((x: any) => ({ rank: x.rank, title: String(x.title || '').trim(), url: String(x.url || '') }))
      .filter((x: any) => x.title);
  },
};


const weread: Source = {
  id: 'weread',
  name: '微信读书',
  category: 'social',
  kind: 'hottest',
  home: 'https://weread.qq.com',
  ttl: 600,
  async fetch() {
    const url = 'https://weread.qq.com/api/promo/list?type=recommend_web&count=20';
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        'Referer': 'https://weread.qq.com/'
      }
    });
    if (!resp.ok) throw new Error('weread '+resp.status);
    const j = await resp.json();
    const books = j.books || [];
    return books.map((x, i) => ({
      rank: i + 1,
      title: String(x.title || x.name || '').trim(),
      url: `https://weread.qq.com/web/reader/${x.bookId}`
    })).filter(x => x.title);
  },
};




const acfun: Source = {
  id: 'acfun', name: 'AcFun', category: 'social', kind: 'hottest', home: 'https://www.acfun.cn', ttl: 600,
  async fetch() {
    const r = await fetch('https://www.acfun.cn/rest/pc-direct/rank/channel?channelId=&rankLimit=30&rankPeriod=DAY',
      {timeout:15000, headers:{'Referer':'https://www.acfun.cn/rank/list/'}});
    if (!r.ok) throw new Error('acfun '+r.status);
    const j = await r.json();
    return (j.rankList||[]).map((v: any, i: number) => ({
      rank:i+1, title:String(v.contentTitle||'').trim(),
      url:'https://www.acfun.cn/v/ac'+v.dougaId, hot:v.likeCount
    })).filter((x: any) => x.title);
  }
};
const ngabbs: Source = {
  id: 'ngabbs', name: 'NGA', category: 'social', kind: 'hottest', home: 'https://ngabbs.com', ttl: 600,
  async fetch() {
    const r = await fetch('https://ngabbs.com/nuke.php?__lib=load_topic&__act=load_topic_reply_ladder2&opt=1&all=1', {
      method: 'POST', timeout: 20000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-User-Agent': 'NGA_skull/7.3.1(iPhone13,2;iOS 17.2.1)',
        'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
        'Referer': 'https://ngabbs.com/'
      },
      body: '__output=14'
    });
    if (!r.ok) throw new Error('ngabbs '+r.status);
    const j = await r.json();
    const list = (j.result||[]).flat();
    return list.slice(0,30).map((v: any, i: number) => ({
      rank:i+1, title:String(v.subject||'').trim(),
      url:v.tpcurl ? 'https://ngabbs.com'+v.tpcurl : 'https://ngabbs.com/read.php?tid='+v.tid,
      hot:v.replies
    })).filter((x: any) => x.title);
  }
};
const hupu: Source = {
  id: 'hupu', name: '虎扑', category: 'social', kind: 'hottest', home: 'https://www.hupu.com', ttl: 600,
  async fetch() {
    const r = await fetch('https://m.hupu.com/api/v2/bbs/topicThreads?topicId=1&page=1', {timeout:15000});
    if (!r.ok) throw new Error('hupu '+r.status);
    const j = await r.json();
    return (j.data?.topicThreads||[]).map((v: any, i: number) => ({
      rank:i+1, title:String(v.title||'').trim(), url:'https://bbs.hupu.com/'+v.tid+'.html', hot:v.replies
    })).filter((x: any) => x.title);
  }
};
export const socialSources: Source[] = [weibo, zhihu, baidu, douyin, toutiao, tieba, doubanMovie, smzdm, weread, hupu, acfun, ngabbs];

