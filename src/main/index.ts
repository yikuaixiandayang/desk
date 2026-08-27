/** 主进程入口：透明置顶桌面宠物窗口 + 托盘 + 生命周期 */
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app, BrowserWindow, Tray, Menu, nativeImage, screen, globalShortcut, clipboard } from 'electron'
type NativeImage = Electron.NativeImage
import { IPC } from '@shared/types'
import { unionRects } from '@shared/display'
import { registerIpc } from './ipc'
import { startReminders } from './services/reminders'
import { startScheduler } from './services/scheduler'
import { startPomodoroScheduler } from './services/pomodoro'
import { startNurtureScheduler } from './services/nurture'
import { startMorningReportScheduler } from './services/morning-report'
import { startReportScheduler } from './services/report'
import { startKeyCount, stopKeyCount } from './services/keycount'
import { runSelfTest } from './selftest'

/** 计算所有显示器的合并工作区矩形（支持多显示器，宠物可跨屏活动） */
function unionDisplayBounds(): Electron.Rectangle {
  const areas = screen.getAllDisplays().map((d) => d.workArea)
  return unionRects(areas) ?? screen.getPrimaryDisplay().workArea
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function resourcePath(...parts: string[]): string {
  return join(app.getAppPath(), 'resources', ...parts)
}

function createTrayIcon(): NativeImage {
  try {
    const sheet = nativeImage.createFromPath(resourcePath('yinyue-sprite-sheet.png'))
    if (!sheet.isEmpty()) {
      const cellW = Math.floor(sheet.getSize().width / 4)
      const cellH = Math.floor(sheet.getSize().height / 2)
      return sheet.crop({ x: 0, y: 0, width: cellW, height: cellH }).resize({ width: 32, height: 32 })
    }
  } catch {
    /* 生成失败则使用空图标 */
  }
  return nativeImage.createEmpty()
}

function createTray(): void {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('银月桌宠')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开对话（Alt+Y）', click: () => mainWindow?.webContents.send('tray:toggle-panel') },
      { label: '剪贴板解读（Alt+J）', click: () => {
        const text = clipboard.readText().trim()
        mainWindow?.webContents.send(IPC.assistClipboard, text.slice(0, 2000))
      } },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  )
  tray.on('double-click', () => mainWindow?.webContents.send('tray:toggle-panel'))
}

/** 预加载脚本路径（electron-vite 产物可能为 .mjs 或 .js，按存在性探测） */
function preloadPath(): string {
  const mjs = join(__dirname, '../preload/index.mjs')
  const js = join(__dirname, '../preload/index.js')
  return existsSync(mjs) ? mjs : js
}

/** 全局快捷键：Alt+Y 呼出对话；Alt+J 剪贴板解读 */
function registerHotkeys(): void {
  try {
    globalShortcut.register('Alt+Y', () => mainWindow?.webContents.send('tray:toggle-panel'))
    globalShortcut.register('Alt+J', () => {
      const text = clipboard.readText().trim()
      mainWindow?.webContents.send(IPC.assistClipboard, text.slice(0, 2000))
    })
  } catch (e) {
    console.log(`[hotkeys] 注册失败（可能被占用）: ${e instanceof Error ? e.message : e}`)
  }
}

app.whenReady().then(() => {
  const single = app.requestSingleInstanceLock()
  if (!single) {
    app.quit()
    return
  }

  if (process.argv.includes('--self-test')) {
    runSelfTest()
      .then((code) => app.exit(code))
      .catch((err) => {
        console.error('[selftest] unexpected', err)
        app.exit(1)
      })
    return
  }

  // 窗口保持“仅包住宠物”的小尺寸；运行时由渲染层用 win:set-bounds 跟随宠物
  // 在各显示器之间移动。如此可绕开 Windows DWM 对“横跨多屏的单个透明巨窗”的
  // 裁剪限制（那种写法会让宠物只显示在一块屏上）。
  const start = unionDisplayBounds()
  mainWindow = new BrowserWindow({
    x: Math.round(start.x + start.width / 2 - 300),
    y: Math.round(start.y + start.height - 570),
    width: 600,
    height: 570,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: false
    }
  })

  // 置顶层级：覆盖大多数普通窗口，但用户仍可操作任务栏等
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  registerIpc(() => mainWindow)
  startReminders((ev) => mainWindow?.webContents.send(IPC.reminderEvent, ev))
  startScheduler((t) => mainWindow?.webContents.send(IPC.timerFire, t))
  startPomodoroScheduler((ev) => mainWindow?.webContents.send(IPC.pomodoroEvent, ev))
  startNurtureScheduler((ev) => mainWindow?.webContents.send(IPC.nurtureEvent, ev))
  startMorningReportScheduler((r) => mainWindow?.webContents.send(IPC.morningReport, r))
  startReportScheduler()
  void startKeyCount()
  registerHotkeys()
  createTray()

  // 多显示器：显示器增减/分辨率变化时通知渲染层重新拉取活动范围
  const notifyDisplaysChanged = (): void => {
    if (!mainWindow) return
    mainWindow.webContents.send(IPC.screenChanged)
  }
  screen.on('display-added', notifyDisplaysChanged)
  screen.on('display-removed', notifyDisplaysChanged)
  screen.on('display-metrics-changed', notifyDisplaysChanged)

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (process.env.PET_DEVTOOLS) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.webContents.on('console-message', (...args: unknown[]) => {
    const ev = args[0] as { message?: string }
    const msg: unknown = ev.message ?? args[2]
    if (typeof msg === 'string' && msg.startsWith('[pet]')) console.log(`[renderer] ${msg}`)
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopKeyCount()
})

app.on('second-instance', () => {
  if (mainWindow) {
    mainWindow.show()
  }
})
