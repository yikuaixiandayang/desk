/**
 * 个性化台词服务：
 * - 用 GLM 基于记忆要点 + 昵称生成各场景台词候选，存入 electron-store
 * - GLM 不可用/解析失败时返回 null，旧台词保持不动（渲染层用旧台词或硬编码兜底）
 * - 触发时机与记忆总结同频：summarizeMemory 成功后 fire-and-forget 调用
 */
import type { LineCategory, PersonalityLines } from '@shared/types'
import { get as storeGet, set as storeSet } from './store'
import { getConfig } from './appconfig'
import { chatRaw } from './glm'
import { getMemory } from './memory'

const CATEGORIES: readonly LineCategory[] = ['greeting', 'pat', 'hug', 'angry', 'hand', 'tickle']

/** 每类最多保留的候选条数 */
const MAX_PER_CATEGORY = 4

/** 当前台词（未生成过时返回 null） */
export function getLines(): PersonalityLines | null {
  return storeGet('personalityLines') ?? null
}

/** 台词生成系统提示（台词独立于对话，不复用 prompts.ts 的 system prompt） */
function linesSystemPrompt(name: string): string {
  return [
    '你是桌宠台词创作系统。根据角色的记忆与设定，为她撰写日常台词候选。',
    `角色名「${name}」，是陪伴主人办公的桌面宠物，性格亲切俏皮，自称角色名，称呼对方"主人"。`,
    '要求：',
    '1. 只输出一个 JSON 对象，不要输出任何其他文字，不要 Markdown 代码块。',
    '2. JSON 含 greeting / pat / hug / angry / hand / tickle 六个键，各为 3 条字符串组成的数组。',
    '3. greeting=启动问候，pat=被摸头反应（台词中要提到"头"），hug=被双击拥抱，angry=被连续戳时的抗议，hand=被握住手/击掌（台词中要提到"手"），tickle=被挠痒痒（台词中要提到"脚/腰/痒"等）。',
    '4. 每条不超过 25 个汉字，口语化，融入记忆中的细节（若有），六类语气区分明显。',
    '5. 台词要具体描述被触碰的部位，如摸头时说"头好舒服"，握手时说"手好温暖"，挠痒时说"脚好痒"等。'
  ].join('\n')
}

function linesUserPrompt(facts: string[]): string {
  const factText = facts.length > 0 ? facts.slice(0, 12).map((f) => `- ${f}`).join('\n') : '（暂无记忆，按默认设定自由发挥）'
  return `角色记忆要点：\n${factText}\n\n请生成台词 JSON。`
}

/** 容错解析：剥代码块围栏后取 JSON，逐类清洗为字符串数组（全空视为失败） */
function parseLinesJson(content: string): PersonalityLines | null {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let raw: unknown
  try {
    raw = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const data: Record<LineCategory, string[]> = { greeting: [], pat: [], hug: [], angry: [], hand: [], tickle: [] }
  let total = 0
  for (const cat of CATEGORIES) {
    const arr = (raw as Record<string, unknown>)[cat]
    if (!Array.isArray(arr)) continue
    data[cat] = arr.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean).slice(0, MAX_PER_CATEGORY)
    total += data[cat].length
  }
  return total > 0 ? { ...data, updatedAt: Date.now() } : null
}

/** 用 GLM 生成个性化台词并存入 store（失败返回 null，保持旧台词） */
export async function refreshPersonalityLines(): Promise<PersonalityLines | null> {
  const cfg = getConfig()
  const name = cfg.pet.name.trim() || '银月'
  const result = await chatRaw(linesSystemPrompt(name), linesUserPrompt(getMemory().facts), {
    temperature: 0.9,
    maxTokens: 900
  })
  if (!result.ok) return null
  const lines = parseLinesJson(result.content)
  if (!lines) return null
  storeSet('personalityLines', lines)
  return lines
}
