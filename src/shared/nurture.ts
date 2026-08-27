/** 养成系统纯逻辑：饱食度 / 经验 / 等级 / 道具（与 affection.ts 同风格） */

/** 饱食度范围 */
export const SATIETY_MIN = 0
export const SATIETY_MAX = 100
/** 饱食度开始衰减的门槛：自上次喂食起的分钟数 */
export const SATIETY_THRESHOLD_MIN = 20
/** 每过 N 分钟扣 1 点饱食度 */
export const SATIETY_BLOCK_MIN = 30
/** 每块衰减扣减量 */
export const SATIETY_DECAY_PER_BLOCK = 5
/** 喂食冷却（毫秒），防止刷道具 */
export const FEED_COOLDOWN_MS = 15_000
/** 饱食度低于此值视为饥饿，触发委屈情绪 */
export const SATIETY_HUNGRY = 30

/** 道具 ID */
export type ItemId = 'fish' | 'snack' | 'cake'

export interface ItemDef {
  id: ItemId
  label: string
  /** 喂食后增加的饱食度 */
  satiety: number
  /** 喂食后增加的经验 */
  exp: number
}

/** 道具表 */
export const ITEMS: Record<ItemId, ItemDef> = {
  fish: { id: 'fish', label: '小鱼干', satiety: 20, exp: 10 },
  snack: { id: 'snack', label: '点心', satiety: 15, exp: 8 },
  cake: { id: 'cake', label: '蛋糕', satiety: 35, exp: 20 }
}

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[]

export function clampSatiety(v: number): number {
  return Math.max(SATIETY_MIN, Math.min(SATIETY_MAX, v))
}

/** 等级升级所需经验（线性：level * 100） */
export function expForLevel(level: number): number {
  return level * 100
}

/**
 * 饱食度衰减：自上次喂食起，每满 SATIETY_BLOCK_MIN 分钟扣 SATIETY_DECAY_PER_BLOCK。
 * appliedBlocks 为已扣过的块数，返回本次应扣总量（增量，非绝对值）。
 */
export function satietyDecayDelta(lastFedAt: number, now: number, appliedBlocks: number, blockMin = SATIETY_BLOCK_MIN): number {
  if (now <= lastFedAt) return 0
  const elapsedMin = (now - lastFedAt) / 60_000
  if (elapsedMin < SATIETY_THRESHOLD_MIN) return 0
  const due = Math.floor(elapsedMin / blockMin)
  return Math.max(0, due - appliedBlocks) * SATIETY_DECAY_PER_BLOCK
}

/** 喂食带来的饱食度与经验增量（道具不存在或库存为 0 返回 null） */
export function feedDelta(itemId: ItemId, items: Record<string, number>): { satiety: number; exp: number } | null {
  const def = ITEMS[itemId]
  if (!def) return null
  if ((items[itemId] ?? 0) <= 0) return null
  return { satiety: def.satiety, exp: def.exp }
}

/**
 * 尝试升级：根据当前 exp 与 level 判定是否升一级。
 * 返回 { leveled, level, exp }——leveled=true 时 level 已 +1（exp 不扣除，累积制）。
 */
export function tryLevelUp(exp: number, level: number): { leveled: boolean; level: number } {
  if (exp >= expForLevel(level)) {
    return { leveled: true, level: level + 1 }
  }
  return { leveled: false, level }
}

/** 等级分档描述（用于展示） */
export function levelTier(level: number): string {
  if (level >= 10) return '心意相通'
  if (level >= 7) return '默契伙伴'
  if (level >= 5) return '熟悉伙伴'
  if (level >= 3) return '渐渐熟络'
  return '初识'
}

/** 互动类型 → 经验增量（取代旧 affection interactionDelta） */
export type InteractionKind = 'chat' | 'pat' | 'reminderAck' | 'asrChat' | 'hug' | 'hand' | 'tickle'

/** 抚摸加经验的冷却（毫秒） */
export const PAT_COOLDOWN_MS = 10_000

