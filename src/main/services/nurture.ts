/** 养成系统主进程服务：喂食 / 经验 / 升级 / 饱食度衰减 / 道具掉落 / 心情值 */
import type { NurtureEvent, NurtureState } from '@shared/types'
import {
  applyExpDecay,
  clampMood,
  clampSatiety,
  feedDelta,
  ITEM_IDS,
  moodDeltaFor,
  moodNeglectDelta,
  SATIETY_MAX,
  satietyDecayDelta,
  tryLevelUp,
  type ItemId,
  type MoodCause
} from '@shared/nurture'
import { DEFAULT_STATE } from '@shared/types'
import { get as storeGet, set as storeSet } from './store'
import { getConfig } from './appconfig'

const DECAY_CHECK_MS = 60_000

/** 饥饿惩罚：饱食度归零后，每 5 分钟扣心情并发一次饥饿事件 */
const STARVE_MOOD_INTERVAL_MS = 5 * 60_000
const STARVE_MOOD_DELTA = -2

let started = false
let emit: ((ev: NurtureEvent) => void) | null = null

function loadNurture(): NurtureState {
  const s = storeGet('nurture')
  if (s && typeof s === 'object') return { ...DEFAULT_STATE.nurture, ...s }
  return { ...DEFAULT_STATE.nurture }
}

function saveNurture(n: NurtureState): void {
  storeSet('nurture', n)
}

/** 查询当前养成状态 */
export function getNurture(): NurtureState {
  return loadNurture()
}

/** 喂食：扣道具 → 加饱食度+经验 → 判升级。
 *  v0.7：饱食度已满（≥100）时拒绝进食——道具不消耗、经验不加，reason='full'。
 *  库存为 0 同样拒绝，reason='empty'。
 */
export function feed(itemId: ItemId): { ok: boolean; state: NurtureState; event?: NurtureEvent; reason?: 'full' | 'empty' } {
  const n = loadNurture()
  if (n.satiety >= SATIETY_MAX) return { ok: false, state: n, reason: 'full' }
  const delta = feedDelta(itemId, n.items)
  if (!delta) return { ok: false, state: n, reason: 'empty' }
  n.items = { ...n.items, [itemId]: (n.items[itemId] ?? 0) - 1 }
  n.satiety = clampSatiety(n.satiety + delta.satiety)
  n.exp += delta.exp
  n.lastFedAt = Date.now()
  n.satietyDecayApplied = 0
  // 升级判定（可能连升多级）
  let leveled = false
  let levelUpEvent: NurtureEvent | undefined
  for (;;) {
    const r = tryLevelUp(n.exp, n.level)
    if (!r.leveled) break
    n.level = r.level
    leveled = true
  }
  if (leveled) {
    levelUpEvent = { kind: 'levelUp', value: n.level }
  }
  saveNurture(n)
  return { ok: true, state: n, event: levelUpEvent }
}

/** 互动掉落道具（聊天/摸头/番茄完成时调用） */
export function dropItem(): { dropped: ItemId | null; state: NurtureState } {
  const n = loadNurture()
  const now = Date.now()
  // 限频 5 分钟内不重复掉落
  if (now - n.lastDropAt < 5 * 60_000) return { dropped: null, state: n }
  const dropRate = getConfig().nurture.dropRate
  if (Math.random() > dropRate) return { dropped: null, state: n }
  const id = ITEM_IDS[Math.floor(Math.random() * ITEM_IDS.length)]
  n.items = { ...n.items, [id]: (n.items[id] ?? 0) + 1 }
  n.lastDropAt = now
  saveNurture(n)
  return { dropped: id, state: n }
}

/** 手动加经验（备用接口） */
export function addExp(amount: number): NurtureState {
  const n = loadNurture()
  n.exp += Math.max(0, amount)
  for (;;) {
    const r = tryLevelUp(n.exp, n.level)
    if (!r.leveled) break
    n.level = r.level
    if (emit) emit({ kind: 'levelUp', value: n.level })
  }
  saveNurture(n)
  return n
}

