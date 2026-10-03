/** 术语词条结构 */
export interface DictEntry {
  term: string;               // 术语
  category: 'embodied-ai' | 'robotics' | 'aiml' | 'general';
  plain: string;              // 大白话解释
  example?: string;           // 使用场景例句
  analogy?: string;           // 一句话类比
  aka?: string[];             // 也叫做
}

export type DictCategory = DictEntry['category'];
