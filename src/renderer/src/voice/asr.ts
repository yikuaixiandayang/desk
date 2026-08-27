/**
 * 中文语音输入：vosk-browser (WASM, 离线) + AudioContext 采集
 * 模型 zip 由主进程下载并经 127.0.0.1 本地服务提供给 WASM 加载。
 */
import type { PetApi } from '../../../preload/index'

type VoskModel = {
  KaldiRecognizer: new (sampleRate: number) => VoskRecognizer
}
type VoskRecognizer = {
  acceptWaveform: (data: Float32Array) => void
  finalResult: () => { text: string }
  on: (event: string, cb: (msg: { result?: { text: string } }) => void) => void
}

export class VoiceInput {
  private model: VoskModel | null = null
  private recognizer: VoskRecognizer | null = null
  private audioCtx: AudioContext | null = null
  private stream: MediaStream | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private loading = false

  constructor(private pet: PetApi) {}

  /** 确保模型就绪；返回错误原因（null 表示成功） */
  async ensureModel(onProgress?: (r: number, t: number) => void): Promise<string | null> {
    const off = onProgress ? this.pet.asr.onProgress(onProgress) : null
    try {
      const status = await this.pet.asr.status()
      if (!status.modelPresent) {
        const r = await this.pet.asr.ensureModel()
        if (!r.ok) return '模型下载失败，请检查网络后重试'
      }
      if (!this.model) {
        const { url } = await this.pet.asr.modelUrl()
        if (!url) return '本地模型服务启动失败'
        this.loading = true
        const mod = await import('vosk-browser')
        this.model = (await mod.createModel(url)) as unknown as VoskModel
        this.loading = false
      }
      return null
    } catch (e) {
      this.loading = false
      return `语音模块初始化异常: ${e instanceof Error ? e.message : String(e)}`
    } finally {
      off?.()
    }
  }

  get modelReady(): boolean {
    return this.model !== null
  }

  /**
   * 开始录音识别。onPartial 收到中间结果；onFinal 收到最终文本。
   */
  async start(
    onPartial: (text: string) => void,
    onFinal: (text: string) => void
  ): Promise<string | null> {
    if (this.loading) return '模型正在初始化，请稍候'
    if (!this.model) {
      const err = await this.ensureModel()
      if (err) return err
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
    } catch {
      return '无法访问麦克风（权限被拒绝或设备不存在）'
    }

    this.audioCtx = new AudioContext()
    this.source = this.audioCtx.createMediaStreamSource(this.stream)
    this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1)

    const rec = new this.model!.KaldiRecognizer(this.audioCtx.sampleRate)
    rec.on('partialresult', (msg) => {
      const text = msg.result?.text ?? ''
      if (text) onPartial(text)
    })
    rec.on('result', (msg) => {
      const text = msg.result?.text ?? ''
      if (text) {
        onPartial(text)
        onFinal(text)
      }
    })
    this.recognizer = rec

    this.processor.onaudioprocess = (ev) => {
      const data = ev.inputBuffer.getChannelData(0)
      if (this.recognizer) this.recognizer.acceptWaveform(new Float32Array(data))
    }
    this.source.connect(this.processor)
    // ScriptProcessor 需要连接目的地才会触发回调
    const sink = this.audioCtx.createGain()
    sink.gain.value = 0
    this.processor.connect(sink)
    sink.connect(this.audioCtx.destination)
    this._sink = sink
    return null
  }

  private _sink: GainNode | null = null

  /** 结束录音并返回最终识别文本 */
  stop(): string {
    let text = ''
    if (this.recognizer) {
      try {
        text = this.recognizer.finalResult().text?.trim() ?? ''
      } catch {
        text = ''
      }
    }
    this.teardown()
    return text
  }

  abort(): void {
    this.teardown()
  }

  private teardown(): void {
    this.recognizer = null
    try {
      this.processor?.disconnect()
      this._sink?.disconnect()
      this.source?.disconnect()
      this.stream?.getTracks().forEach((t) => t.stop())
      void this.audioCtx?.close()
    } catch {
      /* 忽略清理异常 */
    }
    this.processor = null
    this._sink = null
    this.source = null
    this.stream = null
    this.audioCtx = null
  }
}
