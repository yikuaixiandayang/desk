/** 节日彩蛋检测：特殊日期触发独特台词与粒子效果 */

export interface FestivalInfo {
  id: string
  name: string
  greeting: string
  /** 建议的环境粒子类型 */
  particle?: 'sparkle' | 'heart' | 'snow'
}

/* 中秋节日期查表（2024-2030），农历八月十五对应公历 */
const MID_AUTUMN: Record<number, [number, number]> = {
  2024: [9, 17],
  2025: [10, 6],
  2026: [9, 25],
  2027: [9, 15],
  2028: [10, 3],
  2029: [9, 22],
  2030: [9, 12]
}

/**
 * 检测今天是否为特殊节日/纪念日。
 * @param now 当前日期（默认今天）
 * @returns 节日信息，无匹配时返回 null
 */
export function detectFestival(now: Date = new Date()): FestivalInfo | null {
  const m = now.getMonth() + 1 // 1-12
  const d = now.getDate()
  const year = now.getFullYear()
  const dayOfWeek = now.getDay() // 0=Sun

  // 元旦
  if (m === 1 && d === 1) {
    return { id: 'new-year', name: '元旦', greeting: '新年快乐！新的一年，银月也要一直陪在主人身边～', particle: 'sparkle' }
  }
  // 情人节
  if (m === 2 && d === 14) {
    return { id: 'valentine', name: '情人节', greeting: '今天是情人节呢……主人，银月最喜欢你了！', particle: 'heart' }
  }
  // 中秋（查表）
  const midAutumn = MID_AUTUMN[year]
  if (midAutumn && midAutumn[0] === m && midAutumn[1] === d) {
    return { id: 'mid-autumn', name: '中秋节', greeting: '中秋节快乐！今晚的月亮一定很圆，银月也想和主人一起赏月～', particle: 'sparkle' }
  }
  // 圣诞
  if (m === 12 && d === 25) {
    return { id: 'christmas', name: '圣诞节', greeting: '圣诞快乐！🎄 银月给主人送个大大的祝福～', particle: 'snow' }
  }
  // 周一早晨问候（工作日 8-10 点）
  if (dayOfWeek === 1 && now.getHours() >= 8 && now.getHours() < 10) {
    return { id: 'monday', name: '周一', greeting: '新的一周开始了，主人加油！银月会一直陪着您的。' }
  }
  return null
}
