/**
 * 运行时配置服务（后台控制台核心）：
 * API 地址/模型/Key/模式、TTS、记忆目录、移动模式 —— 修改后实时生效，无需重启。
 * 取值优先级：控制台已保存值 > 环境变量 > config.local.json > 内置默认。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_APP_CONFIG, type AppConfigPatch, type AppRuntimeConfig } from '@shared/types'
import { get as storeGet, set as storeSet } from './store'

interface LocalFileConfig {
  GLM_API_KEY?: string
  GLM_BASE_URL?: string
  GLM_MODEL?: string
}

function readLocalFile(): LocalFileConfig {
  const candidates = [join(app.getAppPath(), 'config.local.json')]
  if (process.resourcesPath) candidates.push(join(process.resourcesPath, 'config.local.json'))
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue
      return JSON.parse(readFileSync(p, 'utf-8')) as LocalFileConfig
    } catch {
      /* 尝试下一个候选 */
    }
  }
  return {}
}

export function defaultMemoryDir(): string {
  return join(app.getAppPath(), '银月记忆')
}

function isLegacyMemoryDir(dir: string | undefined): boolean {
  if (!dir) return false
  const docsPath = join(app.getPath('documents'), '银月记忆').replace(/\\/g, '/')
  const normalized = dir.replace(/\\/g, '/')
  return normalized === docsPath || normalized.includes('/Documents/银月记忆') || normalized.includes('/文档/银月记忆')
}

/** 读取合并后的运行时配置 */
export function getConfig(): AppRuntimeConfig {
  const stored = storeGet('appConfig') as AppRuntimeConfig | undefined
  const local = readLocalFile()
  const env = {
    apiKey: process.env.GLM_API_KEY ?? local.GLM_API_KEY ?? '',
    baseUrl: process.env.GLM_BASE_URL ?? local.GLM_BASE_URL ?? DEFAULT_APP_CONFIG.api.baseUrl,
    model: process.env.GLM_MODEL ?? local.GLM_MODEL ?? DEFAULT_APP_CONFIG.api.model
  }
  const cfg: AppRuntimeConfig = structuredClone(DEFAULT_APP_CONFIG)
  cfg.api.apiKey = env.apiKey
  cfg.api.baseUrl = env.baseUrl
  cfg.api.model = env.model
  cfg.memory.dir = defaultMemoryDir()
  if (stored) {
    if (stored.api?.apiKey) cfg.api.apiKey = stored.api.apiKey
    if (stored.api?.baseUrl) cfg.api.baseUrl = stored.api.baseUrl
    if (stored.api?.model) cfg.api.model = stored.api.model
    if (stored.api?.mode) cfg.api.mode = stored.api.mode
    if (stored.tts) cfg.tts = { ...cfg.tts, ...stored.tts }
    if (stored.memory) {
      // 强制迁移：旧默认路径（Documents/银月记忆）改为项目运行目录下的银月记忆
      if (isLegacyMemoryDir(stored.memory.dir)) {
        cfg.memory.dir = defaultMemoryDir()
        // 立即回写，避免下次还走迁移逻辑
        const next = structuredClone(stored)
        next.memory = { ...stored.memory, dir: cfg.memory.dir }
        storeSet('appConfig', next)
      } else {
        cfg.memory = { ...cfg.memory, ...stored.memory }
      }
    }
    if (stored.pet) cfg.pet = { ...cfg.pet, ...stored.pet }
    if (stored.weather) cfg.weather = { ...cfg.weather, ...stored.weather }
    if (stored.nurture) cfg.nurture = { ...cfg.nurture, ...stored.nurture }
    if (stored.assistant) cfg.assistant = { ...cfg.assistant, ...stored.assistant }
    if (stored.lines) cfg.lines = { ...cfg.lines, ...stored.lines }
  }
  return cfg
}

/** 分节深合并写入 */
export function setConfig(patch: AppConfigPatch): AppRuntimeConfig {
  const current = getConfig()
  const next: AppRuntimeConfig = {
    api: { ...current.api, ...(patch.api ?? {}) },
    tts: { ...current.tts, ...(patch.tts ?? {}) },
    memory: { ...current.memory, ...(patch.memory ?? {}) },
    pet: { ...current.pet, ...(patch.pet ?? {}) },
    weather: { ...current.weather, ...(patch.weather ?? {}) },
    nurture: { ...current.nurture, ...(patch.nurture ?? {}) },
    assistant: { ...current.assistant, ...(patch.assistant ?? {}) },
    lines: { ...current.lines, ...(patch.lines ?? {}) }
  }
  storeSet('appConfig', next)
  return getConfig()
}

/** 控制台展示用：Key 打码 */
export function maskConfig(cfg: AppRuntimeConfig): AppRuntimeConfig {
  const k = cfg.api.apiKey
  const masked = k ? k.slice(0, 10) + '****' + k.slice(-4) : ''
  return { ...cfg, api: { ...cfg.api, apiKey: masked }, tts: { ...cfg.tts, customKey: cfg.tts.customKey ? '****' : '' } }
}
