/**
 * Vosk 中文离线语音识别支持：
 * - 主进程负责下载/缓存模型 zip（vosk-model-small-cn-0.22，约42MB）
 * - 起一个仅监听 127.0.0.1 的静态服务，把模型 zip 提供给渲染进程的 vosk-browser (WASM)
 */
import { createServer, type Server } from 'node:http'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync
} from 'node:fs'
import { join } from 'node:path'
import type { AsrStatus } from '@shared/types'
import { getStoreDir } from './store'

const MODEL_NAME = 'vosk-model-small-cn-0.22'
const MODEL_URL = `https://alphacephei.com/vosk/models/${MODEL_NAME}.zip`

let server: Server | null = null
let serverPort: number | null = null
let downloading = false
let receivedBytes = 0
let totalBytes = 0

export function modelZipPath(): string {
  return join(getStoreDir(), 'models', `${MODEL_NAME}.zip`)
}

export function isModelPresent(): boolean {
  try {
    return existsSync(modelZipPath()) && statSync(modelZipPath()).size > 1024 * 1024
  } catch {
    return false
  }
}

export function getStatus(): AsrStatus {
  return {
    modelPresent: isModelPresent(),
    downloading,
    receivedBytes,
    totalBytes,
    serverPort
  }
}

/** 下载模型（带进度），成功后落盘 */
export async function ensureModel(onProgress?: (r: number, t: number) => void): Promise<boolean> {
  if (isModelPresent()) return true
  if (downloading) return false
  downloading = true
  receivedBytes = 0
  totalBytes = 0
  try {
    const resp = await fetch(MODEL_URL, { signal: AbortSignal.timeout(600_000) })
    if (!resp.ok || !resp.body) throw new Error(`下载失败 HTTP ${resp.status}`)
    totalBytes = Number(resp.headers.get('content-length') ?? 0)
    const zipPath = modelZipPath()
    mkdirSync(join(getStoreDir(), 'models'), { recursive: true })
    const out = createWriteStream(zipPath + '.part')
    const reader = resp.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      out.write(Buffer.from(value))
      onProgress?.(receivedBytes, totalBytes)
    }
    await new Promise<void>((resolve) => out.end(resolve))
    if (existsSync(zipPath)) unlinkSync(zipPath)
    renameSync(zipPath + '.part', zipPath)
    return true
  } catch {
    try {
      unlinkSync(modelZipPath() + '.part')
    } catch {
      /* 忽略清理失败 */
    }
    return false
  } finally {
    downloading = false
  }
}

/** 本地静态服务：GET /model.zip -> 模型文件（带 CORS，供渲染进程 WASM 加载） */
export async function ensureLocalServer(): Promise<number> {
  if (server && serverPort) return serverPort
  server = createServer((req, res) => {
    if (req.url && req.url.startsWith('/model.zip')) {
      const zip = modelZipPath()
      if (!existsSync(zip)) {
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
        res.end('model not found')
        return
      }
      const size = statSync(zip).size
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': size,
        'Access-Control-Allow-Origin': '*'
      })
      createReadStream(zip).pipe(res)
    } else {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
      res.end()
    }
  })
  return await new Promise((resolve) => {
    server!.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      serverPort = typeof addr === 'object' && addr ? addr.port : null
      resolve(serverPort ?? 0)
    })
  })
}

export function modelHttpUrl(): string {
  return serverPort ? `http://127.0.0.1:${serverPort}/model.zip` : ''
}
