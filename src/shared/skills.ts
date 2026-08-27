/** 本地意图解析（纯逻辑，主/渲染进程与测试共用）：定时提醒、待办、报时、笑话等 */

export interface TimerIntent {
  ok: boolean
  /** 距触发的毫秒数（相对时间）或 null（绝对时间时用 fireAt） */
  delayMs?: number
  /** 绝对触发时间戳 */
  fireAt?: number
  task: string
}

const UNIT_MS: Record<string, number> = {
  秒: 1000,
  分: 60_000,
  分钟: 60_000,
  时: 3_600_000,
  小时: 3_600_000,
  钟头: 3_600_000,
  天: 86_400_000
}

const CN_DIGIT: Record<string, number> = { 零: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

/** 解析数字 token：阿拉伯数字或常见中文数字（支持 十五/二十/半/一个半 等） */
export function parseNumberToken(s: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(s)) return parseFloat(s)
  if (s === '半') return 0.5
  if (s.includes('十')) {
    const [a, b] = s.split('十')
    const tens = a ? CN_DIGIT[a] : 1
    if (tens === undefined) return null
    const ones = b === '' ? 0 : b === '半' ? 0.5 : CN_DIGIT[b]
    if (ones === undefined) return null
    return tens * 10 + ones
  }
  if (s.length === 1 && CN_DIGIT[s] !== undefined) return CN_DIGIT[s]
  return null
}

/** 解析"提醒我 30 分钟后 XXX"类相对时间（支持中文数字：半个钟头/一个半小时/十五分钟…） */
export function parseRelativeTimer(text: string): TimerIntent {
  const m = text.match(
    /(?:提醒我|叫我|记得|记着)?[^\d零一两二三四五六七八九十半]{0,6}(\d+(?:\.\d+)?|[零一两二三四五六七八九十半]+)(个?半?)?(秒|分|分钟|时|小时|钟头|天)(?:之|过)?后(?:提醒我|叫我)?(?:要|去|记得)?(.+)/
  )
  if (!m) return { ok: false, task: '' }
  const base = parseNumberToken(m[1])
  if (base === null) return { ok: false, task: '' }
  const n = base + (m[2]?.includes('半') ? 0.5 : 0)
  const unit = UNIT_MS[m[3]]
  if (!unit) return { ok: false, task: '' }
  const task = m[4].replace(/^[，。,.\s]+/, '').trim()
  if (!task) return { ok: false, task: '' }
  return { ok: true, delayMs: Math.round(n * unit), task }
}

/** 解析"提醒我明天 14:30 XXX"类绝对时间 */
export function parseAbsoluteTimer(text: string, now: number): TimerIntent {
  const m = text.match(/(?:提醒我|叫我|记得|记着)?(今天|明天|后天|大后天)?\s*(\d{1,2})[点:：时](\d{1,2})?分?(?:要|去|记得)?(.+)/)
  if (!m) return { ok: false, task: '' }
  const now2 = new Date(now)
  const day = m[1]
  const h = parseInt(m[2], 10)
  const min = m[3] ? parseInt(m[3], 10) : 0
  const rest = (m[4] ?? '').replace(/^[，。,.\s]+/, '').trim()
  if (h > 23 || min > 59) return { ok: false, task: '' }
  let date = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate(), h, min, 0)
  if (day === '明天') date = new Date(date.getTime() + 86_400_000)
  else if (day === '后天') date = new Date(date.getTime() + 2 * 86_400_000)
  else if (day === '大后天') date = new Date(date.getTime() + 3 * 86_400_000)
  else if (date.getTime() <= now) date = new Date(date.getTime() + 86_400_000) // 默认视为明天
  const task = rest.replace(/^[，。,.\s]+/, '').trim()
  if (!task) return { ok: false, task: '' }
  return { ok: true, fireAt: date.getTime(), task }
}

/** 判断是否是定时提醒请求（先相对后绝对） */
export function parseTimerIntent(text: string, now: number): TimerIntent {
  if (!/(提醒我|叫我|记得|记着)/.test(text)) return { ok: false, task: '' }
  const rel = parseRelativeTimer(text)
  if (rel.ok) return rel
  return parseAbsoluteTimer(text, now)
}

// ---------- 待办 ----------

export type TodoAction =
  | { kind: 'add'; text: string }
  | { kind: 'done'; keyword: string }
  | { kind: 'list' }

export function parseTodoAction(text: string): TodoAction | null {
  const t = text.trim()
  const add = t.match(/^(?:记一下|记一下：|记一下:|添加待办|添加待办：|待办[:：]\s*)(.+)/)
  if (add) return { kind: 'add', text: add[1].trim() }
  const done = t.match(/^(?:完成了?|搞定|划掉|办完了?)[：:]?\s*(.+)/)
  if (done) return { kind: 'done', keyword: done[1].trim() }
  if (/^(我的)?待办(列表|清单)?$|^查看待办$/.test(t)) return { kind: 'list' }
  return null
}

/** 在待办里做包含式模糊匹配 */
export function matchTodo<T extends { text: string; done: boolean }>(items: T[], keyword: string): T | null {
  const k = keyword.toLowerCase()
  const exact = items.find((i) => !i.done && i.text.toLowerCase().includes(k))
  if (exact) return exact
  // 逐字匹配度最高的未完成项
  let best: T | null = null
  let bestScore = 0
  for (const it of items) {
    if (it.done) continue
    let score = 0
    for (const ch of k) if (it.text.includes(ch)) score++
    if (score > bestScore && score >= Math.max(1, Math.ceil(k.length * 0.5))) {
      best = it
      bestScore = score
    }
  }
  return best
}

