/** 渲染进程与主进程共享的类型与 IPC 通道契约 */

/** 情绪全集（12 种）：平静/开心/生气/撒娇/委屈/惊讶/困倦/兴奋/无聊/好奇/调皮/眷恋 */
export type EmotionKind =
  | 'calm'
  | 'happy'
  | 'angry'
  | 'coax'
  | 'sad'
  | 'surprised'
  | 'sleepy'
  | 'excited'
  | 'bored'
  | 'curious'
  | 'mischievous'
  | 'lovestruck'

/** 会话历史条目（user/assistant 各算一条） */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

export interface EmotionState {
  current: EmotionKind
  /** 临时情绪的到期时间戳(ms)，null 表示由好感度基线决定 */
  until: number | null
}

export interface ReminderConfig {
  enabled: boolean
  sedentaryMin: number
  waterMin: number
}

export interface Settings {
  ttsEnabled: boolean
  autoLaunch: boolean
  /** v0.6 桌面小卡片开关 */
  widgetEnabled?: boolean
}

export interface UsageStats {
  lastActiveDate: string
  activeSecondsToday: number
  lastInteractionAt: number
  lastWaterRemindAt: number
  lastSedentaryRemindAt: number
  /** 今日统计（跨天由提醒服务重置） */
  chatsToday: number
  patsToday: number
  pomodorosToday: number
  acksToday: number
  /** v0.9 新增互动：今日握手/挠痒次数 */
  handsToday: number
  ticklesToday: number
  /** v0.9 全局按键统计（仅计数不记内容，跨天由 keycount 服务重置） */
  keysToday: number
  keyCharsToday: number
  keySpaceToday: number
  keyEnterToday: number
  lastKeysDate: string
  /** v0.7 探头互动：今日探头次数 + 计数日期（YYYY-MM-DD） */
  peeksToday: number
  lastPeekDate: string
}

export interface PetPersist {
  x: number | null
  y: number | null
  scale: number
}

/** 养成系统状态（饱食度/经验/等级/道具库存/心情） */
export interface NurtureState {
  /** 当前经验（累积制，不因升级扣除） */
  exp: number
  /** 当前等级 */
  level: number
  /** 饱食度 0-100 */
  satiety: number
  /** 最后一次喂食时间戳（用于饱食度衰减） */
  lastFedAt: number
  /** 道具库存 { id: 数量 } */
  items: Record<string, number>
  /** 最后一次掉落时间戳（用于掉落限频） */
  lastDropAt: number
  /** 饱食度衰减已扣过的块数 */
  satietyDecayApplied: number
  /** v0.7 心情值 0-100（初始 70） */
  mood: number
  /** v0.7 冷落衰减已扣过的块数（每块 30 分钟） */
  moodDecayApplied: number
}

/** 持久化到 electron-store 的完整状态 */
export interface PetStoreState {
  emotion: EmotionState
  history: ChatMessage[]
  reminderConfig: ReminderConfig
  settings: Settings
  stats: UsageStats
  pet: PetPersist
  nurture: NurtureState
}

// ---------- 运行时配置（后台控制台可改，实时生效） ----------

export type ApiMode = 'openai' | 'offline'
export type TtsEngine = 'edge' | 'sapi' | 'custom'
export type MoveMode = 'auto' | 'still'

export interface ApiConfig {
  mode: ApiMode
  baseUrl: string
  model: string
  apiKey: string
}

export interface TtsConfig {
  engine: TtsEngine
  /** edge 音色（如 zh-CN-XiaoyiNeural）或 sapi 语音名 */
  voice: string
  /** 0.5 ~ 2.0，1 为正常 */
  rate: number
  /** 0.5 ~ 2.0，1 为正常 */
  pitch: number
  /** 0 ~ 1 */
  volume: number
  /** 自定义 OpenAI 兼容 /v1/audio/speech（接 GPT-SoVITS/fish-audio 等可克隆音色） */
  customUrl: string
  customKey: string
  customModel: string
  customVoice: string
}

