import { Source, Item } from '../types';
import { spawnBrowserFetch } from '../lib/browser';

const mashdigi: Source = {
  id: 'mashdigi',
  name: 'MashDigi',
  category: 'tech',
  description: '科技、AI、手機、趨勢觀察',
  async fetch(): Promise<Item[]> {
    const raw = await spawnBrowserFetch('mashdigi');
    return raw.map((item: any, i: number) => ({
      id: String(i + 1),
      title: item.title,
      url: item.url,
      mobileUrl: item.mobileUrl
    }));
  }
};

export default mashdigi;
