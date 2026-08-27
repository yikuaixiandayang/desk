/** 控制台面板：基础/声音/API/记忆/定时/待办 的 DOM 交互与配置回写 */
import type { PetApi } from '../../../preload/index'
import type { AppRuntimeConfig, AssetScanResult, MemoryData, MoveMode, NurtureState, PetPrefs, PetStoreState, ScheduleTimer, TtsConfig, TtsEngine } from '@shared/types'
import type { Tts } from '../voice/tts'
import { ITEMS, levelTier, expForLevel } from '@shared/nurture'

export interface PanelCallbacks {
  onSend: (text: string) => void
  onMicToggle: () => void
  onStatePatch: (patch: Partial<PetStoreState>) => void
  onQuit: () => void
  onDownloadModel: () => void
  onMoveMode: (mode: MoveMode) => void
  onPetScale: (scale: number) => void
  onPetConfig: (patch: Partial<PetPrefs>) => void
  onTtsConfig: (patch: Partial<TtsConfig>) => void
  onTtsTest: () => void
  onApiConfig: (patch: Partial<AppRuntimeConfig['api']>) => void
  onApiTest: () => void
  onMemoryConfig: (patch: Partial<AppRuntimeConfig['memory']>) => void
  onMemorySummarize: () => void
  onMemoryChooseDir: () => void
  onMemoryOpen: () => void
  onMemoryExport: () => void
  onMemoryImport: () => void
  onTodoView: () => void
  onTodoClear: () => void
  onRemoveTimer: (id: string) => void
  onFeed: (itemId: 'fish' | 'snack' | 'cake') => void
  onCtxPat: () => void
  onNurtureConfig: (patch: Partial<{ dropRate: number; satietyDecayMin: number; moveIntervalSec: number }>) => void
  onAssistantConfig: (patch: Partial<{ morningReportAt: string; widgetEnabled: boolean }>) => void
  onDiary: () => void
  /** 强制趴在任务栏 / 退出趴下 */
  onSquatAction: (action: 'force' | 'exit') => void
  /** 演示一次探头动画（设置面板“演示探头”按钮） */
  onPeekTest: () => void
  /** 演示一次行走（设置面板“演示行走”按钮） */
  onWalkTest: () => void
  /** 演示一次边缘吸附：循环 左→上→右（设置面板“演示吸附”按钮） */
  onSnapTest: () => void
  /** 开始番茄时钟 */
  onPomodoroStart: (minutes?: number) => void
  /** 停止番茄时钟 */
  onPomodoroStop: () => void
  /** v0.8 选择自定义素材目录（主进程弹窗，成功后落配置并重载素材） */
  onAssetsChoose: () => void
  /** v0.8 调试图片：选图片文件临时应用到宠物（不落配置） */
  onAssetsDebug: () => void
  /** v0.8 恢复内置素材（清空 assetsDir 并重载） */
  onAssetsReset: () => void
  /** v0.8 自定义台词（多行文本） */
  onLinesConfig: (patch: Partial<{ greeting: string; pat: string; hug: string; angry: string }>) => void
  /** v0.8 Hermes 汇报配置 */
  onReportConfig: (patch: Partial<{ reportAt: string; reportUrl: string }>) => void
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

export class Panel {
  private toolbar = el('toolbar')
  private chatbar = el('chatbar')
  private menu = el('menu')
  private recordingEl = el('recording')
  private input = el('chat-input') as HTMLInputElement

  private optTts = el('opt-tts') as HTMLInputElement
  private optAuto = el('opt-autolaunch') as HTMLInputElement
  private optReminder = el('opt-reminder') as HTMLInputElement
  private optSedentary = el('opt-sedentary') as HTMLInputElement
  private optWater = el('opt-water') as HTMLInputElement

  private optMoveMode = el('opt-move-mode') as HTMLSelectElement
  private optScale = el('opt-scale') as HTMLInputElement
  private lblScale = el('lbl-scale')
  private optMoveModeSys = el('opt-move-mode-sys') as HTMLSelectElement
  private optScaleSys = el('opt-scale-sys') as HTMLInputElement
  private lblScaleSys = el('lbl-scale-sys')
  private optAutoSquat = el('opt-auto-squat') as HTMLInputElement
  private optAutoSquatSec = el('opt-auto-squat-sec') as HTMLInputElement
  private optWalkSpeed = el('opt-walk-speed') as HTMLInputElement
  private lblWalkSpeed = el('lbl-walk-speed')
  private btnPomodoroStart = el('btn-pomodoro-start') as HTMLButtonElement
  private pomodoroStatus = el('pomodoro-status')
  private pomodoroActive = false
  private optName = el('opt-name') as HTMLInputElement
  private optGreeting = el('opt-greeting') as HTMLInputElement
  private optChatter = el('opt-chatter-interval') as HTMLInputElement
  private optEdgeSnap = el('opt-edge-snap') as HTMLInputElement
  private optSnapInset = el('opt-snap-inset') as HTMLInputElement
  private optDragBtn = el('opt-drag-btn') as HTMLSelectElement
  private optPeekIdle = el('opt-peek-idle') as HTMLInputElement
  private optPeekDuration = el('opt-peek-duration') as HTMLInputElement
  private optPeekRatio = el('opt-peek-ratio') as HTMLInputElement
  private lblPeekRatio = el('lbl-peek-ratio')
  private optPeekInterval = el('opt-peek-interval') as HTMLInputElement
  private optPeekV2Enabled = el('opt-peek-v2-enabled') as HTMLInputElement
  private optPeekFreqMin = el('opt-peek-freq-min') as HTMLInputElement
  private optPeekFreqMax = el('opt-peek-freq-max') as HTMLInputElement
  private optPeekMaxDay = el('opt-peek-max-day') as HTMLInputElement
  private btnPeekTest = el('btn-peek-test') as HTMLButtonElement
  private optEngine = el('opt-tts-engine') as HTMLSelectElement
  private optVoice = el('opt-tts-voice') as HTMLSelectElement
  private optRate = el('opt-tts-rate') as HTMLInputElement
  private optPitch = el('opt-tts-pitch') as HTMLInputElement
  private optVolume = el('opt-tts-volume') as HTMLInputElement
  private lblRate = el('lbl-rate')
  private lblPitch = el('lbl-pitch')
  private lblVolume = el('lbl-volume')

