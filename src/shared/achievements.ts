/** 成就徽章系统：定义 + 检查解锁条件（纯逻辑，主进程使用） */
import type { UsageStats, NurtureState } from './types'

export interface Achievement {
  id: string
  emoji: string
  name: string
  description: string
}

export interface UnlockedAchievement {
  id: string
  unlockedAt: number
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first', emoji: '🌱', name: '初识', description: '首次互动' },
  { id: 'chatterbox', emoji: '💬', name: '话唠', description: '累计对话 100 次' },
  { id: 'pomodoro-10', emoji: '🍅', name: '专注达人', description: '累计完成 10 个番茄钟' },
  { id: 'pat-master', emoji: '🤚', name: '摸摸大师', description: '累计摸头 50 次' },
  { id: 'lv3', emoji: '⭐', name: 'Lv.3', description: '养成等级达到 3' },
  { id: 'lv5', emoji: '🌟', name: 'Lv.5', description: '养成等级达到 5' },
  { id: 'lv10', emoji: '👑', name: 'Lv.10', description: '养成等级达到 10' },
  { id: 'streak-7', emoji: '📅', name: '连续 7 天', description: '连续 7 天有互动' },
  { id: 'streak-30', emoji: '📅', name: '连续 30 天', description: '连续 30 天有互动' },
  { id: 'first-feed', emoji: '🎉', name: '首次喂食', description: '第一次喂食道具' },
  { id: 'full-day', emoji: '🎯', name: '全勤日', description: '一天内聊天+摸头+番茄各至少 1' },
  { id: 'diary-writer', emoji: '📝', name: '日记作家', description: '累积 10 篇日记' },
  // v0.7 提醒统计成就（数据源：SQLite pet-stats.db）
  { id: 'water-3', emoji: '💧', name: '按时喝水', description: '单日喝水提醒确认 3 次及以上' },
  { id: 'sedentary-2', emoji: '🪑', name: '久坐克星', description: '单日久坐提醒确认 2 次及以上' },
  { id: 'ack-streak-7', emoji: '🏅', name: '七天养生局', description: '连续 7 天提醒全部确认' }
]

interface CheckInput {
  stats: UsageStats
  nurture: NurtureState
  totalDiaryEntries: number
  totalChatCount: number
  totalPatCount: number
  totalPomodoroCount: number
  hasFedBefore: boolean
  consecutiveDays: number
  /** v0.7 今日喝水提醒确认次数（SQLite） */
  waterAckedToday: number
  /** v0.7 今日久坐提醒确认次数（SQLite） */
  sedentaryAckedToday: number
  /** v0.7 连续“提醒全确认”天数（SQLite） */
  consecutiveFullAckDays: number
}

/** 检查哪些成就可以新解锁，返回新解锁的列表 */
export function checkAchievements(input: CheckInput, alreadyUnlocked: UnlockedAchievement[]): Achievement[] {
  const unlockedIds = new Set(alreadyUnlocked.map((a) => a.id))
  const newlyUnlocked: Achievement[] = []

  const check = (id: string, condition: boolean): void => {
    if (condition && !unlockedIds.has(id)) {
      const ach = ACHIEVEMENTS.find((a) => a.id === id)
      if (ach) newlyUnlocked.push(ach)
    }
  }

  // 累计统计检查
  check('first', input.stats.chatsToday > 0 || input.stats.patsToday > 0 || input.totalChatCount > 0)
  check('chatterbox', input.totalChatCount >= 100)
  check('pomodoro-10', input.totalPomodoroCount >= 10)
  check('pat-master', input.totalPatCount >= 50)
  check('lv3', input.nurture.level >= 3)
  check('lv5', input.nurture.level >= 5)
  check('lv10', input.nurture.level >= 10)
  check('streak-7', input.consecutiveDays >= 7)
  check('streak-30', input.consecutiveDays >= 30)
  check('first-feed', input.hasFedBefore)
  check('full-day', input.stats.chatsToday >= 1 && input.stats.patsToday >= 1 && input.stats.pomodorosToday >= 1)
  check('diary-writer', input.totalDiaryEntries >= 10)
  // v0.7 提醒统计成就
  check('water-3', input.waterAckedToday >= 3)
  check('sedentary-2', input.sedentaryAckedToday >= 2)
  check('ack-streak-7', input.consecutiveFullAckDays >= 7)

  return newlyUnlocked
}
