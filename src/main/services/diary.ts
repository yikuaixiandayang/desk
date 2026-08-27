/** 银月日记服务：每日生成一篇温暖小记（主进程） */
import { chatRaw } from './glm'
import { get as storeGet, set as storeSet } from './store'
import { getConfig } from './appconfig'
import * as fs from 'fs'
import * as path from 'path'
import type { UsageStats, ChatMessage } from '@shared/types'
import { personalityType } from '@shared/personality'

export interface DiaryEntry {
  date: string // YYYY-MM-DD
  text: string
}

const MAX_ENTRIES = 90

function loadDiary(): DiaryEntry[] {
  return (storeGet('diary') as unknown as DiaryEntry[]) ?? []
}

function saveDiary(entries: DiaryEntry[]): void {
  // 保留最近 90 天
  storeSet('diary', entries.slice(-MAX_ENTRIES))
}

/** 今天是否已写过日记 */
export function hasTodayEntry(): boolean {
  const entries = loadDiary()
  const today = new Date().toISOString().slice(0, 10)
  return entries.length > 0 && entries[entries.length - 1].date === today
}

/** 生成今日日记（聚合数据 → GLM 生成 → 存储） */
export async function generateDiary(): Promise<{ ok: boolean; text: string; error?: string }> {
  if (hasTodayEntry()) {
    const entries = loadDiary()
    return { ok: true, text: entries[entries.length - 1].text }
  }

  const stats = storeGet('stats') as UsageStats
  const history = (storeGet('history') as ChatMessage[]) ?? []
  const nurture = storeGet('nurture')
  const personality = personalityType(storeGet('personality') ?? { chatter: 0, clingy: 0, study: 0, explore: 0 })

  // 取最近 5 条对话
  const recentChat = history.slice(-10).map((m) => `${m.role === 'user' ? '主人' : '银月'}：${m.content.slice(0, 60)}`).join('\n')

  const today = new Date().toISOString().slice(0, 10)
  const activeMin = Math.round(stats.activeSecondsToday / 60)

  const systemPrompt = [
    '你是桌面宠物"银月"，正在写今天的日记。',
    '用第一人称（银月自称），温暖、简短、带小情绪，2-3句话即可。',
    '可以提到今天和主人的互动、心情、有趣的事。',
    `你的性格是「${personality}」。`,
    '只输出日记正文，不要标题、日期、格式。'
  ].join('\n')

  const userPrompt = [
    `今天数据：活跃 ${activeMin} 分钟，对话 ${stats.chatsToday} 次，摸头 ${stats.patsToday} 次，番茄 ${stats.pomodorosToday} 个。`,
    `养成等级 Lv.${nurture.level}，饱食度 ${nurture.satiety}%。`,
    recentChat ? `\n最近对话：\n${recentChat}` : '今天没有和主人聊天。'
  ].join('\n')

  const result = await chatRaw(systemPrompt, userPrompt, { temperature: 0.8, maxTokens: 200 })
  if (!result.ok) {
    return { ok: false, text: '', error: result.error }
  }

  const text = result.content.trim().slice(0, 300)
  const entry: DiaryEntry = { date: today, text }
  const entries = [...loadDiary(), entry]
  saveDiary(entries)

  // 同时写入记忆目录下的日记.md（明文可读）
  try {
    const dir = getConfig().memory.dir
    if (dir) {
      const mdContent = `## ${today}\n\n${text}\n\n---\n`
      fs.appendFileSync(path.join(dir, '日记.md'), mdContent, 'utf-8')
    }
  } catch { /* 非关键，忽略 */ }

  return { ok: true, text }
}

/** 获取日记列表（最近 N 篇） */
export function listDiary(limit = 90): DiaryEntry[] {
  return loadDiary().slice(-limit).reverse()
}
