/** 精灵图加载与帧定义
 *  yinyue-sprite-sheet.png：10 帧，4 列 × 3 行
 *  row0 情绪 0-3（平静/微笑/惊讶/撒娇）
 *  row1 情绪 4-7（生气/开心/委屈/平静变体）
 *  row2 趴姿 8-9（leanSleep/leanSmile）
 *
 *  探头动画使用独立素材（peek_left/right/top + _fg 变体）。
 *  趴姿素材也已内嵌到主 sheet 的 row2。
 */

import type { AssetSlotId } from '@shared/types'

export const SHEET_COLS = 4
export const SHEET_ROWS = 3

export const FRAME = {
  calm: 0,
  smile: 1,
  surprised: 2,
  coax: 3,
  angry: 4,
  happy: 5,
  crying: 6,
  calmAlt: 7,
  leanSleep: 8,
  leanSmile: 9
} as const

export type FrameIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type PeekSide = 'left' | 'right' | 'top'

// ---------- v0.7 B 类动作（日常灵动 / 情绪补强） ----------

/** 10 个 B 类动作：伸懒腰/打哈欠/托腮思考/原地小跳/摇头晃脑/生气跺脚/委屈趴地/兴奋转圈/被握手/被挠痒 */
export type ActionName =
  | 'stretch' | 'yawn' | 'think' | 'jump' | 'shake' | 'stomp' | 'pout' | 'spin'
  | 'hold' | 'tickle'

export const ACTION_NAMES: readonly ActionName[] = [
  'stretch', 'yawn', 'think', 'jump', 'shake', 'stomp', 'pout', 'spin',
  'hold', 'tickle'
]

/** v0.9 待机随机动作池：排除互动专属动作（hold/tickle 只由握手/挠痒交互触发） */
export const IDLE_ACTION_NAMES: readonly ActionName[] = [
  'stretch', 'yawn', 'think', 'jump', 'shake', 'stomp', 'pout', 'spin'
]

const ACTION_FILES: Record<ActionName, string> = {
  stretch: 'act_stretch',
  yawn: 'act_yawn',
  think: 'act_think',
  jump: 'act_jump',
  shake: 'act_shake',
  stomp: 'act_stomp',
  pout: 'act_pout',
  spin: 'act_spin',
  hold: 'act_hold',
  tickle: 'act_tickle'
}

/** 探头方向 → 帧名映射 */
const PEEK_NAMES: Record<PeekSide, [string, string]> = {
  left: ['peek_left', 'peek_left_fg'],
  right: ['peek_right', 'peek_right_fg'],
  top: ['peek_top', 'peek_top_fg']
}

/** 用户覆盖素材源：散图（HTMLImageElement）或合图切片（HTMLCanvasElement） */
type ImgSrc = HTMLImageElement | HTMLCanvasElement

/** 素材是否已就绪可绘制（canvas 恒就绪；image 需加载完成） */
function srcReady(s: ImgSrc | null | undefined): s is ImgSrc {
  if (!s) return false
  if (s instanceof HTMLCanvasElement) return s.width > 0
  return s.complete && s.naturalWidth > 0
}

function srcW(s: ImgSrc): number {
  return s instanceof HTMLCanvasElement ? s.width : s.naturalWidth
}

function srcH(s: ImgSrc): number {
  return s instanceof HTMLCanvasElement ? s.height : s.naturalHeight
}

export class SpriteSheet {
  readonly image = new Image()
  private loaded = false
  /** 用户覆盖素材统一源：HTMLImageElement（散图）或 HTMLCanvasElement（合图切片） */
  private peekImages: Record<PeekSide, [ImgSrc | null, ImgSrc | null]> = {
    left: [null, null],
    right: [null, null],
    top: [null, null]
  }
  /** 探头素材是否全部加载完成 */
  private peekLoaded = false
  /** B 类动作图片缓存：10 帧（素材由训练侧生成后放入 assets，缺失时优雅降级） */
  private actionImages: Partial<Record<ActionName, ImgSrc | null>> = {}
  /** v0.8 用户自定义趴下素材（lean 合图切片或 lean0/lean1，替换 sheet row2 的趴姿帧） */
  private leanImages: [ImgSrc | null, ImgSrc | null] = [null, null]
  /** v0.8 用户自定义走路循环帧（walk.png 1行×4列切片），缺失时走路用单帧+程序化颠簸 */
  private walkImages: Array<ImgSrc | null> = [null, null, null, null]

