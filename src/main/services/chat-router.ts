/** 聊天路由器：接收用户文本，执行意图解析和技能分发，返回结构化结果（主进程服务） */
import type {
  ChatRouterInput,
  ChatRouterResult,
  UsageStats
} from '@shared/types'
import {
  parseTimerIntent,
  parseTodoAction,
  matchTodo,
  parsePomodoro,
  parseNoise,
  parseWeatherIntent,
  isReportIntent,
  parseLocalSkill,
  TIMER_PARSE_PROMPT,
  parseTimerJson
} from '@shared/skills'
import { wmoDesc, weatherReplyText } from '@shared/wmo'
import {
  fallbackReply,
  jokeReply,
  timeReply,
  capabilitiesReply,
  versionReply,
  timerConfirmReply
} from '@shared/chat-text'
import { chatWithGlm, chatRaw } from './glm'
import * as scheduler from './scheduler'
import * as todos from './todos'
import { reminderStatsToday } from './db'
import * as pomodoro from './pomodoro'
import * as nurtureService from './nurture'
import { getWeather } from './weather'
import { get as storeGet, set as storeSet } from './store'
import { personalityType } from '@shared/personality'
import { randomRiddle, checkRiddleAnswer } from '@shared/riddles'

// ---------- 路由主逻辑 ----------

