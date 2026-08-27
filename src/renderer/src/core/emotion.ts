/** 情绪系统（纯逻辑）：9 种情绪、事件驱动临时情绪、好感度基线、行为差异档案 */
import type { EmotionKind, EmotionState } from '@shared/types'

/** 临时情绪持续时长（毫秒） */
export const EMOTION_DURATION_MS: Record<EmotionKind, number> = {
  calm: 0,
  happy: 60_000,
  angry: 90_000,
  coax: 45_000,
  sad: 120_000,
  surprised: 8_000,
  sleepy: 300_000,
  excited: 45_000,
  bored: 180_000,
  curious: 90_000,
  mischievous: 60_000,
  lovestruck: 120_000
}

/** 养成等级基线情绪（无临时事件时）：低等级委屈，高等级开心 */
export function baseEmotionForLevel(level: number): EmotionKind {
  if (level <= 1) return 'sad' // 委屈低落，渴望关注
  if (level >= 7) return 'happy'
  return 'calm'
}

/** 触发临时情绪（忽略旧状态） */
export function setEmotion(_state: EmotionState, kind: EmotionKind, now: number): EmotionState {
  if (kind === 'calm') return { current: 'calm', until: null }
  return { current: kind, until: now + EMOTION_DURATION_MS[kind] }
}

/** 解析当前生效情绪：临时情绪到期后回到等级基线 */
export function resolveEmotion(state: EmotionState, level: number, now: number): EmotionState {
  if (state.until !== null && now >= state.until) {
    return { current: baseEmotionForLevel(level), until: null }
  }
  return state
}

export function emotionOf(state: EmotionState, level: number, now: number): EmotionKind {
  return resolveEmotion(state, level, now).current
}

// ---------- 情绪 → 行为差异档案 ----------

export type AmbientParticle = 'heart' | 'anger' | 'sparkle' | 'zzz' | 'tear' | null

export interface EmotionBehavior {
  label: string
  /** 精灵帧：0平静 1微笑 2惊讶 3撒娇 4生气 5开心 6委屈 7平静变体 */
  frame: number
  /** 平静时偶尔切换的变体帧（-1 表示无） */
  altFrame: number
  /** 自主移动速度倍率 */
  moveSpeedMul: number
  /** 自主移动间隔倍率（越小越爱走动） */
  moveIntervalMul: number
  /** 弹跳/呼吸幅度倍率 */
  bounceMul: number
  /** 蹲在原地拒绝走动（生气） */
  refuseMove: boolean
  /** 身体下压比例（委屈趴下） */
  droop: number
  /** TTS 语速/音调倍率 */
  ttsRateMul: number
  ttsPitchMul: number
  /** 常驻氛围粒子 */
  ambient: AmbientParticle
  /** 空闲自言自语/主动搭话台词 */
  chatter: readonly string[]
}

