/** 语音合成统一入口：edge/custom 引擎走主进程合成+音频播放，sapi 用渲染进程 SpeechSynthesis；失败自动降级 */
import type { PetApi } from '../../../preload/index'
import type { TtsConfig } from '@shared/types'

export interface SpeakMods {
  rateMul?: number
  pitchMul?: number
}

export class Tts {
  enabled = true
  private cfg: TtsConfig | null = null
  private audio: HTMLAudioElement | null = null
  private sapiVoices: SpeechSynthesisVoice[] = []
  private sapiReady = false
  /** 实际发声的引擎（降级时与配置不同），供 UI 展示 */
  lastEngine = ''

  constructor(private pet: PetApi) {}

  /** 预热系统语音列表（sapi 备援） */
  initSapi(): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === 'undefined') {
        resolve(false)
        return
      }
      const pick = (): void => {
        this.sapiVoices = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('zh'))
        if (this.sapiVoices.length > 0) {
          this.sapiReady = true
          resolve(true)
        }
      }
      pick()
      speechSynthesis.addEventListener('voiceschanged', pick, { once: true })
      setTimeout(() => {
        if (!this.sapiReady) {
          pick()
          resolve(this.sapiReady)
        }
      }, 1500)
    })
  }

  applyConfig(cfg: TtsConfig): void {
    this.cfg = cfg
  }

  get sapiVoiceNames(): string[] {
    return this.sapiVoices.map((v) => v.name)
  }

  private speakSapi(text: string, mods: SpeakMods): boolean {
    if (typeof speechSynthesis === 'undefined' || !this.sapiReady) return false
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()
    if (!clean) return false
    speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(clean)
    const wanted = this.cfg?.voice ?? ''
    const voice = this.sapiVoices.find((v) => v.name === wanted) ?? this.sapiVoices[0]
    if (voice) utter.voice = voice
    utter.lang = voice?.lang ?? 'zh-CN'
    utter.rate = Math.max(0.5, Math.min(2, (this.cfg?.rate ?? 1) * (mods.rateMul ?? 1)))
    utter.pitch = Math.max(0.5, Math.min(2, (this.cfg?.pitch ?? 1) * (mods.pitchMul ?? 1)))
    utter.volume = this.cfg?.volume ?? 0.9
    speechSynthesis.speak(utter)
    this.lastEngine = 'sapi'
    return true
  }

  private async playDataUrl(dataUrl: string): Promise<void> {
    this.audio?.pause()
    const audio = new Audio(dataUrl)
    audio.volume = Math.max(0, Math.min(1, this.cfg?.volume ?? 0.9))
    this.audio = audio
    await audio.play().catch(() => undefined)
  }

  /** 播报；返回实际使用的引擎（空串表示不可用） */
  async speak(text: string, mods: SpeakMods = {}): Promise<'edge' | 'custom' | 'sapi' | ''> {
    if (!this.enabled) return ''
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/^【[^】]+】/, '').trim()
    if (!clean) return ''
    const engine = this.cfg?.engine ?? 'edge'
    if (engine === 'sapi') {
      return this.speakSapi(clean, mods) ? 'sapi' : ''
    }
    const r = await this.pet.tts.speak(clean)
    if (r.ok && r.dataUrl) {
      await this.playDataUrl(r.dataUrl)
      this.lastEngine = r.engine
      return r.engine
    }
    console.log(`[pet] TTS ${engine} 失败(${r.error ?? '未知'})，降级 sapi`)
    return this.speakSapi(clean, mods) ? 'sapi' : ''
  }

  stop(): void {
    this.audio?.pause()
    this.audio = null
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }
}
