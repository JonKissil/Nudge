import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppStore } from '../src/main/store'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('saved theme', () => {
  it('defaults to minimalist and survives reopening the existing state file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'nudge-theme-'))
    directories.push(directory)
    const path = join(directory, 'state.json')
    const errors: string[] = []
    const store = new AppStore(path, (message) => errors.push(message))
    expect(store.theme).toBe('minimalist')
    await store.saveTheme('playful')
    expect(new AppStore(path, (message) => errors.push(message)).theme).toBe('playful')
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ version: 1, allowList: [], theme: 'playful' })
    expect(errors).toEqual([])
  })
})

describe('Quiet Mode preference', () => {
  it('defaults to voice, survives reopening, and leaves other settings intact', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'nudge-quiet-'))
    directories.push(directory)
    const path = join(directory, 'state.json')
    const store = new AppStore(path, () => {})
    expect(store.quietMode).toBe(false)
    await store.saveTheme('playful')
    await store.saveQuietMode(true)
    const restored = new AppStore(path, () => {})
    expect(restored.quietMode).toBe(true)
    expect(restored.theme).toBe('playful')
    await restored.saveQuietMode(false)
    expect(new AppStore(path, () => {}).quietMode).toBe(false)
  })
})