export interface MemoryConfig {
  enabled: boolean
  /** 本地记忆副本目录（json + md 明文可读） */
  dir: string
}

export interface PetPrefs {
  moveMode: MoveMode
  /** 宠物缩放 0.5 ~ 2.0（1 = 210px 高） */
  scale: number
  /** 宠物自定义昵称（默认「银月」），用于系统生成文案中的自称 */
  name: string
  /** 自定义开场问候语，留空则用内置问候 */
  greeting: string
  /** 主动搭话最小间隔（分钟），0=按性格/时段自动，>0 固定间隔 */
  chatterIntervalMin: number
  /** 拖拽到屏幕边缘时自动执行边缘动作（下缘趴下 / 左右上缘探头，默认关） */
  edgeSnap: boolean
  /** 空闲 N 秒后自动从站立切换为趴下状态 */
  autoSquatEnabled: boolean
  /** 自动趴下等待秒数（5~300，默认 30） */
  autoSquatIdleSec: number
  /** 自由漫步时的走动速度（像素/秒，默认 130，范围 50~400） */
  walkSpeedPxSec: number
  /** 探头：贴边静止 N 秒后触发（5~600，默认 20；需小于自动趴下等待才有机会触发） */
  peekIdleSec: number
  /** 探头动画时长秒数（1~10，默认 3） */
  peekDurationSec: number
  /** 探出幅度比例（0.2~0.9，默认 0.55 = 约半个身位） */
  peekOffsetRatio: number
  /** 两次探头最小间隔秒数（10~600，默认 30） */
  peekIntervalSec: number
  /** 拖到边缘后延迟 N 秒探头（0~10，默认 2，0=立即） */
  peekEdgeDelaySec: number
  /** v0.7 探头互动总开关（默认开） */
  peekEnabled: boolean
  /** v0.7 偶发探头：距上次探头的最小间隔（分钟，默认 20） */
  peekFreqMin: number
  /** v0.7 偶发探头：距上次探头的最大间隔（分钟，默认 40） */
  peekFreqMax: number
  /** v0.7 每日探头次数上限（默认 5） */
  peekMaxPerDay: number
  /** v0.8 吸附时向内的露脸偏移（px，默认 26；0=紧贴边缘） */
  snapInsetPx: number
  /** v0.8 拖动宠物的鼠标键：right=右键按住拖动，left=左键按住拖动 */
  dragButton: 'right' | 'left'
  /** v0.8 用户自定义素材目录（空=使用内置素材；非空则按槽位文件覆盖） */
  assetsDir: string
}

export interface WeatherConfig {
  /** 记忆的城市名（默认北京，可对话中切换） */
  city: string
}

/** 养成系统可调参数 */
export interface NurtureConfig {
  /** 互动掉落道具概率 0~1（默认 0.3） */
  dropRate: number
  /** 饱食度每多少分钟衰减一次（默认 30） */
  satietyDecayMin: number
  /** 宠物自主移动间隔秒数（默认 0=用内置 6~15s 随机；>0 为固定间隔） */
  moveIntervalSec: number
}

/** 私人助手参数 */
export interface AssistantConfig {
  /** 每日早报时间，格式 "HH:MM"，空字符串表示关闭 */
  morningReportAt: string
  /** 上次早报日期（YYYY-MM-DD），防止同一天重复触发 */
  lastReportDate: string
  /** v0.8 每日向 Hermes 汇报时间 "HH:MM"，空=关闭（离线时静默跳过） */
  reportAt: string
  /** v0.8 Hermes 汇报地址（base url） */
  reportUrl: string
}

/** v0.8 自定义台词：每项为多行文本（每行一条候选），留空用内置台词 */
export interface LinesConfig {
  /** 启动问候 */
  greeting: string
  /** 拍头反应 */
  pat: string
  /** 双击拥抱 */
  hug: string
  /** 连点抗议（生气） */
  angry: string
  /** v0.9 被握手反应 */
  hand: string
  /** v0.9 被挠痒反应 */
  tickle: string
}

