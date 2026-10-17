import { Menu, Tray, nativeImage } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import type { ActionResult } from '../shared/types'
import type { SessionHooks } from './session/session'
import { menuBarState } from './menuBarState'
import inactivePath from '../../resources/menu-bar/nudgeTemplate.png?asset'
import inactiveRetinaPath from '../../resources/menu-bar/nudgeTemplate@2x.png?asset'
import activePath from '../../resources/menu-bar/nudgeActive.png?asset'
import activeRetinaPath from '../../resources/menu-bar/nudgeActive@2x.png?asset'

export function createMenuBar(
  session: SessionHooks, showControl: () => void, quit: () => void,
): { dispose(): void } {
  const image = (path: string, retinaPath: string, template: boolean): Electron.NativeImage => {
    const icon = nativeImage.createFromPath(path)
    const retina = nativeImage.createFromPath(retinaPath)
    // Explicit representations survive asset hashing in the production build.
    icon.addRepresentation({ scaleFactor: 2, dataURL: retina.toDataURL() })
    icon.setTemplateImage(template)
    if (icon.isEmpty() || retina.isEmpty()) throw new Error('Could not load the Nudge menu-bar icon.')
    return icon
  }
  const inactive = image(inactivePath, inactiveRetinaPath, true)
  const active = image(activePath, activeRetinaPath, false)
  const tray = new Tray(inactive)
  let lastView = ''
  let illuminated = false
  const run = (action: () => Promise<ActionResult>): void => {
    void action().then((result) => {
      if (!result.ok) { console.warn(`Menu-bar action failed: ${result.error}`); showControl() }
    }).catch((error: unknown) => {
      console.error('Menu-bar action failed:', error instanceof Error ? error.message : 'Unknown error')
      showControl()
    })
  }
  const unsubscribe = session.onSnapshot((snapshot) => {
    const view = menuBarState(snapshot.state, snapshot.conn)
    const key = JSON.stringify(view)
    if (key === lastView) return
    lastView = key
    if (view.illuminated !== illuminated) {
      illuminated = view.illuminated
      tray.setImage(illuminated ? active : inactive)
    }
    tray.setToolTip(`Nudge — ${view.status}`)
    const items: MenuItemConstructorOptions[] = [
      { label: view.status, enabled: false },
      { label: 'Show Nudge', click: showControl },
      { type: 'separator' },
    ]
    if (view.canPause) items.push({
      label: view.paused ? 'Resume session' : 'Pause session',
      click: () => { run(() => session.togglePause()) },
    })
    if (view.canEnd) items.push({ label: 'End session', click: () => { run(() => session.endSession()) } })
    else items.push({ label: 'Start a session…', click: showControl })
    items.push({ type: 'separator' }, { label: 'Quit Nudge', accelerator: 'Command+Q', click: quit })
    tray.setContextMenu(Menu.buildFromTemplate(items))
  })
  return { dispose: () => { unsubscribe(); tray.destroy() } }
}
