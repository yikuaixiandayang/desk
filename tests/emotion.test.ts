import { describe, expect, it } from 'vitest'
import {
  baseEmotionForLevel,
  behaviorOf,
  EMOTION_BEHAVIOR,
  resolveEmotion,
  setEmotion
} from '../src/renderer/src/core/emotion'

describe('情绪系统', () => {
  it('等级基线：<=1 委屈，>=7 开心，其余平静', () => {
    expect(baseEmotionForLevel(1)).toBe('sad')
    expect(baseEmotionForLevel(4)).toBe('calm')
    expect(baseEmotionForLevel(8)).toBe('happy')
  })

  it('临时情绪到期后回落到基线', () => {
    const now = 1_000_000
    const angry = setEmotion({ current: 'calm', until: null }, 'angry', now)
    expect(angry.current).toBe('angry')
    expect(angry.until).toBe(now + 90_000)

    // 未到期保持生气
    expect(resolveEmotion(angry, 4, now + 10_000).current).toBe('angry')
    // 到期回基线（等级4 → calm）
    expect(resolveEmotion(angry, 4, now + 91_000).current).toBe('calm')
    // 到期回基线（等级1 → sad）
    expect(resolveEmotion(angry, 1, now + 91_000).current).toBe('sad')
  })

  it('setEmotion(calm) 清除临时状态', () => {
    const s = setEmotion({ current: 'happy', until: 999 }, 'calm', 1)
    expect(s).toEqual({ current: 'calm', until: null })
  })
})

describe('九种情绪的行为差异', () => {
  const kinds = ['calm', 'happy', 'angry', 'coax', 'sad', 'surprised', 'sleepy', 'excited', 'bored'] as const

  it('九种情绪都有行为档案', () => {
    for (const k of kinds) {
      expect(EMOTION_BEHAVIOR[k]).toBeDefined()
      expect(EMOTION_BEHAVIOR[k].frame).toBeGreaterThanOrEqual(0)
      expect(EMOTION_BEHAVIOR[k].frame).toBeLessThanOrEqual(7)
    }
  })

  it('生气拒绝走动、委屈会趴下、兴奋弹跳最大', () => {
    expect(behaviorOf('angry').refuseMove).toBe(true)
    expect(behaviorOf('sad').droop).toBeGreaterThan(0)
    expect(behaviorOf('excited').bounceMul).toBeGreaterThan(behaviorOf('calm').bounceMul)
    expect(behaviorOf('angry').bounceMul).toBeLessThan(behaviorOf('calm').bounceMul)
  })

  it('情绪影响语速音调：兴奋快、困倦慢', () => {
    expect(behaviorOf('excited').ttsRateMul).toBeGreaterThan(1)
    expect(behaviorOf('sleepy').ttsRateMul).toBeLessThan(1)
  })

  it('氛围粒子映射：生气怒气、困倦Zzz、委屈泪滴、开心星光', () => {
    expect(behaviorOf('angry').ambient).toBe('anger')
    expect(behaviorOf('sleepy').ambient).toBe('zzz')
    expect(behaviorOf('sad').ambient).toBe('tear')
    expect(behaviorOf('happy').ambient).toBe('sparkle')
    expect(behaviorOf('calm').ambient).toBeNull()
  })

  it('每种情绪都有主动搭话台词', () => {
    for (const k of kinds) {
      expect(EMOTION_BEHAVIOR[k].chatter.length).toBeGreaterThan(0)
    }
  })
})
