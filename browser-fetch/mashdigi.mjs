import { chromium } from 'playwright';

export default async function fetchMashdigi() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  try {
    await page.goto('https://mashdigi.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    
    const items = await page.evaluate(() => {
      const results = [];
      const articles = document.querySelectorAll('article');
      
      articles.forEach((article, i) => {
        if (i >= 20) return;
        const link = article.querySelector('a');
        const title = article.querySelector('h2, .title');
        
        if (link && title && link.href.includes('mashdigi')) {
          results.push({
            title: title.textContent.trim(),
            url: link.href,
            mobileUrl: link.href
          });
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
  fetchMashdigi().then(r => console.log(JSON.stringify(r, null, 2))).catch(console.error);
}
