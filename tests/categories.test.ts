import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORY_OPTIONS, DEFAULT_CATEGORIES, readCategories, filterCategories } from '../lib/dictionary/categories.ts';

test('first use preserves the four existing libraries while explicit empty selection disables all', () => {
  assert.deepEqual(readCategories(undefined), [...DEFAULT_CATEGORIES]);
  assert.deepEqual(readCategories([]), []);
  assert.equal(CATEGORY_OPTIONS.length, 12);
});

test('multi-select rejects unknown categories and filters terms and aliases as complete entries', () => {
  const selection = readCategories(['robotics', 'finance', 'robotics', 'unknown']);
  assert.deepEqual(selection, ['robotics', 'finance']);
  const entries = [
    { term: '机器臂', aka: ['Robot Arm'], category: 'robotics' as const, plain: '机械手臂' },
    { term: '对冲', category: 'finance' as const, plain: '抵消风险' },
    { term: '神经网络', category: 'aiml' as const, plain: '一种学习方法' },
  ];
  assert.deepEqual(filterCategories(entries, selection), entries.slice(0, 2));
  assert.deepEqual(filterCategories(entries, []), []);
});
