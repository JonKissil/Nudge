import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'src/renderer/media/**/*.test.ts'], passWithNoTests: true },
})
