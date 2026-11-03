/* 每日热搜榜 v4 — 无框架前端 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const CATS = [['all', '全部'], ['social', '社交'], ['news', '新闻'], ['tech', '科技'], ['ent', '娱乐']];
const REFRESH_MS = 180_000;
const CACHE_KEY = 'dp.boot.v4';

const state = {
  data: null, pending: null, view: { type: 'all', value: null },
  pins: new Set(load('dp.pins', [])), read: new Set(load('dp.read', [])),
  logos: {}, next: 0, busy: false, hits: null, retrying: false,
};

function load(k, d) { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 忽略 */ } }
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };
const nf = new Intl.NumberFormat('zh-CN');
/* 平台登录墙：微博 / X 对外链强制登录，标题里标注，避免用户误以为链接坏了 */
const CARD_GATE = { weibo: '微博需登录后访问', x: 'X 需登录后访问' };

/* 各平台热度指标的真实含义（避免用户误以为是同一种"热度"） */
const HOT_METRIC = {
  weibo: '微博热搜指数', douyin: '抖音热度值', baidu: '百度热搜指数', toutiao: '头条热度',
  zhihu: '知乎热度', tieba: '贴吧讨论数', bilibili: 'B站播放量', 'bilibili-hot': 'B站热搜',
  sina: '新浪热度', thepaper: '澎湃互动数', juejin: '掘金热度', hackernews: 'HN 分数',
  sspai: '少数派评论数', ithome: 'IT之家热度', '36kr': '36氪热度',
};
/* 平台自带标签 → 颜色类（微博：热/新/沸/爆；抖音：新/热/爆） */
const TAG_CLASS = { 热: 'hot', 新: 'new', 沸: 'boil', 爆: 'boom', 荐: 'rec', 暖: 'warm', 辟谣: 'gray', 解读: 'gray', 深度: 'gray', 热门事件: 'hot' };

/* 各平台的热度显示习惯：微博千分位、抖音/贴吧一位小数、知乎带「热度」、百度取整 */
const hotW = (n, d = 0) => {
  const w = n / 1e4;
  return `${w >= 100 ? (d ? w.toFixed(d) : Math.round(w)) : w.toFixed(d)}万`;
};
const HOT_FMT = {
  weibo: (n) => nf.format(n),                       // 1,100,051
  douyin: (n) => hotW(n, 1),                        // 1210.1万
  tieba: (n) => hotW(n, 1),                         // 207.9万
  bilibili: (n) => hotW(n, 1),                      // 393.2万
  zhihu: (n) => `${hotW(n, 0)}<i>热度</i>`,         // 1225万热度
  baidu: (n) => hotW(n, 0),
  toutiao: (n) => hotW(n, 1),
  thepaper: (n) => nf.format(n),
  juejin: (n) => hotW(n, 0),
  ithome: (n) => nf.format(n),
  sspai: (n) => nf.format(n),
  hackernews: (n) => nf.format(n),
  hupu: (n) => nf.format(n),
  smzdm: (n) => nf.format(n),
  weread: (n) => nf.format(n),
  huxiu: (n) => nf.format(n),
  ifanr: (n) => nf.format(n),
  acfun: (n) => hotW(n, 1),
  v2ex: (n) => nf.format(n),
  ngabbs: (n) => nf.format(n),
  guokr: (n) => nf.format(n),
};
function hot(v, src) {
  if (v === undefined || v === null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return typeof v === 'string' ? v : '';
  const f = HOT_FMT[src];
  if (f) return f(n);
  if (n >= 1e8) { const y = n / 1e8; return `${y >= 100 ? Math.round(y) : y.toFixed(1)}亿`; }
  if (n >= 1e4) return hotW(n, 1);
  return nf.format(n);
}
function ago(sec) {
  if (!sec) return '—';
  const d = Math.max(0, Math.floor(Date.now() / 1000) - sec);
  if (d < 45) return '刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  return `${Math.floor(d / 86400)} 天前`;
}
const clock = (s) => new Date(s * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

function logoFor(id) {
  const img = el('img');
  img.src = state.logos[id]?.file || `/logos/${id}.png`;
  img.alt = ''; img.loading = 'lazy'; img.dataset.id = id;
  img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
  return img;
}

/* ---------- 主题：系统 / 浅色 / 深色 ---------- */
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_LABEL = { system: '跟随系统', light: '浅色', dark: '深色' };
const THEME_ICON = {
  system: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
};
const mq = matchMedia('(prefers-color-scheme: dark)');
let themeMode = localStorage.getItem('dp.themeMode') || (localStorage.getItem('dp.theme') ? 'manual' : 'system');
if (themeMode === 'manual') themeMode = localStorage.getItem('dp.theme') === 'dark' ? 'dark' : 'light';

function applyTheme() {
  const resolved = themeMode === 'system' ? (mq.matches ? 'dark' : 'light') : themeMode;
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem('dp.themeMode', themeMode);
  localStorage.setItem('dp.theme', resolved);
  const btn = $('#theme');
  if (btn) {
    btn.innerHTML = THEME_ICON[themeMode];
    btn.title = `主题：${THEME_LABEL[themeMode]}（点击切换）`;
    btn.setAttribute('aria-label', btn.title);
    btn.dataset.mode = themeMode;
  }
  $$('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', resolved === 'dark' ? '#0d0f12' : '#ffffff'));
  const lbl = $('#themeLabel');
  if (lbl) lbl.textContent = THEME_LABEL[themeMode];
  $$('#themePop button[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === themeMode)));
}
function cycleTheme() {
  themeMode = THEME_ORDER[(THEME_ORDER.indexOf(themeMode) + 1) % THEME_ORDER.length];
  applyTheme();
  toast(`主题：${THEME_LABEL[themeMode]}`);
}
applyTheme();
mq.addEventListener('change', () => { if (themeMode === 'system') applyTheme(); });
const themeBtn = $('#theme');
const themePop = $('#themePop');
themeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = themePop.classList.toggle('hidden') === false;
  themeBtn.setAttribute('aria-expanded', String(open));
});
themePop.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b) return;
  themeMode = b.dataset.mode;
  applyTheme();
  themePop.classList.add('hidden');
  themeBtn.setAttribute('aria-expanded', 'false');
  toast(`主题：${THEME_LABEL[themeMode]}`);
});
document.addEventListener('click', (e) => {
  if (!themePop.contains(e.target) && !themeBtn.contains(e.target)) {
    themePop.classList.add('hidden');
    themeBtn.setAttribute('aria-expanded', 'false');
  }
});

