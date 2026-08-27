/** 每日早报服务：按配置时间触发，聚合待办+天气+鼓励语推给渲染层播报 */
import { app } from 'electron'
import { getConfig, setConfig } from './appconfig'
import { listTodos } from './todos'
import { getWeather } from './weather'
import type { MorningReport } from '@shared/types'

const CHECK_MS = 30_000
let started = false

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function pickGreeting(): string {
  const hour = new Date().getHours()
  const arr =
    hour < 6
      ? ['主人这么早就起来了？银月陪您。']
      : hour < 9
        ? ['早上好主人！新的一天开始啦，银月给您准备了早报～']
        : ['主人好！银月来汇报一下今天的安排。']
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 检查是否到早报时间，到点则聚合内容返回 */
async function checkAndBuild(): Promise<MorningReport | null> {
  const cfg = getConfig()
  const at = cfg.assistant.morningReportAt
  if (!at || !/^\d{1,2}:\d{2}$/.test(at)) return null
  const today = todayStr()
  if (cfg.assistant.lastReportDate === today) return null
  const [h, m] = at.split(':').map(Number)
  const now = new Date()
  if (now.getHours() < h || (now.getHours() === h && now.getMinutes() < m)) return null
  // 到点：聚合
  const todos = listTodos()
    .filter((t) => !t.done)
    .map((t) => t.text)
    .slice(0, 8)
  let weather: MorningReport['weather'] = null
  const w = await getWeather(cfg.weather.city)
  if (w.ok && typeof w.temp === 'number') {
    weather = { city: w.city, temp: w.temp, code: w.code ?? 0 }
  }
  setConfig({ assistant: { lastReportDate: today } })
  return { date: today, todos, weather, greeting: pickGreeting() }
}

/** 启动早报调度，到点经 emit 推 MorningReport */
export function startMorningReportScheduler(emit: (report: MorningReport) => void): void {
  if (started) return
  started = true
  // 启动后立即检查一次（应对重启后补发）
  void checkAndBuild().then((r) => {
    if (r) emit(r)
  })
  setInterval(() => {
    void checkAndBuild().then((r) => {
      if (r) emit(r)
    })
  }, CHECK_MS)
}

// 防止 tree-shaking 误删 app 引用（appconfig 已用 app.getPath）
void app
