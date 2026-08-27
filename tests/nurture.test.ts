import { describe, it, expect } from 'vitest'
import {
  clampSatiety,
  expForLevel,
  satietyDecayDelta,
  feedDelta,
  tryLevelUp,
  levelTier,
  rollDrop,
  SATIETY_HUNGRY,
  clampMood,
  moodDeltaFor,
  moodNeglectDelta,
  applyExpDecay,
  levelForExp
} from '@shared/nurture'

describe('nurture: clampSatiety', () => {
  it('限制在 0-100', () => {
    expect(clampSatiety(-5)).toBe(0)
    expect(clampSatiety(150)).toBe(100)
    expect(clampSatiety(50)).toBe(50)
  })
})

describe('nurture: expForLevel', () => {
  it('等级越高所需经验越多', () => {
    expect(expForLevel(1)).toBe(100)
    expect(expForLevel(2)).toBe(200)
    expect(expForLevel(5)).toBe(500)
  })
})

describe('nurture: tryLevelUp', () => {
  it('经验不足不升级', () => {
    const r = tryLevelUp(50, 1)
    expect(r.leveled).toBe(false)
    expect(r.level).toBe(1)
  })
  it('经验达标升级', () => {
    const r = tryLevelUp(100, 1)
    expect(r.leveled).toBe(true)
    expect(r.level).toBe(2)
  })
  it('经验远超仍只升一级（逐次升级）', () => {
    const r = tryLevelUp(250, 1)
    expect(r.leveled).toBe(true)
    expect(r.level).toBe(2)
  })
})

describe('nurture: feedDelta', () => {
  it('有库存时返回增量', () => {
    const r = feedDelta('fish', { fish: 3 })
    expect(r).not.toBeNull()
    expect(r!.satiety).toBe(20)
    expect(r!.exp).toBe(10)
  })
  it('库存为 0 返回 null', () => {
    expect(feedDelta('fish', { fish: 0 })).toBeNull()
  })
  it('无库存记录返回 null', () => {
    expect(feedDelta('cake', { fish: 3 })).toBeNull()
  })
})

describe('nurture: satietyDecayDelta', () => {
  const now = 1_000_000
  it('未达门槛不衰减', () => {
    expect(satietyDecayDelta(now - 10 * 60_000, now, 0)).toBe(0)
  })
  it('达到门槛衰减', () => {
    // 60 分钟前喂食，门槛 20 分钟，每 30 分钟一块 → due=2，扣 2*5=10
    expect(satietyDecayDelta(now - 60 * 60_000, now, 0)).toBe(10)
  })
  it('已扣块数不重复扣', () => {
    // 60 分钟 → due=2，已扣 1 → 本次扣 (2-1)*5=5
    expect(satietyDecayDelta(now - 60 * 60_000, now, 1)).toBe(5)
  })
  it('时间倒流返回 0', () => {
    expect(satietyDecayDelta(now + 1000, now, 0)).toBe(0)
  })
})

describe('nurture: levelTier', () => {
  it('各档描述', () => {
    expect(levelTier(1)).toBe('初识')
    expect(levelTier(3)).toBe('渐渐熟络')
    expect(levelTier(5)).toBe('熟悉伙伴')
    expect(levelTier(7)).toBe('默契伙伴')
    expect(levelTier(10)).toBe('心意相通')
  })
})

describe('nurture: rollDrop', () => {
  it('限频期内不掉落', () => {
    const now = 1_000_000
    expect(rollDrop(now, now - 60_000, Math.random)).toBeNull()
  })
  it('高概率 rand>0.3 不掉落', () => {
    const now = 1_000_000
    expect(rollDrop(now, 0, () => 0.5)).toBeNull()
  })
  it('低概率掉落有效道具', () => {
    const now = 1_000_000
    const r = rollDrop(now, 0, () => 0.1)
    expect(r).not.toBeNull()
    expect(['fish', 'snack', 'cake']).toContain(r)
  })
})

