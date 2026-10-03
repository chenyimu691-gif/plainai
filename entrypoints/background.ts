/**
 * 后台服务：处理来自设置页的消息。
 *
 * 注意：词库不在此处打包——内容脚本自行从扩展内的 dict.json 加载，
 * 避免同一份词库被重复打入 background 与 content 两个 bundle。
 */
export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (message: { type: string }) => {
    // 设置页展示词库规模
    if (message.type === 'GET_DICT_STATS') {
      try {
        const res = await fetch(browser.runtime.getURL('/dict.json'));
        const dict: Array<{ category?: string }> = await res.json();
        const byCategory: Record<string, number> = {};
        for (const entry of dict) {
          const key = entry.category || 'general';
          byCategory[key] = (byCategory[key] || 0) + 1;
        }
        return { total: dict.length, byCategory };
      } catch (err) {
        console.error('[PlainAI] 词库统计读取失败:', err);
        return null;
      }
    }
    return undefined;
  });
});
