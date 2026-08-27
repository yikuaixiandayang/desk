/** 健康提醒决策（纯逻辑，主进程与测试共用） */
import type { ReminderConfig } from './types'

/** 用户被视为"离开/休息"的系统空闲阈值（秒） */
export const IDLE_BREAK_SECONDS = 300

export interface ReminderRuntimeState {
  /** 本轮连续活跃累计毫秒 */
  activeMs: number
  lastSedentaryRemindAt: number
  lastWaterRemindAt: number
}

export interface ReminderDecision {
  sedentary: boolean
  water: boolean
  /** 用户已休息，重置久坐累计 */
  resetActive: boolean
  /** 本轮是否计入活跃 */
  active: boolean
}

/** 纯决策函数 */
export function decideReminders(
  now: number,
  idleSeconds: number,
  cfg: ReminderConfig,
  state: ReminderRuntimeState
): ReminderDecision {
  const active = idleSeconds < IDLE_BREAK_SECONDS
  if (!active) {
    return { sedentary: false, water: false, resetActive: state.activeMs > 0, active: false }
  }
  if (!cfg.enabled) {
    return { sedentary: false, water: false, resetActive: false, active }
  }
  const sedentaryDue =
    state.activeMs >= cfg.sedentaryMin * 60_000 &&
    now - state.lastSedentaryRemindAt >= cfg.sedentaryMin * 60_000
  const waterDue = now - state.lastWaterRemindAt >= cfg.waterMin * 60_000
  return { sedentary: sedentaryDue, water: waterDue, resetActive: false, active }
}
