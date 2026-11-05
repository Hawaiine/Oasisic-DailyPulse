import type { HotItem, Source } from '../types';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const biggo: Source = {
  id: 'biggo',
  name: 'BigGo财经',
  category: 'news',
  kind: 'hottest',
  home: 'https://finance.biggo.com.tw/',
  ttl: 600,
  async fetch(): Promise<HotItem[]> {
    const script = process.cwd() + '/browser-fetch/biggo.mjs';
    const { stdout } = await execFileP(process.execPath, [script], {
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '/opt/daily-pulse/.browsers' },
    });
    const arr = JSON.parse(stdout || '[]');
    return arr
      .map((x: any, i: number) => ({
        rank: i + 1,
        title: String(x.title || '').trim(),
        url: String(x.url || ''),
        mobileUrl: String(x.mobileUrl || x.url || ''),
      }))
      .filter((x: any) => x.title);
  },
};

export default biggo;
