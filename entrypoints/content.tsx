import type { DictEntry } from '../lib/dictionary/types';
import { getAIConfig, isLocalFirst, explainWithAI } from '../lib/utils/ai';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // 注入全局样式
    const style = document.createElement('style');
    style.textContent = `
      /* 术语高亮样式 */
      .plainai-term {
        background: rgba(233, 69, 96, 0.12);
        border-bottom: 1.5px dashed #e94560;
        border-radius: 2px;
        cursor: help;
        position: relative;
        transition: background 0.15s;
        padding: 0 1px;
      }
      .plainai-term:hover {
        background: rgba(233, 69, 96, 0.25);
      }

      /* Tooltip 气泡 */
      .plainai-tooltip {
        position: fixed;
        z-index: 2147483647;
        max-width: 400px;
        min-width: 200px;
        background: #1a1a2e;
        border: 1px solid #0f3460;
        border-radius: 10px;
        padding: 12px 14px;
        color: #e0e0e0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.6;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        pointer-events: auto;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.15s ease, transform 0.15s ease;
      }
      .plainai-tooltip.visible {
        opacity: 1;
        transform: translateY(0);
      }
      .plainai-tooltip .term-label {
        font-weight: 700;
        font-size: 14px;
        color: #e94560;
        margin-bottom: 4px;
      }
      .plainai-tooltip .term-source {
        display: inline-block;
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 3px;
        margin-bottom: 6px;
        background: #0f3460;
        color: #4fc3f7;
      }
      .plainai-tooltip .term-source.ai {
        background: #533483;
        color: #ce93d8;
      }
      .plainai-tooltip .term-plain {
        color: #d0d0d0;
        white-space: pre-wrap;
      }
      .plainai-tooltip .term-analogy {
        margin-top: 6px;
        padding: 6px 8px;
        background: #16213e;
        border-radius: 6px;
        font-size: 12px;
        color: #ffd54f;
      }
      .plainai-tooltip .term-community {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #0f3460;
        text-align: center;
      }
      .plainai-tooltip .term-community a {
        display: inline-block;
        padding: 4px 14px;
        background: #e94560;
        color: #fff;
        border-radius: 5px;
        text-decoration: none;
        font-size: 11px;
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);

    // ---- 标注引擎 ----

    // ---- 词库索引（异步加载 JSON 后构建）----
    let termMap = new Map<string, DictEntry>();
    let combinedRegex: RegExp | null = null;

    // 疑似术语自动识别：英文大写缩写（VLA/LLM/RT-2）——即使词库没有也能高亮，悬停走 AI 解释
    const acronymPattern =
      '(?<!\\w)([A-Z]{2,8}(?:-[A-Z0-9]+)*|[A-Z]{2,8}[0-9]+(?:-[A-Z0-9]+)*)(?!\\w)';

    /**
     * 用词库构建索引与匹配正则。
     * 词库来源：本项目自建词条 + embodiedterms.com（CC BY-NC 4.0）
     */
    function buildIndex(dict: DictEntry[]) {
      termMap = new Map();
      for (const entry of dict) {
        if (!termMap.has(entry.term)) termMap.set(entry.term, entry);
        if (entry.aka) {
          for (const alias of entry.aka) {
            if (!termMap.has(alias)) termMap.set(alias, entry);
          }
        }
      }
      // 按术语长度降序（长词优先匹配）
      const termPattern = [...termMap.keys()]
        .sort((a, b) => b.length - a.length)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      combinedRegex = new RegExp(
        `(?<!\\w)(${termPattern})|${acronymPattern}`,
        'g'
      );
    }

    // 常见词排除表（人人知道的缩写不标注，避免噪音）
    const COMMON_WORDS = new Set([
      'AI', 'CEO', 'CFO', 'CTO', 'COO', 'CIO', 'USA', 'UK', 'CN', 'US', 'EU', 'APP',
      'OK', 'TV', 'PC', 'GDP', 'DNA', 'RNA', 'VR', 'AR', 'MR', 'UI', 'UX', 'API',
      'URL', 'USB', 'HDMI', 'CPU', 'GPU', 'RAM', 'ROM', 'HTTP', 'HTTPS', 'HTML',
      'CSS', 'JS', 'PHP', 'SQL', 'ERP', 'CRM', 'OA', 'VPN', 'POS', 'ATM', 'EMS',
      'NFC', 'GPS', 'WIFI', 'IOS', 'ANDROID', 'MAC', 'ID', 'IP', 'QQ', 'VIP', 'MVP',
      'ISO', 'PDF', 'DOC', 'PPT', 'EXCEL', 'WORD', 'EMAIL', 'UFO', 'NBA', 'NFL',
      'CNN', 'BBC', 'CCTV', 'IMF', 'WHO', 'UN', '5G', '4G', '3D', '2D', '1D',
      'ROI', 'KPI', 'OKR', 'B2B', 'B2C', 'O2O', 'DIY', 'FAQ', 'RIP', 'PS',
    ]);

    let tooltipEl: HTMLDivElement | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    /** 延迟隐藏 tooltip（给鼠标从词语移到 tooltip 的时间） */
    function scheduleHide(delay = 250) {
      cancelHide();
      hideTimer = setTimeout(() => {
        hideTooltip();
      }, delay);
    }

    /** 取消延迟隐藏 */
    function cancelHide() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    /** 给 tooltip 绑定悬停保持逻辑 */
    function bindTooltipHover(el: HTMLDivElement) {
      el.addEventListener('mouseenter', cancelHide);
      el.addEventListener('mouseleave', () => scheduleHide(250));
    }

    /** 创建/显示 tooltip */
    function showTooltip(entry: DictEntry, x: number, y: number) {
      hideTooltip();

      tooltipEl = document.createElement('div');
      tooltipEl.className = 'plainai-tooltip';
      tooltipEl.innerHTML = `
        <div class="term-label">${escapeHtml(entry.term)}</div>
        <span class="term-source">📖 词库</span>
        <div class="term-plain">${escapeHtml(entry.plain)}</div>
        ${entry.analogy ? `<div class="term-analogy">💡 ${escapeHtml(entry.analogy)}</div>` : ''}
        <div class="term-community">
          <a href="https://your-community-link.com" target="_blank">🤝 加入具身智能交流群</a>
        </div>
      `;
      document.body.appendChild(tooltipEl);

      // 定位
      const tipWidth = 400;
      const tipHeight = tooltipEl.offsetHeight || 200;
      let left = Math.min(x, window.innerWidth - tipWidth - 10);
      let top = y + 10;

      // 如果 tooltip 超出底部，显示在鼠标上方
      if (top + tipHeight > window.innerHeight - 10) {
        top = y - tipHeight - 10;
      }
      if (top < 4) top = 4;

      tooltipEl.style.left = `${Math.max(4, left)}px`;
      tooltipEl.style.top = `${top}px`;

      requestAnimationFrame(() => {
        if (tooltipEl) tooltipEl.classList.add('visible');
      });

      // 鼠标移到 tooltip 上时保持显示，离开时延迟隐藏
      bindTooltipHover(tooltipEl);
    }

    /** 用 AI 解释并显示 tooltip */
    async function showAITooltip(text: string, x: number, y: number) {
      hideTooltip();

      tooltipEl = document.createElement('div');
      tooltipEl.className = 'plainai-tooltip';
      tooltipEl.innerHTML = `
        <div class="term-label">${escapeHtml(text)}</div>
        <span class="term-source ai">🤖 AI 解释中…</span>
        <div class="term-plain">正在降维翻译，请稍候…</div>
      `;
      document.body.appendChild(tooltipEl);

      // 定位（与词库模式一致，处理底部溢出）
      const tipWidth = 410;
      let left = Math.min(x, window.innerWidth - tipWidth - 10);
      let top = y + 12;
      // 等渲染后根据实际高度处理底部溢出
      requestAnimationFrame(() => {
        if (!tooltipEl) return;
        const h = tooltipEl.offsetHeight || 200;
        if (top + h > window.innerHeight - 8) {
          top = Math.max(8, y - h - 12);
        }
        tooltipEl.style.left = `${Math.max(4, left)}px`;
        tooltipEl.style.top = `${top}px`;
      });
      requestAnimationFrame(() => tooltipEl?.classList.add('visible'));

      // 鼠标移到 tooltip 上时保持显示，离开时延迟隐藏
      bindTooltipHover(tooltipEl);

      // 调用 AI
      try {
        const config = await getAIConfig();
        const result = await explainWithAI(text, config);
        if (tooltipEl) {
          tooltipEl.innerHTML = `
            <div class="term-label">${escapeHtml(text)}</div>
            <span class="term-source ai">🤖 AI 解释</span>
            <div class="term-plain">${escapeHtml(result)}</div>
            <div class="term-community">
              <a href="https://your-community-link.com" target="_blank">🤝 加入具身智能交流群</a>
            </div>
          `;
        }
      } catch {
        if (tooltipEl) {
          tooltipEl.innerHTML = `
            <div class="term-label">${escapeHtml(text)}</div>
            <span class="term-source ai">⚠️ AI 不可用</span>
            <div class="term-plain">请检查设置中的 AI 服务器地址是否正确。</div>
          `;
        }
      }
    }

    function hideTooltip() {
      cancelHide();
      if (tooltipEl) {
        tooltipEl.remove();
        tooltipEl = null;
      }
    }

    /** 标注文本节点，返回是否标注了任何内容 */
    function annotateNode(node: Node): boolean {
      if (node.nodeType !== Node.TEXT_NODE) return false;
      const text = node.textContent ?? '';
      if (!text.trim()) return false;
      if (!combinedRegex || !combinedRegex.test(text)) return false;

      // 重置正则
      combinedRegex.lastIndex = 0;
      const parent = node.parentElement;
      if (!parent || parent.closest('.plainai-term, script, style, noscript, option, svg, code, pre')) return false;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = combinedRegex.exec(text)) !== null) {
        // 词库命中取组1，疑似缩写取组2
        const matchedTerm = match[1] ?? match[2];

        // 常见词直接跳过（当作普通文本，不标注）
        if (matchedTerm && COMMON_WORDS.has(matchedTerm.toUpperCase())) {
          continue;
        }

        // 前面的纯文本
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        const entry = termMap.get(matchedTerm ?? '');

        // 创建标注 span
        const span = document.createElement('span');
        span.className = 'plainai-term';
        span.dataset.term = matchedTerm ?? '';

        // 鼠标悬停
        span.addEventListener('mouseenter', (e) => {
          cancelHide();
          if (entry) {
            showTooltip(entry, e.clientX, e.clientY);
          } else {
            // 词库没有 → AI 兜底解释
            showAITooltip(matchedTerm ?? '', e.clientX, e.clientY);
          }
        });
        span.addEventListener('mousemove', (e) => {
          if (tooltipEl) {
            // 全程跟随鼠标（X+Y 都跟），保证鼠标能追到 tooltip
            const rect = tooltipEl.getBoundingClientRect();
            const newX = Math.min(e.clientX + 12, window.innerWidth - rect.width - 8);
            let newY = e.clientY + 14;
            if (newY + rect.height > window.innerHeight - 8) {
              newY = Math.max(8, e.clientY - rect.height - 12);
            }
            tooltipEl.style.left = `${Math.max(4, newX)}px`;
            tooltipEl.style.top = `${newY}px`;
          }
        });
        span.addEventListener('mouseleave', () => {
          // 不立即隐藏，给鼠标移到 tooltip 的时间
          scheduleHide(300);
        });

        span.textContent = matchedTerm ?? '';
        fragment.appendChild(span);

        lastIndex = match.index + (matchedTerm?.length ?? 0);
      }

      // 剩余文本
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      parent.replaceChild(fragment, node);
      return true;
    }

    /** 扫描并标注整个文档 */
    function scanAndAnnotate() {
      // 跳过已标注的（防止重复扫描）
      if (document.querySelector('.plainai-term')) return;

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (!parent || parent.closest('.plainai-term, script, style, noscript, option, svg, code, pre'))
              return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      const nodes: Text[] = [];
      while (walker.nextNode()) {
        nodes.push(walker.currentNode as Text);
      }

      console.log('[PlainAI] 扫描到', nodes.length, '个文本节点');

      let annotated = 0;
      // 分批处理，不阻塞主线程
      let i = 0;
      function processBatch() {
        const batchSize = 100;
        const end = Math.min(i + batchSize, nodes.length);
        for (; i < end; i++) {
          const changed = annotateNode(nodes[i]);
          if (changed) annotated++;
        }
        if (i < nodes.length) {
          requestAnimationFrame(processBatch);
        } else {
          console.log('[PlainAI] 标注完成：', annotated, '个术语被高亮');
        }
      }
      processBatch();
    }

    // ---- 启动 ----
    async function init() {
      // 异步加载词库（扩展内本地 JSON，无网络请求）
      try {
        const res = await fetch(browser.runtime.getURL('/dict.json'));
        const dict: DictEntry[] = await res.json();
        buildIndex(dict);
        console.log('[PlainAI] 降维翻译器已加载，词库', dict.length, '条');
      } catch (err) {
        console.error('[PlainAI] 词库加载失败:', err);
        return;
      }

      // 页面加载完成后标注
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanAndAnnotate);
      } else {
        scanAndAnnotate();
      }

      // MutationObserver 处理动态加载内容（去抖）
      let observerTimer: ReturnType<typeof setTimeout>;
      const observer = new MutationObserver(() => {
        clearTimeout(observerTimer);
        observerTimer = setTimeout(scanAndAnnotate, 500);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    init();
  },
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