export async function routeChat(input: ChatRouterInput): Promise<ChatRouterResult> {
  const { text, history, ctx, memoryFacts, nowText } = input
  const trimmed = text.trim()

  // 0) 待回答的谜语（优先级最高，避免被其他意图误拦）
  const pending = storeGet('pendingRiddle')
  if (pending && pending.a) {
    storeSet('pendingRiddle', null)
    if (checkRiddleAnswer(pending as any, trimmed)) {
      // 答对谜语加 5 经验
      void nurtureService.addExp(5)
      return {
        reply: '主人答对了！好厉害呀～银月给主人加 5 点经验！',
        degraded: false,
        emotion: 'happy'
      }
    }
    return {
      reply: `没猜到呢～答案是「${pending.a}」。下次再来考主人！`,
      degraded: false,
      emotion: 'coax'
    }
  }

  // 1) 定时提醒（本地正则）
  const timerIntent = parseTimerIntent(trimmed, Date.now())
  if (timerIntent.ok) {
    const fireAt = timerIntent.fireAt ?? Date.now() + (timerIntent.delayMs ?? 0)
    if (fireAt > Date.now() + 5000) {
      scheduler.addTimer(timerIntent.task, fireAt)
      return {
        reply: timerConfirmReply(timerIntent.task, fireAt),
        degraded: false,
        sideEffect: { refreshTimers: true }
      }
    }
  }

  // 2) 待办
  const todo = parseTodoAction(trimmed)
  if (todo) {
    if (todo.kind === 'add') {
      todos.addTodo(todo.text)
      return { reply: `记下了，主人：${todo.text}（说"待办"随时查看）`, degraded: false }
    }
    if (todo.kind === 'list') {
      const items = todos.listTodos().filter((t) => !t.done)
      if (items.length === 0) return { reply: '主人目前没有待办事项，很清爽呢。', degraded: false }
      return { reply: '主人的待办：\n' + items.map((t, i) => `${i + 1}. ${t.text}`).join('\n'), degraded: false }
    }
    if (todo.kind === 'done') {
      const items = todos.listTodos()
      const hit = matchTodo(items, todo.keyword)
      if (hit) {
        todos.toggleTodo(hit.id, true)
        return { reply: `漂亮！「${hit.text}」已完成，主人好棒。`, degraded: false }
      }
      return { reply: '银月没找到这条待办呢，说"待办"看看清单？', degraded: false }
    }
  }

  // 3) 番茄钟
  const pomo = parsePomodoro(trimmed)
  if (pomo) {
    if (pomo.action === 'start') {
      pomodoro.startPomodoro(pomo.minutes)
      return {
        reply: `🍅 番茄钟开始！专注 ${pomo.minutes} 分钟，银月会安静守着，不打扰主人。`,
        degraded: false,
        emotion: 'excited'
      }
    }
    if (pomo.action === 'stop') {
      pomodoro.stopPomodoro()
      return { reply: '番茄钟已取消，主人随时可以重新开始。', degraded: false }
    }
    if (pomo.action === 'status') {
      const s = pomodoro.getPomodoro()
      if (!s.active) return { reply: '现在没有进行中的番茄钟哦。说"开个番茄钟"开始专注。', degraded: false }
      const remain = Math.max(1, Math.ceil((s.endsAt - Date.now()) / 60_000))
      return {
        reply: s.phase === 'focus'
          ? `🍅 专注中：还剩 ${remain} 分钟（共 ${s.focusMin} 分钟）。`
          : `☕ 休息中：还剩 ${remain} 分钟。`,
        degraded: false
      }
    }
  }

  // 4) 环境音
  const noise = parseNoise(trimmed)
  if (noise) {
    if (noise.action === 'stop') {
      return { reply: '好的，环境音已停止。', degraded: false, sideEffect: { stopNoise: true } }
    }
    return {
      reply: `来喽～${noiseLabel(noise.kind)}已响起，主人安心工作。想关掉就说"停止噪音"。`,
      degraded: false,
      emotion: 'coax',
      sideEffect: { playNoise: noise.kind }
    }
  }

  // 5) 天气
  const weatherIntent = parseWeatherIntent(trimmed)
  if (weatherIntent) {
    const w = await getWeather(weatherIntent.city)
    if (!w.ok) {
      return { reply: `呜……天气查不到（${w.error}）。可能是网络问题，稍后再试试？`, degraded: false, emotion: 'sad' }
    }
    return { reply: weatherReplyText({ ...w, desc: wmoDesc(w.code) }), degraded: false, emotion: 'happy' }
  }

  // 6) 今日报告
  if (isReportIntent(trimmed)) {
    const stats = storeGet('stats') as UsageStats
    const h = Math.floor(stats.activeSecondsToday / 3600)
    const m = Math.round((stats.activeSecondsToday % 3600) / 60)
    const undone = todos.listTodos().filter((t) => !t.done).length
    // v0.7 提醒统计（SQLite）：久坐/喝水 送达与确认
    const sed = reminderStatsToday('sedentary')
    const wat = reminderStatsToday('water')
    const lines = [
      '主人今日报告来啦：',
      `电脑活跃 ${h} 小时 ${m} 分钟；对话 ${stats.chatsToday} 次；摸头 ${stats.patsToday} 次；`,
      `完成番茄钟 ${stats.pomodorosToday} 个；确认健康提醒 ${stats.acksToday} 次${undone > 0 ? `；待办还剩 ${undone} 件` : ''}。`,
      `久坐提醒 送达 ${sed.delivered}/确认 ${sed.acked}；喝水提醒 送达 ${wat.delivered}/确认 ${wat.acked}。`
    ]
    const activeHours = stats.activeSecondsToday / 3600
    if (activeHours >= 6) lines.push('活跃时间偏长，主人要注意休息呀。')
    else if (activeHours < 1 && stats.chatsToday < 3) lines.push('今天互动有点少……银月想主人了。')
    else lines.push('节奏不错，继续保持！')
    return { reply: lines.join('\n'), degraded: false }
  }

  // 7) 报时 / 笑话 / 能力介绍 / 版本
  const skill = parseLocalSkill(trimmed)
  if (skill === 'time') return { reply: timeReply(new Date()), degraded: false }
  if (skill === 'joke') return { reply: jokeReply(), degraded: false }
  if (skill === 'help') return { reply: capabilitiesReply(), degraded: false }
  if (skill === 'version') return { reply: versionReply(), degraded: false }

  // 7.5) 谜语请求
  if (/出个谜语|考考我|猜谜|谜语/.test(trimmed)) {
    const riddle = randomRiddle()
    storeSet('pendingRiddle', riddle)
    return {
      reply: `主人猜猜看：${riddle.q}（直接回复答案即可）`,
      degraded: false,
      emotion: 'excited'
    }
  }

  // 8) GLM 大模型
  const personality = personalityType(storeGet('personality') ?? { chatter: 0, clingy: 0, study: 0, explore: 0 })
  const todos_ = todos.listTodos().filter((t) => !t.done).map((t) => t.text)
  // v0.9 注入今日按键统计（只传次数，不含内容）
  const st = storeGet('stats') as UsageStats
  const keyStats = { total: st.keysToday, chars: st.keyCharsToday, space: st.keySpaceToday, enter: st.keyEnterToday }
  const result = await chatWithGlm(
    [...history, { role: 'user' as const, content: trimmed, ts: Date.now() }],
    ctx,
    { memoryFacts, todos: todos_, nowText, personality, keyStats }
  )

  if (result.ok) {
    return { reply: result.content, degraded: false }
  }

  // 9) 降级
  return {
    reply: `【离线回复】${fallbackReply(ctx.emotion)}`,
    degraded: true,
    emotion: 'angry'
  }
}

/** GLM 辅助解析模糊定时表达（如"半小时后叫我站起来"） */
export async function parseTimerViaGlm(text: string): Promise<{ ok: boolean; delayMinutes: number | null; task: string }> {
  if (!/(提醒|叫我|记着|记得)/.test(text)) return { ok: false, delayMinutes: null, task: '' }
  if (parseTimerIntent(text, Date.now()).ok) return { ok: false, delayMinutes: null, task: '' }
  const r = await chatRaw(TIMER_PARSE_PROMPT, text, { temperature: 0, maxTokens: 120 })
  if (!r.ok) return { ok: false, delayMinutes: null, task: '' }
  const parsed = parseTimerJson(r.content)
  if (parsed.delayMinutes !== null && parsed.delayMinutes > 0 && parsed.delayMinutes < 60 * 24 * 7 && parsed.task) {
    return { ok: true, ...parsed }
  }
  return { ok: false, delayMinutes: null, task: '' }
}

// ---------- 辅助 ----------

const NOISE_LABELS: Record<string, string> = {
  rain: '雨声',
  white: '白噪音',
  pink: '粉噪音',
  brown: '棕噪音',
  fire: '篝火'
}

function noiseLabel(kind: string): string {
  return NOISE_LABELS[kind] ?? kind
}
