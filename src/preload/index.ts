/** 预加载脚本：通过 contextBridge 暴露受控 API（contextIsolation 开启，nodeIntegration 关闭） */
import { contextBridge, ipcRenderer } from 'electron'
import {
  EDGE_VOICE_PRESETS,
  IPC,
  type AppConfigPatch,
  type AppRuntimeConfig,
  type AsrStatus,
  type AssetScanResult,
  type ChatContext,
  type ChatMessage,
  type ChatResult,
  type ChatRouterInput,
  type ChatRouterResult,
  type MemoryData,
  type MorningReport,
  type NurtureEvent,
  type NurtureState,
  type PersonalityLines,
  type PetStoreState,
  type PomodoroState,
  type Rect,
  type ReminderEvent,
  type ScheduleTimer,
  type TodoItem,
  type TtsSpeakResult,
  type WeatherNow
} from '@shared/types'

const api = {
  version: '0.8.0',
  edgeVoicePresets: EDGE_VOICE_PRESETS,
  getState: (): Promise<PetStoreState> => ipcRenderer.invoke(IPC.storeGetState) as Promise<PetStoreState>,
  patchState: (patch: Partial<PetStoreState>): Promise<PetStoreState> =>
    ipcRenderer.invoke(IPC.storePatch, patch) as Promise<PetStoreState>,
  chat: (
    history: ChatMessage[],
    ctx: ChatContext,
    extras?: { memoryFacts?: string[]; todos?: string[]; nowText?: string }
  ): Promise<ChatResult> => ipcRenderer.invoke(IPC.glmChat, { history, ctx, extras }) as Promise<ChatResult>,
  parseTimer: (
    text: string
  ): Promise<{ ok: boolean; delayMinutes: number | null; task: string; error?: string }> =>
    ipcRenderer.invoke(IPC.glmParseTimer, text) as Promise<{
      ok: boolean
      delayMinutes: number | null
      task: string
      error?: string
    }>,
  assist: (
    text: string,
    mode: 'translate' | 'explain'
  ): Promise<{ ok: boolean; content: string; error?: string }> =>
    ipcRenderer.invoke(IPC.glmAssist, text, mode) as Promise<{ ok: boolean; content: string; error?: string }>,
  setClickThrough: (enabled: boolean): void => ipcRenderer.send(IPC.winClickThrough, enabled),
  /** 把小窗口定位到屏幕坐标 (x,y)，尺寸 (w,h)；用于让宠物跨显示器移动 */
  setWindowBounds: (x: number, y: number, w: number, h: number): void =>
    ipcRenderer.send(IPC.winSetBounds, x, y, w, h),
  onScreenChanged: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.screenChanged, listener)
    return () => ipcRenderer.removeListener(IPC.screenChanged, listener)
  },
  quit: (): void => ipcRenderer.send(IPC.winQuit),
  openDevtools: (): void => ipcRenderer.send(IPC.winDevtools),
  getWorkArea: (): Promise<Rect & { workAreaBottom?: number }> => ipcRenderer.invoke(IPC.screenBounds) as Promise<Rect & { workAreaBottom?: number }>,
  getAutoLaunch: (): Promise<boolean> => ipcRenderer.invoke(IPC.appAutoLaunch) as Promise<boolean>,
  setAutoLaunch: (v: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.appAutoLaunch, v) as Promise<boolean>,
  openStorePath: (): Promise<boolean> => ipcRenderer.invoke(IPC.openStorePath) as Promise<boolean>,
  onReminder: (cb: (ev: ReminderEvent) => void): (() => void) => {
    const listener = (_e: unknown, ev: ReminderEvent): void => cb(ev)
    ipcRenderer.on(IPC.reminderEvent, listener)
    return () => ipcRenderer.removeListener(IPC.reminderEvent, listener)
  },
  onTrayToggle: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('tray:toggle-panel', listener)
    return () => ipcRenderer.removeListener('tray:toggle-panel', listener)
  },
  // 运行时配置（后台控制台）
  config: {
    get: (): Promise<AppRuntimeConfig> => ipcRenderer.invoke(IPC.appConfigGet) as Promise<AppRuntimeConfig>,
    set: (patch: AppConfigPatch): Promise<AppRuntimeConfig> =>
      ipcRenderer.invoke(IPC.appConfigSet, patch) as Promise<AppRuntimeConfig>,
    test: (): Promise<{ ok: boolean; reply: string; error?: string; latencyMs: number; model: string }> =>
      ipcRenderer.invoke(IPC.appConfigTest) as Promise<{
        ok: boolean
        reply: string
        error?: string
        latencyMs: number
        model: string
      }>
  },
  // TTS
  tts: {
    speak: (text: string): Promise<TtsSpeakResult> => ipcRenderer.invoke(IPC.ttsSpeak, text) as Promise<TtsSpeakResult>,
    voices: (): Promise<{ edge: string[] }> => ipcRenderer.invoke(IPC.ttsVoices) as Promise<{ edge: string[] }>
  },
  // 记忆
  memory: {
    get: (): Promise<MemoryData> => ipcRenderer.invoke(IPC.memoryGet) as Promise<MemoryData>,
    summarize: (): Promise<MemoryData | null> => ipcRenderer.invoke(IPC.memorySummarize) as Promise<MemoryData | null>,
    setDir: (dir: string): Promise<AppRuntimeConfig> =>
      ipcRenderer.invoke(IPC.memorySetDir, dir) as Promise<AppRuntimeConfig>,
    openDir: (): Promise<boolean> => ipcRenderer.invoke(IPC.memoryOpenDir) as Promise<boolean>,
    chooseDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.memoryChooseDir) as Promise<string | null>,
    exportTo: (dir: string): Promise<boolean> => ipcRenderer.invoke(IPC.memoryExport, dir) as Promise<boolean>,
    importFile: (): Promise<MemoryData | null> => ipcRenderer.invoke(IPC.memoryChooseImport) as Promise<MemoryData | null>
  },
  // 个性化台词（GLM 生成；未生成过时为 null，渲染层回退硬编码）
  linesGet: (): Promise<PersonalityLines | null> => ipcRenderer.invoke(IPC.linesGet) as Promise<PersonalityLines | null>,
  linesRefresh: (): Promise<PersonalityLines | null> => ipcRenderer.invoke(IPC.linesRefresh) as Promise<PersonalityLines | null>,
  // 定时提醒
  timers: {
    add: (text: string, fireAt: number): Promise<ScheduleTimer> =>
      ipcRenderer.invoke(IPC.timerAdd, text, fireAt) as Promise<ScheduleTimer>,
    list: (): Promise<ScheduleTimer[]> => ipcRenderer.invoke(IPC.timerList) as Promise<ScheduleTimer[]>,
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.timerRemove, id) as Promise<void>,
    onFire: (cb: (t: ScheduleTimer) => void): (() => void) => {
      const listener = (_e: unknown, t: ScheduleTimer): void => cb(t)
      ipcRenderer.on(IPC.timerFire, listener)
      return () => ipcRenderer.removeListener(IPC.timerFire, listener)
    }
  },
  // 待办
  todos: {
    list: (): Promise<TodoItem[]> => ipcRenderer.invoke(IPC.todoList) as Promise<TodoItem[]>,
    add: (text: string): Promise<TodoItem> => ipcRenderer.invoke(IPC.todoAdd, text) as Promise<TodoItem>,
    toggle: (id: string, done?: boolean): Promise<TodoItem | null> =>
      ipcRenderer.invoke(IPC.todoToggle, id, done) as Promise<TodoItem | null>,
    clearDone: (): Promise<number> => ipcRenderer.invoke(IPC.todoClearDone) as Promise<number>
  },
  // 番茄钟
  pomodoro: {
    start: (minutes?: number): Promise<PomodoroState> =>
      ipcRenderer.invoke(IPC.pomodoroStart, minutes) as Promise<PomodoroState>,
    startBreak: (minutes?: number): Promise<PomodoroState> =>
      ipcRenderer.invoke(IPC.pomodoroBreak, minutes) as Promise<PomodoroState>,
    stop: (): Promise<PomodoroState> => ipcRenderer.invoke(IPC.pomodoroStop) as Promise<PomodoroState>,
    status: (): Promise<PomodoroState> => ipcRenderer.invoke(IPC.pomodoroStatus) as Promise<PomodoroState>,
    onEvent: (cb: (ev: { kind: 'focusDone' | 'breakDone'; state: PomodoroState }) => void): (() => void) => {
      const listener = (_e: unknown, ev: { kind: 'focusDone' | 'breakDone'; state: PomodoroState }): void => cb(ev)
      ipcRenderer.on(IPC.pomodoroEvent, listener)
      return () => ipcRenderer.removeListener(IPC.pomodoroEvent, listener)
    }
  },
  // 天气
  weather: {
    get: (city?: string): Promise<WeatherNow> => ipcRenderer.invoke(IPC.weatherGet, city) as Promise<WeatherNow>
  },
  // v0.4 养成系统
  nurture: {
    feed: (itemId: 'fish' | 'snack' | 'cake'): Promise<{ ok: boolean; state: NurtureState; event?: NurtureEvent; reason?: 'full' | 'empty' }> =>
      ipcRenderer.invoke(IPC.nurtureFeed, itemId) as Promise<{ ok: boolean; state: NurtureState; event?: NurtureEvent; reason?: 'full' | 'empty' }>,
    drop: (): Promise<{ dropped: string | null; state: NurtureState }> =>
      ipcRenderer.invoke(IPC.nurtureDrop) as Promise<{ dropped: string | null; state: NurtureState }>,
    status: (): Promise<NurtureState> => ipcRenderer.invoke(IPC.nurtureState) as Promise<NurtureState>,
    addExp: (amount: number): Promise<NurtureState> =>
      ipcRenderer.invoke(IPC.nurtureAddExp, amount) as Promise<NurtureState>,
    addMood: (delta: number): Promise<NurtureState> =>
      ipcRenderer.invoke(IPC.nurtureAddMood, delta) as Promise<NurtureState>,
    onEvent: (cb: (ev: NurtureEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: NurtureEvent): void => cb(ev)
      ipcRenderer.on(IPC.nurtureEvent, listener)
      return () => ipcRenderer.removeListener(IPC.nurtureEvent, listener)
    }
  },
  // v0.6 聊天路由（技能路由在主进程执行）
  chatRoute: (input: ChatRouterInput): Promise<ChatRouterResult> =>
    ipcRenderer.invoke(IPC.chatRoute, input) as Promise<ChatRouterResult>,
  chatParseTimer: (
    text: string
  ): Promise<{ ok: boolean; delayMinutes: number | null; task: string }> =>
    ipcRenderer.invoke(IPC.chatParseTimer, text) as Promise<{ ok: boolean; delayMinutes: number | null; task: string }>,
  // v0.6 性格养成
  personalityBump: (
    dim: 'chatter' | 'clingy' | 'study' | 'explore'
  ): Promise<{ dimensions: { chatter: number; clingy: number; study: number; explore: number }; type: string }> =>
    ipcRenderer.invoke(IPC.personalityBump, dim) as Promise<any>,
  personalityGet: (): Promise<{ dimensions: { chatter: number; clingy: number; study: number; explore: number }; type: string }> =>
    ipcRenderer.invoke(IPC.personalityGet) as Promise<any>,
  // v0.6 银月日记 + 成就徽章
  diaryGenerate: (): Promise<{ ok: boolean; text: string; error?: string }> =>
    ipcRenderer.invoke(IPC.diaryGenerate) as Promise<any>,
  diaryList: (): Promise<Array<{ date: string; text: string }>> =>
    ipcRenderer.invoke(IPC.diaryList) as Promise<any>,
  achievementList: (): Promise<Array<{ id: string; unlockedAt: number }>> =>
    ipcRenderer.invoke(IPC.achievementList) as Promise<any>,
  achievementCheck: (): Promise<Array<{ id: string; emoji: string; name: string }>> =>
    ipcRenderer.invoke(IPC.achievementCheck) as Promise<any>,
  // v0.7 提醒统计：确认提醒时回填 SQLite
  statsAckReminder: (kind: 'water' | 'sedentary'): Promise<boolean> =>
    ipcRenderer.invoke(IPC.statsAckReminder, kind) as Promise<boolean>,
  // 剪贴板解读（全局快捷键触发）
  onClipboardAssist: (cb: (text: string) => void): (() => void) => {
    const listener = (_e: unknown, text: string): void => cb(text)
    ipcRenderer.on(IPC.assistClipboard, listener)
    return () => ipcRenderer.removeListener(IPC.assistClipboard, listener)
  },
  // 每日早报（主进程定时触发）
  onMorningReport: (cb: (report: MorningReport) => void): (() => void) => {
    const listener = (_e: unknown, r: MorningReport): void => cb(r)
    ipcRenderer.on(IPC.morningReport, listener)
    return () => ipcRenderer.removeListener(IPC.morningReport, listener)
  },
  asr: {
    status: (): Promise<AsrStatus> => ipcRenderer.invoke(IPC.asrStatus) as Promise<AsrStatus>,
    ensureModel: (): Promise<{ ok: boolean; status: AsrStatus }> =>
      ipcRenderer.invoke(IPC.asrEnsureModel) as Promise<{ ok: boolean; status: AsrStatus }>,
    modelUrl: (): Promise<{ url: string; port: number }> =>
      ipcRenderer.invoke(IPC.asrModelUrl) as Promise<{ url: string; port: number }>,
    onProgress: (cb: (r: number, t: number) => void): (() => void) => {
      const listener = (_e: unknown, p: { receivedBytes: number; totalBytes: number }): void =>
        cb(p.receivedBytes, p.totalBytes)
      ipcRenderer.on(IPC.asrProgress, listener)
      return () => ipcRenderer.removeListener(IPC.asrProgress, listener)
    }
  },
  // v0.8 自定义素材（用户自选目录）
  assets: {
    scan: (dir: string): Promise<AssetScanResult> =>
      ipcRenderer.invoke(IPC.assetsScan, dir) as Promise<AssetScanResult>,
    choose: (): Promise<{ dir: string; scan: AssetScanResult } | null> =>
      ipcRenderer.invoke(IPC.assetsChoose) as Promise<{ dir: string; scan: AssetScanResult } | null>,
    clear: (): Promise<boolean> => ipcRenderer.invoke(IPC.assetsClear) as Promise<boolean>,
    read: (
      dir: string,
      slotIds: string[]
    ): Promise<Partial<Record<'sprite' | 'lean' | 'peek' | 'actions' | 'walk', Record<string, string>>>> =>
      ipcRenderer.invoke(IPC.assetsRead, dir, slotIds) as Promise<
        Partial<Record<'sprite' | 'lean' | 'peek' | 'actions' | 'walk', Record<string, string>>>
      >,
    /** v0.8 素材调试：弹窗选多张 PNG 图片（返回文件路径列表，取消返回空数组） */
    pick: (): Promise<string[]> => ipcRenderer.invoke(IPC.assetsPick) as Promise<string[]>,
    /** v0.8 素材调试：按路径读 dataURL（key 为文件名含扩展名） */
    readFiles: (paths: string[]): Promise<Record<string, string>> =>
      ipcRenderer.invoke(IPC.assetsReadFiles, paths) as Promise<Record<string, string>>
  }
}

export type PetApi = typeof api

contextBridge.exposeInMainWorld('pet', api)
