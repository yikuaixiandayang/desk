/**
 * TTS 合成服务（主进程）：
 * - edge: msedge-tts 微软神经网络语音（免费在线，音质远超系统 SAPI）
 * - custom: OpenAI 兼容 /v1/audio/speech（可接 GPT-SoVITS / fish-audio 等实现声音克隆）
 * 返回 data URL 由渲染进程播放；sapi 引擎则直接用渲染进程 speechSynthesis，不经此服务。
 */
import { writeFile, mkdtemp, rm, readdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import type { TtsConfig, TtsSpeakResult } from '@shared/types'

let cacheDir: string | null = null
let edgeClient: MsEdgeTTS | null = null
let edgeVoice = ''

async function ensureCacheDir(): Promise<string> {
  if (!cacheDir) cacheDir = await mkdtemp(join(tmpdir(), 'pet-tts-'))
  return cacheDir
}

/** 清理旧缓存音频（保留最近 8 个） */
async function pruneCache(): Promise<void> {
  if (!cacheDir) return
  try {
    const files = (await readdir(cacheDir)).filter((f) => f.endsWith('.mp3')).sort()
    for (const f of files.slice(0, Math.max(0, files.length - 8))) {
      await unlink(join(cacheDir, f)).catch(() => undefined)
    }
  } catch {
    /* 清理失败不影响主流程 */
  }
}

function pct(mul: number): string {
  const v = Math.round((mul - 1) * 100)
  return `${v >= 0 ? '+' : ''}${Math.max(-50, Math.min(50, v))}%`
}

function hz(mul: number): string {
  const v = Math.round((mul - 1) * 20)
  return `${v >= 0 ? '+' : ''}${Math.max(-30, Math.min(30, v))}Hz`
}

async function synthEdge(text: string, cfg: TtsConfig): Promise<Buffer> {
  const voice = cfg.voice || 'zh-CN-XiaoyiNeural'
  if (!edgeClient || edgeVoice !== voice) {
    const client = new MsEdgeTTS()
    await client.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    edgeClient = client
    edgeVoice = voice
  }
  // 语速/音调通过 ProsodyOptions 生效
  const { audioStream } = await edgeClient.toStream(text, { rate: pct(cfg.rate), pitch: hz(cfg.pitch) })
  const chunks: Buffer[] = []
  try {
    for await (const c of audioStream) chunks.push(c as Buffer)
  } catch (err) {
    // 流中途断（msedge-tts 在某些边缘帧会向已关闭的 stream 推数据，原生版本未做防护），
    // 这里主动销毁单例，下一次调用重新建链，避免把半死的 client 长期复用。
    safeCloseEdgeClient()
    throw err
  }
  return Buffer.concat(chunks)
}

/** 安全关闭并清空 edge 单例；失败仅忽略。 */
function safeCloseEdgeClient(): void {
  const c = edgeClient
  edgeClient = null
  edgeVoice = ''
  if (!c) return
  try {
    // MsEdgeTTS 未暴露 close()，用 ws 关闭兜底（库内部字段）
    // @ts-expect-error 访问内部字段以彻底释放资源
    c._ws?.close?.()
  } catch {
    /* ignore */
  }
}

async function synthCustom(text: string, cfg: TtsConfig): Promise<Buffer> {
  const url = cfg.customUrl.replace(/\/+$/, '')
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.customKey ? { Authorization: `Bearer ${cfg.customKey}` } : {})
    },
    body: JSON.stringify({
      model: cfg.customModel || 'gpt-sovits',
      voice: cfg.customVoice || 'default',
      input: text,
      response_format: 'mp3'
    }),
    signal: AbortSignal.timeout(30_000)
  })
  if (!resp.ok) {
    throw new Error(`自定义 TTS HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 120)}`)
  }
  return Buffer.from(await resp.arrayBuffer())
}

export async function synthesize(text: string, cfg: TtsConfig): Promise<TtsSpeakResult> {
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()
  if (!clean) return { ok: false, error: '空文本', engine: cfg.engine }
  try {
    const buf = cfg.engine === 'custom' ? await synthCustom(clean, cfg) : await synthEdge(clean, cfg)
    if (buf.length < 512) throw new Error('合成音频过短')
    const dir = await ensureCacheDir()
    const file = join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`)
    await writeFile(file, buf)
    await pruneCache()
    return { ok: true, dataUrl: `data:audio/mp3;base64,${buf.toString('base64')}`, engine: cfg.engine }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), engine: cfg.engine }
  }
}

/** 列出可用 Edge 音色（失败时返回空，渲染端回退到预设清单） */
export async function listEdgeVoices(): Promise<string[]> {
  try {
    const client = new MsEdgeTTS()
    const voices = (await client.getVoices()) as Array<{ ShortName: string; Locale?: string; Gender?: string }>
    return voices
      .filter((v) => v.Locale?.startsWith('zh-'))
      .map((v) => `${v.ShortName}（${v.Gender === 'Female' ? '女' : '男'}）`)
  } catch {
    return []
  }
}

export async function cleanupTts(): Promise<void> {
  safeCloseEdgeClient()
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true }).catch(() => undefined)
}