export interface AppRuntimeConfig {
  api: ApiConfig
  tts: TtsConfig
  memory: MemoryConfig
  pet: PetPrefs
  weather: WeatherConfig
  nurture: NurtureConfig
  assistant: AssistantConfig
  /** v0.8 自定义台词 */
  lines: LinesConfig
}

/** 控制台配置补丁（分节部分更新） */
export interface AppConfigPatch {
  api?: Partial<ApiConfig>
  tts?: Partial<TtsConfig>
  memory?: Partial<MemoryConfig>
  pet?: Partial<PetPrefs>
  weather?: Partial<WeatherConfig>
  nurture?: Partial<NurtureConfig>
  assistant?: Partial<AssistantConfig>
  lines?: Partial<LinesConfig>
}

// ---------- 记忆 / 提醒 / 待办 ----------

export interface MemoryData {
  facts: string[]
  updatedAt: number
  summarizedCount: number
}

/** 台词场景分类（与 LinesConfig 自定义台词键一致） */
export type LineCategory = 'greeting' | 'pat' | 'hug' | 'angry' | 'hand' | 'tickle'

/** GLM 生成的个性化台词（每类多条候选；GLM 不可用时不生成，渲染层回退硬编码） */
export interface PersonalityLines {
  greeting: string[]
  pat: string[]
  hug: string[]
  angry: string[]
  hand: string[]
  tickle: string[]
  updatedAt: number
}

