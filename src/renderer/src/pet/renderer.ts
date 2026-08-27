/** Canvas 渲染器：精灵帧 + 程序化动画（呼吸/走路/拖拽摇晃）+ 阴影 + 特效
 *  支持四种渲染模式：常规帧、趴姿(squat)、探头(peek 独立素材)、B 类动作(act_* 独立素材)
 */
import { SpriteSheet, type ActionName, type PeekSide } from './sprite'
import { Effects } from '../core/effects'

export interface RenderInput {
  frame: number
  x: number
  y: number
  facing: 1 | -1
  height: number
  now: number
  walking: boolean
  dragging: boolean
  /** 情绪行为：弹跳幅度倍率 */
  bounceMul: number
  /** 情绪行为：身体下压比例（委屈趴下） */
  droop: number
  /** 探头抬升（px，默认 0） */
  liftY?: number
  /** 趴在任务栏 */
  squat?: boolean
  /** 探头方向：提供则走 peek 素材渲染路径 */
  peekSide?: PeekSide | null
  /** 探头帧序号 0|1（交替动画） */
  peekFrame?: 0 | 1
  /** v0.7 B 类动作名：提供且素材可用则走动作素材渲染路径 */
  actionName?: ActionName | null
}

export class PetCanvas {
  readonly effects = new Effects()
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement, readonly sprite: SpriteSheet) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D 上下文不可用')
    this.ctx = ctx
  }

  resize(width: number, height: number, dpr: number): void {
    this.canvas.width = Math.floor(width * dpr)
    this.canvas.height = Math.floor(height * dpr)
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  render(input: RenderInput, dtMs: number): void {
    const { ctx } = this
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.effects.update(dtMs)

    const { frame, x, y, facing, height, now, walking, dragging, bounceMul, droop } = input
    const liftY = input.liftY ?? 0
    const squat = input.squat === true
    const peekSide = input.peekSide ?? null
    const peekFrame = input.peekFrame ?? 0
    const actionName = input.actionName ?? null
    const actionActive = !!actionName && this.sprite.actionAvailable(actionName)
    const width = height * (this.sprite.cellW / this.sprite.cellH)
    const bounce = Math.max(0.05, bounceMul)
    const droopY = droop * height

    // 呼吸浮动 / 走路颠簸 / 拖拽挣扎
    const idlePhase = (now / 1000) * Math.PI * 2 * (0.8 * (0.6 + 0.4 * bounce))
    const walkPhase = (now / 1000) * Math.PI * 2 * 2.2
    let bob: number
    let tilt: number
    let squashY: number
    if (dragging) {
      bob = -6
      tilt = Math.sin(now / 90) * 0.06
      squashY = 1
    } else if (walking) {
      bob = -Math.abs(Math.sin(walkPhase)) * 6 * bounce
      tilt = Math.sin(walkPhase) * 0.045
      squashY = 1 + Math.sin(walkPhase * 2) * 0.02 * bounce
    } else if (squat) {
      bob = Math.sin(now / 800) * 0.8
      tilt = 0
      squashY = 1
    } else if (peekSide || actionActive) {
      // 探头 / B 类动作：极轻微的呼吸浮动，不倾斜
      bob = Math.sin(now / 600) * 1.2
      tilt = 0
      squashY = 1
    } else {
      bob = Math.sin(idlePhase) * 2.5 * bounce
      tilt = Math.sin(idlePhase / 4) * 0.012
      squashY = 1 + Math.sin(idlePhase) * 0.015 * bounce
    }

    // 地面阴影
    ctx.save()
    ctx.globalAlpha = 0.16 * (1 - droop * 2)
    ctx.fillStyle = '#3a2430'
    ctx.beginPath()
    const shadowW = peekSide ? width * 0.2 : width * (squat ? 0.5 : 0.32)
    const shadowH = peekSide ? height * 0.02 : height * (squat ? 0.08 : 0.045)
    ctx.ellipse(x, y + 4, shadowW, shadowH, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // 精灵渲染
    ctx.save()
    const translateY = squat || peekSide || actionActive ? y + bob : y + bob + droopY - liftY
    ctx.translate(x, translateY)
    ctx.rotate(tilt * (1 - droop))
    // 探头素材自带朝向（peek_left/right/top 构图固定），不做水平镜像
    const sx = peekSide || actionActive ? 1 / squashY : (facing / squashY) * (1 + droop * 0.3)
    const sy = squashY * (1 - droop)
    ctx.scale(sx, sy)

    if (peekSide && this.sprite.peekAvailable(peekSide)) {
      // 探头素材渲染（独立素材，不需要 sheet 裁切）
      // 注意：画布原点已平移到宠物脚底，bottomY 必须传 0（图底=脚底）；
      // 误传 height 会把整张图画到脚底下方一整个身位（画布外），导致吸附后“看不见/只剩手”。
      this.sprite.drawPeek(ctx, peekSide, peekFrame as 0 | 1, 0, 0, height, peekSide === 'top' ? -2 : 0)
    } else if (actionName && actionActive) {
      // B 类动作素材渲染（独立素材）
      this.sprite.drawAction(ctx, actionName, 0, 0, height)
    } else if (walking && this.sprite.walkAvailable()) {
      // v0.8 走路循环帧渲染（walk.png 4 帧，约 7fps 循环；缺失时走下方默认单帧分支）
      this.sprite.drawWalk(ctx, Math.floor(now / 140) % 4, 0, 0, height)
    } else if (squat && this.sprite.leanAvailable()) {
      // v0.8 用户自定义趴下素材（替换 sheet row2 的趴姿帧）
      this.sprite.drawLean(ctx, frame % 2 === 0 ? 0 : 1, 0, 0, height)
    } else {
      this.sprite.drawFrame(ctx, frame, 0, 0, height)
    }
    ctx.restore()

    this.effects.draw(ctx)
  }

  /** 命中测试：点是否落在宠物矩形内（略放宽便于点击） */
  hitTest(px: number, py: number, petX: number, petBottomY: number, height: number): boolean {
    const width = height * (this.sprite.cellW / this.sprite.cellH)
    const pad = 12
    return (
      px >= petX - width / 2 - pad &&
      px <= petX + width / 2 + pad &&
      py >= petBottomY - height - pad &&
      py <= petBottomY + pad
    )
  }

  petWidthFor(height: number): number {
    return height * (this.sprite.cellW / this.sprite.cellH)
  }
}
