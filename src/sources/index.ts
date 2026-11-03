import type { Source } from '../types';
import { socialSources } from './social';
import { newsSources } from './news';
import { techSources } from './tech';

export const sources: Source[] = [...socialSources, ...newsSources, ...techSources];

export const sourceMap: Map<string, Source> = new Map(sources.map((s) => [s.id, s]));

export const CATEGORY_LABEL: Record<string, string> = {
  social: '社交热榜',
  news: '新闻资讯',
  tech: '科技开发',
  ent: '影视娱乐',
};
