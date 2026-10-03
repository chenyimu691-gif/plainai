import { useState, useEffect } from 'react';
import type { AIConfig } from '../../lib/utils/ai';
import { DEFAULT_AI_CONFIG } from '../../lib/utils/ai';

const STORAGE_KEYS = {
  aiConfig: 'plainai_ai_config',
  enabled: 'plainai_enabled',
  localFirst: 'plainai_local_first',
};

export default function SettingsPage() {
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [enabled, setEnabled] = useState(true);
  const [localFirst, setLocalFirst] = useState(true);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState<{ total: number } | null>(null);

  // 加载设置
  useEffect(() => {
    (async () => {
      const config = (await browser.storage.local.get(STORAGE_KEYS.aiConfig))[STORAGE_KEYS.aiConfig] as AIConfig | undefined;
      const en = (await browser.storage.local.get(STORAGE_KEYS.enabled))[STORAGE_KEYS.enabled] as boolean | undefined;
      const lf = (await browser.storage.local.get(STORAGE_KEYS.localFirst))[STORAGE_KEYS.localFirst] as boolean | undefined;

      if (config) setAiConfig(config);
      if (en !== undefined) setEnabled(en);
      if (lf !== undefined) setLocalFirst(lf);

      // 获取词库统计
      try {
        const res = await browser.runtime.sendMessage({ type: 'GET_DICT_STATS' });
        if (res) setStats(res);
      } catch {}
    })();
  }, []);

  // 保存设置
  const saveSettings = async () => {
    await browser.storage.local.set({
      [STORAGE_KEYS.aiConfig]: aiConfig,
      [STORAGE_KEYS.enabled]: enabled,
      [STORAGE_KEYS.localFirst]: localFirst,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{
      width: '360px',
      padding: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      background: '#1a1a2e',
      color: '#e0e0e0',
      fontSize: '13px',
    }}>
      {/* 头部 */}
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#e94560', margin: '0 0 2px' }}>
          ✦ 降维翻译器
        </h1>
        <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
          PlainAI — 把高密度术语翻译成人话
        </p>
        {stats && (
          <p style={{ fontSize: '10px', color: '#666', margin: '4px 0 0' }}>
            内置词库 {stats.total} 条
          </p>
        )}
      </div>

      {/* 开关 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', background: '#16213e', borderRadius: '8px', marginBottom: '8px',
      }}>
        <span>插件启用</span>
        <Toggle checked={enabled} onChange={setEnabled} />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', background: '#16213e', borderRadius: '8px', marginBottom: '12px',
      }}>
        <span>
          本地词库优先
          <span style={{ display: 'block', fontSize: '11px', color: '#888', fontWeight: 400 }}>
            优先匹配内置词库，未命中再走 AI
          </span>
        </span>
        <Toggle checked={localFirst} onChange={setLocalFirst} />
      </div>

      {/* AI 配置 */}
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#aaa', marginBottom: '6px' }}>
        🤖 AI 服务配置
      </div>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        <span style={{ display: 'block', marginBottom: '3px', color: '#aaa', fontSize: '11px' }}>
          服务器地址
        </span>
        <input
          value={aiConfig.endpoint}
          onChange={(e) => setAiConfig({ ...aiConfig, endpoint: e.target.value })}
          placeholder={DEFAULT_AI_CONFIG.endpoint}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        <span style={{ display: 'block', marginBottom: '3px', color: '#aaa', fontSize: '11px' }}>
          模型名称
        </span>
        <input
          value={aiConfig.model}
          onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
          placeholder={DEFAULT_AI_CONFIG.model}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        <span style={{ display: 'block', marginBottom: '3px', color: '#aaa', fontSize: '11px' }}>
          API Key <span style={{ color: '#666' }}>（可选）</span>
        </span>
        <input
          type="password"
          value={aiConfig.apiKey}
          onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
          placeholder="sk-..."
          style={inputStyle}
        />
      </label>

      {/* 保存按钮 */}
      <button
        onClick={saveSettings}
        style={{
          width: '100%',
          padding: '8px',
          background: saved ? '#2e7d32' : '#e94560',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'background 0.3s',
          marginBottom: '12px',
        }}
      >
        {saved ? '✓ 已保存' : '保存设置'}
      </button>

      {/* 使用说明 */}
      <details style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>
        <summary style={{ cursor: 'pointer' }}>💡 使用说明</summary>
        <div style={{ padding: '6px 0 0 12px', lineHeight: '1.7' }}>
          · 在任意网页选中文本即可触发解释<br />
          · 选中的文字会自动匹配词库或调用 AI<br />
          · 弹窗支持拖拽，按 ESC 关闭<br />
          · 服务器需支持 OpenAI 兼容 API
        </div>
      </details>

      {/* 社区引流 */}
      <div style={{
        textAlign: 'center',
        padding: '12px',
        background: 'linear-gradient(135deg, #16213e, #1a1a2e)',
        borderRadius: '8px',
        border: '1px solid #0f3460',
      }}>
        <p style={{ fontSize: '12px', color: '#aaa', margin: '0 0 6px' }}>
          🤝 加入具身智能学习社区
        </p>
        <p style={{ fontSize: '11px', color: '#666', margin: '0 0 10px' }}>
          和 300+ 开发者一起交流，每日论文速递 + 行业动态
        </p>
        <a
          href="https://your-community-link.com"
          target="_blank"
          style={{
            display: 'inline-block',
            padding: '6px 20px',
            background: '#e94560',
            color: '#fff',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          加入交流群 →
        </a>
      </div>
    </div>
  );
}

/** 开关组件 */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '40px',
        height: '22px',
        borderRadius: '11px',
        background: checked ? '#e94560' : '#444',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        background: '#fff',
        position: 'absolute',
        top: '2px',
        left: checked ? '20px' : '2px',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: '#0d1b2a',
  border: '1px solid #0f3460',
  borderRadius: '6px',
  color: '#e0e0e0',
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
};
