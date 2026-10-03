import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '降维翻译器 PlainAI',
    description: '选中即释 — 把高密度行业术语翻译成人话',
    permissions: ['storage', 'activeTab'],
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
