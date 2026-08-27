import { describe, expect, it } from 'vitest'
import {
  parseAbsoluteTimer,
  parseRelativeTimer,
  parseTimerIntent,
  parseTimerJson,
  parseTodoAction,
  matchTodo,
  parseLocalSkill
} from '../src/shared/skills'

const NOW = new Date('2026-08-16T10:00:00').getTime()

describe('定时提醒意图解析', () => {
  it('相对时间：分钟/小时/天/半 + 中文数字', () => {
    expect(parseRelativeTimer('提醒我30分钟后站起来活动')).toEqual({ ok: true, delayMs: 30 * 60_000, task: '站起来活动' })
    expect(parseRelativeTimer('提醒我2小时后开会')).toEqual({ ok: true, delayMs: 2 * 3_600_000, task: '开会' })
    expect(parseRelativeTimer('提醒我1天后交报告')).toEqual({ ok: true, delayMs: 86_400_000, task: '交报告' })
    expect(parseRelativeTimer('叫我半个钟头后喝水')).toEqual({ ok: true, delayMs: 30 * 60_000, task: '喝水' })
    expect(parseRelativeTimer('提醒我一个半小时后放松一下')).toEqual({ ok: true, delayMs: 1.5 * 3_600_000, task: '放松一下' })
    expect(parseRelativeTimer('十五分钟后提醒我关火')).toEqual({ ok: true, delayMs: 15 * 60_000, task: '关火' })
    expect(parseRelativeTimer('提醒我二十分钟后取快递')).toEqual({ ok: true, delayMs: 20 * 60_000, task: '取快递' })
  })

  it('绝对时间：今天/明天 + 时:分', () => {
    const r = parseAbsoluteTimer('提醒我明天14:30开会', NOW)
    expect(r.ok).toBe(true)
    expect(r.task).toBe('开会')
    const fireAt = r.fireAt!
    expect(new Date(fireAt).getDate()).toBe(17)
    expect(new Date(fireAt).getHours()).toBe(14)
    expect(new Date(fireAt).getMinutes()).toBe(30)
  })

  it('过去时间顺延到明天', () => {
    const r = parseAbsoluteTimer('提醒我8点吃药', NOW) // 现在10点，8点已过
    expect(r.ok).toBe(true)
    expect(new Date(r.fireAt!).getDate()).toBe(17)
  })

  it('非提醒文本不误判', () => {
    expect(parseTimerIntent('今天天气怎么样', NOW).ok).toBe(false)
    expect(parseTimerIntent('帮我写个报告', NOW).ok).toBe(false)
  })

  it('GLM 返回的 JSON 容错解析', () => {
    expect(parseTimerJson('{"delayMinutes": 30, "task": "喝水"}')).toEqual({ delayMinutes: 30, task: '喝水' })
    expect(parseTimerJson('好的，结果：{"delayMinutes": 90, "task": "开会"} 请查收')).toEqual({
      delayMinutes: 90,
      task: '开会'
    })
    expect(parseTimerJson('{"delayMinutes": null, "task": ""}')).toEqual({ delayMinutes: null, task: '' })
    expect(parseTimerJson('完全不是JSON')).toEqual({ delayMinutes: null, task: '' })
  })
})

describe('待办技能解析', () => {
  it('添加/完成/查看', () => {
    expect(parseTodoAction('记一下 明早回邮件')).toEqual({ kind: 'add', text: '明早回邮件' })
    expect(parseTodoAction('完成了 回邮件')?.kind).toBe('done')
    expect(parseTodoAction('待办')?.kind).toBe('list')
    expect(parseTodoAction('随便聊聊')).toBeNull()
  })

  it('模糊匹配待办项', () => {
    const items = [
      { text: '明天回复张总的邮件', done: false },
      { text: '买咖啡豆', done: true },
      { text: '写周报', done: false }
    ]
    expect(matchTodo(items, '回复邮件')?.text).toBe('明天回复张总的邮件')
    expect(matchTodo(items, '周报')?.text).toBe('写周报')
    // 已完成的不参与匹配
    expect(matchTodo(items, '咖啡')).toBeNull()
  })
})

describe('本地技能识别', () => {
  it('报时/笑话/帮助', () => {
    expect(parseLocalSkill('现在几点了')).toBe('time')
    expect(parseLocalSkill('讲个笑话')).toBe('joke')
    expect(parseLocalSkill('你能做什么')).toBe('help')
    expect(parseLocalSkill('推荐个电影')).toBeNull()
  })
})
