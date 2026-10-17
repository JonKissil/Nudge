# Nudge

<<<<<<< HEAD
Run `npm run dev`, then use **Next overlay preview** in the control window to cycle through the pill,
check-in card, arrow, next-step note, captions, and session states. **Hide overlay** clears the preview.
The preview buttons simulate their actions. Notes fade and disappear after three minutes.

If your environment sets `ELECTRON_RUN_AS_NODE`, launch with `env -u ELECTRON_RUN_AS_NODE npm run dev`.

M1's demo-Mac capture-exclusion and full-screen Chrome checks are tracked in [TASKS.md](TASKS.md).
=======
A macOS study companion that gently helps students return to their task. Read [AGENTS.md](AGENTS.md)
for the architecture and [TASKS.md](TASKS.md) for the build plan.

## Setup

Use macOS and Node **22.12+** (Node 24 LTS recommended). The current Electron package requires a newer Node
version than the original Node 20 baseline. No API key is needed to run the M0 scaffold. Installation
includes a `postinstall` step that downloads the Electron runtime from its official GitHub release;
allow a few minutes on a slow connection.

```bash
npm install
cp .env.example .env
npm run dev
```

Add your Gemini key to `.env` when implementing the Live session in M3. Environment files are ignored by
Git. Main reads `.env` at startup; API keys are never exposed through the preload bridge or Vite config.
Restart the app after changing `.env`.

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run preview
DEMO_MODE=1 npm run dev
```

`npm run dev` opens the control window, a transparent click-through overlay, and a hidden media window.
Each renderer has its own typed preload API, context isolation, and sandbox. The control form saves a
task in main-process memory and enters `SETUP`; it does not start capture, a microphone, or an AI session.
The overlay stays empty until M1. Quit by closing the control window or pressing Ctrl+C in the terminal.

If an agent/editor environment sets `ELECTRON_RUN_AS_NODE=1`, clear that variable for desktop launches:
`env -u ELECTRON_RUN_AS_NODE npm run dev`. Otherwise Electron runs as Node and cannot create windows.

React and React DOM supply the planned UI; their type packages, Vite's React plugin, and TypeScript ESLint
provide the React/TS build and lint tooling. AI, active-window, and OCR dependencies arrive with their
milestones. `get-windows` is already marked external in the build configuration for its later dynamic import.

## Demo Mac permissions

Grant these on the actual demo laptop and fully restart the launching terminal/editor and Electron:

1. **System Settings → Privacy & Security → Screen & System Audio Recording** (called Screen Recording
   on some macOS versions): enable the launching terminal/editor and Electron as applicable.
2. **Microphone**: approve access when audio capture is introduced in M3.
3. **Automation → Google Chrome**: approve the prompt when the return-to-task action is introduced in M5.
4. **Accessibility** may also be needed for active-window detection in M2.

M0 does not request capture, audio, or browser automation, so those prompts will appear with their
respective features. Keep the permission task unchecked until all required access has been tested on
the demo laptop. A permission checklist UI is scheduled for M7.

## Native OCR (M6)

```bash
npm run build:ocr
```

This script will compile `native/ocr-helper/main.swift` with `swiftc -O` into `resources/bin/ocr-helper`.
Until M6 adds the Swift source, it exits with an explanation. Generated binaries are ignored by Git.

## Layout

- `src/main`: Electron lifecycle, windows, and setup IPC handlers; future session effects and OS integrations.
- `src/preload`: separate control, media, and overlay APIs; no raw IPC access exposed to renderers.
- `src/renderer/{control,media,overlay}`: React entry points and CSS modules.
- `src/shared`: zod schemas, IPC channel constants, bridge interfaces, and DEFAULTS/DEMO configuration.
- `tests`: Vitest specs for shared validation; future pure-module and fake-client tests.
>>>>>>> f5bb2fc (Scaffold)
