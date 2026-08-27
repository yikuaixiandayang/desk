/** v0.8 自定义素材服务：用户自选目录 → 逐槽位扫描校验 + 读出 dataURL。
 *  仅做文件层面校验（存在 / 合法 PNG / 带透明通道），素材语义构图由用户按规格保证。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ASSET_SLOTS, type AssetScanResult, type AssetSlotId } from '@shared/types'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** 读取 PNG IHDR 的颜色类型（offset 25），用于判断是否带透明通道 */
function pngColorType(buf: Buffer): number | null {
  if (buf.length < 26 || !PNG_MAGIC.equals(buf.subarray(0, 8))) return null
  return buf[25]
}

/** 单文件是否可被用作素材：存在 + 合法 PNG + 带 alpha 通道 */
export function isUsablePng(file: string): boolean {
  if (!existsSync(file)) return false
  try {
    const buf = readFileSync(file)
    const ct = pngColorType(buf)
    if (ct === null) return false
    // 6=truecolor+alpha, 4=gray+alpha；3(palette) 可能带 tRNS，也视为可用
    return ct === 6 || ct === 4 || ct === 3
  } catch {
    return false
  }
}

/** 扫描用户素材目录：各槽位优先识别 sheet 合图，否则按 files 散图全名匹配 */
export function scanAssets(dir: string): AssetScanResult {
  const slots = ASSET_SLOTS.map((slot) => {
    const sheetOk = slot.sheet ? isUsablePng(join(dir, slot.sheet)) : false
    if (sheetOk) {
      // 合图命中：整槽位由一张合图替换
      const files = [{ name: slot.sheet as string, ok: true }]
      return { id: slot.id, label: slot.label, desc: slot.desc, active: true, files }
    }
    const files = slot.files.map((name) => {
      const ok = isUsablePng(join(dir, name))
      return { name, ok }
    })
    // 空 files 槽位（如 walk 仅合图）：无散图时不视为 active
    return { id: slot.id, label: slot.label, desc: slot.desc, active: files.length > 0 && files.every((f) => f.ok), files }
  })
  return { dir, slots }
}

/** 按槽位读取素材为 dataURL（仅返回存在的文件）。key 为槽位 id，value 为文件名→dataURL */
export async function readSlotAssets(
  dir: string,
  slotIds: AssetSlotId[]
): Promise<Partial<Record<AssetSlotId, Record<string, string>>>> {
  const out: Partial<Record<AssetSlotId, Record<string, string>>> = {}
  for (const slotId of slotIds) {
    const slot = ASSET_SLOTS.find((s) => s.id === slotId)
    if (!slot) continue
    const map: Record<string, string> = {}
    const names = [slot.sheet, ...slot.files].filter((n): n is string => !!n)
    for (const name of names) {
      const p = join(dir, name)
      if (!isUsablePng(p)) continue
      map[name] = `data:image/png;base64,${readFileSync(p).toString('base64')}`
    }
    if (Object.keys(map).length > 0) out[slotId] = map
  }
  return out
}