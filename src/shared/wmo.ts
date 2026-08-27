/** WMO 天气码 → 中文描述（Open-Meteo weather_code 用） */

const WMO: Record<number, string> = {
  0: '晴',
  1: '大致晴朗',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  56: '冻毛毛雨',
  57: '强冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '小阵雨',
  81: '阵雨',
  82: '强阵雨',
  85: '小阵雪',
  86: '大阵雪',
  95: '雷阵雨',
  96: '雷阵雨伴冰雹',
  99: '强雷阵雨伴冰雹'
}

export function wmoDesc(code: number | undefined): string {
  if (code === undefined) return '未知'
  return WMO[code] ?? '未知'
}

/** 秘书式天气播报文案（纯函数，便于测试） */
export function weatherReplyText(w: {
  city: string
  temp?: number
  desc?: string
  humidity?: number
  wind?: number
  tmax?: number
  tmin?: number
  pop?: number
}): string {
  const parts: string[] = [`${w.city}现在${w.desc ?? '天气未知'}`]
  if (w.temp !== undefined) parts.push(`${Math.round(w.temp)}℃`)
  if (w.tmax !== undefined && w.tmin !== undefined) parts.push(`今日 ${Math.round(w.tmin)}~${Math.round(w.tmax)}℃`)
  if (w.humidity !== undefined) parts.push(`湿度 ${Math.round(w.humidity)}%`)
  if (w.wind !== undefined) parts.push(`风速 ${Math.round(w.wind)}km/h`)
  if (w.pop !== undefined && w.pop >= 30) parts.push(`降水概率 ${Math.round(w.pop)}%，记得带伞`)
  let text = parts.join('，') + '。'
  if (w.temp !== undefined) {
    if (w.temp <= 5) text += ' 主人注意保暖，围巾手套安排上。'
    else if (w.temp >= 33) text += ' 气温很高，多喝水、少暴晒。'
  }
  return text
}
