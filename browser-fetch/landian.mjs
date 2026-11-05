#!/usr/bin/env node
/**
 * 蓝点网抓取。
 * 该站对源站机房 IP 在 TCP 层直接拒绝，因此改走 Cloudflare Worker 的
 * /fetch-edge 通道（CF 边缘代取，需 x-pulse-token），拿到 HTML 后本地解析。
 */
import { readFileSync } from 'node:fs';

const WORKER = 'https://news.noah-hermes.workers.dev/fetch-edge';
const TARGET = 'https://www.landian.news/';

function loadToken() {
  if (process.env.PULSE_TOKEN) return process.env.PULSE_TOKEN.trim();
  try {
    const txt = readFileSync('/opt/daily-pulse/.env', 'utf8');
    for (const line of txt.split('\n')) {
      const m = /^\s*PULSE_TOKEN\s*=\s*(.+?)\s*$/.exec(line);
      if (m) return m[1].replace(/^["']|["']$/g, '').trim();
    }
  } catch { /* ignore */ }
  return '';
}

function stripTags(s) {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parse(html) {
  const out = [];
  const seen = new Set();
  const re = /<a[^>]+href="([^"]*\/archives\/(\d+)\.html[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 40) {
    const id = m[2];
    if (seen.has(id)) continue;
    let title = stripTags(m[3]);
    if (title.length < 8) continue;
    // 去掉「查看全部推荐」之类导航文案
    if (/^(查看全部|更多|加载更多)/.test(title)) continue;
    if (title.length > 80) title = title.slice(0, 80).trim();
    seen.add(id);
    out.push({ title, url: `https://www.landian.news/archives/${id}.html` });
  }
  return out;
}

async function main() {
  const token = loadToken();
  if (!token) throw new Error('PULSE_TOKEN missing');

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const u = `${WORKER}?u=${encodeURIComponent(TARGET)}`;
      const res = await fetch(u, {
        headers: { 'x-pulse-token': token },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`edge fetch ${res.status}`);
      const html = await res.text();
      const items = parse(html);
      if (items.length) return items.slice(0, 20);
      lastErr = new Error(`parsed 0 items (html ${html.length} bytes)`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw lastErr || new Error('landian fetch failed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error('ERR', e.message); process.exit(1); });
} else {
  const items = await main();
  console.log(JSON.stringify(items));
}
