import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: { rollupOptions: { external: ['get-windows', 'tesseract.js', '@tesseract.js-data/eng'] } },
  },
  preload: {
    // Each sandboxed preload must be self-contained, including zod.
    build: {
      externalizeDeps: false,
      isolatedEntries: true,
      rollupOptions: {
        input: {
          control: resolve('src/preload/control.ts'),
          overlay: resolve('src/preload/overlay.ts'),
          media: resolve('src/preload/media.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react(), {
      name: 'development-react-refresh-csp',
      apply: 'serve',
      // React Refresh injects an inline preamble in dev. Production keeps script-src 'self'.
      transformIndexHtml: (html) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
    }],
    build: {
      assetsInlineLimit: 0,
      rollupOptions: {
        input: {
          control: resolve('src/renderer/control/index.html'),
          overlay: resolve('src/renderer/overlay/index.html'),
          media: resolve('src/renderer/media/index.html'),
        },
      },
    },
  },
})