/** 饱食度衰减一次（按时间） */
export function tickDecay(): { state: NurtureState; hungry: boolean } {
  const n = loadNurture()
  const now = Date.now()
  const wasHungry = n.satiety < 30
  const blockMin = getConfig().nurture.satietyDecayMin
  const due = satietyDecayDelta(n.lastFedAt, now, n.satietyDecayApplied, blockMin)
  if (due > 0) {
    n.satiety = clampSatiety(n.satiety - due)
    n.satietyDecayApplied += Math.floor(due / 5) // 每 5 点算一块
    saveNurture(n)
  }
  const hungry = !wasHungry && n.satiety < 30
  return { state: n, hungry }
}

/** v0.7 心情值调整（互动加 / 探头回应 / 提醒超时等减），返回新状态 */
export function addMood(delta: number): NurtureState {
  const n = loadNurture()
  const next = clampMood(n.mood + delta)
  if (next === n.mood) return n
  n.mood = next
  saveNurture(n)
  return n
}

/** v0.7 按原因调整心情（聊天/摸头/拥抱/喂食/确认提醒/探头回应） */
export function addMoodFor(cause: MoodCause): NurtureState {
  return addMood(moodDeltaFor(cause))
}

/** 跟踪上次冷落结算时的互动时间戳：lastInteractionAt 前进（新互动）时重置块数 */
let lastNeglectBase = -1

/** 上次饥饿扣心情的时间戳（饱食度回到 >0 时重置） */
let lastStarvePenaltyAt = 0

/**
 * v0.7 冷落衰减一次：
 *  - 距上次互动每满 30 分钟 → 心情 -1
 *  - 心情 < 20 后继续冷落 → 经验 -1（每块），并按累积制重算等级（允许掉级，level 1 地板）
 * 互动后由渲染层更新 stats.lastInteractionAt，此处只读。
 */
export function tickMood(): { state: NurtureState; levelDown: number | null } {
  const n = loadNurture()
  const now = Date.now()
  const lastInteractionAt = storeGet('stats').lastInteractionAt || 0
  // 新互动发生（基准前进）→ 重置已结算块数
  if (lastInteractionAt !== lastNeglectBase) {
    lastNeglectBase = lastInteractionAt
    if (n.moodDecayApplied !== 0) {
      n.moodDecayApplied = 0
      saveNurture(n)
    }
  }
  // 冷落计时基准：无记录时退化为当前时间（不产生块）
  const base = lastInteractionAt > 0 ? lastInteractionAt : now
  const r = moodNeglectDelta(base, now, n.moodDecayApplied, n.mood)
  if (r.blocks > 0) {
    n.mood = clampMood(n.mood - r.moodDelta)
    n.moodDecayApplied += r.blocks
    let levelDown: number | null = null
    if (r.expDelta > 0) {
      const d = applyExpDecay(n.exp, n.level, r.expDelta)
      n.exp = d.exp
      n.level = d.level
      if (d.dropped) {
        levelDown = n.level
        if (emit) emit({ kind: 'levelDown', value: n.level })
      }
    }
    saveNurture(n)
    return { state: n, levelDown }
  }
  return { state: n, levelDown: null }
}

/** 启动饱食度衰减 + 冷落心情衰减定时器 */
export function startNurtureScheduler(emitFn: (ev: NurtureEvent) => void): void {
  if (started) return
  started = true
  emit = emitFn
  setInterval(() => {
    const { state, hungry } = tickDecay()
    if (hungry && emit) emit({ kind: 'hungry' })
    // 饥饿惩罚：饱食度归零后每 5 分钟扣心情（喂食恢复后重置）
    if (state.satiety <= 0) {
      const now = Date.now()
      if (now - lastStarvePenaltyAt >= STARVE_MOOD_INTERVAL_MS) {
        lastStarvePenaltyAt = now
        addMood(STARVE_MOOD_DELTA)
        if (emit) emit({ kind: 'hungry' })
      }
    } else {
      lastStarvePenaltyAt = 0
    }
    tickMood()
  }, DECAY_CHECK_MS)
}
