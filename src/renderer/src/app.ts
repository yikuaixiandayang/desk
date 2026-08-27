/** 应用编排：状态恢复、渲染循环、交互、聊天、情绪行为、提醒、记忆、控制台 */
import type { PetApi } from '../../preload/index'
import type {
  AppConfigPatch,
  AppRuntimeConfig,
  AssetSlotId,
  ChatMessage,
  EmotionKind,
  MemoryData,
  MoveMode,
  MorningReport,
  NurtureEvent,
  PetStoreState,
  PomodoroState,
  ReminderEvent,
  ScheduleTimer
} from '@shared/types'
import { ASSET_SLOTS } from '@shared/types'
import { SpriteSheet, IDLE_ACTION_NAMES, type ActionName } from './pet/sprite'
import { PetCanvas } from './pet/renderer'
import { clampToArea, edgeActionAt, maybeStartMove, peekFromEdge, scheduleNextMove, snapAnchorX, snapEdgeAt, stepMove, stepPeek, type Area, type MovementState, type PeekState } from './pet/movement'
import { interactionExp, moodDeltaFor, type InteractionKind } from '@shared/nurture'
import { behaviorOf, emotionOf, resolveEmotion, setEmotion } from './core/emotion'
import {
  asrFailedText,
  asrModelMissingText,
  greeting,
  handReaction,
  patReaction,
  pickLine,
  reminderAckText,
  reminderIgnoredText,
  reminderText,
  setDynamicLines,
  squatReaction,
  standUpReaction,
  tickleReaction,
  timerConfirmReply
} from './core/chat'
import { parseTimerIntent } from '@shared/skills'
import { wmoDesc } from '@shared/wmo'
import { Tts } from './voice/tts'
import { VoiceInput } from './voice/asr'
import { NoisePlayer } from './voice/noise'
import { Bubble } from './ui/bubble'
import { Panel } from './ui/panel'
import { Widget } from './ui/widget'
import { ITEMS, type ItemId } from '@shared/nurture'
import { detectFestival } from '@shared/festivals'

