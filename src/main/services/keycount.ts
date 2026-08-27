/**
 * v0.9 全局按键统计：只统计 keydown 次数并分类（总数/字符/空格/回车），
 * 不记录任何按键内容与文本，仅用于「今日速览」与每日汇报。
 * - 依赖 uiohook-napi 全局钩子（N-API 预编译，兼容 Electron）；加载失败时静默降级
 * - 内存累计，每 30 秒落库一次；跨天自动清零（lastKeysDate 标记）
 */
import { get as storeGet, set as storeSet } from './store'

const FLUSH_MS = 30_000

interface KeyPending {
  total: number
  chars: number
  space: number
  enter: number
}

interface UiohookLike {
  on(event: 'keydown', cb: (e: { keycode: number }) => void): void
  start(): void
  stop(): void
}

let started = false
let hook: UiohookLike | null = null
let charKeyCodes = new Set<number>()
let spaceCode = 0
let enterCodes = new Set<number>()
let pending: KeyPending = { total: 0, chars: 0, space: 0, enter: 0 }
let timer: NodeJS.Timeout | null = null

function onKey(keycode: number): void {
  pending.total++
  if (keycode === spaceCode) pending.space++
  else if (enterCodes.has(keycode)) pending.enter++
  else if (charKeyCodes.has(keycode)) pending.chars++
}

/** 每 30 秒把累计值并入 store.stats（跨天先清零再累加）；
 * 即使无按键也会补上 keys 初始化（旧存档升级后字段才会存在），
 * 保证渲染层读取 keysToday 不为 undefined */
function flush(): void {
  const s = storeGet('stats')
  const today = new Date().toISOString().slice(0, 10)
  const p = pending
  pending = { total: 0, chars: 0, space: 0, enter: 0 }
  if (p.total === 0 && s.lastKeysDate === today) return
  const sameDay = s.lastKeysDate === today
  storeSet('stats', {
    ...s,
    lastKeysDate: today,
    keysToday: (sameDay ? s.keysToday ?? 0 : 0) + p.total,
    keyCharsToday: (sameDay ? s.keyCharsToday ?? 0 : 0) + p.chars,
    keySpaceToday: (sameDay ? s.keySpaceToday ?? 0 : 0) + p.space,
    keyEnterToday: (sameDay ? s.keyEnterToday ?? 0 : 0) + p.enter
  })
}

/** 启动全局按键监听（原生模块不可用时静默关闭统计） */
export async function startKeyCount(): Promise<void> {
  if (started) return
  started = true
  try {
    const mod = await import('uiohook-napi')
    const keys = mod.UiohookKey as Record<string, number>
    hook = mod.uIOhook as UiohookLike
    // 字符键 = 字母 + 数字 + 小键盘数字（输入法组词前的物理按键，近似计为字数）
    for (const name of Object.keys(keys)) {
      const isLetter = /^[A-Z]$/.test(name)
      const isDigit = /^[0-9]$/.test(name)
      const isNumpadDigit = /^Numpad[0-9]$/.test(name)
      if (isLetter || isDigit || isNumpadDigit) charKeyCodes.add(keys[name])
    }
    spaceCode = keys.Space
    enterCodes = new Set([keys.Enter, keys.NumpadEnter])
    hook.on('keydown', (e) => onKey(e.keycode))
    hook.start()
  } catch (err) {
    console.log('[keycount] uiohook-napi 不可用，按键统计已禁用:', (err as Error)?.message ?? err)
    return
  }
  timer = setInterval(flush, FLUSH_MS)
}

/** 退出前调用：停止钩子并把剩余计数落库 */
export function stopKeyCount(): void {
  if (timer) clearInterval(timer)
  timer = null
  try {
    hook?.stop()
  } catch {
    // 忽略停止失败
  }
  flush()
}
