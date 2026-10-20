import type { DictEntry } from '../lib/dictionary/types';
import { CATEGORY_STORAGE_KEY, readCategories, filterCategories } from '../lib/dictionary/categories';
import { mergeDictionaries } from '../lib/dictionary/remote-schema';
import { loadPackagedSeed, preferSnapshot } from '../lib/dictionary/packaged-seed';
import { createRemoteSync, REMOTE_ALARM, REMOTE_STATUS_KEY, type SyncStatus } from '../lib/dictionary/remote-sync';

/** Network access and validation stay in the extension worker, never the visited webpage. */
export default defineBackground(() => {
  const sync = createRemoteSync({
    read: async key => (await browser.storage.local.get(key))[key],
    write: async (key, value) => browser.storage.local.set({ [key]: value }),
    fetch: (...args) => fetch(...args),
  });
  let builtin: Promise<DictEntry[]> | undefined;
  const seed = loadPackagedSeed(browser.runtime.getURL('/dict.json'));
  function loadBuiltin() {
    if (!builtin) builtin = fetch(browser.runtime.getURL('/dict.json')).then(async response => {
      if (!response.ok) throw new Error('Cannot read built-in dictionary');
      return await response.json() as DictEntry[];
    }).catch(error => { builtin = undefined; throw error; });
    return builtin;
  }
  async function availableDictionary() {
    const [own, cache, packaged] = await Promise.all([loadBuiltin(), sync.readCache(), seed]);
    return mergeDictionaries(own, preferSnapshot(packaged, cache?.snapshot ?? null)?.entries ?? []);
  }
  async function selection() {
    return readCategories((await browser.storage.local.get(CATEGORY_STORAGE_KEY))[CATEGORY_STORAGE_KEY]);
  }
  async function dictionary() {
    const [entries, selected] = await Promise.all([availableDictionary(), selection()]);
    return filterCategories(entries, selected);
  }
  async function ensureAlarm() {
    // Chrome may clear alarms when restarting; recreate rather than rely on installation alone.
    if (!await browser.alarms.get(REMOTE_ALARM)) await browser.alarms.create(REMOTE_ALARM, { periodInMinutes: 24 * 60 });
  }
  async function checkIfDue() {
    const value = (await browser.storage.local.get(REMOTE_STATUS_KEY))[REMOTE_STATUS_KEY] as SyncStatus | undefined;
    const last = value?.checkedAt ? Date.parse(value.checkedAt) : 0;
    if (!last || !Number.isFinite(last) || Date.now() - last >= 24 * 60 * 60 * 1000 || last > Date.now()) await sync.sync();
  }
  // Register listeners synchronously before any service-worker await.
  browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === REMOTE_ALARM) void checkIfDue().catch(console.error);
  });
  browser.runtime.onInstalled.addListener(() => { void ensureAlarm().then(checkIfDue).catch(console.error); });
  browser.runtime.onStartup.addListener(() => { void ensureAlarm().then(checkIfDue).catch(console.error); });
  browser.runtime.onMessage.addListener(async (message: { type?: string }) => {
    if (!message || typeof message !== 'object') return undefined;
    switch (message.type) {
      case 'GET_DICTIONARY': return dictionary();
      case 'GET_DICT_STATS': {
        try {
          const [available, selected] = await Promise.all([availableDictionary(), selection()]);
          const entries = filterCategories(available, selected);
          const byCategory: Record<string, number> = {};
          const availableByCategory: Record<string, number> = {};
          for (const entry of entries) byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
          for (const entry of available) availableByCategory[entry.category] = (availableByCategory[entry.category] ?? 0) + 1;
          return { total: entries.length, byCategory, availableTotal: available.length, availableByCategory };
        } catch (error) { console.error('[PlainAI] 词库统计读取失败:', error); return null; }
      }
      case 'GET_DICT_STATUS': return (await browser.storage.local.get(REMOTE_STATUS_KEY))[REMOTE_STATUS_KEY] ?? null;
      case 'SYNC_DICTIONARY': return sync.sync();
      default: return undefined;
    }
  });
  void ensureAlarm().then(checkIfDue).catch(console.error);
});
