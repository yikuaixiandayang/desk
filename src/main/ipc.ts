/** IPC 注册：渲染进程 <-> 主进程的安全桥接 */
import { ipcMain, app, screen, webContents, dialog, shell } from 'electron'
import {
  IPC,
  type AppConfigPatch,
  type ChatContext,
  type ChatMessage,
  type ChatRouterInput,
  type ChatRouterResult,
  type MemoryData,
  type PersonalityLines,
  type PetStoreState,
  type ScheduleTimer,
  type TtsSpeakResult,
  type TodoItem
} from '@shared/types'
import { unionRects } from '@shared/display'
import { routeChat, parseTimerViaGlm } from './services/chat-router'
import * as storeService from './services/store'
import { DEFAULT_PERSONALITY, type PersonalityDimensions, personalityType } from '@shared/personality'
import { chatWithGlm, chatRaw } from './services/glm'
import { sanitizeReply } from '@shared/prompts'
import { TIMER_PARSE_PROMPT, parseTimerJson } from '@shared/skills'
import * as asrService from './services/asr'
import { getConfig, setConfig, maskConfig } from './services/appconfig'
import { synthesize, listEdgeVoices, cleanupTts } from './services/ttssynth'
import * as memoryService from './services/memory'
import { getLines, refreshPersonalityLines } from './services/personality-lines'
import * as scheduler from './services/scheduler'
import * as todos from './services/todos'
import * as pomodoro from './services/pomodoro'
import * as nurture from './services/nurture'
import { getWeather } from './services/weather'
import { generateDiary, listDiary } from './services/diary'
import { checkAchievements } from '@shared/achievements'
import { migrateAchievementsFromStore,
  listUnlocked,
  upsertAchievement,
  ackLatestReminder,
  reminderStatsToday,
  consecutiveFullAckDays
} from './services/db'
import { scanAssets, readSlotAssets, isUsablePng } from './services/assets'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

