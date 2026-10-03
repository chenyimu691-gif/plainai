import { dictionary } from './terms';
import { techExtraTerms } from './terms-tech-extra';
import { jargonExtraTerms } from './terms-jargon-extra';
import { embodiedtermsTerms } from './terms-embodiedterms';
import type { DictEntry } from './types';

/**
 * 合并全部词库（去重，自有词条优先）。
 *
 * 词库来源：
 * - terms.ts / terms-tech-extra.ts / terms-jargon-extra.ts（本项目自建）
 * - terms-embodiedterms.ts：来源 embodiedterms.com，CC BY-NC 4.0
 */
export const fullDictionary: DictEntry[] = (() => {
  const own = [...dictionary, ...techExtraTerms, ...jargonExtraTerms];
  const seen = new Set(own.map((e) => e.term.toLowerCase()));
  const extra = embodiedtermsTerms.filter((e) => !seen.has(e.term.toLowerCase()));
  return [...own, ...extra];
})();

/** 在词库中精确查找术语 */
export function lookupTerm(text: string): DictEntry | null {
  const trimmed = text.trim().toLowerCase();

  // 先精确匹配
  const exact = fullDictionary.find(
    (e) => e.term.toLowerCase() === trimmed
  );
  if (exact) return exact;

  // 再别名匹配
  const byAka = fullDictionary.find(
    (e) => e.aka?.some((a) => a.toLowerCase() === trimmed)
  );
  if (byAka) return byAka;

  // 再部分匹配（输入包含术语）
  const byPartial = fullDictionary.find((e) =>
    trimmed.includes(e.term.toLowerCase())
  );
  if (byPartial) return byPartial;

  return null;
}

/** 模糊搜索词库中相关的所有条目 */
export function searchTerms(query: string): DictEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  return fullDictionary.filter(
    (e) =>
      e.term.toLowerCase().includes(q) ||
      e.plain.toLowerCase().includes(q) ||
      e.aka?.some((a) => a.toLowerCase().includes(q))
  );
}

/** 按分类获取词条 */
export function getTermsByCategory(
  category: DictEntry['category']
): DictEntry[] {
  return fullDictionary.filter((e) => e.category === category);
}

/** 词库统计 */
export function getDictStats() {
  return {
    total: fullDictionary.length,
    byCategory: {
      'embodied-ai': fullDictionary.filter((e) => e.category === 'embodied-ai').length,
      robotics: fullDictionary.filter((e) => e.category === 'robotics').length,
      aiml: fullDictionary.filter((e) => e.category === 'aiml').length,
      general: fullDictionary.filter((e) => e.category === 'general').length,
    },
  };
}
