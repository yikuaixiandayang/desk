import { describe, expect, it } from 'vitest'
import { decideReminders, type ReminderRuntimeState } from '../src/shared/remind-logic'
import { buildSystemPrompt, sanitizeReply } from '../src/shared/prompts'

const cfg = { enabled: true, sedentaryMin: 45, waterMin: 60 }

function mkState(over: Partial<ReminderRuntimeState> = {}): ReminderRuntimeState {
  return { activeMs: 0, lastSedentaryRemindAt: 0, lastWaterRemindAt: 0, ...over }
}

describe('健康提醒决策', () => {
  it('连续活跃达到阈值触发久坐与喝水', () => {
    const now = 10_000_000
    const st = mkState({ activeMs: 46 * 60_000 })
    const d = decideReminders(now, 10, cfg, st)
    expect(d.sedentary).toBe(true)
    expect(d.water).toBe(true)
    expect(d.active).toBe(true)
  })

  it('活跃不足不触发', () => {
    const now = 10_000_000
    const st = mkState({ activeMs: 30 * 60_000 })
    expect(decideReminders(now, 10, cfg, st).sedentary).toBe(false)
  })

  it('用户休息（空闲>=5分钟）重置久坐累计且不触发', () => {
    const now = 10_000_000
    const st = mkState({ activeMs: 46 * 60_000 })
    const d = decideReminders(now, 400, cfg, st)
    expect(d.active).toBe(false)
    expect(d.resetActive).toBe(true)
    expect(d.sedentary).toBe(false)
  })

  it('提醒后不重复轰炸（时间窗口内不再次触发）', () => {
    const now = 10_000_000
    const st = mkState({ activeMs: 46 * 60_000, lastSedentaryRemindAt: now - 10 * 60_000 })
    expect(decideReminders(now, 10, cfg, st).sedentary).toBe(false)
    const st2 = mkState({ activeMs: 46 * 60_000, lastSedentaryRemindAt: now - 46 * 60_000 })
    expect(decideReminders(now, 10, cfg, st2).sedentary).toBe(true)
  })

  it('总开关关闭时不触发', () => {
    const now = 10_000_000
    const st = mkState({ activeMs: 46 * 60_000 })
    const d = decideReminders(now, 10, { ...cfg, enabled: false }, st)
    expect(d.sedentary).toBe(false)
    expect(d.water).toBe(false)
  })
})

describe('GLM 提示词与回复清洗', () => {
  it('系统提示注入情绪与养成等级上下文', () => {
    const p = buildSystemPrompt({ level: 7, emotion: 'happy' })
    expect(p).toContain('银月')
    expect(p).toContain('Lv.7')
    expect(p).toContain('轻快愉悦')
    expect(p).toContain('秘书')
  })

  it('四种情绪有不同语气', () => {
    const tones = (['calm', 'happy', 'angry', 'coax'] as const).map((e) =>
      buildSystemPrompt({ level: 4, emotion: e })
    )
    expect(new Set(tones).size).toBe(4)
  })

  it('清洗思考段与 Markdown 记号', () => {
    const raw = '<think>reasoning...</think>**你好**，`主人`。\n\n# 标题'
    expect(sanitizeReply(raw)).toBe('你好，主人。\n标题')
  })
})
