/// <reference types="vite/client" />
import type { NudgeApi } from '../shared/bridge'

declare global {
  interface Window { nudge: NudgeApi }
}
