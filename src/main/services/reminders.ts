/** 健康提醒：久坐（默认45分钟，可配置）与喝水（默认60分钟，可配置） */
import { powerMonitor } from 'electron'
import type { ReminderConfig, ReminderEvent } from '@shared/types'
import { decideReminders, type ReminderRuntimeState } from '@shared/remind-logic'
import { get as storeGet, set as storeSet } from './store'
import { recordReminderDelivered } from './db'

export { decideReminders, IDLE_BREAK_SECONDS, type ReminderRuntimeState } from '@shared/remind-logic'

/** 轮询间隔（毫秒） */
export const POLL_INTERVAL_MS = 30_000

export function startReminders(emit: (ev: ReminderEvent) => void): void {
  const stats = storeGet('stats')
  const state: ReminderRuntimeState = {
    activeMs: 0,
    lastSedentaryRemindAt: stats.lastSedentaryRemindAt || Date.now(),
    lastWaterRemindAt: stats.lastWaterRemindAt || Date.now()
  }

  powerMonitor.on('lock-screen', () => {
    state.activeMs = 0
  })
  powerMonitor.on('resume', () => {
    state.activeMs = 0
    state.lastWaterRemindAt = Date.now()
  })

  const tick = (): void => {
    const cfg: ReminderConfig = storeGet('reminderConfig')
    const now = Date.now()
    let idleSeconds = 0
    try {
      idleSeconds = powerMonitor.getSystemIdleTime()
    } catch {
      idleSeconds = 0
    }
    const decision = decideReminders(now, idleSeconds, cfg, state)

    if (decision.resetActive) {
      state.activeMs = 0
    } else if (decision.active) {
      state.activeMs += POLL_INTERVAL_MS
    }

    if (decision.sedentary) {
      state.lastSedentaryRemindAt = now
      recordReminderDelivered('sedentary')
      emit({ kind: 'sedentary', minutes: cfg.sedentaryMin })
    }
    if (decision.water) {
      state.lastWaterRemindAt = now
      recordReminderDelivered('water')
      emit({ kind: 'water', minutes: cfg.waterMin })
    }

    const s = storeGet('stats')
    const today = new Date().toISOString().slice(0, 10)
    const sameDay = s.lastActiveDate === today
    // 真实使用时长：仅当本窗口内有过键鼠输入才计入（轮询间隔 + 抖动容差），
    // 区别于久坐判定的“人在电脑前”（idle < 5 分钟）
    const usageActive = idleSeconds <= POLL_INTERVAL_MS / 1000 + 10
    storeSet('stats', {
      ...s,
      lastActiveDate: today,
      activeSecondsToday:
        (sameDay ? s.activeSecondsToday : 0) + (usageActive ? POLL_INTERVAL_MS / 1000 : 0),
      chatsToday: sameDay ? s.chatsToday : 0,
      patsToday: sameDay ? s.patsToday : 0,
      pomodorosToday: sameDay ? s.pomodorosToday : 0,
      acksToday: sameDay ? s.acksToday : 0,
      handsToday: sameDay ? s.handsToday : 0,
      ticklesToday: sameDay ? s.ticklesToday : 0,
      lastSedentaryRemindAt: state.lastSedentaryRemindAt,
      lastWaterRemindAt: state.lastWaterRemindAt
    })
  }

  setInterval(tick, POLL_INTERVAL_MS)
}
