/** 文案库：问候、秘书式提醒（渲染进程专用）+ 重导出共享文案 */
import type { LineCategory, PersonalityLines, ReminderEventKind } from '@shared/types'

// 共享文案函数（主进程 chat-router 也使用）从 chat-text 导入并重导出
export {
  fallbackReply,
  jokeReply,
  timeReply,
  capabilitiesReply,
  versionReply,
  timerConfirmReply
} from '@shared/chat-text'

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ---------- 动态台词（GLM 生成，经 IPC 拉取后缓存） ----------
// 读取优先级：store 动态台词 > chat-text/本文件硬编码兜底
let dynamicLines: PersonalityLines | null = null

/** 由 app.ts 在启动/记忆总结后通过 pet.linesGet() 拉取并回填 */
export function setDynamicLines(lines: PersonalityLines | null): void {
  dynamicLines = lines
}

/** 优先取 GLM 生成的个性化台词，无候选时回退硬编码 fallback */
export function pickLine(category: LineCategory, fallback: string): string {
  const arr = dynamicLines?.[category]
  if (arr && arr.length > 0) return pick(arr)
  return fallback
}

export function greeting(level: number, hour: number): string {
  const period =
    hour < 5 ? '夜深了' : hour < 9 ? '早上好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
  let fallback: string
  if (level >= 7) {
    fallback = pick([`${period}，主人～银月一直在等您呢。`, `${period}，主人！今天也要元气满满哦。`])
  } else if (level <= 1) {
    fallback = pick([`${period}，主人……银月最近总觉得您冷落我了。`, `${period}。主人愿意陪银月说说话吗？`])
  } else {
    fallback = pick([`${period}，主人。银月随时待命。`, `${period}，主人。需要银月做些什么吗？`])
  }
  return pickLine('greeting', fallback)
}

export function reminderText(kind: ReminderEventKind, minutes: number): string {
  if (kind === 'sedentary') {
    return pick([
      `主人，您已经连续伏案 ${minutes} 分钟了，起来活动一下吧，银月陪着您。`,
      `报告主人：久坐 ${minutes} 分钟达标～伸展一下肩膀和腰背，效率会更高的。`
    ])
  }
  return pick([
    '主人，喝水时间到了。润润嗓子，我再帮您盯着日程。',
    '小提示：已经有一阵子没喝水了，主人要照顾好自己呀。'
  ])
}

export function reminderAckText(kind: ReminderEventKind): string {
  return kind === 'sedentary' ? '这才对嘛，主人慢走，我等您回来。' : '很好，水分补给完成！银月继续为主人守望。'
}

export function reminderIgnoredText(): string {
  return pick(['哼……主人都不理人家的提醒。', '好吧，是我说话不够分量吗？银月有点小情绪了。'])
}

// fallbackReply / jokeReply / timeReply / capabilitiesReply / versionReply / timerConfirmReply
// 已迁移到 @shared/chat-text，见文件顶部 re-export

export function patReaction(level: number): string {
  let pool: readonly string[]
  if (level >= 7) {
    pool = [
      '嘿嘿～主人摸银月的头，好舒服呀。',
      '再摸一下头也可以哦。',
      '主人的手摸头好温柔，银月的耳朵都竖起来啦。',
      '唔……摸头摸头，尾巴都要摇起来了～',
      '今天也要被主人摸头，银月好幸福。',
      '头顶被主人摸得暖暖的，好喜欢这种感觉。',
      '主人的手放在银月头上，感觉整个世界都温柔了。'
    ]
  } else if (level >= 3) {
    pool = [
      '嗯……被摸头了，感觉还不错。',
      '主人今天很温柔呢，摸头好舒服。',
      '摸头的话……就稍微享受一下吧。',
      '诶嘿嘿，头被摸得有点痒痒的。',
      '主人的手在头上，银月有点害羞。',
      '被摸头了……银月会努力表现更好的。'
    ]
  } else {
    pool = [
      '……谢谢主人摸头。',
      '嗯，我会努力熟悉主人的。',
      '摸、摸头？银月还不太习惯……不过不讨厌。',
      '主人的手放在头上……有点紧张。',
      '被摸头了……银月会记住这个感觉的。'
    ]
  }
  return pickLine('pat', pick(pool))
}

/** v0.9 被握住手/击掌的反应 */
export function handReaction(): string {
  return pickLine(
    'hand',
    pick([
      '呀……主人握住银月的手了，好温暖。',
      '握爪成功！今天也要一起加油哦～',
      '主人的手好大，把银月的手都包住啦。',
      '嘿嘿，牵手手～银月带主人逛逛桌面！',
      '手被抓住了……那银月今天哪儿也不去了。',
      '击个掌！主人刚才敲键盘的样子真帅。',
      '手凉凉的？银月帮主人捂一捂～',
      '主人的手和银月的手握在一起，感觉好安心。',
      '被握住手了……银月的心跳有点加速呢。',
      '手牵手，一起走过今天的每一刻吧～'
    ])
  )
}

/** v0.9 被挠痒痒（脚/腰）的反应 */
export function tickleReaction(): string {
  return pickLine(
    'tickle',
    pick([
      '呀哈哈！别、别挠那里！好痒！',
      '呜哇～银月最怕痒了，主人坏坏！',
      '哈哈哈……停、停一下，银月要笑岔气了！',
      '脚脚不是玩具啦！呀……又痒了！',
      '再挠银月就要在地上打滚了哦！嘿嘿嘿……',
      '痒痒攻击无效……噗，好吧，有效，银月投降！',
      '呜呜，主人欺负人～不过银月忍不住想笑……',
      '腰、腰好痒！主人饶了银月吧～',
      '哈哈哈……脚底不行！那里超级怕痒的！',
      '挠痒痒的仇……银月记住了！嘿嘿……别停！'
    ])
  )
}

/** v0.9 趴在任务栏时的台词（面板按钮/空闲自动触发） */
export function squatReaction(): string {
  return pick([
    '呼……银月趴会儿，主人专心工作呀。',
    '趴下啦～这样离主人更近一点！',
    '嘘……银月安静趴着，不打扰主人。',
    '趴在任务栏上，感觉好安心呀。',
    '嘿嘿，银月要当一只猫猫，趴着晒太阳～',
    '主人别管银月，银月趴着休息一下。',
    '困困的，趴下来眯一会儿……'
  ])
}

/** v0.9 从趴下站起时的台词 */
export function standUpReaction(): string {
  return pick([
    '嗨呀～站起来，精神满满！',
    '银月起来啦！主人需要银月吗？',
    '唔……趴够了，起来活动活动！',
    '站起来了，尾巴伸个懒腰～',
    '银月满血复活！要继续陪着主人！',
    '好啦好啦，银月这就起来。',
    '噗，趴太久腿麻了……咔哒，没事！'
  ])
}

export function asrModelMissingText(): string {
  return '主人想用语音的话，银月需要先下载离线识别模型（约42MB），在菜单 ⚙️ 里点"检查/下载"即可。'
}

export function asrFailedText(): string {
  return '呜……语音功能出了点问题，银月没听清。可以先打字告诉我吗？'
}

// jokeReply / timeReply / capabilitiesReply / versionReply / timerConfirmReply
// 已迁移至 @shared/chat-text，见文件顶部 re-export
