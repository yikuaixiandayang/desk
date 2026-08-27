/** 多显示器工作区合并工具（主进程共用，避免 index.ts / ipc.ts 重复） */

export interface RectLike {
  x: number
  y: number
  width: number
  height: number
}

/** 计算多个工作区矩形的并集；空数组时返回 null，由调用方决定兜底 */
export function unionRects(areas: RectLike[]): RectLike | null {
  if (areas.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of areas) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
