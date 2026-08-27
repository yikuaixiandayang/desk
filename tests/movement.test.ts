import { describe, expect, it } from 'vitest'
import {
  clampToArea,
  edgeActionAt,
  maybeStartMove,
  peekFromEdge,
  scheduleNextMove,
  snapAnchorX,
  snapEdgeAt,
  stepMove,
  stepPeek,
  type MovementState
} from '../src/renderer/src/pet/movement'

const area = { width: 1920, height: 1080 }
const petW = 168 // 210 * (240/300)
const petH = 210

function mkState(x = 960, y = 900): MovementState {
  return { x, y, targetX: x, targetY: y, phase: 'idle', facing: 1, nextMoveAt: 0 }
}

describe('自主移动', () => {
  it('clampToArea 保证不越界（含余量）', () => {
    // 左右/顶部边距已收窄为固定小值，让宠物能贴近屏幕边缘
    expect(clampToArea(-50, -50, area, petW, petH).x).toBeGreaterThanOrEqual(8)
    expect(clampToArea(9999, 9999, area, petW, petH).x).toBeLessThanOrEqual(1920 - 8)
    // 非 squat 状态下底部钳制为 area.height（自动间距由 workAreaBottom 在渲染层处理）
    expect(clampToArea(9999, 9999, area, petW, petH).y).toBeLessThanOrEqual(1080)
    // squat 状态下底部钳制为 area.height - 2（贴任务栏）
    expect(clampToArea(9999, 9999, area, petW, petH, { isSquat: true }).y).toBeLessThanOrEqual(1080 - 2)
    // 顶部余量很小，气泡可能被窗口上沿裁剪，但允许宠物上到接近屏幕顶部
    expect(clampToArea(100, 0, area, petW, petH).y).toBeGreaterThanOrEqual(10)
  })

  it('空闲且到时才会开始移动；拖拽中绝不自主移动', () => {
    const st = mkState()
    st.nextMoveAt = 5000
    maybeStartMove(st, 4000, Math.random, area, petW, petH)
    expect(st.phase).toBe('idle')
    maybeStartMove(st, 6000, Math.random, area, petW, petH)
    expect(st.phase).toBe('walk')
    expect(st.targetX).toBeGreaterThan(0)
    expect(st.targetY).toBeGreaterThan(0)

    const drag = mkState()
    drag.phase = 'drag'
    drag.nextMoveAt = 0
    maybeStartMove(drag, 999_999, Math.random, area, petW, petH)
    expect(drag.phase).toBe('drag')
  })

  it('stepMove 逐步逼近并最终到达，方向随目标翻转', () => {
    const st = mkState(960, 900)
    st.targetX = 400
    st.targetY = 900
    st.phase = 'walk'
    let arrived = false
    for (let i = 0; i < 500 && !arrived; i++) {
      arrived = stepMove(st, 16)
    }
    expect(arrived).toBe(true)
    expect(st.x).toBe(400)
    expect(st.phase).toBe('idle')
    expect(st.facing).toBe(-1)
  })

  it('scheduleNextMove 在 6~15 秒之间', () => {
    const st = mkState()
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < 200; i++) {
      scheduleNextMove(st, 0, Math.random)
      min = Math.min(min, st.nextMoveAt)
      max = Math.max(max, st.nextMoveAt)
    }
    expect(min).toBeGreaterThanOrEqual(6000)
    expect(max).toBeLessThanOrEqual(15000)
  })
})

