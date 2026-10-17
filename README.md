# Nudge

Nudge is a macOS study companion. It watches the task window during a session, stays quiet while you focus,
and offers a gentle voice check-in when you drift. See [AGENTS.md](AGENTS.md) for the design and
[TASKS.md](TASKS.md) for milestone status.

## Run locally

Use macOS with Node 22.12 or newer. Put `GEMINI_API_KEY=...` in a local `.env` file; `.env` is ignored by
Git and loaded only in Electron's main process. Never put the key in a renderer or commit it.

```bash
npm install
npm run dev
```

If your terminal sets `ELECTRON_RUN_AS_NODE=1`, run `env -u ELECTRON_RUN_AS_NODE npm run dev`.
`DEMO_MODE=1 npm run dev` starts with demo timing and the sample essay task. The control window can also
toggle demo timing while the app runs.

In the control window, save a task, click **Lock task window**, and switch to its document in Safari,
Chrome, another supported browser, or a document app before the three-second countdown ends.
Nudge then starts its Live connection and screen capture.
**Pause session** and **End session** are available in the control window; the overlay offers one-click
actions during a check-in. The microphone stays off except during a check-in or push-to-talk.

Keyboard shortcuts: `⌘⇧Space` toggles push-to-talk, `⌘⇧P` pauses or resumes, and `⌘⇧D` toggles the live
status display.

## Mac permissions

The control window shows Screen Recording, Microphone, and Accessibility status and links to System Settings.
Grant Screen Recording for capture and window details, Microphone for voice, Accessibility for browser
details, and Automation for the browser you use (including Safari or Chrome) when macOS asks while
reading URLs or returning to the task. Fully restart the launching terminal/editor and Electron after
granting access. Do these checks on the actual demo Mac.

The checklist refreshes when you return from Settings and periodically while visible. “Not active for
this launch” describes the running copy's access; it does not mean your Settings switch is off. Working
capture and successful browser URL reads are shown separately from macOS permission flags.
Development launches may use the terminal/editor's permissions. If you enabled **Electron** but the
editor-launched copy still lacks access, fully quit that copy, then run:

```bash
npm run start:mac
```

This builds Nudge and opens Electron.app directly through macOS Launch Services, matching the Electron
entry in Settings. It loads the built pages; use `npm run dev` for hot reload with your terminal/editor's
permissions. An actual macOS denial still requires granting access for the appropriate app and restarting.

Use **Request access** beside Microphone to ask macOS. If access was denied earlier, macOS opens its
Microphone settings instead of prompting again. After granting access and restarting, click **Test mic**
and speak for three seconds. This local check reports audio chunks and signal level without sending the
test audio to Gemini.

## Checks

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

`npm run build:ocr` compiles the native Vision helper once Track A's OCR source is present. The full demo
path and its remaining acceptance checks are in [TASKS.md](TASKS.md).
