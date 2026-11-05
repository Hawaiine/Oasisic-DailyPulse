/**
 * Oasisic-DailyPulse — workers.dev 门面
 * 静态资源走 assets（CF 边缘直发，不计 Worker 调用）；
 * /api/* 反代到 InstaBox 私有源，必须带 x-pulse-token 头，源站无 token 一律 403。
 * /fetch-edge 为受 token 保护的边缘抓取通道：用于源站所在机房被目标站封禁时，
 * 改由 CF 边缘代取（仅允许 EDGE_ALLOW 内的主机）。
 */
const ORIGIN = 'https://8790-agqxx6ayv3zczkcw35btrpd2vi.instabox.tech';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const EDGE_ALLOW = new Set(['www.landian.news', 'landian.news']);

function forbidden() {
  return new Response('forbidden', { status: 403 });
}

export default {
  async fetch(request: Request, env: { PULSE_TOKEN?: string }): Promise<Response> {
    const url = new URL(request.url);

    // —— 边缘抓取通道 ——
    if (url.pathname === '/fetch-edge') {
      const tok = request.headers.get('x-pulse-token');
      if (!env.PULSE_TOKEN || tok !== env.PULSE_TOKEN) return forbidden();

      const raw = url.searchParams.get('u');
      if (!raw) return new Response('missing u', { status: 400 });

      let target: URL;
      try {
        target = new URL(raw);
      } catch {
        return new Response('bad u', { status: 400 });
      }
      if (target.protocol !== 'https:' || !EDGE_ALLOW.has(target.hostname)) {
        return new Response('host not allowed', { status: 403 });
      }

      let r: Response;
      try {
        r = await fetch(target.toString(), {
          headers: {
            'user-agent': UA,
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
          redirect: 'follow',
        });
      } catch (e) {
        return new Response(`edge fetch failed: ${(e as Error).message}`, { status: 502 });
      }

      const out = new Headers();
      out.set('content-type', r.headers.get('content-type') || 'text/html; charset=utf-8');
      out.set('x-edge-fetch', '1');
      out.set('cache-control', 'no-store');
      return new Response(r.body, { status: r.status, headers: out });
    }

    // —— /api/* 反代到盒子源站 ——
    const target = new URL(url.pathname + url.search, ORIGIN);

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('x-forwarded-host', url.host);
    if (env.PULSE_TOKEN) headers.set('x-pulse-token', env.PULSE_TOKEN);

    const init: RequestInit = {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
    };

    let res: Response;
    try {
      res = await fetch(target.toString(), init);
    } catch (e) {
      return new Response(`origin unreachable: ${(e as Error).message}`, { status: 502 });
    }

    const outHeaders = new Headers(res.headers);
    outHeaders.set('x-served-by', 'daily-pulse-worker-proxy');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
  },
};
