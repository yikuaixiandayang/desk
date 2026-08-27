import { describe, expect, it } from 'vitest'
import { parsePomodoro, parseNoise, parseWeatherIntent, isReportIntent } from '../src/shared/skills'
import { wmoDesc, weatherReplyText } from '../src/shared/wmo'

describe('番茄钟指令解析', () => {
  it('开始（默认/自定义分钟）', () => {
    expect(parsePomodoro('开个番茄钟')).toEqual({ action: 'start', minutes: 25 })
    expect(parsePomodoro('开个25分钟番茄钟')).toEqual({ action: 'start', minutes: 25 })
    expect(parsePomodoro('来个50分钟番茄钟')).toEqual({ action: 'start', minutes: 50 })
    expect(parsePomodoro('启动番茄钟')).toEqual({ action: 'start', minutes: 25 })
  })

  it('停止与状态', () => {
    expect(parsePomodoro('停止番茄钟')).toEqual({ action: 'stop' })
    expect(parsePomodoro('取消番茄钟')).toEqual({ action: 'stop' })
    expect(parsePomodoro('番茄钟状态')).toEqual({ action: 'status' })
  })

  it('无关文本不误判', () => {
    expect(parsePomodoro('今天吃番茄鸡蛋面')).toBeNull()
    expect(parsePomodoro('讲个笑话')).toBeNull()
  })
})

describe('环境音指令解析', () => {
  it('各类音色', () => {
    expect(parseNoise('放点雨声')).toEqual({ action: 'start', kind: 'rain' })
    expect(parseNoise('来点白噪音')).toEqual({ action: 'start', kind: 'white' })
    expect(parseNoise('放些篝火')).toEqual({ action: 'start', kind: 'fire' })
    expect(parseNoise('播点粉噪音')).toEqual({ action: 'start', kind: 'pink' })
  })

  it('停止', () => {
    expect(parseNoise('停止噪音')).toEqual({ action: 'stop' })
    expect(parseNoise('别放了')).toEqual({ action: 'stop' })
  })

  it('无关文本不误判', () => {
    expect(parseNoise('今天天气怎么样')).toBeNull()
    expect(parseNoise('讲个笑话')).toBeNull()
  })
})

describe('天气意图解析', () => {
  it('城市提取', () => {
    expect(parseWeatherIntent('上海天气怎么样')).toEqual({ city: '上海' })
    expect(parseWeatherIntent('查一下杭州的天气')).toEqual({ city: '杭州' })
    expect(parseWeatherIntent('今天天气怎么样')).toEqual({})
  })

  it('非天气文本返回 null', () => {
    expect(parseWeatherIntent('你好')).toBeNull()
    expect(parseWeatherIntent('开个番茄钟')).toBeNull()
  })
})

describe('今日报告意图', () => {
  it('识别各种说法', () => {
    expect(isReportIntent('今日报告')).toBe(true)
    expect(isReportIntent('今日总结')).toBe(true)
    expect(isReportIntent('今天的工作统计')).toBe(true)
    expect(isReportIntent('讲个笑话')).toBe(false)
  })
})

describe('WMO 天气码与播报文案', () => {
  it('常用码转中文', () => {
    expect(wmoDesc(0)).toBe('晴')
    expect(wmoDesc(61)).toBe('小雨')
    expect(wmoDesc(95)).toBe('雷阵雨')
    expect(wmoDesc(undefined)).toBe('未知')
  })

  it('秘书式播报（含穿衣/带伞建议）', () => {
    const t1 = weatherReplyText({ city: '北京', temp: 28, desc: '多云', humidity: 40, wind: 10, tmax: 31, tmin: 22, pop: 60 })
    expect(t1).toContain('北京')
    expect(t1).toContain('多云')
    expect(t1).toContain('28℃')
    expect(t1).toContain('带伞')
    const t2 = weatherReplyText({ city: '哈尔滨', temp: -8, desc: '小雪' })
    expect(t2).toContain('保暖')
  })
})
