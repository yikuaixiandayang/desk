/** 统一本地持久化（electron-store），主进程持有，渲染进程经 IPC 读写 */
import Store from 'electron-store'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  DEFAULT_STATE,
  type AppRuntimeConfig,
  type MemoryData,
  type PersonalityLines,
  type PetStoreState,
  type PomodoroState,
  type ScheduleTimer,
  type TodoItem
} from '@shared/types'
import { DEFAULT_PERSONALITY, type PersonalityDimensions } from '@shared/personality'

interface StoreSchema {
  emotion: PetStoreState['emotion']
  history: PetStoreState['history']
  reminderConfig: PetStoreState['reminderConfig']
  settings: PetStoreState['settings']
  stats: PetStoreState['stats']
  pet: PetPersistSchema
  nurture: PetStoreState['nurture']
  appConfig: AppRuntimeConfig
  memory: MemoryData
  /** GLM 生成的个性化台词（未生成过为 null） */
  personalityLines: PersonalityLines | null
  timers: ScheduleTimer[]
  todos: TodoItem[]
  pomodoro: PomodoroState
  /** v0.6 性格养成四维数据 */
  personality: PersonalityDimensions
  /** v0.6 待回答的谜语（会话级） */
  pendingRiddle: { q: string; a: string; keywords: string[] } | null
  /** v0.6 银月日记 */
  diary: Array<{ date: string; text: string }>
  /** v0.6 成就徽章 */
  achievements: Array<{ id: string; unlockedAt: number }>
  savedAt: number
  /** 旧版好感度字段（已废弃，仅用于迁移读取） */
  affection?: number
}

type PetPersistSchema = PetStoreState['pet']

/** 存档目录：优先使用程序所在目录下的 data 子目录，便于用户备份/迁移；
 *  若程序目录不可写（如装在 Program Files），则回退到默认 userData 目录 */
function resolveStoreDir(): string {
  const progDir = join(app.getAppPath(), 'data')
  try {
    if (!existsSync(progDir)) mkdirSync(progDir, { recursive: true })
    // 探针：尝试写入临时文件验证可写
    const probe = join(progDir, '.write-probe')
    writeFileSync(probe, '1', 'utf-8')
    return progDir
  } catch {
    // 程序目录不可写，回退到 userData（C:\Users\<u>\AppData\Roaming\desktop-pet-yinyue）
    return app.getPath('userData')
  }
}

/** 一次性迁移：把旧 userData 下的 config.json 搬到程序目录 data 子目录 */
function migrateLegacyStore(newDir: string): void {
  if (newDir === app.getPath('userData')) return // 回退模式不迁移
  const legacyPath = join(app.getPath('userData'), 'config.json')
  const newPath = join(newDir, 'config.json')
  if (!existsSync(legacyPath) || existsSync(newPath)) return
  try {
    const content = readFileSync(legacyPath, 'utf-8')
    writeFileSync(newPath, content, 'utf-8')
    // 保留旧文件（重命名为 .bak），不直接删除以防回退需要
    try { renameSync(legacyPath, legacyPath + '.bak') } catch { /* 旧文件重命名失败不影响使用 */ }
  } catch { /* 迁移失败则使用新空存档 */ }
}

const storeDir = resolveStoreDir()
migrateLegacyStore(storeDir)

/** 暴露存档根目录：db.ts / asr.ts 等本地资源也放这里，保持数据集中 */
export function getStoreDir(): string {
  return storeDir
}

const store = new Store<StoreSchema>({
  // electron-store v10 omits `projectName` from its type, but the runtime still
  // requires it when `app.getName()` is unavailable. Spread avoids the excess-property error.
  ...{ projectName: 'desktop-pet-yinyue' },
  cwd: storeDir,
  defaults: {
    ...DEFAULT_STATE,
    appConfig: undefined as unknown as AppRuntimeConfig, // 由 appconfig 服务合并默认值
    memory: { facts: [], updatedAt: 0, summarizedCount: 0 },
    personalityLines: null,
    timers: [],
    todos: [],
    pomodoro: { active: false, phase: 'focus', endsAt: 0, focusMin: 25 },
    personality: { ...DEFAULT_PERSONALITY },
    pendingRiddle: null,
    diary: [],
    achievements: [],
    savedAt: 0
  }
})

// 旧版存档迁移：把废弃的 affection 换算为 nurture.level + exp，然后删除旧键
;(() => {
  const oldAffection = store.get('affection')
  if (typeof oldAffection === 'number') {
    const n = store.get('nurture')
    if (n && typeof n === 'object') {
      const level = Math.max(1, Math.min(10, Math.floor(oldAffection / 10)))
      const exp = (oldAffection % 10) * 10
      store.set('nurture', { ...n, level, exp })
    }
    store.delete('affection')
  }
})()

export function getState(): PetStoreState {
  return {
    emotion: store.get('emotion'),
    history: store.get('history'),
    reminderConfig: store.get('reminderConfig'),
    settings: store.get('settings'),
    stats: store.get('stats'),
    pet: store.get('pet'),
    nurture: store.get('nurture')
  }
}

/** 深合并补丁：仅覆盖传入的顶层键 */
export function patchState(patch: Partial<PetStoreState>): PetStoreState {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) store.set(key as keyof StoreSchema, value)
  }
  store.set('savedAt', Date.now())
  return getState()
}

/** 会话历史截断：保留最近 MAX_HISTORY_ROUNDS 轮 */
export function appendHistory(messages: PetStoreState['history']): PetStoreState['history'] {
  const trimmed = messages.slice(-(MAX_HISTORY_ROUNDS * 2))
  store.set('history', trimmed)
  return trimmed
}

const MAX_HISTORY_ROUNDS = 20

export function get<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
  return store.get(key)
}

export function set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
  store.set(key, value)
}

export function getStorePath(): string {
  return store.path
}