/** 互动带来的经验增量 */
export function interactionExp(kind: InteractionKind, now: number, lastPatAt: number): number {
  switch (kind) {
    case 'chat':
      return 2
    case 'asrChat':
      return 3
    case 'pat':
      return now - lastPatAt >= PAT_COOLDOWN_MS ? 1 : 0
    case 'hand':
    case 'tickle':
      // v0.9 握手/挠痒与摸头共用冷却，防止连点刷经验
      return now - lastPatAt >= PAT_COOLDOWN_MS ? 1 : 0
    case 'reminderAck':
      return 2
    case 'hug':
      return 3
  }
}

/** 等级 → 基线情绪（取代 baseEmotionForAffection）：低等级委屈，高等级开心 */
export function baseEmotionForLevel(level: number): 'sad' | 'calm' | 'happy' {
  if (level <= 1) return 'sad'
  if (level >= 7) return 'happy'
  return 'calm'
}

// ---------- v0.7 心情值系统 ----------

/** 心情值范围 */
export const MOOD_MIN = 0
export const MOOD_MAX = 100
/** 心情低于此值后，继续冷落会扣经验（递进惩罚阈值） */
export const MOOD_LOW = 20
/** 冷落判定块长：每 30 分钟一块 */
export const MOOD_BLOCK_MIN = 30

export function clampMood(v: number): number {
  return Math.max(MOOD_MIN, Math.min(MOOD_MAX, v))
}

/** 互动 → 心情增量（喂食/探头被回应也计入） */
export type MoodCause = InteractionKind | 'feed' | 'peekAck'

export function moodDeltaFor(cause: MoodCause): number {
  switch (cause) {
    case 'chat':
      return 2
    case 'asrChat':
      return 2
    case 'pat':
      return 2
    case 'hand':
      return 2
    case 'tickle':
      return 2
    case 'hug':
      return 4
    case 'feed':
      return 3
    case 'reminderAck':
      return 3
    case 'peekAck':
      return 5
  }
}

/**
 * 冷落衰减：距上次互动每满 30 分钟扣 1 心情；
 * 心情已低于 MOOD_LOW 时，每块额外扣 1 经验（递进惩罚）。
 * appliedBlocks 为已扣过的块数，返回本次应扣的增量（非绝对值）与本次结算的块数。
 */
export function moodNeglectDelta(
  lastInteractionAt: number,
  now: number,
  appliedBlocks: number,
  currentMood: number,
  blockMin = MOOD_BLOCK_MIN
): { moodDelta: number; expDelta: number; blocks: number } {
  if (now <= lastInteractionAt) return { moodDelta: 0, expDelta: 0, blocks: 0 }
  const elapsedMin = (now - lastInteractionAt) / 60_000
  const due = Math.floor(elapsedMin / blockMin) - appliedBlocks
  if (due <= 0) return { moodDelta: 0, expDelta: 0, blocks: 0 }
  let mood = currentMood
  let expDelta = 0
  for (let i = 0; i < due; i++) {
    if (mood < MOOD_LOW) expDelta += 1
    mood = Math.max(MOOD_MIN, mood - 1)
  }
  return { moodDelta: currentMood - mood, expDelta, blocks: due }
}

/** 累积制经验下的等级换算（与 tryLevelUp 升级链一致）：level = floor(exp/100)+1，地板 1 */
export function levelForExp(exp: number): number {
  return Math.max(1, Math.floor(Math.max(0, exp) / 100) + 1)
}

/**
 * 经验衰减：扣经验并按累积制重算等级（允许掉级，level 1 为地板，经验最低 0）。
 * 返回新 exp/level 及是否掉级。
 */
export function applyExpDecay(exp: number, level: number, delta: number): { exp: number; level: number; dropped: boolean } {
  const newExp = Math.max(0, exp - Math.max(0, delta))
  const newLevel = levelForExp(newExp)
  return { exp: newExp, level: newLevel, dropped: newLevel < level }
}

/** 互动随机掉落道具（返回掉落的道具 ID 或 null） */
export function rollDrop(now: number, lastDropAt: number, rand: () => number): ItemId | null {
  // 同一互动 5 分钟内不重复掉落
  if (now - lastDropAt < 5 * 60_000) return null
  // 30% 概率掉落
  if (rand() > 0.3) return null
  const idx = Math.floor(rand() * ITEM_IDS.length)
  return ITEM_IDS[idx]
}
