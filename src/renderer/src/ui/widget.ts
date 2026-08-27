/** 桌面常驻小卡片：时间 / 番茄倒计时 / 提醒摘要 */

export class Widget {
  private el = document.getElementById('widget')!
  private timeEl = document.getElementById('widget-time')!
  private extraEl = document.getElementById('widget-extra')!
  private enabled = false
  private pomodoroEndsAt = 0
  private pomodoroActive = false
  private reminderSummary = ''

  setEnabled(on: boolean): void {
    this.enabled = on
    this.refresh()
  }

  /** 刷新显示内容（建议每 1-5 秒调用一次） */
  refresh(): void {
    if (!this.enabled) {
      this.el.classList.add('hidden')
      return
    }
    this.el.classList.remove('hidden')

    // 优先级：番茄倒计时 > 提醒摘要 > 默认时钟
    if (this.pomodoroActive && this.pomodoroEndsAt > Date.now()) {
      const remaining = Math.max(0, Math.ceil((this.pomodoroEndsAt - Date.now()) / 1000))
      const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
      const ss = String(remaining % 60).padStart(2, '0')
      this.extraEl.textContent = `🍅 ${mm}:${ss}`
      this.extraEl.classList.remove('hidden')
      this.timeEl.classList.add('hidden')
    } else if (this.reminderSummary) {
      this.extraEl.textContent = `⏰ ${this.reminderSummary}`
      this.extraEl.classList.remove('hidden')
      this.timeEl.classList.add('hidden')
    } else {
      this.extraEl.classList.add('hidden')
      this.timeEl.classList.remove('hidden')
      const now = new Date()
      this.timeEl.textContent =
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    }
  }

  setPomodoro(active: boolean, endsAt: number): void {
    this.pomodoroActive = active
    this.pomodoroEndsAt = endsAt
    this.refresh()
  }

  setReminder(text: string): void {
    this.reminderSummary = text
    this.refresh()
  }

  /** 定位到宠物右侧（窗口内相对坐标） */
  position(petX: number, petTopY: number): void {
    this.el.style.left = `${petX + 40}px`
    this.el.style.top = `${petTopY + 20}px`
  }

  get isVisible(): boolean {
    return this.enabled && !this.el.classList.contains('hidden')
  }
}