  private optApiMode = el('opt-api-mode') as HTMLSelectElement
  private optApiUrl = el('opt-api-url') as HTMLInputElement
  private optApiModel = el('opt-api-model') as HTMLInputElement
  private optApiKey = el('opt-api-key') as HTMLInputElement
  private apiTestResult = el('api-test-result')

  private optMemoryEnabled = el('opt-memory-enabled') as HTMLInputElement
  private memoryCount = el('memory-count')
  private memoryDirLabel = el('opt-memory-dir')
  private timerList = el('timer-list')

  private nLevel = el('nurture-level')
  private nExp = el('nurture-exp')
  private nExpBar = el('nurture-exp-bar') as HTMLElement
  private nSatiety = el('nurture-satiety')
  private nSatietyBar = el('nurture-satiety-bar') as HTMLElement
  private nMood = el('nurture-mood')
  private nMoodBar = el('nurture-mood-bar') as HTMLElement
  private nItems = el('nurture-items')
  private feedBtns = ['btn-feed-fish', 'btn-feed-snack', 'btn-feed-cake'].map((id) => el(id) as HTMLButtonElement)
  private personalityType = el('personality-type')
  private achievementBadges = el('achievement-badges')
  private optDropRate = el('opt-drop-rate') as HTMLInputElement
  private optSatietyDecay = el('opt-satiety-decay') as HTMLInputElement
  private optMoveInterval = el('opt-move-interval') as HTMLInputElement
  private optMorningReport = el('opt-morning-report') as HTMLInputElement
  private optWidgetEnabled = el('opt-widget-enabled') as HTMLInputElement
  private statActiveMin = el('stat-active-min')
  private statChats = el('stat-chats')
  private statPomodoros = el('stat-pomodoros')
  private statKeysTotal = el('stat-keys-total')
  private statKeysChars = el('stat-keys-chars')
  private statKeysSpace = el('stat-keys-space')
  private statKeysEnter = el('stat-keys-enter')
  private statKeysRow = el('stat-keys-row')
  private statKeysDetail = el('stat-keys-detail')
  private keysDetailOpen = false
  private btnSquat = el('btn-squat') as HTMLButtonElement
  private ctxMenu = el('ctxmenu')
  private assetDir = el('asset-dir')
  private assetSlots = el('asset-slots')
  private lastNurture: NurtureState = { exp: 0, level: 1, satiety: 80, lastFedAt: 0, items: { fish: 3, snack: 2, cake: 1 }, lastDropAt: 0, satietyDecayApplied: 0, mood: 70, moodDecayApplied: 0 }

  chatOpen = false
  menuOpen = false
  ctxMenuOpen = false
  toolbarOpen = false
  recording = false
  /** 当前是否处于趴下状态（控制按钮文字） */
  squatActive = false

  constructor(private pet: PetApi, private tts: Tts, private cb: PanelCallbacks) {
    // 把含多个分区的标签页改造成“横向子菜单 + 分区内容”，先于事件绑定执行（仅移动节点，id 不变）
    this.buildSubTabs()
    el('btn-chat').addEventListener('click', () => this.toggleChat())
    el('btn-mic').addEventListener('click', () => this.cb.onMicToggle())
    el('btn-send').addEventListener('click', () => this.submit())
    el('btn-chat-close').addEventListener('click', () => this.closeChat())
    el('btn-quit').addEventListener('click', () => this.closeMenu())
    el('btn-menu-quit').addEventListener('click', () => this.closeMenu())
    el('btn-squat').addEventListener('click', () => {
      this.cb.onSquatAction(this.squatActive ? 'exit' : 'force')
    })
    el('btn-asr-dl').addEventListener('click', () => this.cb.onDownloadModel())

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit()
      e.stopPropagation()
    })

