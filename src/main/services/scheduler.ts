/** 用户定时提醒调度器："提醒我30分钟后…" → 到点由宠物播报；重启后错过的提醒补发 */
import { randomUUID } from 'node:crypto'
import type { ScheduleTimer } from '@shared/types'
import { get as storeGet, set as storeSet } from './store'

const CHECK_INTERVAL_MS = 10_000
let started = false

export function listTimers(): ScheduleTimer[] {
  return storeGet('timers') ?? []
}

function saveTimers(timers: ScheduleTimer[]): void {
  storeSet('timers', timers)
}

export function addTimer(text: string, fireAt: number): ScheduleTimer {
  const timer: ScheduleTimer = {
    id: randomUUID(),
    text,
    fireAt,
    createdAt: Date.now(),
    done: false
  }
  saveTimers([...listTimers().filter((t) => !t.done), timer])
  return timer
}

export function removeTimer(id: string): void {
  saveTimers(listTimers().filter((t) => t.id !== id))
}

/**
 * 启动调度。fire 回调在到点时触发（含重启后补发的过期提醒）。
 */
export function startScheduler(fire: (timer: ScheduleTimer) => void): void {
  if (started) return
  started = true
  const tick = (): void => {
    const now = Date.now()
    const timers = listTimers()
    let changed = false
    for (const t of timers) {
      if (!t.done && t.fireAt <= now) {
        t.done = true
        changed = true
        fire(t)
      }
    }
    if (changed) saveTimers(timers)
    // 清理 7 天前的已完成提醒
    const weekAgo = now - 7 * 86_400_000
    const kept = listTimers().filter((t) => !(t.done && t.createdAt < weekAgo))
    if (kept.length !== listTimers().length) saveTimers(kept)
  }
  setInterval(tick, CHECK_INTERVAL_MS)
  // 启动即检查一次（补发重启期间到期的提醒）
  setTimeout(tick, 3000)
}
