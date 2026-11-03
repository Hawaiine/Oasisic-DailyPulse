/**
 * 每日热搜榜 — workers.dev 门面
 * 静态资源走 assets（CF 边缘直发，不计 Worker 调用）；
 * /api/* 反代到 InstaBox 私有源，必须带 x-pulse-token 头，源站无 token 一律 403。
 */
const ORIGIN = 'https://8790-agqxx6ayv3zczkcw35btrpd2vi.instabox.tech';

export default {
  async fetch(request: Request, env: { PULSE_TOKEN?: string }): Promise<Response> {
    const url = new URL(request.url);
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

    const out = new Headers(res.headers);
    out.set('x-served-by', 'daily-pulse-worker-proxy');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  },
};
