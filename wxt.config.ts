import { defineConfig } from 'wxt';
import { readCatalog } from './scripts/dictionary/network';
import { buildNotices } from './scripts/dictionary/notices';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  hooks: {
    // Historical online releases are deployed to Pages, never copied into the extension package.
    'build:publicAssets': async (wxt, files) => {
      for (let index = files.length - 1; index >= 0; index--) {
        if (files[index].relativeDest.startsWith('dictionary/')) files.splice(index, 1);
      }
      const sources = await readCatalog(wxt.config.root);
      const { notices } = await buildNotices(wxt.config.root, sources);
      files.push({ relativeDest: 'dictionary-NOTICES.txt', contents: notices });
    },
  },
  manifest: {
    name: '降维翻译器 PlainAI',
    description: '选中即释 — 把高密度行业术语翻译成人话',
    permissions: ['storage', 'activeTab', 'alarms'],
    host_permissions: ['<all_urls>'],
    // 词库以 JSON 形式按需加载（避免把 3000+ 条词库打进 content script）
    web_accessible_resources: [
      {
        resources: ['dict.json'],
        matches: ['<all_urls>'],
      },
    ],
    action: {
      default_title: '降维翻译器 PlainAI',
    },
  },
});
