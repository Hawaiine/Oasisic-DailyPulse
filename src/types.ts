export type Category = 'social' | 'news' | 'tech' | 'ent';

export interface HotItem {
  rank?: number;
  title: string;
  url: string;
  hot?: number | string;
  desc?: string;
  ts?: number;
  tag?: string;
  /** 平台自带角标图片（如 B站热搜的新/热） */
  tagIcon?: string;
  /** 相对上一次快照的排名变化：正数=上升，负数=下降 */
  delta?: number;
  /** 上一次快照里没有 → 新上榜 */
  isNew?: boolean;
}

export interface Source {
  id: string;
  name: string;
  category: Category;
  kind: 'hottest' | 'realtime';
  home: string;
  ttl: number;
  fetch: () => Promise<HotItem[]>;
}

export interface SourceMeta {
  status: 'ok' | 'degraded' | 'blocked';
  updated: number;
  fails: number;
  count: number;
  latency?: number;
  lastError?: string;
}

export class SourceError extends Error {
  stage: 'http' | 'parse' | 'shape' | 'empty';
  status: number;
  constructor(stage: SourceError['stage'], status: number, message: string) {
    super(message);
    this.stage = stage;
    this.status = status;
  }
}
