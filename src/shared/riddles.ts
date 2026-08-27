/** 互动谜语库：内置 30+ 条中文谜语/脑筋急转弯 + 模糊匹配 */

export interface Riddle {
  q: string
  a: string
  /** 匹配关键词（用户回答包含任一即算对） */
  keywords: string[]
}

const RIDDLES: readonly Riddle[] = [
  { q: '有头没有颈，身上冷冰冰，有翅不能飞，无脚也能行。', a: '鱼', keywords: ['鱼'] },
  { q: '头戴红帽子，身穿白袍子，走路摆架子，说话伸脖子。', a: '鹅', keywords: ['鹅'] },
  { q: '千条线万条线，落到水里看不见。', a: '雨', keywords: ['雨'] },
  { q: '白嫩小宝宝，洗澡吹泡泡，洗洗身体小，再洗不见了。', a: '肥皂', keywords: ['肥皂', '香皂'] },
  { q: '身穿绿衣裳，肚里水汪汪，生的子儿多，个个黑脸膛。', a: '西瓜', keywords: ['西瓜'] },
  { q: '一物生来真奇怪，肚子下面长口袋，孩子袋里吃和睡，跑得不慢跳得快。', a: '袋鼠', keywords: ['袋鼠'] },
  { q: '耳朵像蒲扇，身子像小山，鼻子长又长，帮人把活干。', a: '大象', keywords: ['大象'] },
  { q: '八只脚抬面鼓，两把剪刀鼓前舞，生来横行又霸道，嘴里常把泡沫吐。', a: '螃蟹', keywords: ['螃蟹'] },
  { q: '小小诸葛亮，独坐中军帐，摆下八卦阵，专捉飞来将。', a: '蜘蛛', keywords: ['蜘蛛'] },
  { q: '弟兄七八个，围着柱子坐，大家一分手，衣服全撕破。', a: '蒜', keywords: ['蒜', '大蒜'] },
  { q: '身子粗壮头长角，大人小孩都爱它，天天奉献鲜奶汁，草原是它好家园。', a: '牛', keywords: ['牛', '奶牛'] },
  { q: '说它是虎它不像，金钱印在黄袄上，站在山上吼一声，吓跑猴子吓跑狼。', a: '金钱豹', keywords: ['豹', '金钱豹'] },
  { q: '一物像人又像狗，爬杆上树是能手，擅长模仿人动作，家里没它也有它。', a: '猴子', keywords: ['猴', '猴子'] },
  { q: '年纪不算大，胡子一大把，不管见到谁，总爱叫妈妈。', a: '羊', keywords: ['羊', '山羊', '绵羊'] },
  { q: '先修十字街，再修月花台，身子不动弹，口里吃自来。', a: '蜘蛛', keywords: ['蜘蛛'] },
  { q: '什么东西越洗越脏？', a: '水', keywords: ['水'] },
  { q: '什么东西有头没有脚？', a: '硬币', keywords: ['硬币', '钱币'] },
  { q: '什么房子没有门窗？', a: '蘑菇', keywords: ['蘑菇'] },
  { q: '什么东西有嘴不说话？', a: '茶壶', keywords: ['茶壶', '壶'] },
  { q: '什么布剪不断？', a: '瀑布', keywords: ['瀑布'] },
  { q: '什么瓜不能吃？', a: '傻瓜', keywords: ['傻瓜'] },
  { q: '什么车没有轮子？', a: '风车', keywords: ['风车'] },
  { q: '什么花不能闻？', a: '火花', keywords: ['火花'] },
  { q: '什么东西打碎了才能用？', a: '鸡蛋', keywords: ['鸡蛋', '蛋'] },
  { q: '一只狗过了独木桥就不叫了，为什么？', a: '过目不忘', keywords: ['过目不忘', '过木不汪'] },
  { q: '什么样的路不能走？', a: '电路', keywords: ['电路', '思路', '网路', '套路'] },
  { q: '有一个人一年才上一次班，他是谁？', a: '圣诞老人', keywords: ['圣诞老人'] },
  { q: '什么动物天天熬夜？', a: '熊猫', keywords: ['熊猫'] },
  { q: '什么东西明明是你的，别人却用的比你多？', a: '名字', keywords: ['名字'] },
  { q: '什么书在书店买不到？', a: '遗书', keywords: ['遗书'] },
  { q: '什么门永远关不上？', a: '球门', keywords: ['球门'] },
  { q: '胖子从12楼掉下来会变成什么？', a: '死胖子', keywords: ['死胖子'] }
]

let lastIndex = -1

/** 随机选一条谜语（避免连续重复） */
export function randomRiddle(): Riddle {
  let idx: number
  do {
    idx = Math.floor(Math.random() * RIDDLES.length)
  } while (idx === lastIndex && RIDDLES.length > 1)
  lastIndex = idx
  return RIDDLES[idx]
}

/** 检查用户回答是否匹配谜语答案（包含关键词即算对） */
export function checkRiddleAnswer(riddle: Riddle, userAnswer: string): boolean {
  const ans = userAnswer.trim()
  if (!ans) return false
  if (ans === riddle.a) return true
  return riddle.keywords.some((kw) => ans.includes(kw))
}
