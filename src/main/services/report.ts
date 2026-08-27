/** v0.8 每日向 Hermes agent 汇报今日数据（best-effort）。
 *  到配置的时间点把今日活跃/聊天/提醒/心情等汇总 POST 到 reportUrl 的 OpenAI 兼容接口；
 *  离线或不可达时静默跳过（仅记日志），不影响桌宠正常使用。
 */
import { getConfig } from './appconfig'
import { get as storeGet } from './store'
import { reminderStatsToday } from './db'

const CHECK_MS = 60_000
let started = false
let lastSentDate = ''

export interface DailyReportData {
  date: string
  activeMin: number
  chats: number
  pats: number
  hugsAndPokes: string
  remindersWater: { delivered: number; acked: number }
  remindersSedentary: { delivered: number; acked: number }
  pomodoros: number
  peeks: number
  mood: number
  satiety: number
  level: number
}

/** 汇总今日数据（主进程读 store + SQLite） */
function collectReport(): DailyReportData {
  const stats = storeGet('stats')
  const nurture = storeGet('nurture')
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    activeMin: Math.round((stats.activeSecondsToday ?? 0) / 60),
    chats: stats.chatsToday ?? 0,
    pats: stats.patsToday ?? 0,
    hugsAndPokes: '见聊天/互动明细',
    remindersWater: reminderStatsToday('water'),
    remindersSedentary: reminderStatsToday('sedentary'),
    pomodoros: stats.pomodorosToday ?? 0,
    peeks: stats.peeksToday ?? 0,
    mood: nurture.mood ?? 70,
    satiety: nurture.satiety ?? 80,
    level: nurture.level ?? 1
  }
}

function reportText(r: DailyReportData): string {
  return [
    `【银月桌宠·今日汇报 ${r.date}】`,
    `活跃 ${r.activeMin} 分钟；聊天 ${r.chats} 次；摸头 ${r.pats} 次；番茄 ${r.pomodoros} 个；探头 ${r.peeks} 次。`,
    `喝水提醒 送达${r.remindersWater.delivered}/确认${r.remindersWater.acked}；久坐提醒 送达${r.remindersSedentary.delivered}/确认${r.remindersSedentary.acked}。`,
    `当前心情 ${r.mood}/100，饱食度 ${r.satiety}/100，等级 Lv.${r.level}。`
  ].join('\n')
}

/** 立即发送一次汇报（best-effort，失败静默）。返回是否成功。 */
export async function sendReportNow(): Promise<{ ok: boolean; error?: string }> {
  const cfg = getConfig()
  const url = (cfg.assistant.reportUrl ?? '').trim()
  if (!url) return { ok: false, error: '未配置汇报地址' }
  const text = reportText(collectReport())
  try {
    const resp = await fetch(url.replace(/\/+$/, '') + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hermes-Session-Id': 'desktop-pet-report' },
      body: JSON.stringify({
        model: cfg.api.model,
        messages: [
          { role: 'system', content: '你是桌宠数据汇报接收助手，只需确认收到今日汇报，一句话即可。' },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 64
      }),
      signal: AbortSignal.timeout(8000)
    })
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` }
    lastSentDate = collectReport().date
    return { ok: true }
  } catch (err) {
    // 离线/不可达：静默跳过
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 定时汇报调度：每分钟检查，到 reportAt 且当天未发过则发送 */
export function startReportScheduler(): void {
  if (started) return
  started = true
  setInterval(() => {
    const cfg = getConfig()
    const at = (cfg.assistant.reportAt ?? '').trim()
    if (!/^\d{1,2}:\d{2}$/.test(at)) return
    const now = new Date()
    const cur = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
    const norm = (s: string): string => {
      const [h, m] = s.split(':').map((x) => parseInt(x, 10))
      return `${h}:${String(m).padStart(2, '0')}`
    }
    if (norm(at) !== cur) return
    const today = collectReport().date
    if (lastSentDate === today) return
    void sendReportNow().then((r) => {
      if (r.ok) console.log('[report] 每日汇报已发送')
      else console.log(`[report] 汇报跳过/失败（离线?）: ${r.error}`)
    })
  }, CHECK_MS)
}