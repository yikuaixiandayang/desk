/**
 * 自测模式（--self-test）：无 GUI 下验证持久化、GLM 全链路、运行时配置、TTS 合成、
 * 定时意图解析与记忆提取，输出 JSON 结果并以退出码标识成败
 */
import { writeFileSync } from 'fs'
import { chatWithGlm } from './services/glm'
import { buildSystemPrompt } from '@shared/prompts'
import { extractFactsJson } from '@shared/prompts'
import * as storeService from './services/store'
import { decideReminders, type ReminderRuntimeState } from '@shared/remind-logic'
import { parseTimerIntent, parseTodoAction, parseLocalSkill, parsePomodoro, parseNoise } from '@shared/skills'
import { getConfig, setConfig } from './services/appconfig'
import { synthesize } from './services/ttssynth'
import { addTimer, listTimers, removeTimer } from './services/scheduler'
import { startPomodoro, getPomodoro, stopPomodoro } from './services/pomodoro'
import { getWeather } from './services/weather'

export async function runSelfTest(): Promise<number> {
  const results: Record<string, unknown> = {}
  let pass = true

  // 1. 持久化
  try {
    const before = storeService.getState()
    storeService.patchState({ nurture: before.nurture })
    const after = storeService.getState()
    results.store = { ok: typeof after.nurture.level === 'number', path: storeService.getStorePath() }
  } catch (e) {
    pass = false
    results.store = { ok: false, error: String(e) }
  }

  // 2. 系统提示构建（上下文注入：情绪 + 等级 + 记忆 + 待办）
  try {
    const prompt = buildSystemPrompt({ level: 7, emotion: 'happy' }, {
      memoryFacts: ['主人叫小明', '主人喜欢喝咖啡'],
      todos: ['明天回复邮件'],
      nowText: '8月16日 星期六 22:00'
    })
    results.prompt = {
      ok:
        prompt.includes('银月') &&
        prompt.includes('Lv.7') &&
        prompt.includes('轻快') &&
        prompt.includes('主人喜欢喝咖啡') &&
        prompt.includes('明天回复邮件'),
      length: prompt.length
    }
  } catch (e) {
    pass = false
    results.prompt = { ok: false, error: String(e) }
  }

  // 3. GLM 真实调用（用当前运行时配置）
  try {
    const r = await chatWithGlm([{ role: 'user', content: '请回复四个字：自测成功', ts: Date.now() }], {
      level: 6,
      emotion: 'calm'
    })
    results.glm = { ok: r.ok, content: r.content, error: r.error, latencyMs: r.latencyMs, model: r.model }
    if (!r.ok) pass = false
  } catch (e) {
    pass = false
    results.glm = { ok: false, error: String(e) }
  }

  // 4. 运行时配置：读取 + 热改 + 还原
  try {
    const orig = getConfig()
    setConfig({ api: { model: 'SELFTEST-MODEL' } })
    const changed = getConfig()
    setConfig({ api: { model: orig.api.model } })
    const restored = getConfig()
    results.appconfig = {
      ok: changed.api.model === 'SELFTEST-MODEL' && restored.api.model === orig.api.model,
      baseUrl: orig.api.baseUrl,
      hasKey: orig.api.apiKey.length > 10
    }
  } catch (e) {
    pass = false
    results.appconfig = { ok: false, error: String(e) }
  }

  // 5. Edge 神经语音合成（在线，真实合成一小段）
  try {
    const cfg = getConfig()
    const r = await synthesize('自测。', cfg.tts)
    results.tts = { ok: r.ok, engine: r.engine, error: r.error, bytes: r.dataUrl?.length ?? 0 }
  } catch (e) {
    pass = false
    results.tts = { ok: false, error: String(e) }
  }

  // 6. 定时意图解析（相对/绝对/无关文本）
  try {
    const now = new Date('2026-08-16T10:00:00').getTime()
    const r1 = parseTimerIntent('提醒我30分钟后站起来活动', now)
    const r2 = parseTimerIntent('提醒我明天14:30开会', now)
    const r3 = parseTimerIntent('今天天气怎么样', now)
    results.timerParse = {
      ok:
        r1.ok && r1.delayMs === 30 * 60_000 && r1.task === '站起来活动' &&
        r2.ok && r2.fireAt !== undefined && new Date(r2.fireAt).getHours() === 14 &&
        !r3.ok,
      r1, r2
    }
  } catch (e) {
    pass = false
    results.timerParse = { ok: false, error: String(e) }
  }

  // 7. 定时器增删（持久层）
  try {
    const t = addTimer('自测任务', Date.now() + 60_000)
    const listed = listTimers()
    removeTimer(t.id)
    const after = listTimers()
    results.scheduler = { ok: listed.some((x) => x.id === t.id) && !after.some((x) => x.id === t.id) }
  } catch (e) {
    pass = false
    results.scheduler = { ok: false, error: String(e) }
  }

  // 8. 技能路由解析（待办/本地技能）
  try {
    const t1 = parseTodoAction('记一下 明早回邮件')
    const t2 = parseLocalSkill('现在几点了')
    const t3 = parseLocalSkill('讲个笑话')
    results.skills = { ok: t1?.kind === 'add' && t2 === 'time' && t3 === 'joke', t1 }
  } catch (e) {
    pass = false
    results.skills = { ok: false, error: String(e) }
  }

  // 9. 记忆提取
  try {
    const facts = extractFactsJson('好的，以下是记忆：\n["主人叫小明","主人喜欢咖啡"]')
    results.memoryExtract = { ok: facts.length === 2 && facts[0] === '主人叫小明' }
  } catch (e) {
    pass = false
    results.memoryExtract = { ok: false, error: String(e) }
  }

  // 10. 提醒决策纯逻辑
  try {
    const cfg = { enabled: true, sedentaryMin: 45, waterMin: 60 }
    const now = Date.now()
    const st: ReminderRuntimeState = { activeMs: 46 * 60_000, lastSedentaryRemindAt: 0, lastWaterRemindAt: 0 }
    const d1 = decideReminders(now, 10, cfg, st)
    const d2 = decideReminders(now, 400, cfg, st)
    results.reminders = { ok: d1.sedentary && d1.water && !d2.active && d2.resetActive }
  } catch (e) {
    pass = false
    results.reminders = { ok: false, error: String(e) }
  }

  // 11. 番茄钟往返（持久层）
  try {
    startPomodoro(25)
    const during = getPomodoro()
    stopPomodoro()
    const after = getPomodoro()
    results.pomodoro = { ok: during.active && during.focusMin === 25 && !after.active }
  } catch (e) {
    pass = false
    results.pomodoro = { ok: false, error: String(e) }
  }

  // 12. v0.3 指令解析（番茄钟/噪音）
  try {
    const p = parsePomodoro('开个50分钟番茄钟')
    const n = parseNoise('放点雨声')
    results.v03parse = { ok: p?.action === 'start' && p.minutes === 50 && n?.action === 'start' && n.kind === 'rain' }
  } catch (e) {
    pass = false
    results.v03parse = { ok: false, error: String(e) }
  }

  // 13. 天气（在线，Open-Meteo 免密钥；失败不判整体失败，仅记录）
  try {
    const w = await getWeather('北京')
    results.weather = { ok: w.ok, city: w.city, temp: w.temp, code: w.code, error: w.error }
  } catch (e) {
    results.weather = { ok: false, error: String(e) }
  }

  const summary = '[selftest] ' + JSON.stringify({ pass, results }, null, 2)
  // 同步写入结果文件，避免 app.exit 截断 stdout（管道/文件下 console.log 为异步写）。
  const outPath = 'D:/yunwei-notes/desk/selftest-result.json'
  try {
    writeFileSync(outPath, summary + '\n')
  } catch (we) {
    try {
      writeFileSync('D:/yunwei-notes/desk/selftest-writeerr.log', String(we) + '\n' + String((we as Error)?.stack ?? ''))
    } catch {
      /* ignore */
    }
  }
  console.log(summary)
  return pass ? 0 : 1
}
