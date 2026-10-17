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

In the control window, save a task, click **Lock task window**, and switch to its Google Doc in Chrome
before the three-second countdown ends. Nudge then starts its Live connection and screen capture.
**Pause session** and **End session** are available in the control window; the overlay offers one-click
actions during a check-in. The microphone stays off except during a check-in or push-to-talk.

Keyboard shortcuts: `⌘⇧Space` toggles push-to-talk, `⌘⇧P` pauses or resumes, and `⌘⇧D` toggles the live
status display.

## Mac permissions

The control window shows Screen Recording and Microphone status and links to System Settings. Grant
Screen Recording for capture and browser window details, Microphone for voice, and Chrome Automation
when macOS asks during the return-to-task action. Accessibility may also be needed for browser window
details. Fully restart the launching terminal/editor and Electron after granting access. Do these checks
on the actual demo Mac.
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