describe('探头探脑（v0.6 桌面物理互动）', () => {
  it('edgeActionAt 四边判定：下趴、上/左/右探头、中央无动作', () => {
    // 下缘 → 趴任务栏
    expect(edgeActionAt(mkState(960, area.height - 20), area, petW, petH)).toBe('squat')
    // 上缘 → 顶部探头（阈值 = petH/2 + 8 + petH*0.6 ≈ 239）
    expect(edgeActionAt(mkState(960, 10), area, petW, petH)).toBe('peekTop')
    expect(edgeActionAt(mkState(960, 235), area, petW, petH)).toBe('peekTop')
    expect(edgeActionAt(mkState(960, 300), area, petW, petH)).toBeNull()
    // 左右缘
    expect(edgeActionAt(mkState(50, 900), area, petW, petH)).toBe('peekLeft')
    expect(edgeActionAt(mkState(1870, 900), area, petW, petH)).toBe('peekRight')
    // 屏幕中央 → 无边缘动作
    expect(edgeActionAt(mkState(960, 900), area, petW, petH)).toBeNull()
  })

  it('edgeActionAt 多显示器负坐标场景同样成立', () => {
    const negArea = { x: -1920, y: 0, width: 3840, height: 1080 }
    expect(edgeActionAt(mkState(-1900, 900), negArea, petW, petH)).toBe('peekLeft')
    expect(edgeActionAt(mkState(1800, 900), negArea, petW, petH)).toBe('peekRight')
    expect(edgeActionAt(mkState(-960, 1060), negArea, petW, petH)).toBe('squat')
  })

  it('peekFromEdge 左右方向偏移符号正确，幅度约半个身位', () => {
    const left = peekFromEdge(0, 'left', petW, petH)
    const right = peekFromEdge(0, 'right', petW, petH)
    expect(left.offsetX).toBeLessThan(0)
    expect(right.offsetX).toBeGreaterThan(0)
    expect(Math.abs(left.offsetX)).toBeCloseTo(petW * 0.55)
    expect(left.liftY).toBe(0)
    expect(right.liftY).toBe(0)
  })

  it('peekFromEdge top 纯抬升无水平偏移；参数可覆盖时长与幅度', () => {
    const top = peekFromEdge(0, 'top', petW, petH)
    expect(top.side).toBe('top')
    expect(top.offsetX).toBe(0)
    expect(top.liftY).toBeCloseTo(petH * 0.55 * 0.82)

    // 自定义时长与幅度
    const custom = peekFromEdge(0, 'left', petW, petH, { durationSec: 5, offsetRatio: 0.8 })
    expect(custom.durationMs).toBe(5000)
    expect(Math.abs(custom.offsetX)).toBeCloseTo(petW * 0.8)
    // 幅度钳制在 0.2~0.9
    const clamped = peekFromEdge(0, 'left', petW, petH, { offsetRatio: 5 })
    expect(Math.abs(clamped.offsetX)).toBeCloseTo(petW * 0.9)
  })

  it('stepPeek 缓动：起止为 0、中段保持 1、不越界', () => {
    const peek = peekFromEdge(0, 'left', petW, petH)
    expect(stepPeek(peek, -10)).toBe(0)
    expect(stepPeek(peek, 0)).toBe(0)
    expect(stepPeek(peek, peek.durationMs)).toBe(0)
    expect(stepPeek(peek, peek.durationMs + 500)).toBe(0)
    // 中间停留段
    expect(stepPeek(peek, peek.durationMs * 0.5)).toBe(1)
    // 全程采样均在 [0,1]
    for (let i = 0; i <= 100; i++) {
      const p = stepPeek(peek, (peek.durationMs * i) / 100)
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })
})

describe('v0.7 边缘吸附 snapEdgeAt', () => {
  it('中心点落在距边缘 10% 区域内（1920x1080 → 左右 192px、上 108px）', () => {
    // 1920*0.1=192（未超 200 封顶）；1080*0.1=108
    expect(snapEdgeAt(mkState(150, 900), area)).toBe('left')
    expect(snapEdgeAt(mkState(1900, 900), area)).toBe('right')
    expect(snapEdgeAt(mkState(960, 80), area)).toBe('top')
    // 恰好在阈值边界
    expect(snapEdgeAt(mkState(192, 900), area)).toBe('left')
    expect(snapEdgeAt(mkState(193, 900), area)).toBeNull()
    expect(snapEdgeAt(mkState(960, 108), area)).toBe('top')
    expect(snapEdgeAt(mkState(960, 109), area)).toBeNull()
    // 屏幕中央不吸附
    expect(snapEdgeAt(mkState(960, 900), area)).toBeNull()
  })

  it('宽屏下单边封顶 200px（如 3840 宽 → 10%=384 被封到 200）', () => {
    const wide = { width: 3840, height: 2160 }
    expect(snapEdgeAt(mkState(250, 1000), wide)).toBeNull()
    expect(snapEdgeAt(mkState(200, 1000), wide)).toBe('left')
    // 高度 2160*0.1=216 封顶 200
    expect(snapEdgeAt(mkState(1900, 210), wide)).toBeNull()
    expect(snapEdgeAt(mkState(1900, 199), wide)).toBe('top')
  })

  it('同时命中多条边时取最近的一条', () => {
    // 左 30px、上 50px → left 更近
    expect(snapEdgeAt(mkState(30, 50), area)).toBe('left')
    // 左 100px、上 40px → top 更近
    expect(snapEdgeAt(mkState(100, 40), area)).toBe('top')
  })

  it('多显示器负坐标场景同样成立', () => {
    const negArea = { x: -1920, y: 0, width: 3840, height: 1080 }
    expect(snapEdgeAt(mkState(-1890, 900), negArea)).toBe('left')
    expect(snapEdgeAt(mkState(1860, 900), negArea)).toBe('right')
    expect(snapEdgeAt(mkState(-960, 60), negArea)).toBe('top')
    expect(snapEdgeAt(mkState(-960, 500), negArea)).toBeNull()
  })
})

describe('v0.8 吸附露脸 snapAnchorX', () => {
  it('左缘向内缩进 inset（仍对齐面朝中心），右缘同理，top 无横向偏移', () => {
    // 左缘：锚点 = ax + inset（向内推进固定偏移，不随区域宽度变化）
    expect(snapAnchorX('left', 0, 1920, 26)).toBe(26)
    // 右缘：锚点 = ax + width - inset
    expect(snapAnchorX('right', 0, 1920, 26)).toBe(1920 - 26)
    // inset 为 0（用户关闭）时贴边
    expect(snapAnchorX('left', 0, 1920, 0)).toBe(0)
    expect(snapAnchorX('right', 0, 1920, 0)).toBe(1920)
    // inset 不取负数（钳制到 0）
    expect(snapAnchorX('left', 0, 1920, -10)).toBe(0)
  })

  it('多显示器负坐标下同样成立', () => {
    const neg = { x: -1920, width: 3840 }
    expect(snapAnchorX('left', neg.x, neg.width, 26)).toBe(-1920 + 26)
    expect(snapAnchorX('right', neg.x, neg.width, 26)).toBe(-1920 + 3840 - 26)
  })

  it('top 使用区域中线（占位，实际由 enterSnap 走 move.y）', () => {
    expect(snapAnchorX('top', 0, 1920, 26)).toBe(960)
  })
})
