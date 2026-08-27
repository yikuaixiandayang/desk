/** 对话气泡：展示回复/提醒，可带确认按钮 */
import type { EmotionKind } from '@shared/types'

export interface BubbleButton {
  label: string
  onClick: () => void
}

export interface BubbleOptions {
  emotion?: EmotionKind
  /** 0 或 undefined 表示不自动隐藏 */
  durationMs?: number
  buttons?: BubbleButton[]
  typing?: boolean
}

export class Bubble {
  private el = document.getElementById('bubble')!
  private textEl = document.getElementById('bubble-text')!
  private actionsEl = document.getElementById('bubble-actions')!
  private hideTimer: number | null = null

  show(text: string, opts: BubbleOptions = {}): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    this.el.className = opts.emotion && opts.emotion !== 'calm' ? `emotion-${opts.emotion}` : ''
    this.textEl.textContent = text
    this.textEl.classList.toggle('typing-dots', opts.typing ?? false)
    this.actionsEl.innerHTML = ''
    if (opts.buttons?.length) {
      this.el.classList.add('has-actions')
      for (const b of opts.buttons) {
        const btn = document.createElement('button')
        btn.textContent = b.label
        btn.addEventListener('click', b.onClick)
        this.actionsEl.appendChild(btn)
      }
    } else {
      this.el.classList.remove('has-actions')
    }
    this.el.classList.remove('hidden')
    if (opts.durationMs && opts.durationMs > 0) {
      this.hideTimer = window.setTimeout(() => this.hide(), opts.durationMs)
    }
  }

  updateText(text: string): void {
    this.textEl.textContent = text
  }

  hide(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    this.el.classList.add('hidden')
    this.actionsEl.innerHTML = ''
    this.el.classList.remove('has-actions')
  }

  get visible(): boolean {
    return !this.el.classList.contains('hidden')
  }

  get hasActions(): boolean {
    return this.el.classList.contains('has-actions')
  }

  /** 定位到宠物头顶上方 */
  position(petX: number, petTopY: number): void {
    this.el.style.left = `${petX}px`
    this.el.style.top = `${Math.max(60, petTopY - 12)}px`
  }
}
