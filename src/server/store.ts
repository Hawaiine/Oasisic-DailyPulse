import { mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HotItem } from '../types';

export interface Snap {
  items: HotItem[];
  updated: number;
  error?: string;
  status: 'ok' | 'degraded' | 'blocked';
  latency?: number;
}

export interface Pack {
  generated: number;
  blocks: unknown[];
  [k: string]: unknown;
}

/** 文件存储：每源一个 JSON 快照 + 一个整包快照 + NDJSON 历史。零依赖、可备份、无配额。 */
export class FileStore {
  private dir: string;
  private snapDir: string;
  constructor(dir: string) {
    this.dir = dir;
    this.snapDir = join(dir, 'snapshots');
    mkdirSync(this.snapDir, { recursive: true });
    this.pruneHistory();
  }

  private histCount = 0;

  /** 只保留最近 N 天的历史行；同时兜底体积上限，避免静默吃盘 */
  pruneHistory(maxAgeDays = 7, maxBytes = 8 * 1024 * 1024): void {
    const p = join(this.dir, 'history.ndjson');
    if (!existsSync(p)) return;
    const raw = readFileSync(p, 'utf8');
    if (raw.length < 1024 && raw.length <= maxBytes) return;
    const cutoff = Date.now() - maxAgeDays * 86400000;
    const keep: string[] = [];
    let dropped = 0;
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      const tab = line.indexOf('\t');
      const body = tab >= 0 ? line.slice(tab + 1) : line;
      let ts = 0;
      try { ts = (JSON.parse(body) as { ts?: number }).ts || 0; } catch { ts = 0; }
      if (ts >= cutoff) keep.push(line); else dropped++;
    }
    if (!dropped) return;
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, keep.length ? keep.join('\n') + '\n' : '');
    renameSync(tmp, p);
    console.log(`[store] history pruned: dropped=${dropped} kept=${keep.length}`);
  }

  private path(id: string) {
    return join(this.snapDir, `${id}.json`);
  }

  read(id: string): Snap | null {
    const p = this.path(id);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as Snap;
    } catch {
      return null;
    }
  }

  write(id: string, snap: Snap): void {
    const p = this.path(id);
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(snap));
    renameSync(tmp, p);
  }

  readPack(): Pack | null {
    const p = join(this.dir, 'pack.json');
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as Pack;
    } catch {
      return null;
    }
  }

  writePack(pack: Pack): void {
    const p = join(this.dir, 'pack.json');
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(pack));
    renameSync(tmp, p);
  }

  /** 追加一行历史（用于热度曲线）：id, ts, [{title, rank, hot}] */
  appendHistory(id: string, ts: number, items: HotItem[]): void {
    const line = JSON.stringify({ ts, items: items.slice(0, 30).map((i) => ({ t: i.title, r: i.rank, h: i.hot })) });
    appendFileSync(join(this.dir, 'history.ndjson'), `${id}\t${line}\n`);
    if (++this.histCount % 200 === 0) this.pruneHistory();
  }
}

export type Store = Pick<FileStore, 'read' | 'write' | 'readPack' | 'writePack' | 'appendHistory'>;
