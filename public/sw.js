/* 每日热搜榜 — Service Worker v4.2
   关键：HTML/JS/CSS 一律「网络优先」，否则改版后老用户永远看到旧页面；
   只有图标这类几乎不变的资源走 cache-first；接口网络优先 + 兜底缓存。 */
const VERSION = 'dp-v4.2';
const SHELL = `${VERSION}-shell`;
const API = `${VERSION}-api`;
const STATIC = `${VERSION}-static`;

const SHELL_FILES = ['/', '/app.css', '/app.js', '/manifest.webmanifest', '/logos/manifest.json'];
const NET_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.allSettled(SHELL_FILES.map((f) => c.add(new Request(f, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(req, cacheName, timeout = NET_TIMEOUT) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout)),
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    e.respondWith((async () => {
      const cache = await caches.open(API);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req);
        if (hit) {
          const h = new Headers(hit.headers);
          h.set('x-sw-offline', '1');
          return new Response(hit.body, { status: 200, headers: h });
        }
        return new Response(JSON.stringify({ ok: false, offline: true, blocks: [], aggregate: [], timeline: [], total: 0 }), {
          status: 503, headers: { 'content-type': 'application/json' },
        });
      }
    })());
    return;
  }

  const isDoc = req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
  const isCode = /\.(css|js|webmanifest)$/.test(url.pathname);
  if (isDoc || isCode) {
    e.respondWith((async () => {
      try {
        return await networkFirst(req, SHELL);
      } catch {
        const shell = await caches.open(SHELL);
        const page = await shell.match('/');
        if (page) return page;
        return new Response('离线且无缓存', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(STATIC);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});
