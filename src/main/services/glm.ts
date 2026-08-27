/** GLM OpenAI 兼容接口客户端（主进程 Node fetch，规避渲染进程 CORS；配置实时读取运行时配置） */
import type { ChatContext, ChatMessage, ChatResult } from '@shared/types'
import { buildSystemPrompt, sanitizeReply, type PromptExtras } from '@shared/prompts'
import { getConfig } from './appconfig'

const TIMEOUT_MS = 30_000

export interface RawCallOptions {
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}

/** 通用补全：给任意系统提示 + 用户文本，返回原始助手文本（供记忆总结等内部能力使用） */
export async function chatRaw(
  systemPrompt: string,
  userText: string,
  opts: RawCallOptions = {}
): Promise<{ ok: boolean; content: string; error?: string }> {
  const cfg = getConfig()
  if (cfg.api.mode === 'offline') {
    return { ok: false, content: '', error: 'offline 模式（未调用远端）' }
  }
  if (!cfg.api.apiKey) {
    return { ok: false, content: '', error: 'API Key 未配置（后台控制台或 config.local.json）' }
  }
  try {
    const resp = await fetch(cfg.api.baseUrl.replace(/\/+$/, '') + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.api.apiKey}`,
        // 桌宠客户端身份标识 —— 后端 Hermes Agent 据此区分来源
        'X-Hermes-Session-Id': 'desktop-pet'
      },
      body: JSON.stringify({
        model: cfg.api.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ],
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 512
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS)
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { ok: false, content: '', error: `HTTP ${resp.status} ${text.slice(0, 160)}` }
    }
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content ?? ''
    if (!content) return { ok: false, content: '', error: '响应中无有效内容' }
    return { ok: true, content }
  } catch (err) {
    return { ok: false, content: '', error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }
  }
}

export { buildSystemPrompt, sanitizeReply }

export async function chatWithGlm(
  history: ChatMessage[],
  ctx: ChatContext,
  extras: PromptExtras = {}
): Promise<ChatResult> {
  const cfg = getConfig()
  if (cfg.api.mode === 'offline') {
    return { ok: false, content: '', error: 'offline 模式：使用本地回复', degraded: true }
  }
  if (!cfg.api.apiKey) {
    return { ok: false, content: '', error: 'API Key 未配置' }
  }
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: buildSystemPrompt(ctx, extras) },
    ...history.slice(-40).map((m) => ({ role: m.role, content: m.content }))
  ]
  const started = Date.now()
  try {
    const resp = await fetch(cfg.api.baseUrl.replace(/\/+$/, '') + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.api.apiKey}`,
        // 桌宠客户端身份标识 —— 后端 Hermes Agent 据此区分来源
        'X-Hermes-Session-Id': 'desktop-pet'
      },
      body: JSON.stringify({ model: cfg.api.model, messages, temperature: 0.7, max_tokens: 512 }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return {
        ok: false,
        content: '',
        error: `HTTP ${resp.status} ${text.slice(0, 160)}`,
        latencyMs: Date.now() - started,
        degraded: true
      }
    }
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = sanitizeReply(data.choices?.[0]?.message?.content ?? '')
    if (!content) {
      return { ok: false, content: '', error: '响应中无有效内容', latencyMs: Date.now() - started, degraded: true }
    }
    return { ok: true, content, latencyMs: Date.now() - started, model: cfg.api.model }
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    return { ok: false, content: '', error: message, latencyMs: Date.now() - started, degraded: true }
  }
}
