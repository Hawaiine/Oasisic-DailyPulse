import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

function trimTitle(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  // 卡片锚文本常是「标题 + 重复标题开头的正文」：检测前缀重复并截断
  const probe = s.slice(0, 6);
  if (probe.length === 6) {
    const again = s.indexOf(probe, 5);
    if (again > 0) s = s.slice(0, again).trim();
  }
  const cut = s.search(/[。！？]/);
  if (cut >= 12) s = s.slice(0, cut).trim();
  if (s.length > 70) s = s.slice(0, 70).trim();
  return s;
}

async function scrape() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ userAgent: UA });
  const page = await ctx.newPage();
  try {
    await page.goto('https://finance.biggo.com.tw/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href*="/news/"]', { timeout: 20000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(1200);

    const items = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      for (const a of document.querySelectorAll('a[href*="/news/"]')) {
        const href = a.href || '';
        if (!/\/news\/[0-9a-f-]{8,}/i.test(href)) continue;
        const key = href.replace(/[?#].*$/, '');
        if (seen.has(key)) continue;
        const h = a.querySelector('h2,h3,h4');
        let title = (h ? h.textContent : a.textContent) || '';
        title = title.replace(/\s+/g, ' ').trim();
        if (title.length < 8) continue;
        seen.add(key);
        out.push({ title, url: key });
      }
      return out;
    });
    return items;
  } finally {
    await browser.close();
  }
}

export default async function fetchBiggo() {
  let last = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const items = await scrape();
      const cleaned = items.map(x => ({ ...x, title: trimTitle(x.title) })).filter(x => x.title.length >= 8);
      if (cleaned.length) return cleaned.slice(0, 20);
      last = cleaned;
    } catch (e) {
      if (attempt === 2) throw e;
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  return last;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchBiggo().then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e); process.exit(1); });
}
