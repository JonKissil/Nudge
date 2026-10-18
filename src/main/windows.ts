import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { Theme } from '../shared/types'

const controlBackground: Record<Theme, string> = {
  pixelated: '#dcecc9', minimalist: '#f5f4ef', 'neo-brutalist': '#ffe87a', gorilla: '#102f25',
}

export function setControlTheme(window: BrowserWindow, theme: Theme): void {
  window.setBackgroundColor(controlBackground[theme])
}

export type WindowKind = 'control' | 'overlay' | 'media'
export type AppWindows = Record<WindowKind, BrowserWindow>

export function centerControlWindow(window: BrowserWindow): void {
  const area = screen.getPrimaryDisplay().workArea
  const bounds = window.getBounds()
  // macOS's native center() places small windows above the geometric midpoint.
  window.setPosition(Math.round(area.x + (area.width - bounds.width) / 2),
    Math.round(area.y + (area.height - bounds.height) / 2))
}

export function createWindows(): AppWindows {
  const make = (kind: WindowKind): BrowserWindow => {
    const window = new BrowserWindow({
      title: `Nudge — ${kind}`,
      show: false,
      ...(kind === 'control'
        ? { width: 440, height: 440, resizable: false, maximizable: false,
            fullscreenable: false, backgroundColor: controlBackground.minimalist,
            titleBarStyle: 'hiddenInset' as const }
        : kind === 'overlay'
          ? { ...screen.getPrimaryDisplay().bounds, transparent: true, frame: false,
              focusable: false, hasShadow: false, skipTaskbar: true,
              // Prevent macOS from clamping the overlay to the menu bar / Dock work area.
              type: 'panel', enableLargerThanScreen: true, resizable: false, fullscreenable: false }
          : { width: 320, height: 240, skipTaskbar: true }),
      webPreferences: {
        preload: join(__dirname, `../preload/${kind}.js`),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: kind === 'control',
      },
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => { event.preventDefault() })
    window.webContents.on('preload-error', (_event, _path, error) => {
      console.error(`${kind} preload failed:`, error.message)
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      console.error(`${kind} renderer exited: ${details.reason}`)
      if (kind === 'overlay') window.setIgnoreMouseEvents(true, { forward: true })
    })
    if (kind === 'overlay') window.webContents.on('did-start-loading', () => {
      window.setIgnoreMouseEvents(true, { forward: true })
    })
    return window
  }

  const windows = { control: make('control'), overlay: make('overlay'), media: make('media') }
  windows.overlay.setAlwaysOnTop(true, 'screen-saver')
  windows.overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  windows.overlay.setIgnoreMouseEvents(true, { forward: true })
  windows.overlay.setContentProtection(true)

  const updateBounds = (): void => {
    if (!windows.overlay.isDestroyed()) windows.overlay.setBounds(screen.getPrimaryDisplay().bounds)
  }
  screen.on('display-metrics-changed', updateBounds)
  screen.on('display-added', updateBounds)
  screen.on('display-removed', updateBounds)
  windows.overlay.once('closed', () => {
    screen.removeListener('display-metrics-changed', updateBounds)
    screen.removeListener('display-added', updateBounds)
    screen.removeListener('display-removed', updateBounds)
  })

  return windows
}

export async function loadWindows(windows: AppWindows): Promise<void> {
  await Promise.all(Object.entries(windows).map(async ([kind, window]) => {
    if (process.env.ELECTRON_RENDERER_URL) {
      await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${kind}/index.html`)
    } else {
      await window.loadFile(join(__dirname, `../renderer/${kind}/index.html`))
    }
  }))
  centerControlWindow(windows.control)
  windows.control.show()
  windows.overlay.showInactive()
}
