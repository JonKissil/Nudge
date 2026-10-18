import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    await store.saveTheme('gorilla')
    expect(new AppStore(path, (message) => errors.push(message)).theme).toBe('gorilla')
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ version: 1, allowList: [], theme: 'gorilla' })
    expect(errors).toEqual([])
  })

  it('migrates the former playful theme without losing saved allowances or timing', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'nudge-theme-'))
    directories.push(directory)
    const path = join(directory, 'state.json')
    const allowList = [{ kind: 'bundle', value: 'com.apple.TextEdit' }]
    writeFileSync(path, JSON.stringify({ version: 1, theme: 'playful', allowList, graceHistory: [30_000] }))
    const errors: string[] = []
    const store = new AppStore(path, (message) => errors.push(message))
    expect(store.theme).toBe('gorilla')
    expect(store.allowList).toEqual(allowList)
    expect(store.graceHistory).toEqual([30_000])
    await store.setAdaptiveGrace(false)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ theme: 'gorilla', allowList, graceHistory: [30_000] })
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
    await store.saveTheme('gorilla')
    await store.saveQuietMode(true)
    const restored = new AppStore(path, () => {})
    expect(restored.quietMode).toBe(true)
    expect(restored.theme).toBe('gorilla')
    await restored.saveQuietMode(false)
    expect(new AppStore(path, () => {}).quietMode).toBe(false)
  })
})
