import { SourceError } from '../types';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const MAX_BYTES = 2_500_000;
const TIMEOUT_MS = 9_000;

interface Opts {
  referer?: string;
  origin?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

function headersFor(o: Opts): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
  if (o.referer) h.Referer = o.referer;
  if (o.origin) h.Origin = o.origin;
  if (o.body !== undefined) h['Content-Type'] = 'application/json';
  return { ...h, ...(o.headers || {}) };
}

async function request(url: string, o: Opts): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: o.body === undefined ? 'GET' : 'POST',
      headers: headersFor(o),
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
      signal: AbortSignal.timeout(o.timeout ?? TIMEOUT_MS),
      redirect: 'follow',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SourceError('http', 0, `network: ${msg}`);
  }
  if (!res.ok) throw new SourceError('http', res.status, `HTTP ${res.status}`);
  return res;
}

export async function getText(url: string, o: Opts = {}): Promise<string> {
  const res = await request(url, o);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new SourceError('http', 413, `oversize ${len}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new SourceError('http', 413, 'oversize body');
  return text;
}

export async function getJSON<T = unknown>(url: string, o: Opts = {}): Promise<T> {
  const text = await getText(url, o);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError('parse', 0, `invalid json: ${text.slice(0, 80)}`);
  }
}

/** 微博/百度等热度字符串 → 数字 */
export function parseHot(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(/,/g, '');
  const m = s.match(/^([\d.]+)\s*(万|亿)?/);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  if (m[2] === '万') return Math.round(n * 10_000);
  if (m[2] === '亿') return Math.round(n * 100_000_000);
  return Math.round(n);
}

export function clip(s: unknown, n = 140): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** 递归收集满足条件的对象（应对上游结构变动） */
export function collect(node: unknown, pred: (o: Record<string, unknown>) => boolean, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const v of node) collect(v, pred, out);
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (pred(o)) out.push(o);
    else for (const v of Object.values(o)) collect(v, pred, out);
  }
  return out;
}
