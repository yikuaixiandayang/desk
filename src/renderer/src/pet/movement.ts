/** 自主移动逻辑：随机间隔、屏幕边界约束、平滑移动（纯逻辑可测） */
export interface Area {
  /** 区域左上角在屏幕坐标空间下的 X（多显示器可非 0，单屏默认 0） */
  x?: number
  /** 区域左上角在屏幕坐标空间下的 Y（多显示器可非 0，单屏默认 0） */
  y?: number
  width: number
  height: number
}

export type MovePhase = 'idle' | 'walk' | 'drag' | 'squat'

export interface MovementState {
  x: number
  y: number
  targetX: number
  targetY: number
  phase: MovePhase
  facing: 1 | -1
  /** 下次自主移动的时间戳 */
  nextMoveAt: number
}

/**
 * 宠物可站立的安全区域：
 *  - 非 squat 状态：底部使用 workAreaBottom（任务栏上方，自动保持间距）
 *  - squat 状态：底部使用 boundsBottom（贴底趴任务栏）
 * 传入 bottomMargin 或直接根据 phase 使用不同的底部值。
 */
export function clampToArea(
  x: number,
  y: number,
  area: Area,
  _petW: number,
  _petH: number,
  opts?: { isSquat?: boolean; bottomLimit?: number }
): { x: number; y: number } {
  const ax = area.x ?? 0
  const ay = area.y ?? 0
  const marginX = 8
  const topMargin = 10
  // 非 squat 时使用 workArea 底部（area.height 已由主进程传 workAreaBottom 时自动有效）
  const bottom = opts?.bottomLimit ?? (opts?.isSquat ? ay + area.height - 2 : ay + area.height)
  return {
    x: Math.max(ax + marginX, Math.min(ax + area.width - marginX, x)),
    y: Math.max(ay + topMargin, Math.min(bottom, y))
  }
}

export function randomTarget(rand: () => number, area: Area, petW: number, petH: number): { x: number; y: number } {
  return clampToArea(rand() * area.width, rand() * area.height, area, petW, petH)
}

/** 自主移动决策：空闲且到达时间则选定新目标；拖拽中不自主移动 */
export function maybeStartMove(st: MovementState, now: number, rand: () => number, area: Area, petW: number, petH: number): void {
  if (st.phase !== 'idle') return
  if (now < st.nextMoveAt) return
  const t = randomTarget(rand, area, petW, petH)
  st.targetX = t.x
  st.targetY = t.y
  st.phase = 'walk'
}

/**
 * 按速度推进一帧（dt 毫秒）。返回是否刚到达目标。
 */
export function stepMove(st: MovementState, dtMs: number, speedPxPerSec = 130): boolean {
  if (st.phase !== 'walk') return false
  const dx = st.targetX - st.x
  const dy = st.targetY - st.y
  const dist = Math.hypot(dx, dy)
  if (Math.abs(dx) > 2) st.facing = dx > 0 ? 1 : -1
  const step = (speedPxPerSec * dtMs) / 1000
  if (dist <= step) {
    st.x = st.targetX
    st.y = st.targetY
    st.phase = 'idle'
    return true
  }
  st.x += (dx / dist) * step
  st.y += (dy / dist) * step
  return false
}

/** 到达后安排下一次自主移动：6~15 秒随机间隔（intervalMul 为情绪行为倍率）；fixedSec>0 时用固定间隔 */
export function scheduleNextMove(st: MovementState, now: number, rand: () => number, intervalMul = 1, fixedSec = 0): void {
  const ms = fixedSec > 0 ? fixedSec * 1000 : (6000 + rand() * 9000)
  st.nextMoveAt = now + ms * Math.max(0.1, intervalMul)
}

// ---------- 探头探脑（v0.6 桌面物理互动） ----------

export interface PeekState {
  /** 动画起始时间戳（performance.now） */
  startedAt: number
  /** 总时长 ms */
  durationMs: number
  /** 最大探出时的水平窗口偏移（px，左缘为负、右缘为正）；0 表示纯垂直探头 */
  offsetX: number
  /** 最大探出时的垂直抬升（px） */
  liftY: number
  /** 探头方向（决定精灵帧） */
  side: 'left' | 'right' | 'top'
}

/** 屏幕四边对应的边缘动作：下缘趴任务栏，左/右/上缘探头 */
export type EdgeAction = 'squat' | 'peekLeft' | 'peekRight' | 'peekTop'

