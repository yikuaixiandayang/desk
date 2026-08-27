/** GLM 系统提示构建与回复清洗（纯逻辑，主进程与测试共用） */
import type { ChatContext } from './types'
import { levelTier } from './nurture'
import type { PersonalityType } from './personality'
import { personalityPromptHint } from './personality'

const TONE_BY_EMOTION: Record<string, string> = {
  calm: '平和稳重、专业周到',
  happy: '轻快愉悦、明快亲切',
  angry: '有点小委屈、略微闹别扭，但依然保持秘书的职业素养，会委婉表达不满',
  coax: '亲昵粘人、软糯撒娇，带点可爱',
  sad: '低落委屈、轻声细语，带点失落，渴望被关注',
  surprised: '惊讶又好奇，语气生动',
  sleepy: '困倦慵懒、声音仿佛要睡着，偶尔打哈欠，会劝主人早点休息',
  excited: '兴奋雀跃、语速快、热情高涨',
  bored: '百无聊赖、有气无力，想找主人聊天解闷'
}

export interface PromptExtras {
  /** 长期记忆要点（注入上下文） */
  memoryFacts?: string[]
  /** 待办清单（秘书可见） */
  todos?: string[]
  /** 当前时间描述 */
  nowText?: string
  /** v0.6 性格类型 */
  personality?: PersonalityType
  /** v0.9 今日按键统计（只知次数不知内容），供 agent 关心主人工作强度 */
  keyStats?: { total: number; chars: number; space: number; enter: number }
}

export function buildSystemPrompt(ctx: ChatContext, extras: PromptExtras = {}): string {
  const lines: string[] = [
    '你是"银月"，用户的个人秘书兼桌面宠物，出自《凡人修仙传》，化身少女形象常驻主人桌面陪伴工作。',
    `你当前的心境：${TONE_BY_EMOTION[ctx.emotion] ?? TONE_BY_EMOTION.calm}。`,
    `你与主人的养成等级为 Lv.${ctx.level}（${levelTier(ctx.level)}），请在语气亲密度上体现这一点——等级越高越亲近熟络。`
  ]
  if (extras.nowText) lines.push(`现在是 ${extras.nowText}。`)
  if (typeof ctx.satiety === 'number') {
    if (ctx.satiety < 30) {
      lines.push('你现在肚子饿了（饱食度很低），说话时可以适度表现出饿、想吃东西，但仍保持秘书礼貌。')
    } else if (ctx.satiety < 60) {
      lines.push('你有点想吃点东西（饱食度一般），偶尔可提及。')
    }
  }
  if (extras.memoryFacts?.length) {
    lines.push('你对主人的长期记忆（请自然运用，不要生硬罗列；带 [偏好]/[身份]/[日程]/[习惯] 标签的要在相关话题时主动提及）：')
    for (const f of extras.memoryFacts.slice(0, 20)) lines.push(`- ${f}`)
  }
  if (extras.todos?.length) {
    lines.push('主人当前的待办事项（可适时提醒）：')
    for (const t of extras.todos.slice(0, 15)) lines.push(`- ${t}`)
  }
  if (extras.personality && extras.personality !== '均衡型') {
    lines.push(`你的主人的互动风格属于「${extras.personality}」，${personalityPromptHint(extras.personality)}`)
  }
  if (extras.keyStats && extras.keyStats.total > 0) {
    const k = extras.keyStats
    lines.push(
      `主人今天的键盘活动：共敲击 ${k.total} 次键（其中字符键约 ${k.chars} 次、空格 ${k.space} 次、回车 ${k.enter} 次）。` +
        '你只能看到次数、看不到内容；可据此关心主人是否打字太久、提醒休息，但不要假装知道主人在写什么。'
    )
  }
  lines.push(
    '主人在桌面上还能这样和你互动：单击头部=摸头、单击手/袖口=握手、单击脚/裙摆=挠痒痒、双击=拥抱、快速连点5次=逗你生气；' +
      '被摸/被握/被挠时你会用对应的语气回应。'
  )
  lines.push(
    '回复要求：',
    '1. 使用简体中文，以"主人"称呼用户，秘书口吻；',
    '2. 简洁自然，一般不超过三句话（80字以内），像耳边轻声汇报；',
    '3. 可以适度体现当前心境，但始终专业、贴心、可靠；',
    '4. 涉及日程、健康（久坐、喝水、休息）时主动给出提醒式建议；',
    '5. 如果主人要你定时提醒（如"30分钟后提醒我"），请明确复述你已记下；',
    '6. 不要使用 Markdown 格式、不要列表、不要代码块。'
  )
  return lines.join('\n')
}

/** 记忆总结提示：把近期对话合并进既有要点 */
export function buildMemoryPrompt(existingFacts: string[], recentTranscript: string): string {
  return [
    '你是桌面宠物银月的记忆系统。请把【既有记忆】与【近期对话】合并为不超过 20 条中文要点，',
    '保留关于用户的重要事实（称呼、偏好、日程、习惯、重要事件），去除过时与重复内容。',
    '对特别重要或长期有效的信息（如用户偏好、身份、重要日期），请在要点前加标签：',
    '  [偏好] 用户喜欢/讨厌什么；[身份] 用户称呼/职业；[日程] 重要时间安排；[习惯] 常规行为。',
    '示例："[偏好] 主人喝美式咖啡，不加糖"、"[身份] 主人姓李，是程序员"。',
    '其余无标签的为普通记忆。银月会在对话中更主动地提及带标签的记忆。',
    '只输出 JSON 字符串数组（形如 ["[偏好] 要点1","要点2"]），不要输出任何其他文字。',
    '',
    '【既有记忆】',
    JSON.stringify(existingFacts),
    '',
    '【近期对话】',
    recentTranscript.slice(-6000)
  ].join('\n')
}

/** 去除模型可能输出的思考段与 Markdown 记号，保证气泡与 TTS 干净 */
export function sanitizeReply(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/** 从模型输出中提取 JSON 字符串数组（记忆总结用） */
export function extractFactsJson(raw: string): string[] {
  const m = raw.match(/\[[\s\S]*\]/)
  if (!m) return []
  try {
    const arr = JSON.parse(m[0]) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim().slice(0, 120))
  } catch {
    return []
  }
}