export const EMOTION_BEHAVIOR: Record<EmotionKind, EmotionBehavior> = {
  calm: {
    label: '平静',
    frame: 0,
    altFrame: 7,
    moveSpeedMul: 1,
    moveIntervalMul: 1,
    bounceMul: 1,
    refuseMove: false,
    droop: 0,
    ttsRateMul: 1,
    ttsPitchMul: 1,
    ambient: null,
    chatter: [
      '主人在忙吗？银月就在这儿陪着。',
      '需要银月的时候随时叫我哦。',
      '桌面风景不错呢，主人辛苦啦。'
    ]
  },
  happy: {
    label: '开心',
    frame: 5,
    altFrame: 1,
    moveSpeedMul: 1.2,
    moveIntervalMul: 0.7,
    bounceMul: 1.4,
    refuseMove: false,
    droop: 0,
    ttsRateMul: 1.08,
    ttsPitchMul: 1.05,
    ambient: 'sparkle',
    chatter: ['今天心情真好呀～主人要不要休息一下？', '嘿嘿，银月蹦蹦跳跳的，主人看到了吗？', '开心的时候工作都变顺利了呢！']
  },
  angry: {
    label: '生气',
    frame: 4,
    altFrame: -1,
    moveSpeedMul: 0.3,
    moveIntervalMul: 3,
    bounceMul: 0.3,
    refuseMove: true,
    droop: 0.02,
    ttsRateMul: 0.95,
    ttsPitchMul: 0.96,
    ambient: 'anger',
    chatter: ['哼，银月不想说话。', '……主人知道错了吗？', '生气的时候才不要走动呢。']
  },
  coax: {
    label: '撒娇',
    frame: 3,
    altFrame: 1,
    moveSpeedMul: 1.05,
    moveIntervalMul: 0.85,
    bounceMul: 1.15,
    refuseMove: false,
    droop: 0,
    ttsRateMul: 1,
    ttsPitchMul: 1.15,
    ambient: 'heart',
    chatter: ['主人～摸摸银月的头好不好嘛～', '陪银月说说话嘛，就一会儿。', '主人主人，看看我呀～']
  },
  sad: {
    label: '委屈',
    frame: 6,
    altFrame: -1,
    moveSpeedMul: 0.5,
    moveIntervalMul: 2.2,
    bounceMul: 0.4,
    refuseMove: false,
    droop: 0.06,
    ttsRateMul: 0.9,
    ttsPitchMul: 0.94,
    ambient: 'tear',
    chatter: ['……银月是不是被嫌弃了。', '主人最近都不理人家……', '有点想被摸摸头。']
  },
  surprised: {
    label: '惊讶',
    frame: 2,
    altFrame: -1,
    moveSpeedMul: 1.3,
    moveIntervalMul: 1,
    bounceMul: 1.8,
    refuseMove: false,
    droop: 0,
    ttsRateMul: 1.1,
    ttsPitchMul: 1.12,
    ambient: 'sparkle',
    chatter: ['诶？！', '哇，吓银月一跳……']
  },
  sleepy: {
    label: '困倦',
    frame: 7,
    altFrame: 0,
    moveSpeedMul: 0.4,
    moveIntervalMul: 3,
    bounceMul: 0.5,
    refuseMove: false,
    droop: 0.03,
    ttsRateMul: 0.85,
    ttsPitchMul: 0.92,
    ambient: 'zzz',
    chatter: ['呼啊……主人，早点休息吧……', '银月有点困了……主人也困吗？', '夜深了呢，主人注意身体……']
  },
  excited: {
    label: '兴奋',
    frame: 5,
    altFrame: 2,
    moveSpeedMul: 1.5,
    moveIntervalMul: 0.5,
    bounceMul: 2,
    refuseMove: false,
    droop: 0,
    ttsRateMul: 1.18,
    ttsPitchMul: 1.1,
    ambient: 'heart',
    chatter: ['主人主人！今天做什么都会顺利的！', '银月超有精神的！有什么任务尽管来！', '冲鸭主人！银月给你打气！']
  },
  bored: {
    label: '无聊',
    frame: 7,
    altFrame: 0,
    moveSpeedMul: 0.8,
    moveIntervalMul: 1.5,
    bounceMul: 0.8,
    refuseMove: false,
    droop: 0.01,
    ttsRateMul: 0.95,
    ttsPitchMul: 1,
    ambient: null,
    chatter: ['好无聊呀……主人陪银月聊聊天嘛。', '银月在原地转圈圈……主人看到没？', '要不要让银月讲个笑话？跟我说"讲个笑话"就行。']
  },
  curious: {
    label: '好奇',
    frame: 2,
    altFrame: 7,
    moveSpeedMul: 1.2,
    moveIntervalMul: 0.8,
    bounceMul: 1.3,
    refuseMove: false,
    droop: 0,
    ttsRateMul: 1.05,
    ttsPitchMul: 1.08,
    ambient: 'sparkle',
    chatter: ['诶？主人在做什么呢？银月也想看看。', '这个东西是什么呀？能给银月讲讲吗？', '主人的工作看起来好有意思，银月也想了解。']
  },
  mischievous: {
    label: '调皮',
    frame: 1,
    altFrame: 3,
    moveSpeedMul: 1.4,
    moveIntervalMul: 0.6,
    bounceMul: 1.6,
    refuseMove: false,
    droop: 0,
    ttsRateMul: 1.12,
    ttsPitchMul: 1.18,
    ambient: 'sparkle',
    chatter: ['嘿嘿，主人被银月吓到了吧？', '银月偷偷躲起来了，主人找得到吗？', '跟银月玩嘛，保证主人会开心的！']
  },
  lovestruck: {
    label: '眷恋',
    frame: 3,
    altFrame: 1,
    moveSpeedMul: 0.6,
    moveIntervalMul: 2,
    bounceMul: 0.7,
    refuseMove: false,
    droop: 0.04,
    ttsRateMul: 0.9,
    ttsPitchMul: 0.95,
    ambient: 'heart',
    chatter: ['主人……银月最喜欢主人了。', '就想一直陪着主人，哪里也不想去。', '主人能不能多摸摸银月的头？这样好幸福。']
  }
}

export function behaviorOf(kind: EmotionKind): EmotionBehavior {
  return EMOTION_BEHAVIOR[kind]
}