export function registerIpc(getMainWindow: () => Electron.BrowserWindow | null): void {
  ipcMain.handle(IPC.appPing, () => ({ pong: true, version: app.getVersion() }))

  ipcMain.handle(IPC.storeGetState, () => storeService.getState())
  ipcMain.handle(IPC.storePatch, (_e, patch: Partial<PetStoreState>) => storeService.patchState(patch))

  ipcMain.handle(IPC.glmChat, (_e, payload: { history: ChatMessage[]; ctx: ChatContext; extras?: memoryExtras }) =>
    chatWithGlm(
      payload.history,
      payload.ctx,
      payload.extras ?? {}
    )
  )

  ipcMain.handle(IPC.glmParseTimer, async (_e, text: string) => {
    const r = await chatRaw(TIMER_PARSE_PROMPT, text, { temperature: 0, maxTokens: 120 })
    if (!r.ok) return { ok: false, delayMinutes: null, task: '', error: r.error }
    return { ok: true, ...parseTimerJson(r.content) }
  })

  ipcMain.on(IPC.winClickThrough, (e, enabled: boolean) => {
    const win = getMainWindow()
    if (!win || win.webContents !== e.sender) return
    win.setIgnoreMouseEvents(enabled, { forward: true })
  })

  ipcMain.on(IPC.winQuit, () => app.quit())
  ipcMain.on(IPC.winDevtools, (e) => {
    e.sender.openDevTools({ mode: 'detach' })
  })

  // 渲染层逐帧跟随宠物：把小窗口定位到屏幕坐标，使其能在各显示器间移动。
  // 注意：单个横跨多屏的“透明巨窗”会被 Windows DWM 裁剪到单屏，所以窗口保持小尺寸、由这里定位。
  // 钳制策略：
  //  - X轴：窗口中心落在所有显示器边界(bounds)的并集内，让宠物可贴近每块显示器的最左/最右。
  //  - Y轴：宠物的脚底（锚点 anchorY = h-12）落在所有显示器边界的并集内，让宠物可上到屏幕顶部
  //    下到任务栏顶部，同时保证宠物不会完全被拖出屏外。
  //    （顶部探头例外：允许脚底升出屏幕上缘最多 520px（窗口整体上移，超出部分由系统裁剪，
  //    实现“从屏幕顶部探出半个身位”的效果；520 覆盖最大缩放 2.0 时的抬升量）。
  //    底部趴下例外：允许脚底下沉最多 160px（趴姿素材底部透明留白补偿，超出屏幕部分被裁剪，
  //    使角色真正贴住任务栏）。
  ipcMain.on(IPC.winSetBounds, (e, x: number, y: number, w: number, h: number) => {
    const win = getMainWindow()
    if (!win || win.webContents !== e.sender) return
    try {
      const rw = Math.round(w)
      const rh = Math.round(h)
      const areas = screen.getAllDisplays().map((d) => d.bounds)
      const u = unionRects(areas) ?? screen.getPrimaryDisplay().bounds
      // X：窗口中心在桌面并集内
      const nx = Math.max(u.x - rw / 2, Math.min(u.x + u.width - rw / 2, Math.round(x)))
      // Y：宠物脚底（锚点 = h-12）在桌面并集内；顶部探头可向上越界 520px，趴下补偿可向下越界 160px
      const feet = Math.max(u.y - 520, Math.min(u.y + u.height + 160, Math.round(y) + (rh - 12)))
      const ny = feet - (rh - 12)
      win.setBounds({ x: nx, y: ny, width: rw, height: rh })
    } catch {
      /* 极端布局下 setBounds 可能被忽略 */
    }
  })

  ipcMain.handle(IPC.screenBounds, () => {
    // 多显示器：计算所有显示器边界（bounds，含任务栏区域）并集 + workArea 底部信息。
    // bounds 用于 squat 状态（贴底趴任务栏），workAreaBottom 用于非 squat 状态（自动与任务栏保持间距）。
    const displays = screen.getAllDisplays()
    const boundsAreas = displays.map((d) => d.bounds)
    const union = unionRects(boundsAreas) ?? screen.getPrimaryDisplay().bounds
    // workAreaBottom：所有显示器 workArea 底部的最小值（宠物站立时不能低于此值）
    let workAreaBottom = Infinity
    for (const d of displays) {
      // workArea 是任务栏上方的区域
      const waBottom = d.workArea.y + d.workArea.height
      if (waBottom < workAreaBottom) workAreaBottom = waBottom
    }
    if (!isFinite(workAreaBottom)) workAreaBottom = union.y + union.height
    return {
      x: union.x, y: union.y, width: union.width, height: union.height,
      workAreaBottom
    }
  })

  ipcMain.handle(IPC.appAutoLaunch, (_e, enable?: boolean) => {
    if (typeof enable === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: enable })
      const settings = storeService.get('settings')
      storeService.set('settings', { ...settings, autoLaunch: enable })
    }
    return app.getLoginItemSettings().openAtLogin
  })

  // 在文件管理器中打开数据目录（electron-store 本地存档）
  ipcMain.handle(IPC.openStorePath, () => {
    void shell.openPath(storeService.getStorePath())
    return true
  })

  // ---------- v0.2 运行时配置（后台控制台） ----------
  ipcMain.handle(IPC.appConfigGet, () => maskConfig(getConfig()))
  ipcMain.handle(IPC.appConfigSet, (_e, patch: AppConfigPatch) => maskConfig(setConfig(patch)))
  ipcMain.handle(IPC.appConfigTest, async () => {
    const started = Date.now()
    const r = await chatRaw('你是接口测试助手。无论用户说什么，只回复两个字：正常', 'ping', {
      temperature: 0,
      maxTokens: 16,
      timeoutMs: 15_000
    })
    return { ok: r.ok, reply: r.content, error: r.error, latencyMs: Date.now() - started, model: getConfig().api.model }
  })

  // ---------- TTS ----------
  ipcMain.handle(IPC.ttsSpeak, async (_e, text: string): Promise<TtsSpeakResult> => {
    const cfg = getConfig()
    if (cfg.tts.engine === 'sapi') return { ok: false, error: 'sapi 由渲染进程处理', engine: 'sapi' }
    return synthesize(text, cfg.tts)
  })
  ipcMain.handle(IPC.ttsVoices, async () => ({ edge: await listEdgeVoices() }))

  // ---------- 记忆 ----------
  ipcMain.handle(IPC.memoryGet, (): MemoryData => memoryService.getMemory())
  ipcMain.handle(IPC.memorySummarize, async (): Promise<MemoryData | null> => memoryService.summarizeMemory())
  ipcMain.handle(IPC.memorySetDir, (_e, dir: string) =>
    maskConfig(setConfig({ memory: { ...getConfig().memory, dir } }))
  )
  ipcMain.handle(IPC.memoryOpenDir, () => {
    memoryService.openMemoryDir()
    return true
  })
  ipcMain.handle(IPC.memoryChooseDir, async () => {
    const win = getMainWindow()
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0] ?? null
  })
  ipcMain.handle(IPC.memoryExport, (_e, dir: string) => memoryService.exportMemory(dir))
  ipcMain.handle(IPC.memoryChooseImport, async () => {
    const win = getMainWindow()
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: '记忆文件', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    return memoryService.importMemory(r.filePaths[0])
  })

  // ---------- 个性化台词（GLM 生成，不可用时为 null） ----------
  ipcMain.handle(IPC.linesGet, (): PersonalityLines | null => getLines())
  ipcMain.handle(IPC.linesRefresh, async (): Promise<PersonalityLines | null> => refreshPersonalityLines())

  // ---------- 定时提醒 ----------
  ipcMain.handle(IPC.timerAdd, (_e, text: string, fireAt: number): ScheduleTimer => scheduler.addTimer(text, fireAt))
  ipcMain.handle(IPC.timerList, (): ScheduleTimer[] => scheduler.listTimers().filter((t) => !t.done))
  ipcMain.handle(IPC.timerRemove, (_e, id: string) => scheduler.removeTimer(id))
  // 主→渲染事件通道（实际触发经 webContents.send，此处仅占位声明让 preload 可以监听）
  ipcMain.on(IPC.timerFire, () => { /* placeholder: main→renderer via webContents.send */ })

  // ---------- 待办 ----------
  ipcMain.handle(IPC.todoList, (): TodoItem[] => todos.listTodos())
  ipcMain.handle(IPC.todoAdd, (_e, text: string): TodoItem => todos.addTodo(text))
  ipcMain.handle(IPC.todoToggle, (_e, id: string, done?: boolean) => todos.toggleTodo(id, done))
  ipcMain.handle(IPC.todoClearDone, (): number => todos.clearDone())

  // ---------- v0.3 番茄钟 / 天气 / 助手 ----------
  ipcMain.handle(IPC.pomodoroStart, (_e, minutes?: number) => pomodoro.startPomodoro(minutes ?? 25))
  ipcMain.handle(IPC.pomodoroBreak, (_e, minutes?: number) => pomodoro.startBreak(minutes ?? 5))
  ipcMain.handle(IPC.pomodoroStop, () => pomodoro.stopPomodoro())
  ipcMain.handle(IPC.pomodoroStatus, () => pomodoro.getPomodoro())
  ipcMain.on(IPC.pomodoroEvent, () => { /* placeholder: main→renderer via webContents.send */ })

  // ---------- v0.4 养成系统 ----------
  ipcMain.handle(IPC.nurtureFeed, (_e, itemId: string) => nurture.feed(itemId as 'fish' | 'snack' | 'cake'))
  ipcMain.handle(IPC.nurtureDrop, () => nurture.dropItem())
  ipcMain.handle(IPC.nurtureState, () => nurture.getNurture())
  ipcMain.handle(IPC.nurtureAddExp, (_e, amount: number) => nurture.addExp(amount))
  // v0.7 心情值：渲染层按事件加减（互动+/探头回应+/无响应-/提醒超时-）
  ipcMain.handle(IPC.nurtureAddMood, (_e, delta: number) => nurture.addMood(delta))
  ipcMain.on(IPC.nurtureEvent, () => { /* placeholder: main→renderer via webContents.send */ })

  ipcMain.handle(IPC.weatherGet, (_e, city?: string) => getWeather(city))

  ipcMain.handle(IPC.glmAssist, async (_e, text: string, mode: string) => {
    const prompt =
      mode === 'translate'
        ? '你是翻译与讲解助手：把用户内容翻译成简体中文（若已是中文则简要解释其含义）。两句话以内，口语化，不要 Markdown。'
        : '你是知识讲解助手：用不超过三句话、口语化中文为用户讲解以下内容（术语、报错、概念皆可）。不要 Markdown。'
    const r = await chatRaw(prompt, text.slice(0, 2000), { temperature: 0.4, maxTokens: 400 })
    return { ok: r.ok, content: sanitizeReply(r.content), error: r.error }
  })

  // ---------- ASR 模型管理 ----------
  ipcMain.handle(IPC.asrStatus, () => asrService.getStatus())
  ipcMain.handle(IPC.asrEnsureModel, async () => {
    const ok = await asrService.ensureModel((r, t) => broadcastAsrProgress(r, t))
    return { ok, status: asrService.getStatus() }
  })
  ipcMain.handle(IPC.asrModelUrl, async () => {
    const port = await asrService.ensureLocalServer()
    return { url: asrService.modelHttpUrl(), port }
  })

  // ---------- v0.6 聊天路由（技能路由迁移到主进程） ----------
  ipcMain.handle(IPC.chatRoute, async (_e, input: ChatRouterInput): Promise<ChatRouterResult> => {
    return routeChat(input)
  })
  ipcMain.handle(IPC.chatParseTimer, async (_e, text: string) => {
    return parseTimerViaGlm(text)
  })

  // ---------- v0.6 性格养成 ----------
  ipcMain.handle(IPC.personalityBump, (_e, dim: 'chatter' | 'clingy' | 'study' | 'explore') => {
    const cur = storeService.get('personality') ?? { ...DEFAULT_PERSONALITY }
    const updated: PersonalityDimensions = { ...cur, [dim]: (cur[dim] ?? 0) + 1 }
    storeService.set('personality', updated)
    return { dimensions: updated, type: personalityType(updated) }
  })
  ipcMain.handle(IPC.personalityGet, () => {
    const cur = storeService.get('personality') ?? { ...DEFAULT_PERSONALITY }
    return { dimensions: cur, type: personalityType(cur) }
  })

  // ---------- v0.6 银月日记 + 成就徽章 ----------
  ipcMain.handle(IPC.diaryGenerate, () => generateDiary())
  ipcMain.handle(IPC.diaryList, () => listDiary())
  ipcMain.handle(IPC.achievementList, () => {
    // v0.7：一次性把 electron-store 里的历史解锁迁移进 SQLite，此后以 SQLite 为准
    migrateAchievementsFromStore(storeService.get('achievements') ?? [])
    return listUnlocked()
  })
  ipcMain.handle(IPC.achievementCheck, () => {
    const stats = storeService.get('stats')
    const nurtureState = storeService.get('nurture')
    const diaryEntries = (storeService.get('diary') as unknown as Array<{ date: string }>) ?? []
    const personality = storeService.get('personality') ?? { chatter: 0, clingy: 0, study: 0, explore: 0 }
    migrateAchievementsFromStore(storeService.get('achievements') ?? [])
    const alreadyUnlocked = listUnlocked()
    const waterStats = reminderStatsToday('water')
    const sedentaryStats = reminderStatsToday('sedentary')
    const newlyUnlocked = checkAchievements(
      {
        stats,
        nurture: nurtureState,
        totalDiaryEntries: diaryEntries.length,
        // 性格维度为累计计数（不归零），用作累计对话/摸头/番茄数的代理
        totalChatCount: personality.chatter,
        totalPatCount: personality.clingy,
        totalPomodoroCount: personality.study,
        hasFedBefore: nurtureState.lastFedAt > 0,
        consecutiveDays: 0, // TODO: 计算连续天数
        waterAckedToday: waterStats.acked,
        sedentaryAckedToday: sedentaryStats.acked,
        consecutiveFullAckDays: consecutiveFullAckDays()
      },
      alreadyUnlocked
    )
    if (newlyUnlocked.length > 0) {
      const now = Date.now()
      for (const a of newlyUnlocked) {
        upsertAchievement({ id: a.id, name: a.name, description: a.description, unlockedAt: now })
      }
      // 同步回 electron-store，保持旧读取路径兼容
      storeService.set('achievements', [...alreadyUnlocked, ...newlyUnlocked.map((a) => ({ id: a.id, unlockedAt: now }))])
    }
    return newlyUnlocked.map((a) => ({ id: a.id, emoji: a.emoji, name: a.name }))
  })

  // v0.7 提醒统计：渲染层确认提醒时回填 SQLite acked_at
  ipcMain.handle(IPC.statsAckReminder, (_e, kind: 'water' | 'sedentary') => {
    return ackLatestReminder(kind)
  })

  // ---------- v0.8 自定义素材（用户自选目录） ----------
  ipcMain.handle(IPC.assetsScan, (_e, dir: string) => {
    if (!dir) return { dir: '', slots: [] }
    return scanAssets(dir)
  })
  ipcMain.handle(IPC.assetsChoose, async () => {
    const win = getMainWindow()
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const dir = r.filePaths[0]
    // 直接返回扫描结果，由渲染层决定是否落配置
    return { dir, scan: scanAssets(dir) }
  })
  ipcMain.handle(IPC.assetsClear, () => {
    // 配置清空由渲染层用 config.set 完成（回到内置素材）
    return true
  })
  ipcMain.handle(IPC.assetsRead, async (_e, dir: string, slotIds: string[]) => {
    if (!dir) return {}
    return readSlotAssets(dir, slotIds as Array<'sprite' | 'lean' | 'peek' | 'actions' | 'walk'>)
  })
  // v0.8 素材调试：弹窗选多张图片文件（不落配置，渲染层临时应用）
  ipcMain.handle(IPC.assetsPick, async () => {
    const win = getMainWindow()
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    })
    if (r.canceled || r.filePaths.length === 0) return []
    return r.filePaths
  })
  // v0.8 素材调试：按文件路径读 dataURL（key 为文件名含扩展名），跳过不可用 PNG
  ipcMain.handle(IPC.assetsReadFiles, (_e, paths: string[]) => {
    const out: Record<string, string> = {}
    for (const p of paths) {
      if (!isUsablePng(p)) continue
      out[basename(p)] = `data:image/png;base64,${readFileSync(p).toString('base64')}`
    }
    return out
  })

  app.on('before-quit', () => {
    void cleanupTts()
  })
}

type memoryExtras = {
  memoryFacts?: string[]
  todos?: string[]
  nowText?: string
}

function broadcastAsrProgress(received: number, total: number): void {
  for (const wc of webContents.getAllWebContents()) {
    wc.send(IPC.asrProgress, { receivedBytes: received, totalBytes: total })
  }
}