export interface ScheduleTimer {
  id: string
  text: string
  fireAt: number
  createdAt: number
  done: boolean
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
  ts: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type ReminderEventKind = 'sedentary' | 'water'

export interface ReminderEvent {
  kind: ReminderEventKind
  minutes: number
}

/** GLM 调用上下文（来自渲染进程当前状态） */
export interface ChatContext {
  emotion: EmotionKind
  /** 养成等级，注入 system prompt 表达亲密度 */
  level: number
  /** 饱食度，注入让 GLM 感知饥饿状态 */
  satiety?: number
}

export interface ChatResult {
  ok: boolean
  content: string
  error?: string
  latencyMs?: number
  model?: string
  /** true 表示使用了本地降级 */
  degraded?: boolean
}

export interface AsrStatus {
  modelPresent: boolean
  downloading: boolean
  receivedBytes: number
  totalBytes: number
  serverPort: number | null
}

export interface TtsVoiceOption {
  engine: TtsEngine
  id: string
  label: string
}

export interface TtsSpeakResult {
  ok: boolean
  /** 成功时为 data URL 音频 */
  dataUrl?: string
  error?: string
  engine: TtsEngine
}

/** 番茄钟状态 */
export interface PomodoroState {
  active: boolean
  phase: 'focus' | 'break'
  /** 当前阶段结束时间戳 */
  endsAt: number
  focusMin: number
}

/** 每日早报内容（主进程聚合后推给渲染层播报） */
export interface MorningReport {
  date: string
  todos: string[]
  weather: { city: string; temp: number; code: number } | null
  greeting: string
}

/** 养成事件（主进程 → 渲染进程） */
export interface NurtureEvent {
  kind: 'levelUp' | 'drop' | 'fed' | 'hungry' | 'levelDown'
  /** 升级/掉级时为等级，掉落时为道具 ID */
  value?: number | string
}

export interface WeatherNow {
  ok: boolean
  city: string
  temp?: number
  /** WMO 天气码（渲染层转中文描述） */
  code?: number
  humidity?: number
  wind?: number
  tmax?: number
  tmin?: number
  /** 降水概率 % */
  pop?: number
  error?: string
}

/** 聊天路由器输入（主进程执行技能分发） */
export interface ChatRouterInput {
  text: string
  history: ChatMessage[]
  ctx: ChatContext
  memoryFacts?: string[]
  nowText?: string
}

/** 路由器副作用 */
export interface RouterSideEffect {
  playNoise?: string
  stopNoise?: boolean
  refreshTimers?: boolean
}

/** 聊天路由器返回结果 */
export interface ChatRouterResult {
  reply: string
  degraded: boolean
  emotion?: EmotionKind
  sideEffect?: RouterSideEffect
}

export const IPC = {
  storeGetState: 'store:get-state',
  storePatch: 'store:patch',
  glmChat: 'glm:chat',
  glmParseTimer: 'glm:parse-timer',
  winClickThrough: 'win:click-through',
  winQuit: 'win:quit',
  winDevtools: 'win:devtools',
  /** 渲染层逐帧把小窗口定位到“宠物屏幕坐标 − 固定锚点”，使其跟随宠物跨屏移动 */
  winSetBounds: 'win:set-bounds',
  /** 显示器布局变化时主进程通知渲染层重新拉取活动范围 */
  screenChanged: 'screen:changed',
  screenBounds: 'screen:bounds',
  appAutoLaunch: 'app:auto-launch',
  appPing: 'app:ping',
  openStorePath: 'app:open-store-path',
  reminderEvent: 'reminder:event',
  reminderAction: 'reminder:action',
  asrStatus: 'asr:status',
  asrEnsureModel: 'asr:ensure-model',
  asrModelUrl: 'asr:model-url',
  asrProgress: 'asr:progress',
  // v0.2 后台控制台
  appConfigGet: 'appconfig:get',
  appConfigSet: 'appconfig:set',
  appConfigTest: 'appconfig:test',
  // TTS
  ttsSpeak: 'tts:speak',
  ttsVoices: 'tts:voices',
  // 记忆
  memoryGet: 'memory:get',
  memorySummarize: 'memory:summarize',
  memorySetDir: 'memory:set-dir',
  memoryOpenDir: 'memory:open-dir',
  memoryExport: 'memory:export',
  memoryImport: 'memory:import',
  memoryChooseDir: 'memory:choose-dir',
  memoryChooseImport: 'memory:choose-import',
  // 个性化台词（GLM 生成）
  linesGet: 'lines:get',
  linesRefresh: 'lines:refresh',
  // 定时提醒
  timerAdd: 'timer:add',
  timerList: 'timer:list',
  timerRemove: 'timer:remove',
  timerFire: 'timer:fire',
  // 待办
  todoList: 'todo:list',
  todoAdd: 'todo:add',
  todoToggle: 'todo:toggle',
  todoClearDone: 'todo:clear-done',
  // v0.3 番茄钟 / 天气 / 快捷键助手
  pomodoroStart: 'pomodoro:start',
  pomodoroBreak: 'pomodoro:break',
  pomodoroStop: 'pomodoro:stop',
  pomodoroStatus: 'pomodoro:status',
  pomodoroEvent: 'pomodoro:event',
  weatherGet: 'weather:get',
  glmAssist: 'glm:assist',
  assistClipboard: 'assist:clipboard',
  // v0.4 养成系统
  nurtureFeed: 'nurture:feed',
  nurtureDrop: 'nurture:drop',
  nurtureState: 'nurture:state',
  nurtureEvent: 'nurture:event',
  nurtureAddExp: 'nurture:add-exp',
  nurtureAddMood: 'nurture:add-mood',
  morningReport: 'assistant:morning-report',
  // v0.6 聊天路由
  chatRoute: 'chat:route',
  chatParseTimer: 'chat:parse-timer',
  // v0.6 性格养成
  personalityBump: 'personality:bump',
  personalityGet: 'personality:get',
  // v0.6 银月日记 + 成就徽章
  diaryGenerate: 'diary:generate',
  diaryList: 'diary:list',
  achievementList: 'achievement:list',
  achievementCheck: 'achievement:check',
  // v0.7 提醒统计（SQLite）
  statsAckReminder: 'stats:ack-reminder',
  // v0.8 自定义素材（用户自选目录 → dataURL 覆盖）
  assetsScan: 'assets:scan',
  assetsChoose: 'assets:choose',
  assetsClear: 'assets:clear',
  assetsRead: 'assets:read',
  assetsPick: 'assets:pick',
  assetsReadFiles: 'assets:read-files'
} as const

export const DEFAULT_STATE: PetStoreState = {
  emotion: { current: 'calm', until: null },
  history: [],
  reminderConfig: { enabled: true, sedentaryMin: 45, waterMin: 60 },
  settings: { ttsEnabled: true, autoLaunch: false },
  stats: {
    lastActiveDate: '',
    activeSecondsToday: 0,
    lastInteractionAt: 0,
    lastWaterRemindAt: 0,
    lastSedentaryRemindAt: 0,
    chatsToday: 0,
    patsToday: 0,
    pomodorosToday: 0,
    acksToday: 0,
    handsToday: 0,
    ticklesToday: 0,
    keysToday: 0,
    keyCharsToday: 0,
    keySpaceToday: 0,
    keyEnterToday: 0,
    lastKeysDate: '',
    peeksToday: 0,
    lastPeekDate: ''
  },
  pet: { x: null, y: null, scale: 1 },
  nurture: {
    exp: 0,
    level: 1,
    satiety: 80,
    lastFedAt: 0,
    items: { fish: 3, snack: 2, cake: 1 },
    lastDropAt: 0,
    satietyDecayApplied: 0,
    mood: 70,
    moodDecayApplied: 0
  }
}

export const DEFAULT_APP_CONFIG: AppRuntimeConfig = {
  api: {
    mode: 'openai',
    baseUrl: 'http://172.22.40.153:8642',
    model: 'GLM-5.2',
    apiKey: ''
  },
  tts: {
    engine: 'edge',
    voice: 'zh-CN-XiaoyiNeural',
    rate: 1,
    pitch: 1,
    volume: 0.9,
    customUrl: '',
    customKey: '',
    customModel: 'gpt-sovix',
    customVoice: 'yin_yue'
  },
  memory: {
    enabled: true,
    dir: ''
  },
  pet: { moveMode: 'auto', scale: 1, name: '银月', greeting: '', chatterIntervalMin: 0, edgeSnap: true, autoSquatEnabled: false, autoSquatIdleSec: 30, walkSpeedPxSec: 130, peekIdleSec: 20, peekDurationSec: 3, peekOffsetRatio: 0.55, peekIntervalSec: 30, peekEdgeDelaySec: 2, peekEnabled: true, peekFreqMin: 20, peekFreqMax: 40, peekMaxPerDay: 5, snapInsetPx: 16, dragButton: 'right', assetsDir: '' },
  weather: { city: '北京' },
  nurture: { dropRate: 0.3, satietyDecayMin: 30, moveIntervalSec: 0 },
  assistant: { morningReportAt: '', lastReportDate: '', reportAt: '', reportUrl: 'http://172.22.40.153:8642' },
  lines: { greeting: '', pat: '', hug: '', angry: '', hand: '', tickle: '' }
}

/** 会话保留的最大轮数（一轮 = user + assistant） */
export const MAX_HISTORY_ROUNDS = 20

// ---------- v0.8 自定义素材槽位 ----------
/** 可被用户替换的素材槽位 id */
export type AssetSlotId = 'sprite' | 'lean' | 'peek' | 'actions' | 'walk'

/** 槽位定义：唯一文件命名 + 面向用户说明（渲染层 UI 展示文案也用它） */
export interface AssetSlot {
  id: AssetSlotId
  label: string
  desc: string
  /** 该槽位涉及的源文件名（用户自选目录中按此命名即生效） */
  files: string[]
  /** v0.8 合图格式：单张精灵图文件名；存在则整槽位用合图替换（按固定网格切片），优先于 files 散图 */
  sheet?: string
  /** 合图网格描述（展示用） */
  sheetDesc?: string
}

/** 用户素材目录扫描结果（主进程返回，渲染层展示） */
export interface AssetScanResult {
  dir: string
  /** 各槽位命中状态：files 全部存在且通过基础校验(透明 PNG)才置 active */
  slots: AssetSlotStatus[]
}

export interface AssetSlotStatus {
  id: AssetSlotId
  label: string
  desc: string
  /** 该槽位是否被用户自定义素材覆盖 */
  active: boolean
  /** 每个所需文件是否存在且为透明 PNG */
  files: { name: string; ok: boolean }[]
}

/** 固定槽位清单（展示顺序即渲染层加载顺序）。
 *  v0.8 合图格式：每槽位可只放一张 sheet 合图（网格切片），或放 files 散图，缺省回退内置。
 */
export const ASSET_SLOTS: AssetSlot[] = [
  {
    id: 'sprite',
    label: '主精灵图',
    desc: 'sprite.png：4 列 × 3 行透明精灵图，替代默认站姿/行走/情绪/趴姿画风',
    files: ['sprite.png']
  },
  {
    id: 'lean',
    label: '趴下动作',
    desc: 'lean.png 合图（1 行 × 2 列：趴睡 | 趴笑）或 lean0.png / lean1.png 两张散图',
    files: ['lean0.png', 'lean1.png'],
    sheet: 'lean.png',
    sheetDesc: '1 行 × 2 列'
  },
  {
    id: 'peek',
    label: '边缘探头',
    desc: 'peek.png 合图（3 列 × 2 行：列=左/右/顶，行=基础帧/前景帧）或 6 张散图',
    files: [
      'peek_left.png', 'peek_left_fg.png',
      'peek_right.png', 'peek_right_fg.png',
      'peek_top.png', 'peek_top_fg.png'
    ],
    sheet: 'peek.png',
    sheetDesc: '3 列 × 2 行'
  },
  {
    id: 'actions',
    label: 'B 类动作',
    desc: 'actions.png 合图（4 列 × 3 行：伸懒腰/打哈欠/托腮/小跳 + 摇头/跺脚/委屈/转圈 + 握手/挠痒，末行可留 2 空格）或 10 张散图；旧 4×2 合图仍兼容',
    files: ['act_stretch.png', 'act_yawn.png', 'act_think.png', 'act_jump.png', 'act_shake.png', 'act_stomp.png', 'act_pout.png', 'act_spin.png', 'act_hold.png', 'act_tickle.png'],
    sheet: 'actions.png',
    sheetDesc: '4 列 × 3 行'
  },
  {
    id: 'walk',
    label: '走路动画',
    desc: 'walk.png 合图（1 行 × 4 列走路循环帧），可选；缺失时走路用单帧+程序化颠簸',
    files: [],
    sheet: 'walk.png',
    sheetDesc: '1 行 × 4 列'
  }
]

/** 推荐的 Edge 神经音色（少女向优先） */
export const EDGE_VOICE_PRESETS: TtsVoiceOption[] = [
  { engine: 'edge', id: 'zh-CN-XiaoyiNeural', label: '晓伊（活泼少女·推荐）' },
  { engine: 'edge', id: 'zh-CN-XiaoxiaoNeural', label: '晓晓（温柔女声）' },
  { engine: 'edge', id: 'zh-CN-XiaohanNeural', label: '晓涵（沉稳女声）' },
  { engine: 'edge', id: 'zh-CN-XiaomengNeural', label: '晓梦（甜美女声）' },
  { engine: 'edge', id: 'zh-CN-XiaoshuangNeural', label: '晓双（童声）' },
  { engine: 'edge', id: 'zh-CN-YunxiNeural', label: '云希（阳光男声）' },
  { engine: 'edge', id: 'zh-CN-YunyangNeural', label: '云扬（新闻男声）' },
  { engine: 'edge', id: 'zh-TW-HsiaoChenNeural', label: '曉臻（台湾女声）' }
]
