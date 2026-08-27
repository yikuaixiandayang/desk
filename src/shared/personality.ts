/** 性格养成系统：四维累计统计 → 性格标签（纯逻辑，主进程与渲染进程共用） */

export interface PersonalityDimensions {
  /** 话唠值：每日对话次数累计 */
  chatter: number
  /** 粘人值：摸头/拥抱次数累计 */
  clingy: number
  /** 学霸值：番茄钟完成数累计 */
  study: number
  /** 探险值：天气/新城市/新技能使用累计 */
  explore: number
}

export type PersonalityType = '话唠型' | '粘人型' | '学霸型' | '探险型' | '均衡型'

export const DEFAULT_PERSONALITY: PersonalityDimensions = {
  chatter: 0,
  clingy: 0,
  study: 0,
  explore: 0
}

/** 取最高维度作为性格标签，相等或差距 <3 时为"均衡型" */
export function personalityType(d: PersonalityDimensions): PersonalityType {
  const max = Math.max(d.chatter, d.clingy, d.study, d.explore)
  if (max < 3) return '均衡型'
  const dims: [string, number][] = [
    ['话唠型', d.chatter],
    ['粘人型', d.clingy],
    ['学霸型', d.study],
    ['探险型', d.explore]
  ]
  // 如果有两个以上维度接近最高值（差 ≤2），则为均衡型
  const nearMax = dims.filter(([, v]) => max - v <= 2)
  if (nearMax.length >= 2) return '均衡型'
  const winner = dims.find(([, v]) => v === max)
  return (winner?.[0] as PersonalityType) ?? '均衡型'
}

/** 性格对 system prompt 的影响描述 */
export function personalityPromptHint(type: PersonalityType): string {
  switch (type) {
    case '话唠型':
      return '你的主人喜欢聊天，你可以多说几句、主动搭话，台词可以更长更活泼。'
    case '粘人型':
      return '你的主人喜欢亲密互动，可以多撒娇、表达想念，语气更软糯。'
    case '学霸型':
      return '你的主人专注学习，可以多鼓励、关心学习效率，偶尔提醒休息。'
    case '探险型':
      return '你的主人喜欢探索新事物，可以主动推荐新功能、分享有趣的知识。'
    default:
      return ''
  }
}

/** 根据性格调整主动搭话间隔（分钟） */
export function chatterIntervalMinutes(type: PersonalityType): number {
  return type === '话唠型' ? 15 : 18
}

/** 根据性格对聊天回复做微调（可选增强，目前仅返回标签） */
export function personalityStyleTag(type: PersonalityType): string {
  switch (type) {
    case '话唠型': return '活泼多话'
    case '粘人型': return '撒娇粘人'
    case '学霸型': return '鼓励学习'
    case '探险型': return '好奇探索'
    default: return '均衡温和'
  }
}
