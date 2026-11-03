import type { HotItem } from '../types';

/** 归一化标题：去空白/标点/符号，小写 */
export const normTitle = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

/** 判断两条标题是否在说同一件事：包含关系 或 2-gram Jaccard > 0.62 */
export function similarTitle(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 8 && l.includes(s)) return true;
  if (s.length < 6) return false;
  const grams = (x: string) => {
    const set = new Set<string>();
    for (let i = 0; i < x.length - 1; i++) set.add(x.slice(i, i + 2));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter) > 0.62;
}

export const hotNumber = (h: HotItem['hot']): number =>
  typeof h === 'number' ? h : typeof h === 'string' ? parseFloat(h.replace(/[^\d.]/g, '')) || 0 : 0;

export interface FeedItem extends HotItem {
  from: string;
  sourceId: string;
}

export interface MergedItem extends FeedItem {
  platforms: { name: string; id: string }[];
  platformCount: number;
}

/** 跨源合并同一事件：平台数多的在前，同平台数按热度排 */
export function mergeByEvent(items: FeedItem[], limit = 40): MergedItem[] {
  const seen: { key: string; item: FeedItem; platforms: { name: string; id: string }[] }[] = [];
  for (const it of items) {
    const key = normTitle(it.title);
    if (!key) continue;
    const dup = seen.find((s) => similarTitle(s.key, key));
    if (dup) {
      if (!dup.platforms.some((p) => p.id === it.sourceId)) dup.platforms.push({ name: it.from, id: it.sourceId });
      continue;
    }
    seen.push({ key, item: it, platforms: [{ name: it.from, id: it.sourceId }] });
  }
  return seen
    .sort((a, b) => b.platforms.length - a.platforms.length || hotNumber(b.item.hot) - hotNumber(a.item.hot))
    .slice(0, limit)
    .map((s, i) => ({ ...s.item, rank: i + 1, platforms: s.platforms, platformCount: s.platforms.length }));
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
