/** 番茄钟：专注/休息两阶段，持久化跨重启，完成计入今日统计 */
import type { PomodoroState } from '@shared/types'
import { get as storeGet, set as storeSet } from './store'

const CHECK_MS = 5000

let started = false
let state: PomodoroState = { active: false, phase: 'focus', endsAt: 0, focusMin: 25 }

function load(): void {
  const s = storeGet('pomodoro') as PomodoroState | undefined
  if (s && typeof s === 'object') state = { ...state, ...s }
  // 重启后过期的专注阶段直接视为完成（会由 renderer 提示补休）
}
function save(): void {
  storeSet('pomodoro', state)
}

export function startPomodoro(focusMin = 25): PomodoroState {
  state = { active: true, phase: 'focus', endsAt: Date.now() + focusMin * 60_000, focusMin }
  save()
  return state
}

export function startBreak(breakMin = 5): PomodoroState {
  state = { active: true, phase: 'break', endsAt: Date.now() + breakMin * 60_000, focusMin: state.focusMin }
  save()
  return state
}

export function stopPomodoro(): PomodoroState {
  state = { ...state, active: false }
  save()
  return state
}

export function getPomodoro(): PomodoroState {
  return { ...state }
}

export function bumpPomodoroStat(): void {
  const stats = storeGet('stats')
  storeSet('stats', { ...stats, pomodorosToday: (stats.pomodorosToday ?? 0) + 1 })
}

/**
 * 启动调度。事件：'focusDone'（专注完成，等待用户选择）、'breakDone'（休息结束）
 */
export function startPomodoroScheduler(emit: (ev: { kind: 'focusDone' | 'breakDone'; state: PomodoroState }) => void): void {
  if (started) return
  started = true
  load()
  if (state.active && state.endsAt <= Date.now()) {
    // 重启期间已经结束：专注完成事件延迟一拍发出
    const overdue = state.phase
    state.endsAt = Date.now() + 1000
    save()
    if (overdue === 'focus') emit({ kind: 'focusDone', state })
    else emit({ kind: 'breakDone', state })
    if (overdue === 'focus') bumpPomodoroStat()
    state = { ...state, active: false }
    save()
  }
  setInterval(() => {
    if (!state.active || Date.now() < state.endsAt) return
    if (state.phase === 'focus') {
      bumpPomodoroStat()
      emit({ kind: 'focusDone', state: { ...state } })
      state = { ...state, active: false }
    } else {
      emit({ kind: 'breakDone', state: { ...state } })
      state = { ...state, active: false }
    }
    save()
  }, CHECK_MS)
}
