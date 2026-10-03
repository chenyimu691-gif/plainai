/** AI API 配置接口 */
export interface AIConfig {
  endpoint: string;
  model: string;
  apiKey: string;
}

/** 默认配置 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  endpoint: 'http://localhost:8000/v1/chat/completions',
  model: 'qwen2.5-7b-instruct',
  apiKey: '',
};

/** 设置项键名 */
const STORAGE_KEYS = {
  aiConfig: 'plainai_ai_config',
  enabled: 'plainai_enabled',
  localFirst: 'plainai_local_first',
};

/** 从 storage 读取 AI 配置 */
export async function getAIConfig(): Promise<AIConfig> {
  const result = await browser.storage.local.get(STORAGE_KEYS.aiConfig);
  return (result[STORAGE_KEYS.aiConfig] as AIConfig) ?? DEFAULT_AI_CONFIG;
}

/** 保存 AI 配置 */
export async function setAIConfig(config: AIConfig): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.aiConfig]: config });
}

/** 读取插件启用状态 */
export async function isEnabled(): Promise<boolean> {
  const result = await browser.storage.local.get(STORAGE_KEYS.enabled);
  return (result[STORAGE_KEYS.enabled] as boolean) ?? true;
}

/** 读取是否先查本地词库 */
export async function isLocalFirst(): Promise<boolean> {
  const result = await browser.storage.local.get(STORAGE_KEYS.localFirst);
  return (result[STORAGE_KEYS.localFirst] as boolean) ?? true;
}

/** 用 AI 解释文本（自部署模型 API，兼容 OpenAI 格式） */
export async function explainWithAI(
  text: string,
  config: AIConfig
): Promise<string> {
  const prompt = `你是一个「降维翻译器」，专门把高密度的行业术语/技术概念翻译成大白话。

用户选中了以下文本，请用大白话解释（200字以内）：
- 如果这是一个术语/缩写，先解释它是什么，再用一个生活类比
- 如果这是一个句子/段落，用通俗的语言重述它的核心意思
- 用比喻、类比帮助理解
- 语气轻松，让人一听就懂

选中文本："""${text}"""

请直接输出解释，不要加「解释：」之类的开头。`;

  const body = JSON.stringify({
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 500,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`AI 服务返回错误: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '（AI 无法解释）';
}

/** 调用背景脚本进行解释 */
export async function requestExplanation(
  text: string
): Promise<{ from: 'dict' | 'ai'; content: string; term?: string } | null> {
  try {
    const result = await browser.runtime.sendMessage({
      type: 'EXPLAIN_TEXT',
      text,
    });
    return result as { from: 'dict' | 'ai'; content: string; term?: string } | null;
  } catch {
    return null;
  }
}
