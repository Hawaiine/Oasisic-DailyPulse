import { chromium } from 'playwright';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export default async function fetchHupu() {
  const browser = await chromium.launch({args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']});
  const ctx = await browser.newContext({userAgent: UA, locale: 'zh-CN', viewport: {width: 1280, height: 900}});
  const page = await ctx.newPage();
  await page.goto('https://bbs.hupu.com/', {waitUntil: 'domcontentloaded', timeout: 45000});
  await page.waitForTimeout(5000);
  const items = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')].filter(a => /bbs\/\d+\.html/.test(a.href) && a.textContent.trim().length > 5);
    return links.slice(0, 20).map((a, i) => ({
      rank: i + 1,
      title: a.textContent.trim(),
      url: a.href
    }));
  });
  await browser.close();
  return {ok: true, total: items.length, items};
}
