/**
 * 长期记忆服务：
 * - 每 12 条助手回复触发一次 GLM 总结，把近期对话提炼为要点（≤20 条）
 * - 记忆注入对话系统提示（跨会话"认识"主人）
 * - 本地明文副本：配置目录下 记忆.json + 记忆.md（用户可读可备份）
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shell } from 'electron'
import type { ChatMessage, MemoryData } from '@shared/types'
import { buildMemoryPrompt, extractFactsJson } from '@shared/prompts'
import { get as storeGet, set as storeSet } from './store'
import { getConfig } from './appconfig'
import { chatRaw } from './glm'
import { refreshPersonalityLines } from './personality-lines'

const SUMMARIZE_EVERY = 12

export function getMemory(): MemoryData {
  return storeGet('memory') ?? { facts: [], updatedAt: 0, summarizedCount: 0 }
}

function memoryDir(): string {
  const cfg = getConfig()
  return cfg.memory.dir || join(process.env.USERPROFILE ?? '.', '银月记忆')
}

/** 写本地明文副本（json + markdown），与 electron-store 各存一份 */
function mirrorToDisk(data: MemoryData): void {
  try {
    const dir = memoryDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, '记忆.json'),
      JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2),
      'utf-8'
    )
    const md = [
      '# 银月的记忆',
      '',
      `> 更新时间：${new Date(data.updatedAt).toLocaleString('zh-CN')} · 共 ${data.facts.length} 条`,
      '',
      ...data.facts.map((f, i) => `${i + 1}. ${f}`),
      ''
    ].join('\n')
    writeFileSync(join(dir, '记忆.md'), md, 'utf-8')
  } catch (e) {
    console.log(`[memory] 本地副本写入失败: ${e instanceof Error ? e.message : e}`)
  }
}

function saveMemory(data: MemoryData): void {
  storeSet('memory', data)
  if (getConfig().memory.enabled) mirrorToDisk(data)
}

/** 是否到达总结阈值 */
export function shouldSummarize(): boolean {
  const mem = getMemory()
  const history = storeGet('history')
  const assistantCount = history.filter((m) => m.role === 'assistant').length
  return assistantCount - mem.summarizedCount >= SUMMARIZE_EVERY
}

/** 用 GLM 总结近期对话进记忆（失败时返回 null，保持旧记忆） */
export async function summarizeMemory(): Promise<MemoryData | null> {
  const mem = getMemory()
  const history = storeGet('history') as ChatMessage[]
  if (history.length === 0) return mem
  const transcript = history
    .slice(-24)
    .map((m) => `${m.role === 'user' ? '主人' : '银月'}: ${m.content}`)
    .join('\n')
  const result = await chatRaw(
    '你是记忆整理系统，只输出一个 JSON 字符串数组，不要输出任何其他文字。',
    buildMemoryPrompt(mem.facts, transcript),
    { temperature: 0.3, maxTokens: 1200 }
  )
  if (!result.ok) return null
  const facts = extractFactsJson(result.content)
  if (facts.length === 0) return null
  const data: MemoryData = {
    facts,
    updatedAt: Date.now(),
    summarizedCount: history.filter((m) => m.role === 'assistant').length
  }
  saveMemory(data)
  // 记忆更新后顺便刷新台词（GLM 不可用则不影响，refreshPersonalityLines 内部处理）
  refreshPersonalityLines().catch(() => {}) // fire-and-forget，不阻塞记忆保存
  return data
}

/** 导出记忆到指定目录 */
export function exportMemory(dir: string): boolean {
  try {
    const data = getMemory()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '记忆.json'), JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

/** 从记忆.json 导入 */
export function importMemory(file: string): MemoryData | null {
  try {
    if (!existsSync(file)) return null
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<MemoryData>
    if (!Array.isArray(raw.facts)) return null
    const data: MemoryData = {
      facts: raw.facts.filter((f) => typeof f === 'string').slice(0, 40),
      updatedAt: Date.now(),
      summarizedCount: getMemory().summarizedCount
    }
    saveMemory(data)
    return data
  } catch {
    return null
  }
}

export function openMemoryDir(): void {
  const dir = memoryDir()
  mkdirSync(dir, { recursive: true })
  void shell.openPath(dir)
}
