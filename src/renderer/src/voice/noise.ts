/** 程序化环境音播放器（WebAudio，无需音频素材）：雨声 / 篝火 / 白 / 粉 / 棕噪 */
import type { NoiseKind } from '@shared/skills'

const NOISE_LABEL: Record<NoiseKind, string> = {
  rain: '雨声',
  fire: '篝火',
  white: '白噪音',
  pink: '粉噪音',
  brown: '棕噪音'
}

export function noiseLabel(kind: NoiseKind): string {
  return NOISE_LABEL[kind]
}

export class NoisePlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private nodes: AudioNode[] = []
  private timer: number | null = null
  private current: NoiseKind | null = null

  get playing(): NoiseKind | null {
    return this.current
  }

  stop(): void {
    for (const n of this.nodes) {
      try {
        n.disconnect()
      } catch {
        /* 已断开 */
      }
    }
    this.nodes = []
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.master) {
      try {
        this.master.disconnect()
      } catch {
        /* 忽略 */
      }
      this.master = null
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
    }
    this.current = null
  }

  /** 生成循环噪声缓冲（秒） */
  private makeBuffer(kind: NoiseKind, seconds = 4): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    if (kind === 'white' || kind === 'rain') {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    } else if (kind === 'pink') {
      // Paul Kellet 近似粉噪
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      }
    } else {
      // 棕噪（brown）：白噪积分
      let last = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        last = (last + 0.02 * w) / 1.02
        data[i] = last * 3.5
      }
    }
    return buffer
  }

  play(kind: NoiseKind): void {
    this.stop()
    this.ctx = new AudioContext()
    this.current = kind
    const master = this.ctx.createGain()
    master.gain.value = kind === 'fire' ? 0.5 : 0.35
    master.connect(this.ctx.destination)
    this.master = master

    if (kind === 'rain') {
      // 雨声 = 白噪过低通 + 轻微幅度起伏
      const src = this.ctx.createBufferSource()
      src.buffer = this.makeBuffer('white')
      src.loop = true
      const lp = this.ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1400
      const hp = this.ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 250
      const swell = this.ctx.createGain()
      swell.gain.value = 1
      src.connect(hp)
      hp.connect(lp)
      lp.connect(swell)
      swell.connect(master)
      src.start()
      this.nodes = [src, hp, lp, swell]
      // 雨强起伏
      this.timer = window.setInterval(() => {
        swell.gain.linearRampToValueAtTime(0.75 + Math.random() * 0.5, this.ctx!.currentTime + 2.5)
      }, 3000)
    } else if (kind === 'fire') {
      // 篝火 = 棕噪低频垫底 + 随机噼啪
      const src = this.ctx.createBufferSource()
      src.buffer = this.makeBuffer('brown')
      src.loop = true
      const lp = this.ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 900
      src.connect(lp)
      lp.connect(master)
      src.start()
      this.nodes = [src, lp]
      const crackle = (): void => {
        if (!this.ctx || this.current !== 'fire') return
        const pop = this.ctx.createBufferSource()
        const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.03), this.ctx.sampleRate)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2)
        pop.buffer = buf
        const g = this.ctx.createGain()
        g.gain.value = 0.25 + Math.random() * 0.55
        pop.connect(g)
        g.connect(master)
        pop.start()
        this.nodes.push(pop, g)
      }
      this.timer = window.setInterval(() => {
        const n = 1 + Math.floor(Math.random() * 2)
        for (let i = 0; i < n; i++) window.setTimeout(crackle, Math.random() * 800)
      }, 1200)
    } else {
      const src = this.ctx.createBufferSource()
      src.buffer = this.makeBuffer(kind)
      src.loop = true
      const lp = this.ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 8000
      src.connect(lp)
      lp.connect(master)
      src.start()
      this.nodes = [src, lp]
    }
  }
}