// ---------- v0.3：番茄钟 / 噪音 / 天气 / 报告 ----------

export type PomodoroAction = { action: 'start'; minutes: number } | { action: 'stop' } | { action: 'status' }

/** 番茄钟指令：开个(25分钟)番茄钟 / 停止番茄钟 / 番茄钟状态 */
export function parsePomodoro(text: string): PomodoroAction | null {
  const t = text.trim()
  if (/(停止|取消|结束|关掉)番茄钟|番茄钟(停止|取消|结束)/.test(t)) return { action: 'stop' }
  if (/番茄钟(状态|进度)|.*(查|看).{0,4}番茄钟/.test(t)) return { action: 'status' }
  const m = t.match(/(开|来|起|启动|开始|整|上)个?(?:(\d{1,3})分钟)?番茄钟|^番茄钟$/)
  if (m) {
    const minutes = m[2] ? Math.max(5, Math.min(120, parseInt(m[2], 10))) : 25
    return { action: 'start', minutes }
  }
  return null
}

export type NoiseKind = 'rain' | 'white' | 'pink' | 'brown' | 'fire'

export type NoiseAction = { action: 'start'; kind: NoiseKind } | { action: 'stop' }

const NOISE_WORDS: Array<[RegExp, NoiseKind]> = [
  [/雨声|下雨|雨白噪|雨音/, 'rain'],
  [/篝火|壁炉|火炉|炉火/, 'fire'],
  [/白噪/, 'white'],
  [/粉噪/, 'pink'],
  [/棕噪|红噪/, 'brown']
]

/** 噪音指令：放点雨声 / 来点白噪音 / 停止噪音 */
export function parseNoise(text: string): NoiseAction | null {
  const t = text.trim()
  if (
    /(停止|关掉|别放|停止播放|停下).{0,4}(噪音|声音|音乐|雨声|篝火)|^安静点$|^静音环境音$|^别放了?$|^关掉(吧|声音)?$|^停止播放$/.test(
      t
    )
  ) {
    return { action: 'stop' }
  }
  if (/(放|来|播|开)点?(一?些?个?)?(雨声|下雨声|白噪|粉噪|棕噪|红噪|篝火|壁炉|火炉|炉火|环境音|专注音)/.test(t)) {
    for (const [re, kind] of NOISE_WORDS) if (re.test(t)) return { action: 'start', kind }
    return { action: 'start', kind: 'rain' }
  }
  return null
}

/** 天气指令与城市提取：返回 null 表示不是天气意图 */
export function parseWeatherIntent(text: string): { city?: string } | null {
  const t = text.trim()
  if (!/天气|气温|温度多少|下雨吗|weather/i.test(t)) return null
  // 剥离"帮我查一下/看看/报"等前导动词，避免混入城市名
  const s = t.replace(/^(?:帮我|请|给我)?(?:查询|查查|查|看看|看|报)(?:一下)?/, '')
  const notCity = /今天|今日|明天|后天|现在|这儿|这里|本地|当地|外面|查|看/
  const m1 = s.match(/([^\s，。,？?]{1,8}?)的?天气(?:怎么样|呢|如何)?$/)
  if (m1 && !notCity.test(m1[1])) return { city: m1[1] }
  const m2 = s.match(/天气(?:怎么样)?[，,]?\s*(?:在|是)?\s*([^\s，。,？?]{1,8})$/)
  if (m2 && m2[1] && !notCity.test(m2[1]) && !/怎么样|呢|如何/.test(m2[1])) return { city: m2[1] }
  return {}
}

/** 今日报告意图 */
export function isReportIntent(text: string): boolean {
  return /今日报告|今日总结|工作日报|今天.{0,4}(统计|总结|报告)|每日(报告|总结)/.test(text.trim())
}

// ---------- 其他本地技能 ----------

export type LocalSkill = 'time' | 'joke' | 'help' | 'version'

export function parseLocalSkill(text: string): LocalSkill | null {
  const t = text.trim()
  if (/(现在)?几点(了|钟)?|当前时间|几点了/.test(t)) return 'time'
  if (/讲(一)?个笑话|来(一)?个笑话|说个笑话/.test(t)) return 'joke'
  if (/你(能|会)(做|干)?什么|你有什么功能|功能列表|帮助|help/i.test(t)) return 'help'
  if (/版本|version/i.test(t) && t.length <= 12) return 'version'
  return null
}

/** GLM 定时意图辅助解析的提示词（严格 JSON） */
export const TIMER_PARSE_PROMPT = [
  '从用户消息中提取定时提醒意图，只输出 JSON，不要输出任何其他文字：',
  '{"delayMinutes": 数字, "task": "要做的事"}',
  '如果消息不包含提醒意图，输出 {"delayMinutes": null, "task": ""}。',
  '相对时间换算成分钟（如"半小时后"=30）；绝对时间换算成距现在的分钟数。'
].join('\n')

export function parseTimerJson(raw: string): { delayMinutes: number | null; task: string } {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return { delayMinutes: null, task: '' }
  try {
    const obj = JSON.parse(m[0]) as { delayMinutes?: unknown; task?: unknown }
    const d = typeof obj.delayMinutes === 'number' && isFinite(obj.delayMinutes) ? obj.delayMinutes : null
    const task = typeof obj.task === 'string' ? obj.task.trim() : ''
    return { delayMinutes: d, task }
  } catch {
    return { delayMinutes: null, task: '' }
  }
}