    // 标签页切换
    for (const tab of this.menu.querySelectorAll<HTMLButtonElement>('.menu-tabs .tab')) {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab ?? 'base'))
    }

    // 基础
    this.optMoveMode.addEventListener('change', () => {
      this.cb.onMoveMode(this.optMoveMode.value as MoveMode)
      this.optMoveModeSys.value = this.optMoveMode.value
    })
    this.optMoveModeSys.addEventListener('change', () => {
      this.cb.onMoveMode(this.optMoveModeSys.value as MoveMode)
      this.optMoveMode.value = this.optMoveModeSys.value
    })
    this.optScale.addEventListener('input', () => {
      const v = Number(this.optScale.value)
      this.lblScale.textContent = v.toFixed(2) + 'x'
      this.lblScaleSys.textContent = v.toFixed(2) + 'x'
      this.optScaleSys.value = this.optScale.value
    })
    this.optScale.addEventListener('change', () => this.cb.onPetScale(Number(this.optScale.value)))
    this.optScaleSys.addEventListener('input', () => {
      const v = Number(this.optScaleSys.value)
      this.lblScale.textContent = v.toFixed(2) + 'x'
      this.lblScaleSys.textContent = v.toFixed(2) + 'x'
      this.optScale.value = this.optScaleSys.value
    })
    this.optScaleSys.addEventListener('change', () => this.cb.onPetScale(Number(this.optScaleSys.value)))
    // 自动趴下配置
    this.optAutoSquat.addEventListener('change', () => this.cb.onPetConfig({ autoSquatEnabled: this.optAutoSquat.checked }))
    this.optAutoSquatSec.addEventListener('change', () => {
      const v = Number(this.optAutoSquatSec.value)
      if (!Number.isNaN(v)) this.cb.onPetConfig({ autoSquatIdleSec: Math.max(5, Math.min(300, v)) })
    })
    // 走动速度
    this.optWalkSpeed.addEventListener('input', () => {
      this.lblWalkSpeed.textContent = this.optWalkSpeed.value
    })
    this.optWalkSpeed.addEventListener('change', () => {
      const v = Number(this.optWalkSpeed.value)
      if (!Number.isNaN(v)) this.cb.onPetConfig({ walkSpeedPxSec: Math.max(50, Math.min(400, v)) })
    })
    // 番茄时钟
    this.btnPomodoroStart.addEventListener('click', () => {
      if (this.pomodoroActive) {
        this.cb.onPomodoroStop()
      } else {
        this.cb.onPomodoroStart(25)
      }
    })
    // 宠物自定义属性（系统标签）
    this.optName.addEventListener('change', () => {
      const v = this.optName.value.trim()
      this.cb.onPetConfig({ name: v || '银月' })
      this.optName.value = v
    })
    this.optGreeting.addEventListener('change', () => this.cb.onPetConfig({ greeting: this.optGreeting.value.trim() }))
    this.optChatter.addEventListener('change', () => {
      const v = Number(this.optChatter.value)
      if (!Number.isNaN(v)) this.cb.onPetConfig({ chatterIntervalMin: Math.max(0, Math.min(120, v)) })
    })
    this.optEdgeSnap.addEventListener('change', () => this.cb.onPetConfig({ edgeSnap: this.optEdgeSnap.checked }))
    // v0.8 吸附向内偏移
    this.optSnapInset.addEventListener('change', () => {
      const v = Number(this.optSnapInset.value)
      if (!Number.isNaN(v)) this.cb.onPetConfig({ snapInsetPx: Math.max(0, Math.min(200, v)) })
    })
    // v0.8 拖动方式（右键/左键）
    this.optDragBtn.addEventListener('change', () => {
      this.cb.onPetConfig({ dragButton: this.optDragBtn.value === 'left' ? 'left' : 'right' })
    })
    // v0.8 自定义素材
    el('btn-assets-choose').addEventListener('click', () => this.cb.onAssetsChoose())
    el('btn-assets-debug').addEventListener('click', () => this.cb.onAssetsDebug())
    el('btn-assets-reset').addEventListener('click', () => this.cb.onAssetsReset())
    // v0.8 自定义台词
    for (const [id, key] of [
      ['opt-line-greeting', 'greeting'],
      ['opt-line-pat', 'pat'],
      ['opt-line-hug', 'hug'],
      ['opt-line-angry', 'angry']
    ] as const) {
      el(id).addEventListener('change', () => {
        this.cb.onLinesConfig({ [key]: (el(id) as HTMLTextAreaElement).value })
      })
    }
    // v0.8 Hermes 汇报
    el('opt-report-at').addEventListener('change', () => {
      this.cb.onReportConfig({ reportAt: (el('opt-report-at') as HTMLInputElement).value.trim() })
    })
    el('opt-report-url').addEventListener('change', () => {
      const v = (el('opt-report-url') as HTMLInputElement).value.trim()
      if (v) this.cb.onReportConfig({ reportUrl: v })
    })
    // 探头探脑参数
    this.optPeekIdle.addEventListener('change', () => {
      const v = Number(this.optPeekIdle.value)
      if (!Number.isNaN(v)) this.cb.onPetConfig({ peekIdleSec: Math.max(5, Math.min(600, v)) })
    })
    this.optPeekDuration.addEventListener('change', () => {
      const v = Number(this.optPeekDuration.value)
      if (!Number.isNaN(v)) this.cb.onPetConfig({ peekDurationSec: Math.max(1, Math.min(10, v)) })
    })
    this.optPeekRatio.addEventListener('input', () => {
      this.lblPeekRatio.textContent = Number(this.optPeekRatio.value).toFixed(2)
    })
    this.optPeekRatio.addEventListener('change', () => {
      const v = Number(this.optPeekRatio.value)
      if (!Number.isNaN(v)) this.cb.onPetConfig({ peekOffsetRatio: Math.max(0.2, Math.min(0.9, v)) })
    })
    this.optPeekInterval.addEventListener('change', () => {
      const v = Number(this.optPeekInterval.value)
      if (!Number.isNaN(v)) this.cb.onPetConfig({ peekIntervalSec: Math.max(10, Math.min(600, v)) })
    })
    // v0.7 偶发探头
    this.optPeekV2Enabled.addEventListener('change', () => this.cb.onPetConfig({ peekEnabled: this.optPeekV2Enabled.checked }))
    this.optPeekFreqMin.addEventListener('change', () => {
      const v = Number(this.optPeekFreqMin.value)
      if (!Number.isNaN(v)) this.cb.onPetConfig({ peekFreqMin: Math.max(5, Math.min(240, v)) })
    })
    this.optPeekFreqMax.addEventListener('change', () => {
      const v = Number(this.optPeekFreqMax.value)
      if (!Number.isNaN(v)) this.cb.onPetConfig({ peekFreqMax: Math.max(5, Math.min(360, v)) })
    })
    this.optPeekMaxDay.addEventListener('change', () => {
      const v = Number(this.optPeekMaxDay.value)
      if (!Number.isNaN(v)) this.cb.onPetConfig({ peekMaxPerDay: Math.max(1, Math.min(20, v)) })
    })
    this.btnPeekTest.addEventListener('click', () => this.cb.onPeekTest())
    el('btn-walk-test').addEventListener('click', () => this.cb.onWalkTest())
    el('btn-snap-test').addEventListener('click', () => this.cb.onSnapTest())
    el('btn-store-path').addEventListener('click', () => void this.pet.openStorePath())
    this.optTts.addEventListener('change', () => this.patchSettings())
    this.optReminder.addEventListener('change', () => this.patchReminder())
    this.optSedentary.addEventListener('change', () => this.patchReminder())
    this.optWater.addEventListener('change', () => this.patchReminder())
    el('btn-api-test').addEventListener('click', () => this.cb.onApiTest())
    el('btn-tts-test').addEventListener('click', () => this.cb.onTtsTest())

    // 声音
    this.optEngine.addEventListener('change', () => {
      this.rebuildVoiceOptions(this.optEngine.value as TtsEngine)
      this.toggleCustomTtsRows()
      this.cb.onTtsConfig({ engine: this.optEngine.value as TtsEngine })
    })
    this.optVoice.addEventListener('change', () => this.cb.onTtsConfig({ voice: this.optVoice.value }))
    for (const [input, lbl, key] of [
      [this.optRate, this.lblRate, 'rate'],
      [this.optPitch, this.lblPitch, 'pitch'],
      [this.optVolume, this.lblVolume, 'volume']
    ] as const) {
      // input 只更新数值标签，change（松手）才写配置，避免拖动时 IPC 写盘风暴
      input.addEventListener('input', () => {
        lbl.textContent = key === 'volume' ? Math.round(Number(input.value) * 100) + '%' : Number(input.value).toFixed(2) + 'x'
      })
      input.addEventListener('change', () => {
        ;(this.cb.onTtsConfig as (p: Partial<TtsConfig>) => void)({ [key]: Number(input.value) })
      })
    }
    for (const [id, key] of [
      ['opt-tts-url', 'customUrl'],
      ['opt-tts-custom-model', 'customModel'],
      ['opt-tts-custom-voice', 'customVoice'],
      ['opt-tts-key', 'customKey']
    ] as const) {
      el(id).addEventListener('change', () => {
        const v = (el(id) as HTMLInputElement).value.trim()
        if (v) this.cb.onTtsConfig({ [key]: v } as Partial<TtsConfig>)
      })
    }

    // API
    this.optApiMode.addEventListener('change', () => this.cb.onApiConfig({ mode: this.optApiMode.value as 'openai' | 'offline' }))
    this.optApiUrl.addEventListener('change', () => {
      const v = this.optApiUrl.value.trim()
      if (v) this.cb.onApiConfig({ baseUrl: v })
    })
    this.optApiModel.addEventListener('change', () => {
      const v = this.optApiModel.value.trim()
      if (v) this.cb.onApiConfig({ model: v })
    })
    this.optApiKey.addEventListener('change', () => {
      const v = this.optApiKey.value.trim()
      // 留空或仍是打码占位时不覆盖
      if (v && !v.includes('****')) this.cb.onApiConfig({ apiKey: v })
      this.optApiKey.value = ''
    })

    // 记忆
    this.optMemoryEnabled.addEventListener('change', () =>
      this.cb.onMemoryConfig({ enabled: this.optMemoryEnabled.checked })
    )
    el('btn-memory-dir').addEventListener('click', () => this.cb.onMemoryChooseDir())
    el('btn-memory-open').addEventListener('click', () => this.cb.onMemoryOpen())
    el('btn-memory-summarize').addEventListener('click', () => this.cb.onMemorySummarize())
    el('btn-memory-export').addEventListener('click', () => this.cb.onMemoryExport())
    el('btn-memory-import').addEventListener('click', () => this.cb.onMemoryImport())

    // 待办
    el('btn-todo-view').addEventListener('click', () => this.cb.onTodoView())
    el('btn-todo-clear').addEventListener('click', () => this.cb.onTodoClear())

    // 养成喂食
    el('btn-feed-fish').addEventListener('click', () => this.cb.onFeed('fish'))
    el('btn-feed-snack').addEventListener('click', () => this.cb.onFeed('snack'))
    el('btn-feed-cake').addEventListener('click', () => this.cb.onFeed('cake'))

    // 养成参数
    this.optDropRate.addEventListener('change', () => {
      const v = Number(this.optDropRate.value)
      if (!Number.isNaN(v)) this.cb.onNurtureConfig({ dropRate: Math.max(0, Math.min(1, v)) })
    })
    this.optSatietyDecay.addEventListener('change', () => {
      const v = Number(this.optSatietyDecay.value)
      if (!Number.isNaN(v)) this.cb.onNurtureConfig({ satietyDecayMin: Math.max(10, Math.min(240, v)) })
    })
    this.optMoveInterval.addEventListener('change', () => {
      const v = Number(this.optMoveInterval.value)
      if (!Number.isNaN(v)) this.cb.onNurtureConfig({ moveIntervalSec: Math.max(0, Math.min(120, v)) })
    })
    this.optMorningReport.addEventListener('change', () => {
      this.cb.onAssistantConfig({ morningReportAt: this.optMorningReport.value.trim() })
    })

    // 助手 - 桌面小卡片开关
    this.optWidgetEnabled.addEventListener('change', () => {
      this.cb.onAssistantConfig({ widgetEnabled: this.optWidgetEnabled.checked })
    })

    // 按键统计：点击展开/收起详情
    this.statKeysRow.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('#stat-keys-toggle')) {
        this.keysDetailOpen = !this.keysDetailOpen
        this.statKeysDetail.classList.toggle('hidden', !this.keysDetailOpen)
        el('stat-keys-toggle').querySelector('.keys-more')!.textContent = this.keysDetailOpen ? '▾' : '▸'
      }
    })

    // 系统 - 银月日记
    el('btn-diary').addEventListener('click', () => this.cb.onDiary())

    // 右键菜单
    for (const item of this.ctxMenu.querySelectorAll<HTMLButtonElement>('.ctx-item')) {
      item.addEventListener('click', () => {
        const act = item.dataset.act ?? ''
        this.closeCtxMenu()
        this.dispatchCtxAction(act)
      })
    }
  }

  private dispatchCtxAction(act: string): void {
    switch (act) {
      case 'chat':
        this.openChat()
        break
      case 'feed':
        this.cb.onFeed(this.pickFeedItem())
        break
      case 'pat':
        this.cb.onCtxPat()
        break
      case 'move': {
        const next: MoveMode = this.optMoveMode.value === 'auto' ? 'still' : 'auto'
        this.optMoveMode.value = next
        this.cb.onMoveMode(next)
        break
      }
      case 'menu':
        this.openMenu()
        break
      case 'quit':
        this.cb.onQuit()
        break
    }
  }

  /** 选库存最多的道具喂 */
  private pickFeedItem(): 'fish' | 'snack' | 'cake' {
    const n = this.lastNurture
    let best: 'fish' | 'snack' | 'cake' = 'fish'
    let max = -1
    for (const id of ['fish', 'snack', 'cake'] as const) {
      const c = n.items[id] ?? 0
      if (c > max) {
        max = c
        best = id
      }
    }
    return best
  }

  private patchSettings(): void {
    this.cb.onStatePatch({
      settings: { ttsEnabled: this.optTts.checked, autoLaunch: this.optAuto.checked }
    })
  }

  private patchReminder(): void {
    this.cb.onStatePatch({
      reminderConfig: {
        enabled: this.optReminder.checked,
        sedentaryMin: Math.max(10, Math.min(240, Number(this.optSedentary.value) || 45)),
        waterMin: Math.max(10, Math.min(240, Number(this.optWater.value) || 60))
      }
    })
  }

  private switchTab(name: string): void {
    for (const tab of this.menu.querySelectorAll<HTMLButtonElement>('.menu-tabs .tab')) {
      tab.classList.toggle('active', tab.dataset.tab === name)
    }
    for (const page of this.menu.querySelectorAll<HTMLElement>('.tab-page')) {
      page.classList.toggle('active', page.id === `tab-${name}`)
    }
  }

  /** 按 section-header 把标签页内容拆成横向子菜单：选中哪个模块就只展示哪个模块。
   *  首个无标题分组用页面 data-first-sub 命名；单分组页面不改造。 */
  private buildSubTabs(): void {
    for (const page of this.menu.querySelectorAll<HTMLElement>('.tab-page')) {
      const children = Array.from(page.children) as HTMLElement[]
      if (!children.some((c) => c.classList.contains('section-header'))) continue
      const groups: Array<{ label: string; items: HTMLElement[] }> = []
      let cur: { label: string; items: HTMLElement[] } | null = null
      for (const c of children) {
        if (c.classList.contains('section-header')) {
          cur = { label: c.textContent?.trim() || '其他', items: [] }
          groups.push(cur)
        } else {
          if (!cur) {
            cur = { label: page.dataset.firstSub ?? '基础', items: [] }
            groups.push(cur)
          }
          cur.items.push(c)
        }
      }
      if (groups.length < 2) continue
      page.classList.add('subbed')
      const bar = document.createElement('div')
      bar.className = 'sub-tabs'
      const subPages: HTMLElement[] = []
      groups.forEach((g, i) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'sub-tab' + (i === 0 ? ' active' : '')
        btn.textContent = g.label
        const sub = document.createElement('div')
        sub.className = 'sub-page' + (i === 0 ? ' active' : '')
        for (const item of g.items) sub.appendChild(item)
        btn.addEventListener('click', () => {
          bar.querySelectorAll('.sub-tab').forEach((b) => b.classList.toggle('active', b === btn))
          subPages.forEach((p, j) => p.classList.toggle('active', j === i))
        })
        bar.appendChild(btn)
        subPages.push(sub)
      })
      // 清空残余的 section-header 节点后重组（各分组项已移入子页，引用与事件监听不受影响）
      page.replaceChildren(bar, ...subPages)
    }
  }

  hydrate(state: PetStoreState, cfg: AppRuntimeConfig, autoLaunch: boolean): void {
    this.optTts.checked = state.settings.ttsEnabled
    this.optAuto.checked = autoLaunch
    this.optReminder.checked = state.reminderConfig.enabled
    this.optSedentary.value = String(state.reminderConfig.sedentaryMin)
    this.optWater.value = String(state.reminderConfig.waterMin)

    this.optMoveMode.value = cfg.pet.moveMode
    this.optMoveModeSys.value = cfg.pet.moveMode
    this.updateMoveButton(cfg.pet.moveMode)
    this.optScale.value = String(cfg.pet.scale)
    this.optScaleSys.value = String(cfg.pet.scale)
    this.lblScale.textContent = cfg.pet.scale.toFixed(2) + 'x'
    this.lblScaleSys.textContent = cfg.pet.scale.toFixed(2) + 'x'

    this.optName.value = cfg.pet.name || '银月'
    this.optGreeting.value = cfg.pet.greeting ?? ''
    this.optChatter.value = String(cfg.pet.chatterIntervalMin ?? 0)
    this.optEdgeSnap.checked = cfg.pet.edgeSnap ?? false
    this.optSnapInset.value = String(cfg.pet.snapInsetPx ?? 16)
    this.optDragBtn.value = cfg.pet.dragButton === 'left' ? 'left' : 'right'
    this.optAutoSquat.checked = cfg.pet.autoSquatEnabled ?? false
    this.optAutoSquatSec.value = String(cfg.pet.autoSquatIdleSec ?? 30)
    this.optWalkSpeed.value = String(cfg.pet.walkSpeedPxSec ?? 130)
    this.lblWalkSpeed.textContent = String(cfg.pet.walkSpeedPxSec ?? 130)
    // 探头探脑参数回填
    this.optPeekIdle.value = String(cfg.pet.peekIdleSec ?? 20)
    this.optPeekDuration.value = String(cfg.pet.peekDurationSec ?? 3)
    this.optPeekRatio.value = String(cfg.pet.peekOffsetRatio ?? 0.55)
    this.lblPeekRatio.textContent = (cfg.pet.peekOffsetRatio ?? 0.55).toFixed(2)
    this.optPeekInterval.value = String(cfg.pet.peekIntervalSec ?? 30)
    // v0.7 偶发探头参数回填
    this.optPeekV2Enabled.checked = cfg.pet.peekEnabled ?? true
    this.optPeekFreqMin.value = String(cfg.pet.peekFreqMin ?? 20)
    this.optPeekFreqMax.value = String(cfg.pet.peekFreqMax ?? 40)
    this.optPeekMaxDay.value = String(cfg.pet.peekMaxPerDay ?? 5)

    this.optEngine.value = cfg.tts.engine
    this.optRate.value = String(cfg.tts.rate)
    this.optPitch.value = String(cfg.tts.pitch)
    this.optVolume.value = String(cfg.tts.volume)
    this.lblRate.textContent = cfg.tts.rate.toFixed(2) + 'x'
    this.lblPitch.textContent = cfg.tts.pitch.toFixed(2) + 'x'
    this.lblVolume.textContent = Math.round(cfg.tts.volume * 100) + '%'
    ;(el('opt-tts-url') as HTMLInputElement).value = cfg.tts.customUrl
    ;(el('opt-tts-custom-model') as HTMLInputElement).value = cfg.tts.customModel
    ;(el('opt-tts-custom-voice') as HTMLInputElement).value = cfg.tts.customVoice
    this.rebuildVoiceOptions(cfg.tts.engine, cfg.tts.voice)
    this.toggleCustomTtsRows()

    this.optApiMode.value = cfg.api.mode
    this.optApiUrl.value = cfg.api.baseUrl
    this.optApiModel.value = cfg.api.model
    this.optApiKey.value = ''
    this.optApiKey.placeholder = cfg.api.apiKey ? `已保存（${cfg.api.apiKey.slice(0, 8)}…）` : '填写 API Key'

    this.optMemoryEnabled.checked = cfg.memory.enabled
    this.memoryDirLabel.textContent = cfg.memory.dir
    this.memoryDirLabel.title = cfg.memory.dir

    // 养成参数
    this.optDropRate.value = String(cfg.nurture.dropRate)
    this.optSatietyDecay.value = String(cfg.nurture.satietyDecayMin)
    this.optMoveInterval.value = String(cfg.nurture.moveIntervalSec)
    this.optMorningReport.value = cfg.assistant.morningReportAt
    this.optWidgetEnabled.checked = (state.settings as any).widgetEnabled ?? false
    // v0.8 Hermes 汇报
    ;(el('opt-report-at') as HTMLInputElement).value = cfg.assistant.reportAt ?? ''
    ;(el('opt-report-url') as HTMLInputElement).value = cfg.assistant.reportUrl ?? ''
    // v0.8 自定义台词
    ;(el('opt-line-greeting') as HTMLTextAreaElement).value = cfg.lines?.greeting ?? ''
    ;(el('opt-line-pat') as HTMLTextAreaElement).value = cfg.lines?.pat ?? ''
    ;(el('opt-line-hug') as HTMLTextAreaElement).value = cfg.lines?.hug ?? ''
    ;(el('opt-line-angry') as HTMLTextAreaElement).value = cfg.lines?.angry ?? ''
  }

  private toggleCustomTtsRows(): void {
    document.querySelectorAll('.custom-tts').forEach((n) => n.classList.toggle('hidden', this.optEngine.value !== 'custom'))
  }

  private rebuildVoiceOptions(engine: TtsEngine, selected?: string): void {
    const sel = this.optVoice
    sel.innerHTML = ''
    if (engine === 'edge') {
      for (const v of this.pet.edgeVoicePresets) {
        const o = document.createElement('option')
        o.value = v.id
        o.textContent = v.label
        sel.appendChild(o)
      }
    } else if (engine === 'sapi') {
      const names = this.tts.sapiVoiceNames
      if (names.length === 0) {
        const o = document.createElement('option')
        o.value = ''
        o.textContent = '（未检测到中文语音包）'
        sel.appendChild(o)
      } else {
        for (const n of names) {
          const o = document.createElement('option')
          o.value = n
          o.textContent = n.length > 18 ? n.slice(0, 18) + '…' : n
          sel.appendChild(o)
        }
      }
    } else {
      const o = document.createElement('option')
      o.value = (el('opt-tts-custom-voice') as HTMLInputElement).value || 'default'
      o.textContent = '自定义音色名（在下方填写）'
      sel.appendChild(o)
    }
    const want = selected ?? sel.options[0]?.value ?? ''
    if (want) sel.value = want
  }

  updateMoveButton(mode: MoveMode): void {
    // 工具条走动按钮已移除，走动切换由右键菜单与控制台 select 负责
    void mode
  }

  setPetScale(scale: number): void {
    this.optScale.value = String(scale)
    this.lblScale.textContent = scale.toFixed(2) + 'x'
  }

  setMemoryInfo(mem: MemoryData): void {
    this.memoryCount.textContent = String(mem.facts.length)
  }

  setNurture(n: NurtureState): void {
    this.lastNurture = n
    this.nLevel.textContent = `Lv.${n.level} ${levelTier(n.level)}`
    const need = expForLevel(n.level)
    const expPct = Math.min(100, Math.round((n.exp / need) * 100))
    this.nExp.textContent = `${n.exp} / ${need}`
    this.nExpBar.style.width = `${expPct}%`
    const satPct = Math.round(n.satiety)
    this.nSatiety.textContent = `${satPct}%`
    this.nSatietyBar.style.width = `${satPct}%`
    this.nSatietyBar.classList.toggle('low', n.satiety < 30)
    // v0.7 心情值（0-100，低于 20 变灰）
    const moodPct = Math.round(n.mood ?? 70)
    this.nMood.textContent = `${moodPct}%`
    this.nMoodBar.style.width = `${moodPct}%`
    this.nMoodBar.classList.toggle('low', moodPct < 20)
    // v0.7 饱食度已满时喂食按钮置灰（拒绝进食）
    const full = satPct >= 100
    for (const b of this.feedBtns) b.disabled = full
    const parts: string[] = []
    for (const id of ['fish', 'snack', 'cake'] as const) {
      const cnt = n.items[id] ?? 0
      if (cnt > 0) parts.push(`${ITEMS[id].label}×${cnt}`)
    }
    this.nItems.textContent = parts.length ? parts.join('、') : '空空如也'
  }

  /** 更新性格类型显示 */
  setPersonality(type: string): void {
    this.personalityType.textContent = type
  }

  /** 更新成就徽章显示 */
  setAchievements(unlocked: Array<{ id: string; unlockedAt: number }>): void {
    if (unlocked.length === 0) {
      this.achievementBadges.textContent = '暂无'
    } else {
      const labelMap: Record<string, string> = {
        first: '初遇', chatterbox: '健谈', 'pomodoro-10': '专注', 'pat-master': '疼爱',
        lv3: '成长', lv5: '熟练', lv10: '大师', 'streak-7': '连续7天', 'streak-30': '连续30天',
        'first-feed': '投喂', 'full-day': '全日陪伴', 'diary-writer': '日记',
        'water-3': '按时喝水', 'sedentary-2': '久坐克星', 'ack-streak-7': '七天养生局'
      }
      this.achievementBadges.textContent = unlocked.map((a) => labelMap[a.id] ?? a.id).join('、')
    }
  }

  setMemoryDir(dir: string): void {
    this.memoryDirLabel.textContent = dir
    this.memoryDirLabel.title = dir
  }

  /** v0.8 展示素材目录扫描结果（各槽位 内置/自定义 状态） */
  setAssetsScan(scan: AssetScanResult): void {
    this.assetDir.textContent = scan.dir ? scan.dir : '使用内置素材'
    this.assetDir.title = scan.dir
    this.assetSlots.innerHTML = ''
    if (!scan.dir) {
      const none = document.createElement('div')
      none.className = 'asset-slot'
      none.innerHTML = '<span class="as-name">全部</span><span class="as-flag off">内置</span><span class="as-files">未启用自定义素材</span>'
      this.assetSlots.appendChild(none)
      return
    }
    for (const s of scan.slots) {
      const row = document.createElement('div')
      row.className = 'asset-slot'
      const flag = s.active ? '<span class="as-flag on">自定义</span>' : '<span class="as-flag off">内置</span>'
      const files = s.files.map((f) => (f.ok ? f.name : `${f.name} ✗`)).join('、')
      row.innerHTML = `<span class="as-name">${s.label}</span>${flag}<span class="as-files" title="${files}">${files}</span>`
      this.assetSlots.appendChild(row)
    }
    // 目录已设置但没有任何可用素材（如目录被清空/文件名不匹配）→ 显式警告，避免静默回退内置
    if (scan.slots.length > 0 && scan.slots.every((s) => !s.active)) {
      const warn = document.createElement('div')
      warn.className = 'asset-slot'
      warn.innerHTML = '<span class="as-name">警告</span><span class="as-flag off">空目录</span><span class="as-files">该目录没有可识别的素材（需透明 PNG 且文件名匹配），当前全部使用内置素材</span>'
      this.assetSlots.appendChild(warn)
    }
  }

  setApiTestResult(ok: boolean, text: string): void {
    this.apiTestResult.textContent = text
    this.apiTestResult.className = ok ? 'ok' : 'err'
  }

  setTtsTestResult(ok: boolean, text: string): void {
    const r = el('tts-test-result')
    r.textContent = text
    r.className = ok ? 'ok' : 'err'
  }

  /** 设置趴下状态（更新按钮文字） */
  setSquatActive(active: boolean): void {
    this.squatActive = active
    this.btnSquat.textContent = active ? '起来' : '趴到任务栏'
  }

  /** 设置番茄时钟状态 */
  setPomodoroState(active: boolean, remainingSec = 0): void {
    this.pomodoroActive = active
    if (active) {
      this.btnPomodoroStart.textContent = '停止番茄钟'
      const min = Math.floor(remainingSec / 60)
      const sec = Math.floor(remainingSec % 60)
      this.pomodoroStatus.textContent = `专注中 ${min}:${sec.toString().padStart(2, '0')}`
    } else {
      this.btnPomodoroStart.textContent = '开始番茄时钟'
      this.pomodoroStatus.textContent = '专注 25 分钟'
    }
  }

  /** 查询番茄时钟是否激活 */
  isPomodoroActive(): boolean {
    return this.pomodoroActive
  }

  refreshTimers(timers: ScheduleTimer[]): void {
    this.timerList.innerHTML = ''
    if (timers.length === 0) {
      const d = document.createElement('div')
      d.className = 'muted'
      d.textContent = '暂无（对话里说"提醒我30分钟后…"）'
      this.timerList.appendChild(d)
      return
    }
    for (const t of timers) {
      const row = document.createElement('div')
      row.className = 'timer-item'
      const time = new Date(t.fireAt)
      const span = document.createElement('span')
      span.textContent = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')} ${t.text}`
      span.title = t.text
      const del = document.createElement('button')
      del.textContent = '✕'
      del.addEventListener('click', () => this.cb.onRemoveTimer(t.id))
      row.appendChild(span)
      row.appendChild(del)
      this.timerList.appendChild(row)
    }
  }

  toggleChat(): void {
    this.chatOpen ? this.closeChat() : this.openChat()
  }

  openChat(): void {
    this.chatOpen = true
    this.chatbar.classList.remove('hidden')
    this.input.focus()
  }

  closeChat(): void {
    this.chatOpen = false
    this.chatbar.classList.add('hidden')
    this.input.blur()
  }

  toggleMenu(): void {
    this.menuOpen ? this.closeMenu() : this.openMenu()
  }

  openMenu(): void {
    this.menuOpen = true
    this.menu.classList.remove('hidden')
  }

  /** 刷新日常速览数据（活跃时长/聊天次数/番茄数/按键统计） */
  refreshDailyStats(stats: { activeSecondsToday: number; chatsToday: number; pomodorosToday: number; keysToday?: number; keyCharsToday?: number; keySpaceToday?: number; keyEnterToday?: number }): void {
    this.statActiveMin.textContent = String(Math.round(stats.activeSecondsToday / 60))
    this.statChats.textContent = String(stats.chatsToday)
    this.statPomodoros.textContent = String(stats.pomodorosToday)
    if (stats.keysToday !== undefined) this.statKeysTotal.textContent = String(stats.keysToday)
    if (stats.keyCharsToday !== undefined) this.statKeysChars.textContent = String(stats.keyCharsToday)
    if (stats.keySpaceToday !== undefined) this.statKeysSpace.textContent = String(stats.keySpaceToday)
    if (stats.keyEnterToday !== undefined) this.statKeysEnter.textContent = String(stats.keyEnterToday)
  }

  closeMenu(): void {
    this.menuOpen = false
    this.menu.classList.add('hidden')
  }

  openCtxMenu(x: number, y: number): void {
    this.ctxMenuOpen = true
    this.ctxMenu.classList.remove('hidden')
    // 整体向右偏移 20px，避免菜单紧贴宠物（光标即落在宠物上）
    const rx = x + 20
    // 边界反弹：超出窗口则向左/上展开
    const rect = this.ctxMenu.getBoundingClientRect()
    const w = rect.width || 160
    const h = rect.height || 220
    const left = rx + w > window.innerWidth ? rx - w : rx
    const top = y + h > window.innerHeight ? y - h : y
    this.ctxMenu.style.left = `${Math.max(0, left)}px`
    this.ctxMenu.style.top = `${Math.max(0, top)}px`
  }

  closeCtxMenu(): void {
    this.ctxMenuOpen = false
    this.ctxMenu.classList.add('hidden')
  }

  setInputText(text: string): void {
    this.input.value = text
  }

  setRecording(on: boolean): void {
    this.recordingEl.classList.toggle('hidden', !on)
  }

  private submit(): void {
    const text = this.input.value.trim()
    if (!text) return
    this.input.value = ''
    this.cb.onSend(text)
  }

  /** UI 元素跟随宠物定位（头顶） */
  position(petX: number, petTopY: number): void {
    const y = `${Math.max(52, petTopY - 46)}px`
    this.toolbar.style.left = `${petX}px`
    this.toolbar.style.top = y
    this.chatbar.style.left = `${petX}px`
    this.chatbar.style.top = `${Math.max(96, petTopY - 100)}px`
    this.menu.style.left = `${petX}px`
    // 菜单底边贴近宠物头顶（原 124px 间距太远）
    this.menu.style.top = `${Math.max(8, petTopY - 18)}px`
    this.recordingEl.style.left = `${petX}px`
    this.recordingEl.style.top = `${Math.max(96, petTopY - 100)}px`
  }

  showToolbar(): void {
    this.toolbarOpen = true
    this.toolbar.classList.remove('hidden')
  }

  hideToolbar(): void {
    this.toolbarOpen = false
    this.toolbar.classList.add('hidden')
  }
}