describe('nurture: SATIETY_HUNGRY', () => {
  it('饥饿阈值为 30', () => {
    expect(SATIETY_HUNGRY).toBe(30)
  })
})

describe('v0.7 心情值系统', () => {
  it('clampMood 限制在 0-100', () => {
    expect(clampMood(-5)).toBe(0)
    expect(clampMood(150)).toBe(100)
    expect(clampMood(70)).toBe(70)
  })

  it('moodDeltaFor 按计划规则给增量', () => {
    expect(moodDeltaFor('chat')).toBe(2)
    expect(moodDeltaFor('asrChat')).toBe(2)
    expect(moodDeltaFor('pat')).toBe(2)
    expect(moodDeltaFor('hug')).toBe(4)
    expect(moodDeltaFor('feed')).toBe(3)
    expect(moodDeltaFor('reminderAck')).toBe(3)
    expect(moodDeltaFor('peekAck')).toBe(5)
  })

  it('冷落每 30 分钟扣 1 心情；心情<20 后继续冷落扣经验', () => {
    const now = 10_000_000
    // 冷落 60 分钟 → 2 块：心情 -2，心情尚高不扣经验
    let r = moodNeglectDelta(now - 60 * 60_000, now, 0, 70)
    expect(r.moodDelta).toBe(2)
    expect(r.expDelta).toBe(0)
    // 已扣 1 块 → 只补扣 1 块
    r = moodNeglectDelta(now - 60 * 60_000, now, 1, 70)
    expect(r.moodDelta).toBe(1)
    // 心情 15（<20）冷落 60 分钟 → 2 块：心情 -2 且经验 -2
    r = moodNeglectDelta(now - 60 * 60_000, now, 0, 15)
    expect(r.moodDelta).toBe(2)
    expect(r.expDelta).toBe(2)
    // 未满 30 分钟不扣
    r = moodNeglectDelta(now - 29 * 60_000, now, 0, 70)
    expect(r.moodDelta).toBe(0)
    // 时间倒流安全
    r = moodNeglectDelta(now + 1000, now, 0, 70)
    expect(r.moodDelta).toBe(0)
  })

  it('心情衰减到 0 为地板，不再继续扣经验时经验仍按块扣', () => {
    const now = 10_000_000
    // 心情 0，冷落 90 分钟 → 3 块：心情仍 0（地板），经验 -3
    const r = moodNeglectDelta(now - 90 * 60_000, now, 0, 0)
    expect(r.moodDelta).toBe(0)
    expect(r.expDelta).toBe(3)
  })

  it('levelForExp 与累积升级链一致', () => {
    expect(levelForExp(0)).toBe(1)
    expect(levelForExp(99)).toBe(1)
    expect(levelForExp(100)).toBe(2)
    expect(levelForExp(199)).toBe(2)
    expect(levelForExp(200)).toBe(3)
    expect(levelForExp(250)).toBe(3)
    // 与 tryLevelUp 升级链对照
    let level = 1
    for (;;) {
      const t = tryLevelUp(250, level)
      if (!t.leveled) break
      level = t.level
    }
    expect(level).toBe(levelForExp(250))
  })

  it('applyExpDecay 允许掉级，level 1 为地板、经验最低 0', () => {
    // level 3（exp 250）扣 60 → exp 190 → 掉到 level 2
    let r = applyExpDecay(250, 3, 60)
    expect(r.exp).toBe(190)
    expect(r.level).toBe(2)
    expect(r.dropped).toBe(true)
    // level 1 扣到底 → exp 0，等级仍 1
    r = applyExpDecay(50, 1, 100)
    expect(r.exp).toBe(0)
    expect(r.level).toBe(1)
    expect(r.dropped).toBe(false)
    // 恰好在本级起点不掉级：level 2 起点 100，扣 0
    r = applyExpDecay(100, 2, 0)
    expect(r.level).toBe(2)
    expect(r.dropped).toBe(false)
  })
})
