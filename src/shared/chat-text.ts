/** 聊天回复文案工具（主进程 chat-router 与渲染进程共用） */
import type { EmotionKind } from './types'

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 接口异常/超时时的本地预设回复（按情绪调制语气） */
export function fallbackReply(emotion: EmotionKind): string {
  const byEmotion: Record<EmotionKind, readonly string[]> = {
    calm: [
      '主人，银月这会儿联系不上"大脑"（接口异常），稍后再试，先由我陪您。',
      '抱歉主人，云端暂时没有回应。银月先记下来，稍后为您补上。'
    ],
    happy: [
      '嘿嘿，虽然现在脑子有点转不动（接口异常），但银月心情好，主人说什么都陪着！',
      '哎呀，联系不上大脑啦～不过不影响银月陪主人开心！'
    ],
    angry: [
      '哼！连大脑都不听话（接口异常），银月更生气了……主人哄哄我。',
      '接口又出问题了！银月本来就有情绪，这下更委屈了。'
    ],
    coax: [
      '主人～大脑断线了（接口异常），银月笨笨的，您多担待，等下再问好不好嘛～',
      '唔……接口不通，银月只能撒娇装傻了，主人别嫌弃。'
    ],
    sad: [
      '呜……大脑联系不上了，银月本来就难过，现在更难过了。',
      '接口不通……主人会一直陪着银月吧？'
    ],
    surprised: ['诶？！接口怎么突然没反应了！银月吓一跳。'],
    sleepy: ['呼啊……接口睡着了，银月也快睡着了……主人稍后再问吧……'],
    excited: ['呀！接口掉链子了！银月正兴奋着呢，好扫兴好扫兴！'],
    bored: ['无聊，接口也无聊，大家都无聊……主人等会儿再聊吧。'],
    curious: ['诶？接口怎么了？银月想知道原因呢……'],
    mischievous: ['嘿嘿，接口也躲起来了！主人要不要再试试？'],
    lovestruck: ['没关系……就算接口偶尔不理，银月也会一直陪着主人的。']
  }
  return pick(byEmotion[emotion])
}

const JOKES: readonly string[] = [
  '主人，程序员最讨厌的数字是什么？是 404——因为找不到了。',
  '为什么修仙的人不怕熬夜？因为他们都在渡"夜"劫。',
  '主人知道银月为什么记得住这么多事吗？因为我有长期记忆呀——好吧这个笑话有点冷。',
  '键盘上哪个键最勇敢？回车键，因为它总是第一个冲进去。',
  '主人，我的内存条问我要不要升级，我说：先把我主人的工资升一下吧。'
]

export function jokeReply(): string {
  return JOKES[Math.floor(Math.random() * JOKES.length)]
}

export function timeReply(now: Date): string {
  const h = now.getHours()
  const period = h < 5 ? '凌晨' : h < 9 ? '早上' : h < 12 ? '上午' : h < 14 ? '中午' : h < 18 ? '下午' : h < 23 ? '晚上' : '深夜'
  const t = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const d = `${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`
  return `主人，现在是${period} ${t}，${d}。`
}

export function capabilitiesReply(): string {
  return [
    '主人，银月现在会这些：',
    '对话陪聊（GLM 大模型）、语音对话、神经语音播报（8 种音色可换）；',
    '秘书技能：定时提醒（"提醒我30分钟后…"）、待办清单、番茄钟（"开个番茄钟"）、今日报告；',
    '环境音：雨声/篝火/白噪音（"放点雨声"）；天气播报（"北京天气"，城市自动记忆）；',
    '全局快捷键：Alt+Y 呼出对话，Alt+J 解读剪贴板（翻译或解释）；',
    '长期记忆（越聊越懂你）、健康守护（久坐/喝水）、九种情绪小脾气；',
    '身体互动：摸头（点头部）、握手（点手/袖口）、挠痒痒（点脚/裙摆）、双击拥抱、连点5次逗我生气；',
    '按键小账本：银月会默默记下主人今天敲了多少次键（字符/空格/回车分类统计，只看次数不偷看内容），控制台「今日速览」可查。',
    '冷落我会委屈哦；⚙️ 控制台能换音色/改模型/管记忆/切走动模式。'
  ].join('\n')
}

export function versionReply(): string {
  return '银月桌宠 v0.9.0：身体分区互动（摸头/握手/挠痒）+ 全局按键统计（分类计数）+ 后端 agent 感知互动与键数。'
}

export function timerConfirmReply(task: string, fireAt: number): string {
  const t = new Date(fireAt)
  return `好的主人，银月记下了：${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')} 提醒您「${task}」。`
}
