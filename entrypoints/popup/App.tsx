import { useState, useEffect, useRef } from 'react';
import type { AIConfig } from '../../lib/utils/ai';
import { DEFAULT_AI_CONFIG } from '../../lib/utils/ai';
import type { SyncStatus } from '../../lib/dictionary/remote-sync';
import type { DictCategory } from '../../lib/dictionary/types';
import { CATEGORY_OPTIONS, CATEGORY_STORAGE_KEY, DEFAULT_CATEGORIES, readCategories } from '../../lib/dictionary/categories';

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
  const [stats, setStats] = useState<{ total: number; availableTotal: number; availableByCategory: Partial<Record<DictCategory, number>> } | null>(null);
  const [categories, setCategories] = useState<DictCategory[]>([...DEFAULT_CATEGORIES]);
  const [selectionReady, setSelectionReady] = useState(false);
  const [selectionStatus, setSelectionStatus] = useState('');
  const selectionWrites = useRef(Promise.resolve());
  const selectionRevision = useRef(0);
  const savedCategories = useRef<DictCategory[]>([...DEFAULT_CATEGORIES]);
  const [dictionaryStatus, setDictionaryStatus] = useState<SyncStatus | null>(null);
  const [checkingDictionary, setCheckingDictionary] = useState(false);

  // 加载设置
  useEffect(() => {
    (async () => {
      const config = (await browser.storage.local.get(STORAGE_KEYS.aiConfig))[STORAGE_KEYS.aiConfig] as AIConfig | undefined;
      const en = (await browser.storage.local.get(STORAGE_KEYS.enabled))[STORAGE_KEYS.enabled] as boolean | undefined;
      const lf = (await browser.storage.local.get(STORAGE_KEYS.localFirst))[STORAGE_KEYS.localFirst] as boolean | undefined;

      if (config) setAiConfig(config);
      if (en !== undefined) setEnabled(en);
      if (lf !== undefined) setLocalFirst(lf);
      const selected = (await browser.storage.local.get(CATEGORY_STORAGE_KEY))[CATEGORY_STORAGE_KEY];
      const savedSelection = readCategories(selected);
      savedCategories.current = savedSelection;
      setCategories(savedSelection);
      setSelectionReady(true);

      // 获取词库统计
      try {
        const res = await browser.runtime.sendMessage({ type: 'GET_DICT_STATS' });
        if (res) setStats(res);
        setDictionaryStatus(await browser.runtime.sendMessage({ type: 'GET_DICT_STATUS' }));
      } catch {}
    })();
  }, []);

  const changeCategories = (next: DictCategory[]) => {
    const revision = ++selectionRevision.current;
    setCategories(next);
    setSelectionStatus('保存中…');
    // Serialize rapid checkbox changes so an earlier write cannot replace the latest choice.
    selectionWrites.current = selectionWrites.current.then(async () => {
      await browser.storage.local.set({ [CATEGORY_STORAGE_KEY]: next });
      savedCategories.current = next;
      if (revision === selectionRevision.current) setSelectionStatus('已自动保存，网页立即生效');
    }).catch(() => {
      if (revision === selectionRevision.current) {
        setCategories([...savedCategories.current]);
        setSelectionStatus('保存失败，已恢复上次选项，请重试');
      }
    });
  };
  const selectedCount = stats ? categories.reduce((sum, id) => sum + (stats.availableByCategory[id] ?? 0), 0) : 0;

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

  const updateDictionary = async () => {
    setCheckingDictionary(true);
    try {
      setDictionaryStatus(await browser.runtime.sendMessage({ type: 'SYNC_DICTIONARY' }));
      const result = await browser.runtime.sendMessage({ type: 'GET_DICT_STATS' });
      if (result) setStats(result);
    } catch {
      setDictionaryStatus({ checkedAt: new Date().toISOString(), error: '后台服务暂不可用' });
    } finally { setCheckingDictionary(false); }
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
            已启用 {selectedCount} 条 · 本地共 {stats.availableTotal} 条
          </p>
        )}
      </div>

      <fieldset disabled={!selectionReady} style={{ border: '1px solid #0f3460', borderRadius: '8px', margin: '0 0 12px', padding: '10px 12px' }}>
        <legend style={{ color: '#eee', fontSize: '13px', fontWeight: 600, padding: '0 4px' }}>我需要解释的行业 / 方向</legend>
        <p style={{ color: '#aaa', fontSize: '11px', lineHeight: 1.7, margin: '0 0 8px' }}>可多选。只标注已选词库，勾选后自动保存，无需模型或 API Key。</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          {CATEGORY_OPTIONS.map(({ id, label }) => {
            const count = stats?.availableByCategory[id] ?? 0;
            const checked = categories.includes(id);
            return <label key={id} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', background: checked ? '#16213e' : '#202035', borderRadius: '6px', padding: '8px 5px', cursor: 'pointer' }}>
              <input type="checkbox" checked={checked} onChange={event => changeCategories(event.target.checked ? readCategories([...categories, id]) : categories.filter(value => value !== id))} style={{ margin: '2px 0 0', accentColor: '#e94560' }} />
              <span style={{ fontSize: '11px', lineHeight: 1.5 }}>{label}<span style={{ display: 'block', color: '#888', fontSize: '10px' }}>{count ? `${count} 条` : '暂无词条'}</span></span>
            </label>;
          })}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button type="button" onClick={() => changeCategories(CATEGORY_OPTIONS.map(option => option.id))} style={choiceButton}>全选</button>
          <button type="button" onClick={() => changeCategories([])} style={choiceButton}>全不选</button>
        </div>
        <div role="status" style={{ color: categories.length ? '#aaa' : '#ffd54f', fontSize: '10px', lineHeight: 1.7, marginTop: '6px' }}>
          {selectionStatus}
          <div>{categories.length ? '暂无词条的方向会在后续词库更新后可用。' : '未选择词库，网页将不再标注术语。'}</div>
        </div>
      </fieldset>

      <div style={{ padding: '10px 12px', background: '#16213e', borderRadius: '8px', marginBottom: '12px', fontSize: '11px', lineHeight: 1.7 }}>
        <div>词库每周更新，自动同步到本地供离线使用。</div>
        <div style={{ color: dictionaryStatus?.error ? '#ffd54f' : '#aaa' }} title={dictionaryStatus?.error}>
          {dictionaryStatus?.error ? '检查失败，继续使用已保存词库。' : dictionaryStatus?.version ? `在线词库 v${dictionaryStatus.version} · ${dictionaryStatus.count ?? 0} 条` : '尚未同步在线词库，内置词库可正常使用。'}
        </div>
        {dictionaryStatus?.checkedAt && <div style={{ color: '#888' }}>上次检查：{new Date(dictionaryStatus.checkedAt).toLocaleString()}</div>}
        <button type="button" onClick={updateDictionary} disabled={checkingDictionary} style={{ marginTop: '6px', background: '#0f3460', color: '#fff', border: 0, borderRadius: '4px', padding: '5px 10px', cursor: 'pointer' }}>
          {checkingDictionary ? '检查中…' : '检查词库更新'}
        </button>
      </div>

      {/* 开关 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', background: '#16213e', borderRadius: '8px', marginBottom: '8px',
      }}>
        <span>插件启用</span>
        <Toggle checked={enabled} onChange={setEnabled} />
      </div>

      <details style={{ marginBottom: '12px' }}>
      <summary style={{ cursor: 'pointer', color: '#aaa', fontSize: '12px' }}>高级设置（AI 接口，可选）</summary>
      <p style={{ color: '#888', fontSize: '11px', lineHeight: 1.7 }}>行业词库无需配置以下接口。这里保留原有 AI 功能的连接设置。</p>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', background: '#16213e', borderRadius: '8px', marginBottom: '12px',
      }}>
        <span>
          本地词库优先
          <span style={{ display: 'block', fontSize: '11px', color: '#888', fontWeight: 400 }}>
            不影响上方的行业词库选择
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
      </details>

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
          · 先勾选需要解释的行业，可同时选择多个<br />
          · 鼠标移到网页上带虚线的词语查看词库解释<br />
          · 更改分类自动生效，无需刷新网页<br />
          · 未配置 AI 接口也能使用行业词库
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

const choiceButton: React.CSSProperties = { background: 'none', border: 0, color: '#4fc3f7', fontSize: '11px', padding: '2px 0', cursor: 'pointer' };
