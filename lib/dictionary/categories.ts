import type { DictCategory, DictEntry } from './types.ts';

export const CATEGORY_STORAGE_KEY = 'plainai_dictionary_categories';
export const CATEGORY_OPTIONS: ReadonlyArray<{ id: DictCategory; label: string }> = [
  { id: 'embodied-ai', label: '具身智能' },
  { id: 'robotics', label: '机器人' },
  { id: 'aiml', label: '人工智能 / 机器学习' },
  { id: 'general', label: '通用 / 职场' },
  { id: 'technical', label: '软件 / 通用技术' },
  { id: 'business', label: '商业 / 管理' },
  { id: 'finance', label: '金融 / 经济' },
  { id: 'legal', label: '法律' },
  { id: 'medical', label: '医疗 / 健康' },
  { id: 'science', label: '科学 / 工程' },
  { id: 'internet', label: '互联网' },
  { id: 'education', label: '教育 / 学习' },
];
export const DEFAULT_CATEGORIES: readonly DictCategory[] = ['embodied-ai', 'robotics', 'aiml', 'general'];

/** An intentional empty array means no libraries; new industries always require opting in. */
export function readCategories(value: unknown): DictCategory[] {
  if (!Array.isArray(value)) return [...DEFAULT_CATEGORIES];
  return CATEGORY_OPTIONS.map(option => option.id).filter(id => value.includes(id));
}

export function filterCategories<T extends DictEntry>(entries: T[], selected: readonly DictCategory[]): T[] {
  const enabled = new Set(selected);
  return entries.filter(entry => enabled.has(entry.category));
}