const PET_HEIGHT = 210

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export class PetApp {
  private state!: PetStoreState
  private config!: AppRuntimeConfig
  private memory: MemoryData = { facts: [], updatedAt: 0, summarizedCount: 0 }
  private sprite = new SpriteSheet()
  private canvas!: PetCanvas
  private bubble = new Bubble()
  private widget = new Widget()
  private panel!: Panel
  private tts: Tts
  private voice: VoiceInput
  private noise = new NoisePlayer()
  private move: MovementState
  private pomodoroCache: PomodoroState = { active: false, phase: 'focus', endsAt: 0, focusMin: 25 }
  private area: Area = { width: 0, height: 0 }
  private workAreaBottom = 0
  private lastFrameAt = 0
  private lastPatAt = 0
  private recording = false
  private chatting = false
  private reminderAckTimer: number | null = null
  private clickThrough = true
  private posSaveTimer: number | null = null
  private lastAmbientAt = 0
  private interactionTimes: number[] = []
  private lastChatterAt = Date.now()
  private assistantSinceSummary = 0
  private appStartAt = Date.now()
  private festivalToday = detectFestival()
  private riddlesToday = 0
  private lastRiddleDate = ''
  private patTimes: number[] = []
  private dblTimes: number[] = []
  // 探头探脑（v0.6 桌面物理互动）
  private peek: PeekState | null = null
  private peekOffsetX = 0
  private peekLiftY = 0
  private lastPeekAt = 0
  /** 演示按钮的方向轮换索引 */
  private peekDemoIdx = 0
  /** 强制趴在任务栏模式（由面板按钮触发，交互后自动退出） */
  private forceSquatMode = false
  // v0.7 边缘吸附：吸附到的屏幕边（null=未吸附）；吸附期间锁定位置并常驻半身探头素材
  private snapSide: 'left' | 'right' | 'top' | null = null
  // v0.9 无操作自动动作：上次触发时刻（0=未触发，新互动后重置）；“走到底部再趴下”进行中标记
  private lastAutoActionAt = 0
  private pendingAutoSquat = false
  /** 演示吸附的方向轮换索引 */
  private snapDemoIdx = 0
  // v0.7 偶发探头：等待回应的互动窗口（performance.now 时间轴）
  private peekInteractive: { side: 'left' | 'right' | 'top'; endsAt: number; rewarded: boolean } | null = null
  /** 偶发探头：走到边缘后待播放的方向 */
  private pendingOccasionalPeek: { side: 'left' | 'right' | 'top' } | null = null
  /** 下次偶发探头允许触发的最早时刻（Date.now 时间轴，每次探头后随机重排） */
  private peekDueAt = 0
  // v0.7 B 类动作：当前播放的动作（独立素材，2~3.5 秒）；interactive=true 为互动触发，不受工具条等 UI 打断
  private bAction: { name: ActionName; startedAt: number; durationMs: number; interactive?: boolean } | null = null
  private lastBActionAt = 0
  // 小窗跟随：窗口在屏幕上的左上角坐标 + 尺寸 + 宠物在窗口内的固定锚点
  private winX = 0
  private winY = 0
  private winW = 400
  private winH = 580
  private anchorX = 200
  private anchorY = 448
  private winDirty = false

  /** 有效底部限制：非 squat 时使用 workAreaBottom（自动与任务栏保持间距），
   *  squat 时 = 任务栏顶部 + 趴姿帧底部透明留白补偿（图底下沉留白量后，
   *  可见角色正好趴在任务栏上沿，既不悬空也不盖住任务栏） */
  private effectiveBottomLimit(): number {
    if (this.move.phase === 'squat' || this.forceSquatMode) {
      return this.workAreaBottom + this.sprite.squatPadMax(this.effectivePetHeight())
    }
    return this.workAreaBottom
  }

  constructor(private pet: PetApi) {
    this.tts = new Tts(pet)
    this.voice = new VoiceInput(pet)
    this.move = { x: 0, y: 0, targetX: 0, targetY: 0, phase: 'idle', facing: 1, nextMoveAt: 0 }
  }

  async init(): Promise<void> {
    this.state = await this.pet.getState()
    this.config = await this.pet.config.get()
    this.memory = await this.pet.memory.get()
    // 动态台词（GLM 生成）：启动时拉取一次，greeting/pat 等优先用它，无则硬编码兜底
    setDynamicLines(await this.pet.linesGet())
    const bounds = await this.pet.getWorkArea()
    // 活动范围以主进程返回的“实际窗口边界”为准（已强制覆盖所有显示器边界并集，含任务栏区域）。
    // area 携带并集矩形左上角坐标(x,y)，使多显示器与负坐标场景下宠物也能遍布整块桌面。
    this.area = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    this.workAreaBottom = bounds.workAreaBottom ?? bounds.y + bounds.height

    await this.sprite.load()
    const canvasEl = document.getElementById('stage') as HTMLCanvasElement
    this.canvas = new PetCanvas(canvasEl, this.sprite)
    this.resizeCanvas()

    this.tts.enabled = this.state.settings.ttsEnabled
    this.tts.applyConfig(this.config.tts)
    void this.tts.initSapi().then((ok) => {
      if (!ok) console.log('[pet] 系统无中文语音包（sapi 备援不可用，神经语音不受影响）')
    })

    const autoLaunch = await this.pet.getAutoLaunch()
    this.panel = new Panel(this.pet, this.tts, {
      onSend: (text) => void this.handleSend(text, 'chat'),
      onMicToggle: () => void this.toggleMic(),
      onStatePatch: (patch) => this.patchState(patch),
      onQuit: () => this.pet.quit(),
      onDownloadModel: () => void this.downloadAsrModel(),
      onMoveMode: (mode) => void this.setMoveMode(mode),
      onPetScale: (scale) => void this.setPetScale(scale),
      onPetConfig: (patch) => void this.applyConfigPatch({ pet: patch }),
      onTtsConfig: (patch) => void this.applyConfigPatch({ tts: patch }),
      onTtsTest: () => void this.testTts(),
      onApiConfig: (patch) => void this.applyConfigPatch({ api: patch }),
      onApiTest: () => void this.testApi(),
      onMemoryConfig: (patch) => void this.applyConfigPatch({ memory: patch }),
      onMemorySummarize: () => void this.summarizeMemory(true),
      onMemoryChooseDir: () => void this.chooseMemoryDir(),
      onMemoryOpen: () => void this.pet.memory.openDir(),
      onMemoryExport: () => void this.exportMemory(),
      onMemoryImport: () => void this.importMemory(),
      onTodoView: () => void this.viewTodos(),
      onTodoClear: () => void this.clearDoneTodos(),
      onRemoveTimer: (id) => void this.removeTimer(id),
      onFeed: (itemId) => void this.feedPet(itemId),
      onCtxPat: () => this.ctxPat(),
      onNurtureConfig: (patch) => void this.applyConfigPatch({ nurture: patch }),
      onAssistantConfig: (patch) => {
        if (patch.widgetEnabled !== undefined) {
          this.patchState({ settings: { ...this.state.settings, widgetEnabled: patch.widgetEnabled } })
          this.widget.setEnabled(patch.widgetEnabled)
        }
        if (patch.morningReportAt !== undefined) {
          void this.applyConfigPatch({ assistant: { morningReportAt: patch.morningReportAt } })
        }
      },
      onDiary: () => void this.viewDiary(),
      onSquatAction: (action) => {
        if (action === 'force') {
          this.forceSquat()
          this.panel.setSquatActive(true)
          const line = squatReaction()
          this.bubble.show(line, { durationMs: 4000, emotion: 'calm' })
          void this.tts.speak(line, { rateMul: 0.95, pitchMul: 0.9 })
        } else {
          this.exitSquatMode()
          this.panel.setSquatActive(false)
          const line = standUpReaction()
          this.bubble.show(line, { durationMs: 4000, emotion: 'happy' })
          void this.tts.speak(line)
        }
      },
      onPeekTest: () => this.peekDemo(),
      onWalkTest: () => this.walkDemo(),
      onSnapTest: () => this.snapDemo(),
      onPomodoroStart: (minutes) => {
        void this.pet.pomodoro.start(minutes ?? 25).then((s) => {
          this.pomodoroCache = s
          this.panel.setPomodoroState(true, Math.max(0, s.endsAt - Date.now()) / 1000)
        })
      },
      onPomodoroStop: () => {
        void this.pet.pomodoro.stop().then((s) => {
          this.pomodoroCache = s
          this.panel.setPomodoroState(false)
        })
      },
      onAssetsChoose: () => void this.chooseAssetsDir(),
      onAssetsDebug: () => void this.debugAssets(),
      onAssetsReset: () => void this.resetAssets(),
      onLinesConfig: (patch) => void this.applyConfigPatch({ lines: patch }),
      onReportConfig: (patch) => void this.applyConfigPatch({ assistant: patch })
    })
    this.panel.hydrate(this.state, this.config, autoLaunch)
    this.panel.setMemoryInfo(this.memory)
    this.panel.setNurture(this.state.nurture)
    // 初始化小卡片状态
    this.widget.setEnabled(this.state.settings.widgetEnabled ?? false)
    // 加载性格类型并显示
    void this.pet.personalityGet().then((p) => {
      this.panel.setPersonality(p.type)
    })
    // 加载已解锁成就并显示
    void this.pet.achievementList().then((list) => {
      this.panel.setAchievements(list)
    })

    // 恢复宠物位置
    const h = this.effectivePetHeight()
    const bl = this.workAreaBottom
    const restored =
      this.state.pet.x !== null && this.state.pet.y !== null
        ? clampToArea(this.state.pet.x, this.state.pet.y, this.area, this.petWidth(), h, { bottomLimit: bl })
        : clampToArea(this.area.width * 0.7, this.workAreaBottom - h, this.area, this.petWidth(), h, { bottomLimit: bl })
    this.move.x = restored.x
    this.move.y = restored.y
    scheduleNextMove(this.move, performance.now(), Math.random)

    // 按当前宠物尺寸/位置初始化小窗口（尺寸 + 锚点 + 定位），使其跟随宠物跨屏
    this.applyWindowSize()

    this.bindPointer(canvasEl)
    this.bindKeys()
    this.pet.onReminder((ev) => this.handleReminder(ev))
    this.pet.onTrayToggle(() => this.panel.openChat())
    this.pet.timers.onFire((t) => this.handleTimerFire(t))
    this.pet.pomodoro.onEvent((ev) => this.handlePomodoroEvent(ev))
    this.pet.nurture.onEvent((ev) => this.handleNurtureEvent(ev))
    this.pet.onClipboardAssist((text) => void this.handleClipboardAssist(text))
    this.pet.onMorningReport((r) => this.handleMorningReport(r))
    this.pet.onScreenChanged(() => void this.refetchArea())
    window.addEventListener('resize', () => this.resizeCanvas())

    setInterval(() => this.neglectTick(), 30_000)
    setInterval(() => this.moodTick(), 30_000)
    setInterval(() => this.satietyTick(), 60_000)
    setInterval(() => this.tickDailyStats(), 30_000)
    // 初始化时立即刷新一次日常速览
    this.tickDailyStats()
    // 小卡片定时刷新（每秒更新倒计时/时钟）
    setInterval(() => this.tickWidget(), 1000)
    this.tickWidget()
    // 恢复重启前未完成的番茄钟状态
    void this.pet.pomodoro.status().then((s) => {
      this.pomodoroCache = s
      if (s.active && this.panel.menuOpen) {
        const remaining = Math.max(0, s.endsAt - Date.now()) / 1000
        this.panel.setPomodoroState(true, remaining)
      }
    })

    this.frame(performance.now())

    // 加载探头素材与 B 类动作素材（异步，失败不阻塞主流程；缺失时渲染降级）
    void this.sprite.loadPeekImages()
    void this.sprite.loadActionImages()
    // v0.8 应用用户自定义素材（若有 assetsDir）
    void this.reloadAssets()
    // v0.7 偶发探头：启动后随机 20-40 分钟内择机触发
    this.scheduleNextPeekDue()

    const greet =
      this.customLine('greeting') ??
      (this.config.pet.greeting.trim() || (this.festivalToday?.greeting ?? greeting(this.state.nurture.level, new Date().getHours())))
    this.bubble.show(greet, { durationMs: 8000 })
    void this.tts.speak(greet)
    // 节日粒子效果
    if (this.festivalToday?.particle) {
      const top = this.anchorY - this.effectivePetHeight()
      this.canvas.effects.spawn(this.festivalToday.particle as any, this.anchorX, top + 30, 6)
    }
    console.log('[pet] ready (v0.8)')
  }

  // ---------- 配置 ----------

  private async applyConfigPatch(patch: AppConfigPatch): Promise<void> {
    this.config = await this.pet.config.set(patch)
    this.tts.applyConfig(this.config.tts)
  }

  private async setMoveMode(mode: MoveMode): Promise<void> {
    this.config = await this.pet.config.set({ pet: { moveMode: mode } })
    this.panel.updateMoveButton(mode)
    this.bubble.show(mode === 'auto' ? `好嘞，${this.petName()}自由漫步～` : `收到，${this.petName()}就在原地待命。`, { durationMs: 3000 })
    if (mode === 'still') {
      this.move.phase = 'idle'
      this.move.targetX = this.move.x
      this.move.targetY = this.move.y
    }
  }

  /** v0.8 把用户素材目录的覆盖应用到精灵（按活动槽位读取 dataURL），并刷新面板状态 */
  private async reloadAssets(): Promise<void> {
    const dir = this.config.pet.assetsDir
    if (!dir) {
      await this.sprite.resetToBundled()
      this.panel.setAssetsScan({ dir: '', slots: [] })
      return
    }
    const scan = await this.pet.assets.scan(dir)
    const active: string[] = scan.slots.filter((s) => s.active).map((s) => s.id)
    const overrides = await this.pet.assets.read(dir, active)
    await this.sprite.applyOverrides(overrides)
    this.panel.setAssetsScan(scan)
  }

  /** v0.8 弹出素材目录选择（主进程），落配置并立即热加载 */
  private async chooseAssetsDir(): Promise<void> {
    const r = await this.pet.assets.choose()
    if (!r) return
    this.config = await this.pet.config.set({ pet: { assetsDir: r.dir } })
    await this.reloadAssets()
    this.bubble.show('素材已加载，拖到屏幕边缘看看效果吧～', { durationMs: 4000, emotion: 'happy' })
  }

  /** v0.8 恢复内置素材 */
  private async resetAssets(): Promise<void> {
    this.config = await this.pet.config.set({ pet: { assetsDir: '' } })
    await this.reloadAssets()
    this.bubble.show('已恢复内置素材。', { durationMs: 3000 })
  }

  /** v0.8 素材调试：选图片按槽位命名临时应用到宠物（不落配置，「恢复默认」还原）。
   *  匹配规则与素材目录一致：合图文件名（actions.png 等）整槽替换，否则按散图全名（act_*.png 等）逐个匹配。 */
  private async debugAssets(): Promise<void> {
    const paths = await this.pet.assets.pick()
    if (paths.length === 0) return
    const files = await this.pet.assets.readFiles(paths)
    const overrides: Partial<Record<AssetSlotId, Record<string, string>>> = {}
    const matched: string[] = []
    for (const slot of ASSET_SLOTS) {
      if (slot.sheet && files[slot.sheet]) {
        overrides[slot.id] = { [slot.sheet]: files[slot.sheet] }
        matched.push(slot.label)
        continue
      }
      const part: Record<string, string> = {}
      for (const f of slot.files) if (files[f]) part[f] = files[f]
      if (Object.keys(part).length > 0) {
        overrides[slot.id] = part
        matched.push(slot.label)
      }
    }
    if (matched.length === 0) {
      this.bubble.show('选中的图不匹配任何素材槽位命名，参考：actions.png / act_stretch.png / walk.png / peek_left.png 等。', { durationMs: 6000 })
      return
    }
    await this.sprite.resetToBundled()
    await this.sprite.applyOverrides(overrides)
    this.bubble.show(`已调试应用：${matched.join('、')}（未保存，点「恢复默认」还原）`, { durationMs: 5000, emotion: 'happy' })
  }

  private async setPetScale(scale: number): Promise<void> {
    this.config = await this.pet.config.set({ pet: { scale } })
    // 缩放后宠物占位尺寸变化，重新约束位置并同步小窗口尺寸
    const c = clampToArea(this.move.x, this.move.y, this.area, this.petWidth(), this.effectivePetHeight(), { bottomLimit: this.effectiveBottomLimit() })
    this.move.x = c.x
    this.move.y = c.y
    // v0.7 吸附中：按新尺寸重新贴边
    if (this.snapSide) this.enterSnap(this.snapSide)
    this.applyWindowSize()
    this.scheduleSavePos()
  }

  private async testApi(): Promise<void> {
    this.panel.setApiTestResult(true, '测试中…')
    const r = await this.pet.config.test()
    const text = r.ok ? `✓ ${r.model} ${r.latencyMs}ms「${r.reply.slice(0, 10)}」` : `✗ ${r.error?.slice(0, 40)}`
    this.panel.setApiTestResult(r.ok, text)
  }

  private async testTts(): Promise<void> {
    this.panel.setTtsTestResult(true, '合成中…')
    const engine = await this.tts.speak('主人，这是银月现在的声音，好听吗？')
    const label = engine === 'edge' ? '神经语音' : engine === 'custom' ? '自定义端点' : engine === 'sapi' ? '系统语音' : '不可用'
    this.panel.setTtsTestResult(engine !== '', engine === '' ? '发声失败' : `✓ ${label}`)
  }

  /** 强制趴在任务栏 */
  private forceSquat(): void {
    this.forceSquatMode = true
    this.move.phase = 'squat'
    this.move.targetX = this.move.x
    this.move.targetY = this.move.y
    // 定位到屏幕最底部（任务栏顶部附近），含 lean 图底部留白补偿
    this.move.y = this.effectiveBottomLimit()
    this.move.x = Math.max(this.area.x ?? 0 + 8, Math.min((this.area.x ?? 0) + this.area.width - 8, this.move.x))
    this.move.facing = 1
    this.winDirty = true
  }

  /** 从趴下站起（任意模式）：切站立并收回底部留白补偿，避免站姿沉入任务栏 */
  private standUpFromSquat(): void {
    if (this.move.phase !== 'squat') return
    this.move.phase = 'idle'
    const c = clampToArea(this.move.x, this.move.y, this.area, this.petWidth(), this.effectivePetHeight(), { bottomLimit: this.workAreaBottom })
    this.move.y = c.y
    this.move.targetX = this.move.x
    this.move.targetY = this.move.y
    this.winDirty = true
  }

  /** 退出强制趴下模式（交互时自动调用） */
  private exitSquatMode(): void {
    if (!this.forceSquatMode) return
    this.forceSquatMode = false
    this.panel.setSquatActive(false)
    this.standUpFromSquat()
  }

  // ---------- 主循环 ----------

  private frame = (now: number): void => {
    try {
      this._frameInner(now)
    } catch (err) {
      console.error('[pet] frame 异常（已跳过）:', err)
    }
    requestAnimationFrame(this.frame)
  }

  private _frameInner(now: number): void {
    const dt = this.lastFrameAt ? Math.min(100, now - this.lastFrameAt) : 16
    this.lastFrameAt = now

    const emotion = this.currentEmotion(now)
    const behavior = behaviorOf(emotion)
    const uiBusy = this.panel.chatOpen || this.panel.menuOpen || this.panel.ctxMenuOpen || this.panel.toolbarOpen || this.bubble.hasActions || this.recording
    const canWander =
      this.config.pet.moveMode === 'auto' && !behavior.refuseMove && !uiBusy && this.move.phase !== 'drag' && this.move.phase !== 'squat' && this.snapSide === null && this.pendingOccasionalPeek === null
    const petH = this.effectivePetHeight()
    if (canWander) {
      maybeStartMove(this.move, now, Math.random, this.area, this.petWidth(), petH)
    } else if (this.move.phase === 'walk' && !canWander && this.config.pet.moveMode === 'still') {
      this.move.phase = 'idle'
    }
    const arrived = stepMove(this.move, dt, (this.config.pet.walkSpeedPxSec ?? 130) * behavior.moveSpeedMul)
    if (arrived) {
      if (this.pendingAutoSquat) {
        // 自动动作：走到底部 → 趴在任务栏上沿
        this.pendingAutoSquat = false
        this.move.phase = 'squat'
        this.move.y = this.effectiveBottomLimit()
        this.move.targetX = this.move.x
        this.move.targetY = this.move.y
        this.winDirty = true
      } else if (this.pendingOccasionalPeek) {
        // v0.7 偶发探头：走到边缘 → 开始探头并开启等待回应窗口（时长 + 2 秒宽限）
        const side = this.pendingOccasionalPeek.side
        this.pendingOccasionalPeek = null
        this.startPeek(now, side)
        this.peekInteractive = { side, endsAt: now + (this.peek?.durationMs ?? 3000) + 2000, rewarded: false }
      } else {
        scheduleNextMove(this.move, now, Math.random, behavior.moveIntervalMul, this.config.nurture.moveIntervalSec)
      }
    }

    // v0.7 偶发探头无人回应：到期心情 -1（计入冷落时长 = 不重置互动计时）
    if (this.peekInteractive && !this.peekInteractive.rewarded && now > this.peekInteractive.endsAt) {
      this.peekInteractive = null
      void this.pet.nurture.addMood(-1).then((n) => {
        this.state.nurture = n
        this.panel.setNurture(n)
      })
    }

    // 无操作自动动作：超过等待阈值后随机执行 趴下/吸附/探头/走动 之一；
    // 持续无操作时每隔 cooldown 换一个动作（自动解除上一个姿势），新互动后重置
    if (this.config.pet.autoSquatEnabled && !uiBusy && this.move.phase !== 'drag' && this.pendingOccasionalPeek === null) {
      const idleMs = Date.now() - (this.state.stats.lastInteractionAt || this.appStartAt)
      const threshold = (this.config.pet.autoSquatIdleSec ?? 30) * 1000
      if (idleMs < threshold) {
        this.lastAutoActionAt = 0
      } else if (this.lastAutoActionAt === 0 || Date.now() - this.lastAutoActionAt >= Math.max(threshold, 90_000)) {
        this.performAutoAction(now)
      }
    }

    let frame = behavior.frame
    if (behavior.altFrame >= 0 && Math.floor(now / 4000) % 5 === 0) frame = behavior.altFrame
    // 趴任务栏：使用 sheet 内的 leanSleep/leanSmile 帧交替（renderer 根据 squat 标志走对应分支）
    let squatFlag = false
    if (this.move.phase === 'squat') {
      frame = Math.floor(now / 2000) % 2 === 0 ? 8 : 9   // 8=leanSleep / 9=leanSmile
      squatFlag = true
    }
    // 探头探脑动画（边缘探头）——在 render 输入之前计算
    const peek = this.updatePeek(now, uiBusy)
    // v0.7 边缘吸附：无临时探头动画时常驻显示吸附边的半身素材（缓慢交替张望帧）
    const peekSide = peek.side ?? this.snapSide
    const peekFrame = peekSide ? (Math.floor(now / (peek.side ? 500 : 800)) % 2 === 0 ? 0 : 1) : 0

    // v0.7 B 类动作：待机随机播放（探头/趴下/吸附期间不播）
    this.updateBAction(now, uiBusy)
    const actionName = this.bAction?.name ?? null

    // 趴下时：不使用 peek.liftY，不使用情绪 droop，让 lean 图紧贴底部
    const renderDroop = squatFlag ? 0 : behavior.droop
    const renderLiftY = squatFlag ? 0 : peek.liftY

    // 情绪氛围粒子
    if (behavior.ambient && now - this.lastAmbientAt > 2200) {
      this.lastAmbientAt = now
      this.canvas.effects.spawn(behavior.ambient, this.anchorX + (Math.random() - 0.5) * 60, this.anchorY - petH + 46, 1)
    }

    // 每帧把小窗口定位到宠物（仅移动或尺寸变化时发送 IPC，静止帧跳过）
    if (this.move.phase === 'walk' || this.move.phase === 'drag' || arrived || this.winDirty || peek.offsetX !== 0 || peek.liftY !== 0) {
      this.placeWindow()
    }

    this.canvas.render(
      {
        frame,
        x: this.anchorX,
        y: this.anchorY,
        facing: this.move.facing,
        height: petH,
        now,
        walking: this.move.phase === 'walk',
        dragging: this.move.phase === 'drag',
        bounceMul: behavior.bounceMul,
        droop: renderDroop,
        liftY: renderLiftY,
        squat: squatFlag,
        peekSide,
        peekFrame,
        actionName
      },
      dt
    )

    this.layoutUi()
  }

  /**
   * 探头探脑调度：
   * - 贴近左/右屏幕边缘 → 半个身位滑出屏外再缩回（窗口随之偏移，超出屏幕部分由系统裁剪）
   * - 贴近屏幕上边缘 → 窗口向上抬升半个身位再缩回（使用 peekTop 素材从屏幕顶部"探出头"）
   * 触发条件（可在系统设置调整）：贴边静止超过 peekIdleSec、距上次探头超过 peekIntervalSec。
   * v0.7：吸附状态（snapSide）下不再触发临时探头（常驻素材已展示）；低饱食（<30）时触发权重提高（讨食）。
   */
  private updatePeek(now: number, uiBusy: boolean): { offsetX: number; liftY: number; side: 'left' | 'right' | 'top' | null } {
    // 走动/拖拽/交互中 → 立即取消探头与待触发的探头
    if (uiBusy || this.move.phase === 'walk' || this.move.phase === 'drag') {
      this.cancelPeek()
      return { offsetX: 0, liftY: 0, side: null }
    }
    if (this.peek) {
      if (now - this.peek.startedAt >= this.peek.durationMs) {
        this.peek = null
        this.peekOffsetX = 0
        this.peekLiftY = 0
        this.winDirty = true
        return { offsetX: 0, liftY: 0, side: null }
      }
      const p = stepPeek(this.peek, now)
      this.peekOffsetX = this.peek.offsetX * p
      this.peekLiftY = this.peek.liftY * p
      return { offsetX: this.peekOffsetX, liftY: this.peekLiftY, side: this.peek.side }
    }
    // 常规触发：贴边静止超时 + 间隔达标 + 小概率（满足条件后平均约 2 秒内触发）；
    // 低饱食时概率提高（讨食吸引注意）。吸附状态下常驻素材已可见，跳过。
    if (this.snapSide === null) {
      const idleMs = Date.now() - (this.state.stats.lastInteractionAt || this.appStartAt)
      const idleNeedMs = Math.max(5, this.config.pet.peekIdleSec ?? 20) * 1000
      const gapNeedMs = Math.max(10, this.config.pet.peekIntervalSec ?? 30) * 1000
      const base = this.state.nurture.satiety < 30 ? 0.02 : 0.008
      if (idleMs > idleNeedMs && now - this.lastPeekAt > gapNeedMs && Math.random() < base) {
        const act = edgeActionAt(this.move, this.area, this.petWidth(), this.effectivePetHeight())
        if ((act === 'peekLeft' || act === 'peekRight' || act === 'peekTop') && this.move.phase !== 'squat') {
          this.startPeek(now, act === 'peekLeft' ? 'left' : act === 'peekRight' ? 'right' : 'top')
        }
      }
    }
    return { offsetX: 0, liftY: 0, side: null }
  }

  /** 立即开始一次探头动画（时长/幅度取自用户设置；素材自带朝向，不改 move.facing） */
  private startPeek(now: number, side: 'left' | 'right' | 'top'): void {
    this.peek = peekFromEdge(now, side, this.petWidth(), this.effectivePetHeight(), {
      durationSec: this.config.pet.peekDurationSec ?? 3,
      offsetRatio: this.config.pet.peekOffsetRatio ?? 0.55
    })
    this.lastPeekAt = now
    this.scheduleNextPeekDue()
    this.winDirty = true
  }

  /** 取消探头动画与待触发的探头（含偶发探头的行进计划），并复位窗口偏移 */
  private cancelPeek(): void {
    this.peek = null
    this.pendingOccasionalPeek = null
    this.peekOffsetX = 0
    this.peekLiftY = 0
    this.winDirty = true
  }

  /** v0.7 进入边缘吸附：把宠物推到屏幕边缘并常驻半身探头素材（窗口越界部分由系统裁剪），锁定位置直到再次拖拽。
   *  v0.8 左/右向内缩进 snapInsetPx，保证 on-screen 半侧罩住人脸（“半遮掩”不消失）。 */
  private enterSnap(side: 'left' | 'right' | 'top'): void {
    const ax = this.area.x ?? 0
    const ay = this.area.y ?? 0
    const inset = this.config.pet.snapInsetPx ?? 16
    if (side === 'top') {
      // 顶部倒挂：脚底在屏幕上缘下方 0.75 个身位 → 图上 25%（手/爪）被上缘裁掉，露出头到肩
      this.move.y = ay + this.effectivePetHeight() * 0.75
    } else {
      this.move.x = snapAnchorX(side, ax, this.area.width, inset)
    }
    this.snapSide = side
    this.move.phase = 'idle'
    this.move.targetX = this.move.x
    this.move.targetY = this.move.y
    this.cancelPeek()
    this.bAction = null
    this.winDirty = true
    this.scheduleSavePos()
  }

  /** v0.7 脱离边缘吸附（拖拽开始时调用） */
  private releaseSnap(): void {
    if (this.snapSide === null) return
    this.snapSide = null
    this.winDirty = true
  }

  /** v0.7 偶发探头下次允许触发的时刻：随机 [freqMin, freqMax] 分钟 */
  private scheduleNextPeekDue(): void {
    const min = Math.max(5, this.config.pet.peekFreqMin ?? 20)
    const max = Math.max(min, this.config.pet.peekFreqMax ?? 40)
    this.peekDueAt = Date.now() + (min + Math.random() * (max - min)) * 60_000
  }

  /**
   * v0.7 偶发探头：长时间无互动时走到最近的屏幕边缘探头张望吸引注意。
   * 条件：开关开启、不在对话/录音/专注期/提醒待确认、距上次互动>15 分钟、
   * 距上次探头超过随机间隔（默认 20-40 分钟）、当日次数未达上限。
   */
  private maybeOccasionalPeek(now: number): void {
    if (!(this.config.pet.peekEnabled ?? true)) return
    if (this.peekInteractive || this.pendingOccasionalPeek || this.peek || this.snapSide) return
    const focusing = this.pomodoroCache.active && this.pomodoroCache.phase === 'focus'
    if (
      this.chatting || this.recording || focusing ||
      this.bubble.visible || this.bubble.hasActions ||
      this.panel.chatOpen || this.panel.menuOpen || this.panel.ctxMenuOpen || this.panel.toolbarOpen
    ) return
    const last = this.state.stats.lastInteractionAt || this.appStartAt
    if ((now - last) / 60_000 <= 15) return
    if (now < this.peekDueAt) return
    // 当日计数（跨天重置）
    const today = new Date().toISOString().slice(0, 10)
    if (this.state.stats.lastPeekDate !== today) {
      this.state.stats.lastPeekDate = today
      this.state.stats.peeksToday = 0
    }
    if (this.state.stats.peeksToday >= (this.config.pet.peekMaxPerDay ?? 5)) return
    const side = this.nearestEdgeSide()
    if (!side) return
    // 记次数并随机重排下次时间
    this.state.stats.peeksToday++
    this.patchState({ stats: this.state.stats })
    this.scheduleNextPeekDue()
    // 走向该边缘，到达后由主循环触发探头
    const ax = this.area.x ?? 0
    const ay = this.area.y ?? 0
    const petW = this.petWidth()
    const petH = this.effectivePetHeight()
    if (side === 'left') {
      this.move.targetX = ax + petW * 0.5
      this.move.targetY = this.move.y
    } else if (side === 'right') {
      this.move.targetX = ax + this.area.width - petW * 0.5
      this.move.targetY = this.move.y
    } else {
      this.move.targetX = this.move.x
      this.move.targetY = ay + petH + 12
    }
    this.move.facing = this.move.targetX >= this.move.x ? 1 : -1
    this.move.phase = 'walk'
    this.pendingOccasionalPeek = { side }
  }

  /** 距宠物中心最近的屏幕边（左/右/上） */
  private nearestEdgeSide(): 'left' | 'right' | 'top' | null {
    const ax = this.area.x ?? 0
    const ay = this.area.y ?? 0
    const dLeft = this.move.x - ax
    const dRight = ax + this.area.width - this.move.x
    const dTop = this.move.y - ay - this.effectivePetHeight() // 以宠物头顶算顶部距离
    const best = Math.min(dLeft, dRight, dTop)
    if (best === dLeft) return 'left'
    if (best === dRight) return 'right'
    if (best === dTop) return 'top'
    return null
  }

  /** v0.7 偶发探头被回应：撒娇情绪 + 心形粒子 + 心情 +5 */
  private rewardPeekResponse(): void {
    if (!this.peekInteractive || this.peekInteractive.rewarded) return
    if (performance.now() > this.peekInteractive.endsAt) {
      this.peekInteractive = null
      return
    }
    this.peekInteractive.rewarded = true
    this.peekInteractive = null
    void this.pet.nurture.addMood(moodDeltaFor('peekAck')).then((n) => {
      this.state.nurture = n
      this.panel.setNurture(n)
    })
    this.triggerEmotion('coax')
    const top = this.anchorY - this.effectivePetHeight()
    this.canvas.effects.spawn('heart', this.anchorX, top + 30, 8)
    this.canvas.effects.spawn('sparkle', this.anchorX + 30, top + 50, 4)
    const line = pick(['呀，被主人发现啦～', '嘿嘿，主人看到银月探头了吗？', '主人终于理银月了！开心～'])
    this.bubble.show(line, { durationMs: 4000, emotion: 'coax' })
    void this.tts.speak(line, { rateMul: 1, pitchMul: 1.12 })
  }

  /** v0.7 B 类动作：待机随机播放（平均约 1 分钟一次），被交互/移动打断 */
  private updateBAction(now: number, uiBusy: boolean): void {
    if (this.bAction) {
      // 互动触发的动作（握手/挠痒）不因工具条等 UI 打开而打断
      const busyBlock = uiBusy && !this.bAction.interactive
      if (busyBlock || this.move.phase === 'walk' || this.move.phase === 'drag' || this.peek || this.move.phase === 'squat') {
        this.bAction = null
        return
      }
      if (now - this.bAction.startedAt >= this.bAction.durationMs) {
        this.bAction = null
        this.lastBActionAt = now
      }
      return
    }
    if (uiBusy || this.move.phase !== 'idle' || this.peek || this.snapSide) return
    if (now - this.lastBActionAt < 45_000 || Math.random() > 0.0015) return
    this.playAction(pick(IDLE_ACTION_NAMES))
  }

  /** 播放一个 B 类动作（素材缺失时静默跳过）；interactive=true 表示由点击互动触发，不受 UI 打断 */
  private playAction(name: ActionName, interactive = false): void {
    if (!this.sprite.actionAvailable(name)) return
    this.bAction = { name, startedAt: performance.now(), durationMs: 2600 + Math.random() * 900, interactive }
  }

  /** 面板“演示探头”按钮：优先演示当前贴边方向，否则循环演示 左→上→右 */
  private peekDemo(): void {
    this.standUpFromSquat()
    this.exitSquatMode()
    this.releaseSnap()
    const act = edgeActionAt(this.move, this.area, this.petWidth(), this.effectivePetHeight())
    let side: 'left' | 'right' | 'top'
    if (act === 'peekLeft') side = 'left'
    else if (act === 'peekRight') side = 'right'
    else if (act === 'peekTop') side = 'top'
    else {
      const cycle: Array<'left' | 'top' | 'right'> = ['left', 'top', 'right']
      side = cycle[this.peekDemoIdx % cycle.length]
      this.peekDemoIdx++
    }
    this.startPeek(performance.now(), side)
  }

  /** 无操作自动动作：随机执行 趴下/左右上吸附/探头/走动 之一，让宠物空闲时也保持生动。
   *  仅在 autoSquatEnabled 且空闲超阈值时由主循环调用；执行前先解除当前趴下/吸附姿势 */
  private performAutoAction(now: number): void {
    this.lastAutoActionAt = Date.now()
    const opts = ['squat', 'snap', 'peek', 'walk'] as const
    const act = opts[Math.floor(Math.random() * opts.length)]
    if (act === 'squat') {
      if (this.move.phase === 'squat') return
      this.releaseSnap()
      this.cancelPeek()
      if (this.move.y >= this.workAreaBottom - 20) {
        // 已在底部附近：原地趴下（先切相位再取含留白补偿的底部限制）
        this.move.phase = 'squat'
        this.move.y = this.effectiveBottomLimit()
        this.move.targetX = this.move.x
        this.move.targetY = this.move.y
        this.winDirty = true
      } else {
        // 离底部较远：先走到底部，到达后由主循环趴下
        this.pendingAutoSquat = true
        this.move.targetX = this.move.x
        this.move.targetY = this.workAreaBottom
        this.move.phase = 'walk'
      }
      return
    }
    // 其余动作先解除当前趴下/吸附
    this.standUpFromSquat()
    this.exitSquatMode()
    this.releaseSnap()
    this.cancelPeek()
    if (act === 'snap') {
      const sides: Array<'left' | 'right' | 'top'> = ['left', 'right', 'top']
      this.enterSnap(sides[Math.floor(Math.random() * sides.length)])
      return
    }
    if (act === 'peek') {
      const sides: Array<'left' | 'top' | 'right'> = ['left', 'top', 'right']
      this.startPeek(now, sides[Math.floor(Math.random() * sides.length)])
      return
    }
    // walk：立即随机一个漫步目标（不依赖行为模式的自主wander）
    this.move.nextMoveAt = 0
    maybeStartMove(this.move, now, Math.random, this.area, this.petWidth(), this.effectivePetHeight())
  }

  /** 面板“演示行走”按钮：解除趴下/吸附后立即走一段（不受“原地待命”模式限制） */
  private walkDemo(): void {
    this.standUpFromSquat()
    this.exitSquatMode()
    this.releaseSnap()
    this.cancelPeek()
    this.pendingAutoSquat = false
    this.move.nextMoveAt = 0
    maybeStartMove(this.move, performance.now(), Math.random, this.area, this.petWidth(), this.effectivePetHeight())
    this.bubble.show('散步去咯～', { durationMs: 2000, emotion: 'happy' })
  }

  /** 面板“演示吸附”按钮：循环演示 左→上→右 边缘吸附 */
  private snapDemo(): void {
    this.standUpFromSquat()
    this.exitSquatMode()
    this.cancelPeek()
    const sides: Array<'left' | 'top' | 'right'> = ['left', 'top', 'right']
    const side = sides[this.snapDemoIdx % 3]
    this.snapDemoIdx++
    this.enterSnap(side)
  }

  private layoutUi(): void {
    // 气泡/面板锚定在宠物正上方（窗口内相对坐标，因宠物固定绘制在锚点处）
    const petTop = this.anchorY - this.effectivePetHeight()
    this.bubble.position(this.anchorX, petTop)
    this.panel.position(this.anchorX, petTop)
    // 小卡片跟随宠物（仅静止时更新位置）
    if (this.move.phase !== 'walk' && this.move.phase !== 'drag') {
      this.widget.position(this.anchorX, petTop)
    }
  }

  private resizeCanvas(): void {
    // 画布绘制面尺寸 = 小窗口尺寸（仅包住宠物 + 上方气泡/特效空间）。
    // 活动范围 this.area 由主进程边界（多屏并集）决定，引擎此处不可覆盖。
    this.canvas.resize(this.winW, this.winH, window.devicePixelRatio || 1)
  }

  /** 计算窗口尺寸：宽度需容纳控制台（560px）；高度需容纳宠物 + 上方气泡/控制台。
   *  控制台完整高度 ≈ 标签栏(42) + 滚动区(≤322) ≈ 364px，叠加气泡余量向上预留 500px，
   *  否则面板顶部（标签栏）会被窗口上缘裁剪导致标签不可见、滚动区不可操作 */
  private windowSize(): { w: number; h: number } {
    const petH = this.effectivePetHeight()
    const w = 600
    const h = Math.ceil(petH + 500)
    return { w, h }
  }

  /** 尺寸/缩放变化时重算窗口尺寸与锚点，并立即把窗口定位到宠物 */
  private applyWindowSize(): void {
    const { w, h } = this.windowSize()
    this.winW = w
    this.winH = h
    this.anchorX = w / 2
    this.anchorY = h - 12
    this.winDirty = true
    this.canvas.resize(this.winW, this.winH, window.devicePixelRatio || 1)
    this.placeWindow(true)
  }

  /** 把小窗口定位到“宠物屏幕坐标 − 固定锚点”，使其跟随宠物在各显示器间移动；
   *  peekOffsetX 为左右探头附加水平偏移；peekLiftY 为顶部探头附加向上抬升（窗口上移，让角色探出屏幕顶部） */
  private placeWindow(force = false): void {
    const wx = Math.round(this.move.x - this.anchorX + this.peekOffsetX)
    const wy = Math.round(this.move.y - this.anchorY - this.peekLiftY)
    if (!force && wx === this.winX && wy === this.winY && !this.winDirty) return
    this.winX = wx
    this.winY = wy
    this.winDirty = false
    this.pet.setWindowBounds(wx, wy, this.winW, this.winH)
  }

  /** 显示器布局变化时重新拉取活动范围，并重新约束宠物位置与小窗口 */
  private async refetchArea(): Promise<void> {
    const b = await this.pet.getWorkArea()
    this.area = { x: b.x, y: b.y, width: b.width, height: b.height }
    this.workAreaBottom = b.workAreaBottom ?? b.y + b.height
    const c = clampToArea(this.move.x, this.move.y, this.area, this.petWidth(), this.effectivePetHeight(), { bottomLimit: this.effectiveBottomLimit() })
    this.move.x = c.x
    this.move.y = c.y
    // v0.7 吸附中：按新屏幕布局重新贴边
    if (this.snapSide) this.enterSnap(this.snapSide)
    this.applyWindowSize()
  }

  private petScale(): number {
    return this.config?.pet.scale ?? 1
  }

  /** 宠物自称：优先自定义昵称，默认「银月」 */
  private petName(): string {
    return (this.config?.pet.name ?? '').trim() || '银月'
  }

  /** v0.8 自定义台词：从 config.lines 取多行候选随机一条；留空返回 null（用内置） */
  private customLine(key: 'greeting' | 'pat' | 'hug' | 'angry' | 'hand' | 'tickle'): string | null {
    const raw = this.config?.lines?.[key] ?? ''
    const arr = raw.split('\n').map((s) => s.trim()).filter(Boolean)
    if (arr.length === 0) return null
    return pick(arr)
  }

  /** 拍头台词：自定义优先，否则按等级内置 */
  private patLine(): string {
    return this.customLine('pat') ?? patReaction(this.state.nurture.level)
  }

  /** v0.9 握手台词：自定义优先，否则内置 */
  private handLine(): string {
    return this.customLine('hand') ?? handReaction()
  }

  /** v0.9 挠痒台词：自定义优先，否则内置 */
  private tickleLine(): string {
    return this.customLine('tickle') ?? tickleReaction()
  }

  /** v0.9 点击分区判定：以宠物包围盒计算相对位置（x: 0=左缘 1=右缘，y: 0=头顶 1=脚底）
   *  - 上部 35% → 摸头；下部 28% → 挠痒痒（脚/裙摆）
   *  - 中段左右两侧 30% → 握手（手/袖口）；中段中央视为摸头 */
  private hitZone(clientX: number, clientY: number): 'pat' | 'hand' | 'tickle' {
    const h = this.effectivePetHeight()
    const w = this.petWidth()
    const top = this.anchorY - h
    const relY = (clientY - top) / h
    const relX = (clientX - (this.anchorX - w / 2)) / w
    if (relY <= 0.35) return 'pat'
    if (relY >= 0.72) return 'tickle'
    if (relX <= 0.3 || relX >= 0.7) return 'hand'
    return 'pat'
  }

  private effectivePetHeight(): number {
    return PET_HEIGHT * this.petScale()
  }

  private petWidth(): number {
    return this.effectivePetHeight() * (this.sprite.cellW / this.sprite.cellH)
  }

  // ---------- 情绪与状态 ----------

  private currentEmotion(now: number): EmotionKind {
    this.state.emotion = resolveEmotion(this.state.emotion, this.state.nurture.level, now)
    return emotionOf(this.state.emotion, this.state.nurture.level, now)
  }

  /** v0.7 情绪 → B 类动作映射（触发情绪时待机则顺带播放补强动作） */
  private static readonly EMOTION_ACTION: Partial<Record<EmotionKind, ActionName>> = {
    angry: 'stomp',
    sad: 'pout',
    happy: 'spin',
    excited: 'jump',
    sleepy: 'yawn',
    curious: 'think',
    bored: 'think',
    coax: 'shake',
    surprised: 'jump',
    mischievous: 'shake',
    lovestruck: 'spin'
  }

  private triggerEmotion(kind: EmotionKind): void {
    this.state.emotion = setEmotion(this.state.emotion, kind, Date.now())
    // v0.7 情绪补强：待机且无探头/吸附时播放对应 B 类动作
    const act = PetApp.EMOTION_ACTION[kind]
    if (act && this.move.phase === 'idle' && !this.peek && this.snapSide === null && !this.bAction) {
      this.playAction(act)
    }
    const top = this.anchorY - this.effectivePetHeight()
    if (kind === 'happy') {
      this.canvas.effects.spawn('sparkle', this.anchorX + 30, top + 30, 4)
      this.canvas.effects.spawn('heart', this.anchorX - 30, top + 50, 2)
    }
    if (kind === 'angry') {
      this.canvas.effects.spawn('anger', this.anchorX + 40, top + 20, 3)
    }
    if (kind === 'coax') {
      this.canvas.effects.spawn('heart', this.anchorX, top + 40, 3)
    }
    if (kind === 'surprised') {
      this.canvas.effects.spawn('sparkle', this.anchorX, top + 30, 5)
    }
  }

  /** 周期性情绪调度：困倦/无聊/兴奋 + 主动搭话 */
  private moodTick(): void {
    const now = Date.now()
    const hour = new Date().getHours()
    const last = this.state.stats.lastInteractionAt || this.appStartAt
    const idleMin = (now - last) / 60_000
    const st = this.state.emotion

    // 兴奋：10 分钟内 3 次以上互动且好感度足够
    this.interactionTimes = this.interactionTimes.filter((t) => now - t < 600_000)
    if (this.interactionTimes.length >= 3 && this.state.nurture.level >= 3 && st.until === null) {
      this.triggerEmotion('excited')
    }
    // 深夜困倦
    if ((hour >= 23 || hour < 6) && idleMin > 3 && (st.until === null || st.current === 'bored')) {
      this.triggerEmotion('sleepy')
    }
    // 白天无聊
    if (idleMin > 30 && this.state.nurture.level >= 3 && st.until === null && hour >= 8 && hour < 23) {
      this.triggerEmotion('bored')
    }
    // 谜语触发（无聊 + 空闲 >20分钟，10% 概率，每天最多 2 次）
    if (
      idleMin > 20 &&
      hour >= 8 && hour < 23 &&
      !this.bubble.visible &&
      !this.chatting &&
      !this.recording &&
      !(this.pomodoroCache.active && this.pomodoroCache.phase === 'focus')
    ) {
      const today = new Date().toDateString()
      if (this.lastRiddleDate !== today) {
        this.riddlesToday = 0
        this.lastRiddleDate = today
      }
      if (this.riddlesToday < 2 && Math.random() < 0.1) {
        this.riddlesToday++
        // 通过 chat-router 设置 pendingRiddle（主进程存储）
        void this.pet.chatRoute({
          text: '出个谜语',
          history: [],
          ctx: { emotion: this.currentEmotion(now), level: this.state.nurture.level, satiety: this.state.nurture.satiety },
          nowText: this.nowText()
        }).then((result) => {
          this.bubble.show(result.reply, { durationMs: 12000, emotion: 'excited' })
          void this.tts.speak(result.reply)
        })
      }
    }
    // 冷落生气：长时间无互动（>15 分钟）→ 生气抱怨被忽视（不扣数值，只切情绪）
    if (idleMin > 15 && st.until === null && hour >= 8 && hour < 23) {
      this.triggerEmotion('angry')
      const line = pick(['哼，主人都好久没理银月了……', '……银月在生气，主人知道吗？', '一直不理人家，银月不高兴了！'])
      this.bubble.show(line, { durationMs: 6000, emotion: 'angry' })
      void this.tts.speak(line, { rateMul: 0.95, pitchMul: 0.96 })
    }

    // 主动搭话（白天常规；深夜仅困倦劝睡，间隔更长；专注中不打扰）
    // v0.7 低饱食（<30）讨食：搭话间隔减半，更频繁讨吃的
    const emotion = this.currentEmotion(now)
    const night = hour >= 23 || hour < 6
    const focusing = this.pomodoroCache.active && this.pomodoroCache.phase === 'focus'
    const chatterIdleMin = night ? 25 : 18
    const customChatter = this.config.pet.chatterIntervalMin ?? 0
    const hungry = this.state.nurture.satiety < 30
    const chatterGapMs = hungry
      ? Math.max(3 * 60_000, (customChatter > 0 ? customChatter * 60_000 : night ? 40 * 60_000 : 28 * 60_000) / 2)
      : customChatter > 0 ? customChatter * 60_000 : night ? 40 * 60_000 : 28 * 60_000
    if (
      !focusing &&
      (night || (hour >= 8 && hour < 23)) &&
      idleMin > chatterIdleMin &&
      now - this.lastChatterAt > chatterGapMs &&
      !this.bubble.visible &&
      !this.chatting &&
      !this.recording
    ) {
      const behavior = behaviorOf(emotion)
      const line = hungry
        ? pick(['主人……银月肚子饿了，有好吃的吗？', '呜……好饿呀，喂喂银月嘛～', '肚子咕咕叫了……小鱼干还有吗？'])
        : night && behavior.chatter.length > 0 ? behavior.chatter[behavior.chatter.length - 1] : pick(behavior.chatter)
      this.lastChatterAt = now
      this.bubble.show(line, { durationMs: 7000, emotion: hungry ? 'sad' : undefined })
      void this.tts.speak(line, { rateMul: behavior.ttsRateMul, pitchMul: behavior.ttsPitchMul })
    }

    // v0.7 偶发探头（独立于搭话：走到屏幕边缘探头张望吸引注意）
    this.maybeOccasionalPeek(now)
  }

  // ---------- 好感度 ----------

  private applyInteraction(kind: InteractionKind): void {
    const now = Date.now()
    const exp = interactionExp(kind, now, this.lastPatAt)
    // 摸头/握手/挠痒共用加经验冷却，防止连点刷经验
    if (kind === 'pat' || kind === 'hand' || kind === 'tickle') this.lastPatAt = now
    if (exp > 0) {
      // 互动加经验 → 升级由主进程 nurture 服务判定
      void this.pet.nurture.addExp(exp).then((n) => {
        this.state.nurture = n
        this.panel.setNurture(n)
      })
      this.triggerEmotion('happy')
    }
    // v0.7 互动加心情（聊天+2 / 摸头+2 / 拥抱+4 / 确认提醒+3；喂食与探头回应在各自流程加）
    void this.pet.nurture.addMood(moodDeltaFor(kind)).then((n) => {
      this.state.nurture = n
      this.panel.setNurture(n)
    })
    this.interactionTimes.push(now)
    this.state.stats.lastInteractionAt = now
    if (kind === 'chat' || kind === 'asrChat') this.state.stats.chatsToday++
    if (kind === 'pat') this.state.stats.patsToday++
    if (kind === 'hand') this.state.stats.handsToday++
    if (kind === 'tickle') this.state.stats.ticklesToday++
    if (kind === 'reminderAck') this.state.stats.acksToday++
    this.patchState({ stats: this.state.stats })
    this.tickDailyStats()
    // 性格养成：根据互动类型增加对应维度
    if (kind === 'chat' || kind === 'asrChat') {
      void this.pet.personalityBump('chatter').then((p) => this.panel.setPersonality(p.type))
    }
    if (kind === 'pat' || kind === 'hug' || kind === 'hand' || kind === 'tickle') {
      void this.pet.personalityBump('clingy').then((p) => this.panel.setPersonality(p.type))
    }
    // 互动随机掉落道具
    if (kind === 'chat' || kind === 'asrChat' || kind === 'pat' || kind === 'hand' || kind === 'tickle') {
      void this.tryDropItem()
    }
    // 成就检查（每次互动后）
    void this.pet.achievementCheck().then((newly) => {
      for (const ach of newly) {
        this.triggerEmotion('happy')
        this.canvas.effects.spawn('sparkle', this.anchorX, this.anchorY - this.effectivePetHeight() + 30, 6)
        this.bubble.show(`成就解锁！${ach.emoji} ${ach.name}`, { durationMs: 5000, emotion: 'happy' })
      }
    })
  }

  private patchState(patch: Partial<PetStoreState>): void {
    void this.pet.patchState(patch).then((s) => {
      if (patch.settings) this.tts.enabled = patch.settings.ttsEnabled
      this.state = { ...this.state, ...s }
    })
  }

  /** 刷新控制台「今日速览」统计：活跃时长由主进程每 30 秒按键鼠活跃累计（仅真实使用），
   *  此处拉取最新值，不做本地插值（会把待机/开机时间混进去） */
  private tickDailyStats(): void {
    void this.pet.getState().then((s) => {
      this.state.stats = { ...this.state.stats, activeSecondsToday: s.stats.activeSecondsToday }
      this.panel.refreshDailyStats({
        activeSecondsToday: s.stats.activeSecondsToday,
        chatsToday: this.state.stats.chatsToday,
        pomodorosToday: this.state.stats.pomodorosToday,
        keysToday: s.stats.keysToday,
        keyCharsToday: s.stats.keyCharsToday,
        keySpaceToday: s.stats.keySpaceToday,
        keyEnterToday: s.stats.keyEnterToday
      })
    })
  }

  /** 刷新桌面小卡片（倒计时/时钟） */
  private tickWidget(): void {
    this.widget.setPomodoro(this.pomodoroCache.active && this.pomodoroCache.endsAt > Date.now(), this.pomodoroCache.endsAt)
    this.widget.refresh()
    // 同步番茄时钟状态到设置面板
    if (this.pomodoroCache.active) {
      const remaining = Math.max(0, this.pomodoroCache.endsAt - Date.now()) / 1000
      this.panel.setPomodoroState(true, remaining)
    } else if (this.panel.isPomodoroActive()) {
      this.panel.setPomodoroState(false)
    }
  }

  private neglectTick(): void {
    // 好感度已并入养成等级（只升不降），冷落情绪由 moodTick 按 idleMin 驱动，此处仅保留位置持久化
    this.scheduleSavePos()
  }

  private scheduleSavePos(): void {
    if (this.posSaveTimer !== null) clearTimeout(this.posSaveTimer)
    this.posSaveTimer = window.setTimeout(() => {
      this.posSaveTimer = null
      this.patchState({ pet: { x: this.move.x, y: this.move.y, scale: this.petScale() } })
    }, 2000)
  }

  // ---------- 指针交互 ----------

  private bindPointer(canvasEl: HTMLCanvasElement): void {
    let dragging = false
    let downX = 0
    let downY = 0
    let grabDx = 0
    let grabDy = 0
    /** 按下时的鼠标键：0=左 2=右（按设置 dragButton 决定哪个键可拖动） */
    let downButton: number | null = null
    const dragBtn = this.config.pet.dragButton === 'left' ? 0 : 2

    canvasEl.addEventListener('pointerdown', (e) => {
      if (!this.canvas.hitTest(e.clientX, e.clientY, this.anchorX, this.anchorY, this.effectivePetHeight())) return
      // 交互时解除坐下/趴下吸附并取消探头动画；吸附状态由右键拖拽脱离
      this.pendingAutoSquat = false
      this.standUpFromSquat()
      this.exitSquatMode()
      this.releaseSnap()
      this.cancelPeek()
      downButton = e.button
      dragging = false
      downX = e.clientX
      downY = e.clientY
      // e.clientX/Y 是窗口内相对坐标，需换算成屏幕坐标再与宠物屏幕坐标求差
      const sx = e.clientX + this.winX
      const sy = e.clientY + this.winY
      grabDx = this.move.x - sx
      grabDy = this.move.y - sy
      canvasEl.setPointerCapture(e.pointerId)
    })

    canvasEl.addEventListener('pointermove', (e) => {
      // 只有设置里选中的按键按住才能拖动宠物；放在上面(未按住)不算移动
      if (downButton !== dragBtn) return
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
      if (moved > 6) {
        if (!dragging) dragging = true
        this.move.phase = 'drag'
        // 把指针窗口内相对坐标换算成屏幕坐标，再叠加抓取偏移
        const sx2 = e.clientX + this.winX
        const sy2 = e.clientY + this.winY
        const c = clampToArea(sx2 + grabDx, sy2 + grabDy, this.area, this.petWidth(), this.effectivePetHeight(), { bottomLimit: this.effectiveBottomLimit() })
        this.move.x = c.x
        this.move.y = c.y
        this.scheduleSavePos()
      }
    })

    canvasEl.addEventListener('pointerup', (e) => {
      const btn = downButton
      downButton = null
      if (btn === null) return
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
      const wasDrag = dragging
      dragging = false

      // 拖拽键移动结束 → 边缘吸附/停留
      if (btn === dragBtn && wasDrag) {
        // 默认停在原地；开启“边缘吸附”后：
        // 下缘 → 趴任务栏；左/右/上缘（中心点落在距边 10% 区域内，封顶 200px）→
        // 吸附到最近边缘并常驻半身探头素材，锁定位置直到再次拖拽。
        this.snapSide = null
        const squatAct = this.config.pet.edgeSnap
          ? edgeActionAt(this.move, this.area, this.petWidth(), this.effectivePetHeight())
          : null
        const side = this.config.pet.edgeSnap ? snapEdgeAt(this.move, this.area) : null
        if (squatAct === 'squat') {
          this.move.phase = 'squat'
          this.move.y = this.effectiveBottomLimit()
          this.move.targetX = this.move.x
          this.move.targetY = this.move.y
          this.bubble.show('趴下了～', { durationMs: 2000, emotion: 'coax' })
        } else if (side) {
          this.enterSnap(side)
        } else {
          this.move.phase = 'idle'
          this.move.targetX = this.move.x
          this.move.targetY = this.move.y
          scheduleNextMove(this.move, performance.now() + 8000, Math.random)
        }
        this.winDirty = true // 确保最终位置发送到主进程
        return
      }
      // 右键轻点（未拖动）→ 打开右键菜单
      if (btn === 2) {
        if (!wasDrag && moved <= 6) this.panel.openCtxMenu(e.clientX, e.clientY)
        return
      }

      // 以下为左键轻点：仅互动，不拖动
      if (btn !== 0 || moved > 6) return
      // 快速轻点分三级：先判双击拥抱（300ms 窗口，优先匹配清晰手势），
      // 再判连续 5 次"戳戳"（5 秒窗口），其余视为拍头。
      // 命中任一分支后清空两组计数，避免点击次数在多个手势间互相污染。
      // v0.7：偶发探头等待回应期间，点击优先按“探头被回应”处理（撒娇+心情+5）。
      const now = Date.now()
      if (this.peekInteractive) {
        this.rewardPeekResponse()
        return
      }
      // --- 双击拥抱检测（最窄窗口，优先） ---
      this.dblTimes = this.dblTimes.filter((t) => now - t < 300)
      this.dblTimes.push(now)
      if (this.dblTimes.length >= 2) {
        this.dblTimes = []
        this.patTimes = []
        this.applyInteraction('hug')
        this.triggerEmotion('coax')
        const top = this.anchorY - this.effectivePetHeight()
        this.canvas.effects.spawn('heart', this.anchorX, top + 30, 8)
        this.canvas.effects.spawn('sparkle', this.anchorX, top + 50, 4)
        const line = this.customLine('hug') ?? pickLine('hug', pick(['主人抱抱～银月最喜欢抱抱了！', '嗯……被抱着好温暖。', '再多抱一会儿嘛～']))
        this.bubble.show(line, { durationMs: 4000, emotion: 'coax' })
        void this.tts.speak(line, { rateMul: 1, pitchMul: 1.15 })
        return
      }
      // --- 5 秒内 5 次连点 → 生气抗议 ---
      this.patTimes = this.patTimes.filter((t) => now - t < 5000)
      this.patTimes.push(now)
      if (this.patTimes.length >= 5) {
        this.patTimes = []
        this.dblTimes = []
        this.triggerEmotion('angry')
        // v0.8 被连点生气：扣心情 -2（计入冷落/递进惩罚体系）
        void this.pet.nurture.addMood(-2).then((n) => {
          this.state.nurture = n
          this.panel.setNurture(n)
        })
        this.canvas.effects.spawn('anger', e.clientX + 20, e.clientY - 30, 4)
        const line = this.customLine('angry') ?? pickLine('angry', pick(['哎呀！别戳了，疼！', '哼，主人怎么一直戳银月！生气了！', '住手啦——银月不是玩具！']))
        this.bubble.show(line, { durationMs: 4000, emotion: 'angry' })
        void this.tts.speak(line, { rateMul: 0.95, pitchMul: 0.96 })
        return
      }
      // --- 常规轻点：按点击位置分区互动（摸头/握手/挠痒），顺带 toggle 工具条 ---
      const zone = this.hitZone(e.clientX, e.clientY)
      if (zone === 'hand') {
        this.applyInteraction('hand')
        this.playAction('hold', true)
        this.canvas.effects.spawn('sparkle', e.clientX, e.clientY - 20, 4)
        const line = this.handLine()
        this.bubble.show(line, { durationMs: 3500, emotion: 'happy' })
        void this.tts.speak(line, { rateMul: 1, pitchMul: 1.05 })
      } else if (zone === 'tickle') {
        this.applyInteraction('tickle')
        this.playAction('tickle', true)
        this.canvas.effects.spawn('sparkle', e.clientX, e.clientY - 20, 5)
        const line = this.tickleLine()
        this.bubble.show(line, { durationMs: 3500, emotion: 'surprised' })
        void this.tts.speak(line, { rateMul: 1.1, pitchMul: 1.2 })
      } else {
        this.applyInteraction('pat')
        this.canvas.effects.spawn('heart', e.clientX, e.clientY - 20, 3)
        const line = this.patLine()
        this.bubble.show(line, { durationMs: 3500 })
        void this.tts.speak(line)
      }
      // 左键单击 toggle 精简工具条（对话+语音）；设置入口仅保留右键菜单
      this.panel.toolbarOpen ? this.panel.hideToolbar() : this.panel.showToolbar()
    })

    window.addEventListener(
      'pointermove',
      (e) => {
        const overPet = this.canvas.hitTest(e.clientX, e.clientY, this.anchorX, this.anchorY, this.effectivePetHeight())
        const el = document.elementFromPoint(e.clientX, e.clientY)
        const overUi = el !== null && el !== canvasEl
        const shouldPass = !overPet && !overUi
        if (shouldPass !== this.clickThrough) {
          this.clickThrough = shouldPass
          this.pet.setClickThrough(shouldPass)
        }
      },
      { passive: true }
    )

    // 工具条不自动弹出，由左键单击 toggle（见 pointerup pat 分支）

    // Ctrl+滚轮：悬停宠物时缩放（与控制台滑条同步）
    window.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey) return
        const overPet = this.canvas.hitTest(e.clientX, e.clientY, this.anchorX, this.anchorY, this.effectivePetHeight())
        if (!overPet) return
        e.preventDefault()
        const cur = this.petScale()
        const next = Math.max(0.5, Math.min(2, +(cur + (e.deltaY < 0 ? 0.05 : -0.05)).toFixed(2)))
        if (next === cur) return
        void this.setPetScale(next).then(() => this.panel.setPetScale(next))
      },
      { passive: false }
    )

    // 右键：按住拖动宠物；仅当右键轻点（未拖动，见 pointerup）才弹菜单。
    // 这里只抑制系统原生菜单，避免右键按住拖动时菜单跟着弹出。
    canvasEl.addEventListener('contextmenu', (e) => {
      const overPet = this.canvas.hitTest(e.clientX, e.clientY, this.anchorX, this.anchorY, this.effectivePetHeight())
      if (!overPet) return
      e.preventDefault()
    })
    // 点菜单外关闭右键菜单
    window.addEventListener('pointerdown', (e) => {
      if (!this.panel.ctxMenuOpen) return
      if (!(e.target as HTMLElement)?.closest('#ctxmenu')) this.panel.closeCtxMenu()
    })
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F12') this.pet.openDevtools()
      // 输入法组合键处理（如拼音按 Esc 取消候选）不关面板
      if (e.isComposing) return
      if (e.key === 'Escape') {
        this.panel.closeMenu()
        this.panel.closeChat()
        this.panel.closeCtxMenu()
      }
    })
  }

  // ---------- 聊天与本地技能路由 ----------

  private nowText(): string {
    const d = new Date()
    return `${d.getMonth() + 1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  private async handleSend(text: string, kind: 'chat' | 'asrChat'): Promise<void> {
    if (this.chatting || !text.trim()) return
    this.chatting = true
    // v0.7 偶发探头：对话也算回应（撒娇+心情+5）
    if (this.peekInteractive) this.rewardPeekResponse()
    this.applyInteraction(kind)
    const userMsg: ChatMessage = { role: 'user', content: text.trim(), ts: Date.now() }

    // 主进程聊天路由（本地技能 + GLM + 降级，一次 IPC 完成）
    this.bubble.show('银月思考中', { typing: true, durationMs: 0 })
    const ctx = {
      emotion: this.currentEmotion(Date.now()),
      level: this.state.nurture.level,
      satiety: this.state.nurture.satiety
    }
    const result = await this.pet.chatRoute({
      text: text.trim(),
      history: this.state.history,
      ctx,
      memoryFacts: this.config.memory.enabled ? this.memory.facts : [],
      nowText: this.nowText()
    })

    // 处理副作用
    if (result.sideEffect) {
      if (result.sideEffect.playNoise) {
        this.noise.play(result.sideEffect.playNoise as any)
      }
      if (result.sideEffect.stopNoise) {
        this.noise.stop()
      }
      if (result.sideEffect.refreshTimers && this.panel.menuOpen) {
        await this.refreshTimers()
      }
    }

    // 情绪触发
    if (result.emotion) {
      this.triggerEmotion(result.emotion)
    }

    await this.finishReply(userMsg, result.reply, result.degraded)
    this.chatting = false

    // 定时意图二次检查（GLM 辅助解析模糊表达）
    void this.maybeParseTimerViaGlm(text.trim())
  }

  /** 收尾：历史、气泡、TTS、记忆总结调度 */
  private async finishReply(userMsg: ChatMessage, reply: string, degraded: boolean): Promise<void> {
    const emotion = this.currentEmotion(Date.now())
    const behavior = behaviorOf(emotion)
    const assistantMsg: ChatMessage = { role: 'assistant', content: reply, ts: Date.now() }
    this.state.history = [...this.state.history, userMsg, assistantMsg].slice(-40)
    this.patchState({ history: this.state.history })
    this.bubble.show(reply, {
      emotion,
      durationMs: degraded ? 8000 : Math.max(6000, Math.min(16000, reply.length * 300))
    })
    await this.tts.speak(reply, { rateMul: behavior.ttsRateMul, pitchMul: behavior.ttsPitchMul })

    this.assistantSinceSummary++
    if (this.config.memory.enabled && this.assistantSinceSummary >= 12) {
      this.assistantSinceSummary = 0
      void this.summarizeMemory(false)
    }
  }

  // 本地技能路由已迁移到主进程 chat-router.ts，渲染进程不再直接路由

  // ---------- 番茄钟 ----------

  private handlePomodoroEvent(ev: { kind: 'focusDone' | 'breakDone'; state: PomodoroState }): void {
    if (ev.kind === 'focusDone') {
      // 性格养成：番茄完成加学霸值
      void this.pet.personalityBump('study').then((p) => this.panel.setPersonality(p.type))
      this.triggerEmotion('happy')
      this.canvas.effects.spawn('sparkle', this.anchorX, this.anchorY - this.effectivePetHeight() + 40, 6)
      const text = `主人！专注完成，干得漂亮！休息 5 分钟吧～`
      this.bubble.show(text, {
        emotion: 'happy',
        durationMs: 0,
        buttons: [
          {
            label: '休息5分钟',
            onClick: () => {
              this.bubble.hide()
              void this.pet.pomodoro.startBreak(5).then((s) => {
                this.pomodoroCache = s
                this.bubble.show('好，休息5分钟，银月叫您。', { durationMs: 4000, emotion: 'coax' })
              })
            }
          },
          {
            label: '再来一轮',
            onClick: () => {
              this.bubble.hide()
              void this.pet.pomodoro.start(ev.state.focusMin).then((s) => {
                this.pomodoroCache = s
                this.bubble.show(`🍅 番茄钟开始！专注 ${ev.state.focusMin} 分钟。`, { durationMs: 4000 })
              })
            }
          },
          { label: '先结束', onClick: () => this.bubble.hide() }
        ]
      })
      void this.tts.speak(text)
    } else {
      this.triggerEmotion('coax')
      const text = '休息结束啦～要继续专注吗？'
      this.bubble.show(text, {
        emotion: 'coax',
        durationMs: 0,
        buttons: [
          {
            label: '继续番茄钟',
            onClick: () => {
              this.bubble.hide()
              void this.pet.pomodoro.start(ev.state.focusMin).then((s) => {
                this.pomodoroCache = s
                this.bubble.show(`🍅 番茄钟开始！专注 ${ev.state.focusMin} 分钟。`, { durationMs: 4000 })
              })
            }
          },
          { label: '结束', onClick: () => this.bubble.hide() }
        ]
      })
      void this.tts.speak(text)
    }
  }

  // ---------- 养成系统 ----------

  /** 右键菜单"摸摸头" */
  private ctxPat(): void {
    this.applyInteraction('pat')
    const top = this.anchorY - this.effectivePetHeight()
    this.canvas.effects.spawn('heart', this.anchorX, top + 40, 4)
    const line = this.patLine()
    this.bubble.show(line, { durationMs: 3500 })
    void this.tts.speak(line)
  }

  /** 喂食道具 */
  private async feedPet(itemId: ItemId): Promise<void> {
    const r = await this.pet.nurture.feed(itemId)
    if (!r.ok) {
      if (r.reason === 'full') {
        // v0.7 饱食度已满：拒绝进食（道具不消耗、经验不加；按钮已置灰，此处兜底台词）
        this.triggerEmotion('coax')
        this.bubble.show('吃不下啦……银月已经很饱了～', { durationMs: 4000, emotion: 'coax' })
        void this.tts.speak('吃不下啦，银月已经很饱了', { rateMul: 0.95, pitchMul: 1.05 })
      } else {
        this.bubble.show(`没有${ITEMS[itemId].label}了，多互动能捡到道具哦～`, { durationMs: 4000, emotion: 'sad' })
      }
      return
    }
    this.state.nurture = r.state
    // v0.7 喂食成功心情 +3
    void this.pet.nurture.addMood(moodDeltaFor('feed')).then((n) => {
      this.state.nurture = n
      this.panel.setNurture(n)
    })
    this.panel.setNurture(r.state)
    this.triggerEmotion('happy')
    const top = this.anchorY - this.effectivePetHeight()
    this.canvas.effects.spawn('heart', this.anchorX, top + 40, 5)
    this.canvas.effects.spawn('sparkle', this.anchorX + 20, top + 30, 3)
    const line = pick([`好吃！谢谢主人～`, `嗯～${ITEMS[itemId].label}真香！`, `主人喂的最好吃！`])
    this.bubble.show(line, { durationMs: 3500, emotion: 'happy' })
    void this.tts.speak(line)
    if (r.event?.kind === 'levelUp') {
      this.handleLevelUp(typeof r.event.value === 'number' ? r.event.value : this.state.nurture.level)
    }
  }

  /** 处理养成事件（升级 / 饥饿 / 掉级）——来自主进程定时器或喂食 */
  private handleNurtureEvent(ev: NurtureEvent): void {
    if (ev.kind === 'levelUp') {
      this.handleLevelUp(typeof ev.value === 'number' ? ev.value : this.state.nurture.level)
    } else if (ev.kind === 'levelDown') {
      // v0.7 冷落掉级：委屈提示 + 刷新面板
      this.triggerEmotion('sad')
      const top = this.anchorY - this.effectivePetHeight()
      this.canvas.effects.spawn('tear', this.anchorX, top + 30, 4)
      const line = `呜……银月掉到了 Lv.${typeof ev.value === 'number' ? ev.value : this.state.nurture.level}，主人多陪陪我好吗？`
      this.bubble.show(line, { durationMs: 6000, emotion: 'sad' })
      void this.tts.speak(line, { rateMul: 0.9, pitchMul: 0.94 })
      void this.pet.nurture.status().then((n) => {
        this.state.nurture = n
        this.panel.setNurture(n)
      })
    } else if (ev.kind === 'hungry') {
      this.triggerEmotion('sad')
      const top = this.anchorY - this.effectivePetHeight()
      this.canvas.effects.spawn('tear', this.anchorX, top + 30, 3)
      const line = pick(['呜……银月好饿……', '肚子咕咕叫了，主人喂喂我嘛……', '饿得没力气了……'])
      this.bubble.show(line, { durationMs: 6000, emotion: 'sad' })
      void this.tts.speak(line, { rateMul: 0.9, pitchMul: 0.94 })
    }
  }

  private handleLevelUp(level: number): void {
    this.triggerEmotion('excited')
    const top = this.anchorY - this.effectivePetHeight()
    this.canvas.effects.spawn('sparkle', this.anchorX, top + 20, 10)
    this.canvas.effects.spawn('heart', this.anchorX, top + 50, 5)
    const line = `银月升级了！现在是 Lv.${level}～主人继续加油！`
    this.bubble.show(line, { durationMs: 6000, emotion: 'excited' })
    void this.tts.speak(line, { rateMul: 1.15, pitchMul: 1.1 })
  }

  /** 饱食度衰减周期：从主进程拉最新状态刷新展示 */
  private async satietyTick(): Promise<void> {
    const n = await this.pet.nurture.status()
    this.state.nurture = n
    this.panel.setNurture(n)
  }

  /** 互动掉落道具（聊天/摸头/番茄完成时调用） */
  private async tryDropItem(): Promise<void> {
    const r = await this.pet.nurture.drop()
    if (r.dropped) {
      this.state.nurture = r.state
      this.panel.setNurture(r.state)
      const label = ITEMS[r.dropped as ItemId]?.label ?? r.dropped
      this.bubble.show(`咦？捡到一个${label}！`, { durationMs: 3500, emotion: 'surprised' })
    }
  }

  // ---------- 每日早报 ----------

  private handleMorningReport(r: MorningReport): void {
    this.triggerEmotion('excited')
    const top = this.anchorY - this.effectivePetHeight()
    this.canvas.effects.spawn('sparkle', this.anchorX, top + 30, 8)
    const parts: string[] = [r.greeting]
    if (r.weather) {
      parts.push(`今天${r.weather.city}${r.weather.temp}度，${wmoDesc(r.weather.code)}。`)
    }
    if (r.todos.length > 0) {
      parts.push(`主人今天有 ${r.todos.length} 件事要做：${r.todos.slice(0, 3).join('、')}${r.todos.length > 3 ? '……' : ''}`)
    } else {
      parts.push('今天没有待办，轻松的一天！')
    }
    parts.push(`${this.petName()}陪主人一起加油！`)
    const text = parts.join('')
    this.bubble.show(text, { durationMs: 12000, emotion: 'excited' })
    void this.tts.speak(text, { rateMul: 1.1, pitchMul: 1.05 })
  }

  // ---------- 剪贴板解读（Alt+J） ----------

  private async handleClipboardAssist(text: string): Promise<void> {
    if (!text || text.trim().length === 0) {
      this.bubble.show('剪贴板是空的哦。复制点内容再按 Alt+J。', { durationMs: 4000 })
      return
    }
    if (this.chatting) return
    this.chatting = true
    this.triggerEmotion('surprised')
    const brief = text.trim().slice(0, 300)
    this.bubble.show('银月在看剪贴板内容…', { typing: true, durationMs: 0 })
    // 中文为主 → 讲解；否则 → 翻译
    const zhChars = (brief.match(/[\u4e00-\u9fff]/g) ?? []).length
    const mode = zhChars > brief.length * 0.3 ? 'explain' : 'translate'
    const r = await this.pet.assist(text, mode)
    let reply: string
    if (r.ok) {
      reply = `📎 ${r.content}`
    } else {
      reply = `【离线回复】剪贴板解读失败（${r.error}），主人稍后再试？`
      this.triggerEmotion('angry')
    }
    this.applyInteraction('chat')
    const userMsg: ChatMessage = { role: 'user', content: `[剪贴板解读] ${brief}`, ts: Date.now() }
    await this.finishReply(userMsg, reply, !r.ok)
    this.chatting = false
  }

  // 今日报告已迁移到主进程 chat-router.ts

  /** 模糊定时表达交给 GLM 解析（如"半小时后叫我站起来"） */
  private async maybeParseTimerViaGlm(text: string): Promise<void> {
    if (!/(提醒|叫我|记着|记得)/.test(text)) return
    if (parseTimerIntent(text, Date.now()).ok) return
    const r = await this.pet.chatParseTimer(text)
    if (r.ok && r.delayMinutes !== null) {
      const fireAt = Date.now() + r.delayMinutes * 60_000
      await this.pet.timers.add(r.task, fireAt)
      if (this.panel.menuOpen) await this.refreshTimers()
      this.bubble.show(timerConfirmReply(r.task, fireAt), { durationMs: 5000 })
    }
  }

  // ---------- 待办 ----------

  private async todoListText(): Promise<string> {
    const items = (await this.pet.todos.list()).filter((t) => !t.done)
    if (items.length === 0) return '主人目前没有待办事项，很清爽呢。'
    return '主人的待办：\n' + items.map((t, i) => `${i + 1}. ${t.text}`).join('\n')
  }

  private async viewTodos(): Promise<void> {
    const text = await this.todoListText()
    this.bubble.show(text, { durationMs: 12000 })
  }

  private async clearDoneTodos(): Promise<void> {
    const n = await this.pet.todos.clearDone()
    this.bubble.show(n > 0 ? `清掉了 ${n} 条已完成待办。` : '没有已完成的待办可清理。', { durationMs: 4000 })
  }

  // ---------- 定时提醒 ----------

  private async refreshTimers(): Promise<void> {
    const timers: ScheduleTimer[] = await this.pet.timers.list()
    this.panel.refreshTimers(timers)
  }

  private async removeTimer(id: string): Promise<void> {
    await this.pet.timers.remove(id)
    await this.refreshTimers()
  }

  private handleTimerFire(t: ScheduleTimer): void {
    this.triggerEmotion('surprised')
    const text = `⏰ 主人，您交代的：${t.text}`
    this.bubble.show(text, {
      durationMs: 0,
      buttons: [
        {
          label: '知道了',
          onClick: () => {
            this.bubble.hide()
            this.applyInteraction('reminderAck')
          }
        }
      ]
    })
    void this.tts.speak(text)
    if (this.panel.menuOpen) void this.refreshTimers()
  }

  // ---------- 记忆 ----------

  private async summarizeMemory(manual: boolean): Promise<void> {
    if (manual) this.bubble.show('银月正在整理记忆…', { typing: true, durationMs: 0 })
    const mem = await this.pet.memory.summarize()
    if (mem) {
      this.memory = mem
      this.panel.setMemoryInfo(mem)
      if (manual) this.bubble.show(`记忆整理完成，现在共 ${mem.facts.length} 条（本地副本已更新）。`, { durationMs: 5000 })
      // 主进程台词刷新是 fire-and-forget，延迟一会儿再拉取，尽量同步到最新台词
      setTimeout(() => {
        void this.pet.linesGet().then((l) => setDynamicLines(l))
      }, 20_000)
    } else if (manual) {
      this.bubble.show('整理失败了…接口不可用或暂无可总结的对话。', { durationMs: 5000, emotion: 'sad' })
    }
    this.assistantSinceSummary = 0
  }

  private async chooseMemoryDir(): Promise<void> {
    const dir = await this.pet.memory.chooseDir()
    if (!dir) return
    this.config = await this.pet.memory.setDir(dir)
    this.panel.setMemoryDir(dir)
    // 立即在新目录写一份副本
    void this.summarizeMemory(false).then(() => this.bubble.show(`记忆目录已更换，本地副本将保存在：${dir}`, { durationMs: 5000 }))
  }

  private async exportMemory(): Promise<void> {
    const dir = await this.pet.memory.chooseDir()
    if (!dir) return
    const ok = await this.pet.memory.exportTo(dir)
    this.bubble.show(ok ? `已导出到 ${dir}` : '导出失败…', { durationMs: 4000 })
  }

  private async importMemory(): Promise<void> {
    const mem = await this.pet.memory.importFile()
    if (mem) {
      this.memory = mem
      this.panel.setMemoryInfo(mem)
      this.bubble.show(`导入成功，共 ${mem.facts.length} 条记忆。`, { durationMs: 4000, emotion: 'happy' })
    } else {
      this.bubble.show('没有选择文件或文件格式不对。', { durationMs: 4000 })
    }
  }

  private async viewDiary(): Promise<void> {
    this.bubble.show('银月正在写日记...', { typing: true, durationMs: 0 })
    const result = await this.pet.diaryGenerate()
    if (result.ok) {
      // 显示最近 3 篇日记
      const entries = await this.pet.diaryList()
      const recent = entries.slice(0, 3)
      if (recent.length === 0) {
        this.bubble.show(result.text, { durationMs: 10000, emotion: 'happy' })
      } else {
        const lines = recent.map((e) => `📅 ${e.date}：${e.text.slice(0, 60)}${e.text.length > 60 ? '…' : ''}`)
        this.bubble.show(lines.join('\n\n'), { durationMs: 12000 })
      }
    } else {
      this.bubble.show(`日记写失败了：${result.error?.slice(0, 40) ?? '未知错误'}`, { durationMs: 5000, emotion: 'sad' })
    }
  }

  // ---------- 语音 ----------

  private async toggleMic(): Promise<void> {
    if (this.recording) {
      this.stopMic()
      return
    }
    const status = await this.pet.asr.status()
    if (!status.modelPresent && !this.voice.modelReady) {
      this.bubble.show(asrModelMissingText(), { durationMs: 6000 })
      return
    }
    const err = await this.voice.start(
      (partial) => this.panel.setInputText(partial),
      () => {}
    )
    if (err) {
      this.triggerEmotion('angry')
      this.bubble.show(asrFailedText(), { durationMs: 5000 })
      return
    }
    this.recording = true
    this.panel.setRecording(true)
  }

  private stopMic(): void {
    const text = this.voice.stop()
    this.recording = false
    this.panel.setRecording(false)
    if (text) {
      this.panel.openChat()
      void this.handleSend(text, 'asrChat')
    } else {
      this.panel.setInputText('')
    }
  }

  private async downloadAsrModel(): Promise<void> {
    this.bubble.show('正在下载离线语音模型…', { typing: true, durationMs: 0 })
    const err = await this.voice.ensureModel((r, t) => {
      const pct = t > 0 ? Math.round((r / t) * 100) : 0
      this.bubble.updateText(`语音模型下载中 ${pct}%`)
    })
    this.bubble.hide()
    if (err) {
      this.triggerEmotion('angry')
      this.bubble.show(`模型没下载成功：${err}`, { durationMs: 5000, emotion: 'angry' })
    } else {
      this.triggerEmotion('happy')
      this.bubble.show('语音模型就绪，可以点 🎤 说话了～', { durationMs: 4000, emotion: 'happy' })
    }
  }

  // ---------- 健康提醒 ----------

  private handleReminder(ev: ReminderEvent): void {
    if (!this.state.reminderConfig.enabled) return
    this.triggerEmotion('surprised')
    this.widget.setReminder(ev.kind === 'water' ? '该喝水了' : '该活动了')
    const text = reminderText(ev.kind, ev.minutes)
    this.bubble.show(text, {
      durationMs: 0,
      buttons: [
        {
          label: ev.kind === 'water' ? '已喝水' : '好，去活动',
          onClick: () => this.ackReminder(ev)
        }
      ]
    })
    void this.tts.speak(text)
    if (ev.kind === 'water') {
      this.canvas.effects.spawn('water', this.anchorX + 26, this.anchorY - this.effectivePetHeight() + 40, 4)
    } else {
      this.canvas.effects.spawn('sweat', this.anchorX + 26, this.anchorY - this.effectivePetHeight() + 40, 3)
    }

    if (this.reminderAckTimer !== null) clearTimeout(this.reminderAckTimer)
    this.reminderAckTimer = window.setTimeout(() => {
      this.reminderAckTimer = null
      this.widget.setReminder('')
      if (this.bubble.hasActions) {
        this.triggerEmotion('angry')
        const line = reminderIgnoredText()
        this.bubble.show(line, { emotion: 'angry', durationMs: 6000 })
        void this.tts.speak(line)
      }
    }, 120_000)
  }

  private ackReminder(ev: ReminderEvent): void {
    if (this.reminderAckTimer !== null) {
      clearTimeout(this.reminderAckTimer)
      this.reminderAckTimer = null
    }
    this.bubble.hide()
    this.widget.setReminder('')
    this.applyInteraction('reminderAck')
    // v0.7 提醒统计：回填 SQLite acked_at（今日报告/成就数据源）
    void this.pet.statsAckReminder(ev.kind)
    const text = reminderAckText(ev.kind)
    this.bubble.show(text, { durationMs: 4000, emotion: 'happy' })
    void this.tts.speak(text)
  }
}