/** 判定宠物贴近哪条屏幕边缘及对应动作；不在边缘返回 null。
 *  优先级：下缘（趴任务栏）> 上缘 > 左缘 > 右缘。
 */
export function edgeActionAt(st: MovementState, area: Area, petW: number, petH: number): EdgeAction | null {
  const ax = area.x ?? 0
  const ay = area.y ?? 0
  const marginX = petW / 2 + 8
  const marginY = petH / 2 + 8
  // 下缘：宠物底部接近屏幕底（任务栏）
  if (st.y >= ay + area.height - 2 - petH * 0.3) return 'squat'
  // 上缘
  if (st.y <= ay + marginY + petH * 0.6) return 'peekTop'
  // 左缘
  if (st.x <= ax + marginX + petW * 0.6) return 'peekLeft'
  // 右缘
  if (st.x >= ax + area.width - marginX - petW * 0.6) return 'peekRight'
  return null
}

/** v0.7/0.8 吸附后的横向锚点（宠物中心屏幕 x）：
 *  默认贴到边缘会把角色中线对齐屏幕边（外侧约 50% 被裁），若素材人脸恰在中线会被切没。
 *  因此向内缩进 inset 像素，让 on-screen 那半包住脸（“半遮掩”且始终可见）。
 *  top 不参与（顶部倒挂无横向偏移）。
 */
export function snapAnchorX(side: 'left' | 'right' | 'top', ax: number, areaWidth: number, inset: number): number {
  if (side === 'left') return ax + Math.max(0, inset)
  if (side === 'right') return ax + areaWidth - Math.max(0, inset)
  return ax + areaWidth / 2
}

/** v0.7 边缘吸附：拖拽松手时判定吸附哪条边（不含下缘）。
 *  宠物中心点落在距边缘 10% 区域内即命中（单边封顶 200px），返回距离最近的边；否则 null。
 */
export function snapEdgeAt(st: MovementState, area: Area): 'left' | 'right' | 'top' | null {
  const ax = area.x ?? 0
  const ay = area.y ?? 0
  const rangeX = Math.min(area.width * 0.1, 200)
  const rangeY = Math.min(area.height * 0.1, 200)
  const dLeft = st.x - ax
  const dRight = ax + area.width - st.x
  const dTop = st.y - ay
  const candidates: Array<{ side: 'left' | 'right' | 'top'; dist: number; range: number }> = [
    { side: 'left', dist: dLeft, range: rangeX },
    { side: 'right', dist: dRight, range: rangeX },
    { side: 'top', dist: dTop, range: rangeY }
  ]
  let best: { side: 'left' | 'right' | 'top'; dist: number } | null = null
  for (const c of candidates) {
    if (c.dist >= 0 && c.dist <= c.range && (best === null || c.dist < best.dist)) {
      best = { side: c.side, dist: c.dist }
    }
  }
  return best?.side ?? null
}

/** 生成边缘探头动画：默认总时长 3s（前 30% 探出、中间停留、后 30% 缩回），探出约半个身位。
 *  opts 可覆盖时长与幅度比例（来自用户设置）。
 */
export function peekFromEdge(
  now: number,
  side: 'left' | 'right' | 'top',
  petW: number,
  petH: number,
  opts?: { durationSec?: number; offsetRatio?: number }
): PeekState {
  const durationMs = Math.max(500, (opts?.durationSec ?? 3) * 1000)
  const ratio = Math.min(0.9, Math.max(0.2, opts?.offsetRatio ?? 0.55))
  if (side === 'top') {
    return { startedAt: now, durationMs, offsetX: 0, liftY: petH * ratio * 0.82, side }
  }
  return {
    startedAt: now,
    durationMs,
    offsetX: (side === 'left' ? -1 : 1) * petW * ratio,
    liftY: 0,
    side
  }
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/** 探头进度缓动：返回 0~1 的"探出程度"；未开始或已结束时为 0（调用方按 durationMs 判定丢弃） */
export function stepPeek(peek: PeekState, now: number): number {
  const t = (now - peek.startedAt) / peek.durationMs
  if (t <= 0 || t >= 1) return 0
  if (t < 0.3) return easeOutQuad(t / 0.3)
  if (t < 0.7) return 1
  return easeOutQuad((1 - t) / 0.3)
}
