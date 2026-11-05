import { chromium } from 'playwright';

export default async function fetchLandian() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  try {
    await page.goto('https://www.landian.news/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    
    const items = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/archives/"]');
      
      const seen = new Set();
      links.forEach(link => {
        const title = link.textContent.trim();
        const url = link.href;
        if (title.length > 10 && url.includes('/archives/') && !seen.has(url)) {
          seen.add(url);
          results.push({ title, url, mobileUrl: url });
        }
      });
      
      return results;
    });
    
    await browser.close();
    return items.slice(0, 15);
  } catch (err) {
    await browser.close();
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchLandian().then(r => console.log(JSON.stringify(r, null, 2))).catch(console.error);
}
