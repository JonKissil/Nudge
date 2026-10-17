import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WindowInfo } from '../../shared/types'
import { buildFocusScript } from './focusScript'

/** One attempt only: failure must not repeat an action that may already have happened. */
export async function focusTaskWindow(window: WindowInfo): Promise<'ok' | 'not_found'> {
  try {
    const script = buildFocusScript(window)
    if (!script || process.platform !== 'darwin') return 'not_found'
    const { stdout } = await promisify(execFile)('/usr/bin/osascript', ['-e', script], {
      timeout: 8000, maxBuffer: 4096,
    })
    return stdout.trim() === 'ok' ? 'ok' : 'not_found'
  } catch {
    // Apple Event errors can contain URLs. Return an honest result without logging private data.
    return 'not_found'
  }
}