let toastTimer;
function toast(text) {
  let box = $('#toast');
  if (!box) {
    box = el('div', 'toast');
    box.id = 'toast';
    document.body.append(box);
  }
  box.textContent = text;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 1300);
}

/* ---------- 分类 ---------- */
function renderPills() {
  const box = $('#pills'); box.textContent = '';
  const blocks = state.data?.blocks ?? [];
  for (const [id, label] of CATS) {
    const b = el('button', state.view.type === id ? 'on' : '', label);
    b.append(el('span', 'n', String(id === 'all' ? blocks.length : blocks.filter((x) => x.category === id).length)));
    b.addEventListener('click', () => { state.view = { type: id, value: null }; renderPills(); renderGrid(); });
    box.append(b);
  }
}

/* ---------- 源切换条 ---------- */
const CHIP_ICON = {
  all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>',
  live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3 5.5 13.5H11l-1 7.5 8-11H12l1-7z"/></svg>',
};

function renderSrcbar(scrollToActive = false) {
  const box = $('#srcbar'); if (!box) return;
  const blocks = state.data?.blocks ?? [];
  box.textContent = '';
  const mk = (id, label, active) => {
    const b = el('button', 'chip' + (active ? ' on' : ''));
    if (id) b.append(logoFor(id));
    b.append(el('span', null, label));
    b.addEventListener('click', () => {
      state.view = id ? { type: 'source', value: id } : { type: 'all', value: null };
      state.hits = null;
      renderPills(); renderSrcbar(true); renderGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return b;
  };
  const allChip = mk(null, '全部平台', state.view.type === 'all');
  allChip.insertAdjacentHTML('afterbegin', CHIP_ICON.all);
  box.append(allChip);
  const live = el('button', 'chip' + (state.view.type === 'live' ? ' on' : ''));
  live.insertAdjacentHTML('afterbegin', CHIP_ICON.live);
  live.append(el('span', null, '快讯'));
  live.addEventListener('click', () => {
    state.view = { type: 'live', value: null }; state.hits = null;
    renderPills(); renderSrcbar(true); renderGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  box.append(live);
  for (const b of blocks) {
    box.append(mk(b.id, b.name, state.view.type === 'source' && state.view.value === b.id));
  }
  const active = box.querySelector('.chip.on');
  if (active && scrollToActive) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  requestAnimationFrame(() => box.dispatchEvent(new Event('scroll')));
}

/* ---------- 焦点条 ---------- */
function renderFocus() {
  const d = state.data; if (!d) return;
  const top = d.aggregate?.[0];
  const t = $('#focusTitle');
  if (top) {
    t.textContent = top.title;
    t.href = top.url; t.target = '_blank'; t.rel = 'noopener noreferrer nofollow';
  } else {
    t.textContent = '正在汇总各平台热榜…'; t.removeAttribute('href');
  }
  const box = $('#focusPlats'); box.textContent = '';
  for (const p of top?.platforms ?? []) {
    const s = el('span'); s.title = p.name; s.append(logoFor(p.id)); box.append(s);
  }
  const okN = d.blocks.filter((b) => b.items.length).length;
  $('#focusMeta').textContent = top ? `${top.platformCount} 平台同榜 · ${okN}/${d.total} 源在线 · ${clock(d.generated)}` : `${okN}/${d.total} 源在线`;
}

/* ---------- 卡片 ---------- */
function card(b, idx) {
  if (b.status === 'pending' && !b.items.length) return el('article', 'card sk');

  const c = el('article', 'card');
  if (!b.items.some((i) => typeof i.hot === 'number' && i.hot > 0)) c.classList.add('nohot');
  if (b.kind === 'realtime') c.classList.add('rt');

  const h = el('div', 'card-h');
  const lg = el('span', 'logo'); lg.append(logoFor(b.id)); h.append(lg);
  h.append(el('h3', null, b.name));
  if (b.kind === 'realtime') h.append(el('span', 'kind', '快讯'));

  const expired = !!b.ageSec && b.ageSec > (b.ttl || 300) * 3;
  const fr = el('span', 'fresh' + (!b.items.length ? ' bad' : expired ? ' expired' : b.status === 'ok' ? '' : ' stale'));
  fr.append(el('i'));
  const ft = el('span', null, b.items.length ? (expired ? `过期 · ${ago(b.updated)}` : ago(b.updated)) : '不可用');
  fr.title = !b.items.length ? '该源当前不可用' : `${expired ? '数据已过期' : b.status === 'ok' ? '在线' : '数据延迟'} · 更新于 ${ago(b.updated)}`;
  fr.append(ft); fr.dataset.rel = String(b.updated || 0);
  h.append(fr);

  const pin = el('button', 'pin' + (state.pins.has(b.id) ? ' on' : ''));
  pin.title = state.pins.has(b.id) ? '取消置顶' : '置顶';
  pin.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3l2.4 5.2 5.6.6-4.2 3.9 1.1 5.6L12 15.6 7.1 18.3l1.1-5.6L4 8.8l5.6-.6z"/></svg>';
  pin.addEventListener('click', (e) => {
    e.stopPropagation();
    state.pins.has(b.id) ? state.pins.delete(b.id) : state.pins.add(b.id);
    save('dp.pins', [...state.pins]); renderGrid();
  });
  h.append(pin);
  c.append(h);

  if (!b.items.length) {
    const err = el('div', 'card err');
    err.append(el('b', null, '暂时不可用'));
    err.append(el('span', null, '已跳过，不影响其他平台。'));
    if (b.error) err.append(el('code', null, String(b.error).slice(0, 70)));
    c.append(err);
    return c;
  }

  const ul = el('ul', 'rows');
  const narrow = matchMedia('(max-width: 760px)').matches;
  const rtCount = 12;
  b.items.slice(0, b.kind === 'realtime' ? rtCount : 12).forEach((it, i) => {
    const key = `${b.id}:${it.title}`;
    const li = el('li', 'row' + (i < 3 ? ` t${i + 1}` : '') + (state.read.has(key) ? ' read' : ''));
    li.dataset.src = b.id;
    const a = el('a');
    a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
    a.title = it.title;
    if (b.kind === 'realtime') {
      const t = it.ts ? new Date(it.ts * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
      a.append(el('span', 'rk rt-time', t));
    } else {
      a.append(el('span', 'rk', String(it.rank ?? i + 1)));
    }
    const tt = el('span', 'tt');
    tt.append(el('span', 'tx', it.title));
    const tag = String(it.tag || '').trim();
    const tc = TAG_CLASS[tag];
    const mk = (cls, text) => {
      const s = el('span', 'bdg ' + cls, text);
      s.dataset.src = b.id;
      return s;
    };
    if (it.tagIcon) {
      const im = el('img', 'bdg-img');
      im.src = it.tagIcon; im.alt = ''; im.loading = 'lazy'; im.dataset.src = b.id;
      im.addEventListener('error', () => im.remove(), { once: true });
      tt.append(im);
    } else if (tc) tt.append(mk('bdg-' + tc, tag));
    else if (tag) tt.append(mk('bdg-gray', tag));   // 栏目角标（如「Matrix精选」「派早报」）
    else if (it.isNew) tt.append(mk('bdg-new', '新'));
    a.append(tt);
    const hv = hot(it.hot, b.id);
    if (hv) {
      const span = el('span', 'hv');
      span.title = `${HOT_METRIC[b.id] || b.name + '热度'}：${hv}`;
      if (hv.includes('<i>')) span.innerHTML = hv; else span.textContent = hv;
      a.append(span);
    }
    a.addEventListener('click', () => {
      state.read.add(key); save('dp.read', [...state.read]); li.classList.add('read');
    });
    li.append(a); ul.append(li);
  });
  c.append(ul);
  const limit = 12;
  if (b.items.length < limit) {
    const note = el('div', 'more-note', `仅 ${b.items.length} 条 · 已全部展示`);
    c.append(note);
  }
  return c;
}

/* ---------- 主区 ---------- */
function renderLiveView(onlyId) {
  const grid = $('#grid'); const d = state.data; if (!d) return;
  grid.textContent = '';
  const all = (d.timeline ?? []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const items = onlyId ? all.filter((x) => x.sourceId === onlyId) : all;
  const onlyName = onlyId ? (d.blocks || []).find((b) => b.id === onlyId)?.name || '' : '';
  $('#title').textContent = onlyId ? `${onlyName} 快讯` : '实时快讯';
  const nameOf = (id) => (d.blocks || []).find((b) => b.id === id)?.name || id || '';
  const srcN = new Set(items.map((i) => i.sourceId)).size;
  $('#meta').textContent = `${items.length} 条 · ${srcN} 个快讯源 · 更新于 ${clock(d.generated)}`;
  if (!items.length) { grid.append(el('div', 'card err', '暂无快讯')); return; }

  const TL_TZ = 'Asia/Shanghai';
  const hmOf = (ts) => new Intl.DateTimeFormat('zh-CN', { timeZone: TL_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts * 1000));
  const dayOf = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000));
  const todayKey = dayOf(d.generated);
  const yestKey = dayOf(d.generated - 86400);

  const tl = el('div', 'tl');
  let lastDay = ''; let prev = null; const dayCount = new Map(); const dayHeads = new Map();
  for (const it of items) {
    const ts = it.ts || d.generated;
    const key = dayOf(ts);
    if (key !== lastDay) {
      const head = el('div', 'tl-day');
      head.append(el('span', 'lab', key === todayKey ? '今天' : key === yestKey ? '昨天' : `${Number(key.slice(5, 7))} 月 ${Number(key.slice(8, 10))} 日`));
      const sub = el('span', 'sub'); head.append(sub); dayHeads.set(key, sub);
      tl.append(head); lastDay = key;
    }
    const fresh = it.ts && Date.now() / 1000 - it.ts < 300;
    const cont = prev === it.sourceId;
    prev = it.sourceId;
    const row = el('div', 'tl-item' + (fresh ? ' fresh' : '') + (cont ? ' cont' : ''));
    row.append(el('div', 'tl-time', hmOf(ts)));
    row.append(el('div', 'tl-node'));
    const body = el('div', 'tl-body');
    const src = el('div', 'tl-src');
    src.append(logoFor(it.sourceId || ''));
    src.append(el('span', 'nm', nameOf(it.sourceId)));
    if (fresh) src.append(el('span', 'now', '刚刚'));
    body.append(src);
    const a = el('a', 'tl-title', it.title);
    a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; a.title = it.title;
    body.append(a);
    const desc = (it.desc || '').trim();
    if (desc && desc !== it.title) body.append(el('div', 'tl-desc', desc));
    row.append(body);
    tl.append(row);
    dayCount.set(key, (dayCount.get(key) || 0) + 1);
  }
  for (const [k, node] of dayHeads) node.textContent = `${dayCount.get(k)} 条`;
  grid.append(tl);
}

function renderGrid() {
  const grid = $('#grid'); const d = state.data; if (!d) return;
  if (state.view.type === 'live') return renderLiveView();
  grid.textContent = '';
  let blocks = d.blocks ?? [];
  const rtIds = new Set(blocks.filter((b) => b.kind === 'realtime').map((b) => b.id));
  if (state.view.type === 'source' && rtIds.has(state.view.value)) return renderLiveView(state.view.value);
  if (state.view.type === 'source') blocks = blocks.filter((b) => b.id === state.view.value);
  else if (state.view.type !== 'all') blocks = blocks.filter((b) => b.category === state.view.type);
  blocks = blocks.filter((b) => b.kind !== 'realtime');
  blocks = [...blocks].sort((a, b) => Number(state.pins.has(b.id)) - Number(state.pins.has(a.id)));

  $('#title').textContent = state.view.type === 'all' ? '全部热榜'
    : state.view.type === 'source' ? blocks[0]?.name ?? ''
    : CATS.find((c) => c[0] === state.view.type)?.[1] ?? '';
  const okN = blocks.filter((b) => b.items.length).length;
  const stale = blocks.filter((b) => b.items.length && b.status !== 'ok').length;
  $('#meta').textContent = `${okN} 个平台可用${stale ? ` · ${stale} 个延迟` : ''} · 更新于 ${clock(d.generated)}`;

  if (!blocks.length) { grid.append(el('div', 'card err', '该分类下暂无数据源')); return; }
  blocks.forEach((b, i) => grid.append(card(b, i)));
}

/* ---------- 快讯条 ---------- */
function renderTicker() {
  const track = $('#tickerTrack');
  const items = (state.data?.timeline ?? []).slice(0, 10);
  track.textContent = '';
  if (!items.length) return;
  const make = (it) => {
    const s = el('span', 'tick');
    s.append(logoFor(it.sourceId || ''));
    s.append(el('span', null, it.title));
    s.append(el('time', null, ago(it.ts)));
    return s;
  };
  for (const it of items) track.append(make(it));
  for (const it of items) track.append(make(it));
}

/* ---------- 抽屉 / 面板 ---------- */
function renderSheet() {
  const box = $('#sheetList'); if (!box) return;
  box.textContent = '';
  for (const b of state.data?.blocks ?? []) {
    const row = el('button', 's-src');
    row.append(logoFor(b.id));
    row.append(el('span', null, b.name));
    row.append(el('span', 'd ' + (!b.items.length ? 'blocked' : b.status === 'ok' ? 'ok' : 'degraded')));
    row.append(el('span', 'n', `${b.total || 0} 条`));
    row.addEventListener('click', () => {
      state.view = { type: 'source', value: b.id };
      renderPills(); renderSrcbar(true); renderGrid();
      $('#sheet').classList.add('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    box.append(row);
  }
}

const palette = $('#palette'), pq = $('#pq'), plist = $('#plist');
let sel = 0;
function pItems(q) {
  const s = q.trim().toLowerCase();
  const out = (state.data?.blocks ?? [])
    .filter((b) => !s || b.name.toLowerCase().includes(s) || b.id.includes(s))
    .map((b) => ({ label: b.name, hint: b.categoryLabel, id: b.id,
      run: () => { state.view = { type: 'source', value: b.id }; renderPills(); renderGrid(); } }));
  if (s) out.push({ label: `搜索「${q.trim()}」`, hint: 'enter', id: '', run: () => { $('#q').value = q.trim(); search(q.trim()); } });
  return out;
}
function drawPalette() {
  const items = pItems(pq.value); plist.textContent = '';
  items.forEach((it, i) => {
    const d = el('div', 'p-item' + (i === sel ? ' sel' : ''));
    if (it.id) d.append(logoFor(it.id));
    d.append(el('span', null, it.label));
    d.append(el('span', 'h', it.hint));
    d.addEventListener('click', () => { it.run(); closePalette(); });
    plist.append(d);
  });
}
function openPalette() { palette.classList.remove('hidden'); pq.value = ''; sel = 0; drawPalette(); pq.focus(); }
function closePalette() { palette.classList.add('hidden'); }
pq.addEventListener('input', () => { sel = 0; drawPalette(); });
pq.addEventListener('keydown', (e) => {
  const items = pItems(pq.value);
  if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); drawPalette(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); drawPalette(); e.preventDefault(); }
  if (e.key === 'Enter' && items[sel]) { items[sel].run(); closePalette(); }
});
palette.addEventListener('click', (e) => { if (e.target === palette) closePalette(); });

/* ---------- 搜索 ---------- */
let timer;
$('#q').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  clearTimeout(timer);
  if (!q) { state.hits = null; state.view = { type: 'all', value: null }; renderPills(); renderGrid(); return; }
  timer = setTimeout(() => search(q), 280);
});

async function search(q) {
  state.view = { type: 'search', value: q }; state.hits = null; drawSearch();
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const j = await r.json(); state.hits = j.items || [];
  } catch { state.hits = []; }
  drawSearch();
}

function drawSearch() {
  const grid = $('#grid'); grid.textContent = '';
  $('#title').textContent = `搜索：${state.view.value}`;
  const hits = state.hits;
  $('#meta').textContent = hits ? `${hits.length} 条命中` : '搜索中…';
  if (!hits) { for (let i = 0; i < 3; i++) grid.append(el('article', 'card sk')); return; }
  if (!hits.length) { grid.append(el('div', 'card err', '没有匹配的标题，换个词试试')); return; }
  const c = el('article', 'card');
  const h = el('div', 'card-h');
  h.append(el('h3', null, '全站命中'));
  h.append(el('span', 'kind', String(hits.length)));
  c.append(h);
  const ul = el('ul', 'rows');
  hits.forEach((it, i) => {
    const li = el('li', 'row' + (i < 3 ? ` t${i + 1}` : ''));
    const a = el('a');
    a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
    a.title = it.title;
    a.append(el('span', 'rk', String(i + 1)));
    const tt = el('span', 'tt', it.title); a.append(tt);
    a.append(el('span', 'hv', it.from || ''));
    li.append(a); ul.append(li);
  });
  c.append(ul); grid.append(c);
}

/* ---------- 数据 ---------- */
const sig = (d) => (d?.blocks ?? []).map((b) => `${b.id}:${b.items[0]?.title ?? ''}`).join('|');

function render(d) {
  state.data = d;
  renderPills(); renderSrcbar(false); renderFocus(); renderGrid(); renderTicker(); renderSheet();
  state.next = Date.now() + REFRESH_MS;
  if (state.view.type === 'search') drawSearch();
  if ((d.blocks ?? []).some((b) => !b.items.length) && !state.retrying) {
    state.retrying = true;
    setTimeout(async () => { state.retrying = false; try { const f = await fetchBoot(); save(CACHE_KEY, f); const sp = window.scrollY; render(f); window.scrollTo(0, sp); } catch { /* 忽略 */ } }, 2500);
  }
}

async function fetchBoot(fresh = false) {
  const r = await fetch(`/api/bootstrap?limit=14${fresh ? '&fresh=1' : ''}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function newPill() {
  const pill = $('#newPill');
  const changed = (state.pending?.blocks ?? []).filter((b) => {
    const old = state.data?.blocks.find((x) => x.id === b.id);
    return old && old.items[0]?.title !== b.items[0]?.title;
  }).length;
  pill.textContent = `${changed} 个平台有新内容 · 点击查看`;
  pill.classList.remove('hidden');
  requestAnimationFrame(() => pill.classList.add('show'));
  pill.onclick = () => {
    const d = state.pending; state.pending = null; pill.classList.remove('show'); pill.classList.add('hidden');
    if (d) render(d);
  };
}

$('#refresh').addEventListener('click', async () => {
  const b = $('#refresh'); b.classList.add('spin');
  try { const d = await fetchBoot(true); save(CACHE_KEY, d); render(d); } catch { /* 保留旧数据 */ }
  b.classList.remove('spin');
});

setInterval(() => {
  const left = Math.max(0, Math.round((state.next - Date.now()) / 1000));
  const cd = $('#cd');
  if (cd) cd.textContent = document.hidden ? '· 已暂停（切回自动刷新）' : `· ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} 后自动刷新`;
  if (left === 0 && !document.hidden && !state.busy) {
    state.busy = true;
    fetchBoot(true).then((d) => {
      save(CACHE_KEY, d);
      if (sig(d) !== sig(state.data)) { state.pending = d; newPill(); } else { state.data = d; state.next = Date.now() + REFRESH_MS; }
    }).catch(() => {}).finally(() => { state.busy = false; state.next = Date.now() + REFRESH_MS; });
  }
}, 1000);

setInterval(() => {
  $$('[data-rel]').forEach((n) => { const s = Number(n.dataset.rel || 0); if (s) n.lastChild.textContent = ago(s); });
}, 30_000);

/* ---------- 移动端 ---------- */
const sheet = $('#sheet');
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.classList.add('hidden'); });
$('#sheetRefresh').addEventListener('click', () => { sheet.classList.add('hidden'); $('#refresh').click(); });
$('#sheetTheme').addEventListener('click', cycleTheme);
$('#toTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

/* ---------- 键盘 & 进度 ---------- */
document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (e.key === 'Escape') {
    if (!palette.classList.contains('hidden')) closePalette();
    else if (!sheet.classList.contains('hidden')) sheet.classList.add('hidden');
    else if (typing) document.activeElement.blur();
    return;
  }
  if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); }
});
addEventListener('scroll', () => {
  const h = document.documentElement;
  const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
  $('#progress').style.width = `${Math.round(p * 100)}%`;
  const tt = $('#toTop'); if (tt) tt.classList.toggle('hidden', h.scrollTop < 600);
}, { passive: true });

/* ---------- PWA ---------- */
let deferred = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferred = e;
  const btn = $('#install'); if (btn) btn.hidden = false;
});
$('#install')?.addEventListener('click', async () => {
  if (!deferred) return;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  if (outcome === 'accepted') $('#install').hidden = true;
  deferred = null;
});
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

/* ---------- 启动 ---------- */
async function boot() {
  try {
    const m = await fetch('/logos/manifest.json?v='+Date.now());
    if (m.ok) state.logos = await m.json();
  } catch { /* 退回 png 命名 */ }

  const cached = load(CACHE_KEY, null);
  if (cached && Date.now() / 1000 - cached.generated < 300) render(cached);

  try {
    const d = await fetchBoot(); save(CACHE_KEY, d);
    if (state.data && sig(d) !== sig(state.data)) { state.pending = d; newPill(); } else render(d);
  } catch (e) {
    if (!state.data) {
      const grid = $('#grid'); grid.textContent = '';
      const box = el('div', 'card err');
      box.append(el('b', null, '暂时连不上数据接口'));
      box.append(el('span', null, String(e.message || e)));
      const btn = el('button', 'btn', '重试'); btn.style.marginTop = '10px';
      btn.addEventListener('click', () => location.reload());
      box.append(btn); grid.append(box);
    }
  }

  const tickerBtn = document.querySelector('.ticker');
  const tickerSheet = $('#ticker-sheet');
  if (tickerBtn && tickerSheet) {
    tickerBtn.style.cursor = 'pointer';
    tickerBtn.addEventListener('click', openTickerSheet);
    tickerSheet.querySelector('.sheet-backdrop').addEventListener('click', () => tickerSheet.classList.add('hidden'));
    tickerSheet.querySelector('.sheet-close').addEventListener('click', () => tickerSheet.classList.add('hidden'));
  }
}
boot();
/* ---------- 源切换条：滚轮横向滚动 + 溢出提示 ---------- */
(() => {
  const bar = $('#srcbar'); if (!bar) return;
  const sync = () => bar.classList.toggle('more', bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4);
  bar.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  bar.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const atEnd = bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 1;
    const atStart = bar.scrollLeft <= 0;
    if ((e.deltaY > 0 && atEnd) || (e.deltaY < 0 && atStart)) return;
    e.preventDefault();
    bar.scrollLeft += e.deltaY;
    sync();
  }, { passive: false });
  setTimeout(sync, 300);
})();