  load(url = './assets/yinyue-sprite-sheet.png'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.image.onload = () => {
        this.loaded = true
        resolve()
      }
      this.image.onerror = () => reject(new Error(`精灵图加载失败: ${url}`))
      this.image.src = url
    })
  }

  /** 并行加载所有探头素材 */
  loadPeekImages(baseUrl = './assets/'): Promise<void> {
    const sides: PeekSide[] = ['left', 'right', 'top']
    const tasks = sides.flatMap((side) =>
      (['0', '1'] as const).map((idx) => {
        const img = new Image()
        const name = PEEK_NAMES[side][Number(idx)]
        return new Promise<void>((resolve) => {
          img.onload = () => {
            this.peekImages[side][Number(idx)] = img
            resolve()
          }
          img.onerror = () => {
            this.peekImages[side][Number(idx)] = null
            resolve()
          }
          img.src = `${baseUrl}${name}.png`
        })
      })
    )
    return Promise.all(tasks).then(() => {
      this.peekLoaded = true
    })
  }

  get isLoaded(): boolean {
    return this.loaded
  }

  get peekReady(): boolean {
    return this.peekLoaded
  }

  /** 并行加载 10 个 B 类动作素材（缺失的记为 null，播放时降级为普通帧） */
  loadActionImages(baseUrl = './assets/'): Promise<void> {
    const tasks = ACTION_NAMES.map((name) => {
      const img = new Image()
      return new Promise<void>((resolve) => {
        img.onload = () => {
          this.actionImages[name] = img
          resolve()
        }
        img.onerror = () => {
          this.actionImages[name] = null
          resolve()
        }
        img.src = `${baseUrl}${ACTION_FILES[name]}.png`
      })
    })
    return Promise.all(tasks).then(() => undefined)
  }

  // ---------- v0.8 用户自定义素材覆盖（插件式按槽位替换） ----------

  /** 探头文件名 → [side, frameIndex] */
  private static readonly PEEK_FILE_IDX: Record<string, [PeekSide, 0 | 1]> = {
    peek_left: ['left', 0],
    peek_left_fg: ['left', 1],
    peek_right: ['right', 0],
    peek_right_fg: ['right', 1],
    peek_top: ['top', 0],
    peek_top_fg: ['top', 1]
  }

  /** 动作文件名 → ActionName（ACTION_FILES 的反向映射） */
  private static readonly ACTION_FILE_NAMES: Record<string, ActionName> = {
    act_stretch: 'stretch', act_yawn: 'yawn', act_think: 'think', act_jump: 'jump',
    act_shake: 'shake', act_stomp: 'stomp', act_pout: 'pout', act_spin: 'spin',
    act_hold: 'hold', act_tickle: 'tickle'
  }

  /** v0.8 应用用户素材覆盖（dataURL）。合图（lean.png/peek.png/actions.png）优先：按固定网格切片为 canvas；
   *  否则按散图文件名逐个覆盖。缺失的槽位不影响其他（保留内置素材）。 */
  async applyOverrides(overrides: Partial<Record<AssetSlotId, Record<string, string>>>): Promise<void> {
    const spriteMap = overrides.sprite
    if (spriteMap?.['sprite.png']) this.image.src = spriteMap['sprite.png']

    const leanMap = overrides.lean
    if (leanMap?.['lean.png']) {
      // 合图：1 行 × 2 列（趴睡 | 趴笑）
      const cells = await this.sliceSheet(leanMap['lean.png'], 2, 1)
      if (cells.length >= 2) this.leanImages = [cells[0], cells[1]]
    } else if (leanMap) {
      this.leanImages[0] = this.makeImg(leanMap['lean0.png'])
      this.leanImages[1] = this.makeImg(leanMap['lean1.png'])
    }

    const peekMap = overrides.peek
    if (peekMap?.['peek.png']) {
      // 合图：3 列（左/右/顶）× 2 行（基础帧/前景帧），行优先切片
      const cells = await this.sliceSheet(peekMap['peek.png'], 3, 2)
      const sides: PeekSide[] = ['left', 'right', 'top']
      if (cells.length >= 6) {
        for (let c = 0; c < 3; c++) {
          this.peekImages[sides[c]] = [cells[c], cells[3 + c]]
        }
      }
    } else if (peekMap) {
      for (const [file, dataUrl] of Object.entries(peekMap)) {
        const hit = SpriteSheet.PEEK_FILE_IDX[file]
        if (hit) this.peekImages[hit[0]][hit[1]] = this.makeImg(dataUrl)
      }
    }

    const actionMap = overrides.actions
    if (actionMap?.['actions.png']) {
      // 合图：4 列 × N 行（新 4×3=10 动作+2 空 / 旧 4×2=8 动作，按宽高比自动判行），行优先
      const cells = await this.sliceActions(actionMap['actions.png'])
      // 有几格填几个动作（旧 8 格合图也能用，hold/tickle 回退散图或缺失降级）
      cells.forEach((cell, i) => {
        if (i < ACTION_NAMES.length) this.actionImages[ACTION_NAMES[i]] = cell
      })
    } else if (actionMap) {
      for (const [file, dataUrl] of Object.entries(actionMap)) {
        const name = SpriteSheet.ACTION_FILE_NAMES[file]
        if (name) this.actionImages[name] = this.makeImg(dataUrl)
      }
    }

    const walkMap = overrides.walk
    if (walkMap?.['walk.png']) {
      // 合图：1 行 × 4 列走路循环帧
      const cells = await this.sliceSheet(walkMap['walk.png'], 4, 1)
      if (cells.length >= 4) this.walkImages = cells.slice(0, 4)
    }
  }

  /** v0.9 动作合图切片：4 列，行数按宽高比自动判定（4×3 新格式 / 4×2 旧格式），行优先 */
  private async sliceActions(dataUrl: string): Promise<HTMLCanvasElement[]> {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        im.onload = () => resolve(im)
        im.onerror = () => reject(new Error('素材合图加载失败'))
        im.src = dataUrl
      })
      const cellAspect = 5 / 4 // 单格高宽比 5:4
      const rows = Math.round(img.naturalHeight / ((img.naturalWidth / 4) * cellAspect))
      return this.sliceImage(img, 4, Math.max(2, Math.min(3, rows)))
    } catch {
      return []
    }
  }

  /** 把 dataURL 合图按 cols×rows 网格切片为独立 canvas（行优先），失败返回空数组 */
  private async sliceSheet(dataUrl: string, cols: number, rows: number): Promise<HTMLCanvasElement[]> {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        im.onload = () => resolve(im)
        im.onerror = () => reject(new Error('素材合图加载失败'))
        im.src = dataUrl
      })
      return this.sliceImage(img, cols, rows)
    } catch {
      return []
    }
  }

  /** 把已加载的合图按 cols×rows 网格切片为独立 canvas（行优先） */
  private sliceImage(img: HTMLImageElement, cols: number, rows: number): HTMLCanvasElement[] {
    const cw = Math.floor(img.naturalWidth / cols)
    const ch = Math.floor(img.naturalHeight / rows)
    if (cw <= 0 || ch <= 0) return []
    const cells: HTMLCanvasElement[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cv = document.createElement('canvas')
        cv.width = cw
        cv.height = ch
        const cctx = cv.getContext('2d')
        if (!cctx) continue
        cctx.drawImage(img, c * cw, r * ch, cw, ch, 0, 0, cw, ch)
        cells.push(cv)
      }
    }
    return cells
  }

  private makeImg(src: string): HTMLImageElement | null {
    if (!src) return null
    const img = new Image()
    img.src = src
    return img
  }

  /** v0.8 恢复为内置素材：清空用户覆盖（趴下回退 sheet row2），重载内置 sheet/探头/动作/走路 */
  async resetToBundled(): Promise<void> {
    this.leanImages = [null, null]
    this.actionImages = {}
    this.walkImages = [null, null, null, null]
    await Promise.all([this.load(), this.loadPeekImages(), this.loadActionImages(), this.loadWalkImages()])
  }

  /** v0.8 加载内置走路合图 walk.png（1 行 × 4 列），缺失时保持 null（走路降级为单帧+程序化颠簸） */
  loadWalkImages(baseUrl = './assets/'): Promise<void> {
    const img = new Image()
    return new Promise<void>((resolve) => {
      img.onload = () => {
        const cells = this.sliceImage(img, 4, 1)
        if (cells.length >= 4) this.walkImages = cells.slice(0, 4)
        resolve()
      }
      img.onerror = () => resolve()
      img.src = `${baseUrl}walk.png`
    })
  }

  /** v0.8 走路循环帧是否可用（4 帧齐备） */
  walkAvailable(): boolean {
    return this.walkImages.every((s) => srcReady(s))
  }

  /** v0.8 绘制走路循环帧：保持原始宽高比，底部锚点对齐 */
  drawWalk(ctx: CanvasRenderingContext2D, frameIndex: number, cx: number, bottomY: number, height: number): void {
    const img = this.walkImages[frameIndex % 4]
    if (!srcReady(img)) {
      this.drawFrame(ctx, 0, cx, bottomY, height)
      return
    }
    const aspect = srcW(img) / srcH(img)
    const drawWidth = height * aspect
    ctx.drawImage(img, cx - drawWidth / 2, bottomY - height, drawWidth, height)
  }

  /** v0.8 用户趴下素材是否可用（两帧齐备） */
  leanAvailable(): boolean {
    return srcReady(this.leanImages[0]) && srcReady(this.leanImages[1])
  }

  /** v0.8 绘制趴下素材（保持原始宽高比，底部锚点对齐） */
  drawLean(ctx: CanvasRenderingContext2D, frame: 0 | 1, cx: number, bottomY: number, height: number): void {
    const img = this.leanImages[frame]
    if (!srcReady(img)) {
      this.drawFrame(ctx, 0, cx, bottomY, height)
      return
    }
    const aspect = srcW(img) / srcH(img)
    const drawWidth = height * aspect
    ctx.drawImage(img, cx - drawWidth / 2, bottomY - height, drawWidth, height)
  }

  // ---------- 趴姿底部透明留白检测（补偿“趴下悬空”） ----------

  /** 透明留白扫描结果缓存（同一图源只扫一次） */
  private padCache = new WeakMap<ImgSrc, Record<string, number>>()

  /** 扫描图源指定区域底部的透明留白占比（0~1，相对区域高度） */
  private bottomPadRatio(src: ImgSrc, sx: number, sy: number, w: number, h: number): number {
    let rec = this.padCache.get(src)
    if (!rec) {
      rec = {}
      this.padCache.set(src, rec)
    }
    const key = `${sx},${sy},${w},${h}`
    if (rec[key] !== undefined) return rec[key]
    let ratio = 0
    try {
      const cv = document.createElement('canvas')
      cv.width = Math.max(1, Math.floor(w))
      cv.height = Math.max(1, Math.floor(h))
      const c = cv.getContext('2d', { willReadFrequently: true })
      if (c) {
        c.drawImage(src as CanvasImageSource, sx, sy, w, h, 0, 0, cv.width, cv.height)
        const data = c.getImageData(0, 0, cv.width, cv.height).data
        const cw = cv.width
        outer: for (let y = cv.height - 1; y >= 0; y--) {
          for (let x = 0; x < cw; x++) {
            if (data[(y * cw + x) * 4 + 3] > 8) {
              ratio = (cv.height - 1 - y) / cv.height
              break outer
            }
          }
        }
      }
    } catch {
      ratio = 0
    }
    rec[key] = ratio
    return ratio
  }

  /** 趴姿帧底部透明留白的补偿像素（按渲染高度缩放）：两帧取大值避免交替抖动。
   *  自定义 lean 素材优先，否则扫内置 sheet row2；未就绪返回 0。 */
  squatPadMax(height: number): number {
    if (this.leanAvailable()) {
      let r = 0
      for (const img of this.leanImages) {
        if (img) r = Math.max(r, this.bottomPadRatio(img, 0, 0, srcW(img), srcH(img)))
      }
      return r * height
    }
    if (!this.loaded || this.image.naturalWidth === 0) return 0
    let r = 0
    for (const f of [FRAME.leanSleep, FRAME.leanSmile]) {
      const col = f % SHEET_COLS
      const row = Math.floor(f / SHEET_COLS)
      r = Math.max(r, this.bottomPadRatio(this.image, col * this.cellW, row * this.cellH, this.cellW, this.cellH))
    }
    return r * height
  }

  /** 判断指定 B 类动作素材是否可用 */
  actionAvailable(name: ActionName): boolean {
    return srcReady(this.actionImages[name])
  }

  /** 绘制 B 类动作素材：保持原始宽高比，底部锚点对齐（与 drawPeek 同策略） */
  drawAction(
    ctx: CanvasRenderingContext2D,
    name: ActionName,
    cx: number,
    bottomY: number,
    height: number
  ): void {
    const img = this.actionImages[name]
    if (!srcReady(img)) {
      this.drawFrame(ctx, 0, cx, bottomY, height)
      return
    }
    const aspect = srcW(img) / srcH(img)
    const drawWidth = height * aspect
    ctx.drawImage(img, cx - drawWidth / 2, bottomY - height, drawWidth, height)
  }

  get cellW(): number {
    return this.image.naturalWidth / SHEET_COLS
  }

  get cellH(): number {
    return this.image.naturalHeight / SHEET_ROWS
  }

  /** 判断指定方向的探头素材是否可用 */
  peekAvailable(side: PeekSide): boolean {
    const [a, b] = this.peekImages[side]
    return srcReady(a) && srcReady(b)
  }

  /** 在 (cx, bottomY) 为锚点（底部中心）绘制第 frame 帧，高度为 height */
  drawFrame(
    ctx: CanvasRenderingContext2D,
    frame: number,
    cx: number,
    bottomY: number,
    height: number
  ): void {
    const col = frame % SHEET_COLS
    const row = Math.floor(frame / SHEET_COLS)
    const sx = col * this.cellW
    const sy = row * this.cellH
    const width = height * (this.cellW / this.cellH)
    ctx.drawImage(this.image, sx, sy, this.cellW, this.cellH, cx - width / 2, bottomY - height, width, height)
  }

  /** 绘制探头素材：按方向、帧序号（0=base, 1=fg），保持原始宽高比，底部锚点对齐
   *  @param bottomOffset 向下补偿像素（用于 peek_top 素材底边留白修正）
   */
  drawPeek(
    ctx: CanvasRenderingContext2D,
    side: PeekSide,
    frameIndex: 0 | 1,
    cx: number,
    bottomY: number,
    height: number,
    bottomOffset = 0
  ): void {
    const img = this.peekImages[side][frameIndex]
    if (!srcReady(img)) {
      // 降级：用平静帧代替
      this.drawFrame(ctx, 0, cx, bottomY, height)
      return
    }
    const aspect = srcW(img) / srcH(img)
    const drawWidth = height * aspect
    ctx.drawImage(img, cx - drawWidth / 2, bottomY - height + bottomOffset, drawWidth, height)
  }
}
