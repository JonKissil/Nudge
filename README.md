# Nudge

Nudge is a macOS study companion. It watches the task window during a session, stays quiet while you focus,
and offers a gentle voice check-in when you drift. See [AGENTS.md](AGENTS.md) for the design and
[TASKS.md](TASKS.md) for milestone status.

## Run locally

Use macOS with Node 22.12 or newer. Put `GEMINI_API_KEY=...` in a local `.env` file; `.env` is ignored by
Git and loaded only in Electron's main process. Never put the key in a renderer or commit it.

```bash
npm install
npm run build:ocr
npm run dev
```

If your terminal sets `ELECTRON_RUN_AS_NODE=1`, run `env -u ELECTRON_RUN_AS_NODE npm run dev`.
`DEMO_MODE=1 npm run dev` starts with demo timing and the sample essay task. The control window can also
toggle demo timing while the app runs.

In the control window, save a task, click **Start session**, and switch to its document in Safari,
Chrome, another supported browser, or a document app before the five-second countdown ends.
Nudge prepares a quiet Gemini Live connection when the app opens and reuses it after the task window
is locked. Saving a different language prepares that configuration during setup. Screen capture and
microphone forwarding remain gated by the study session; a slow API handshake does not block capture
or drift polling from starting.

In **Settings → Learn my grace period**, Nudge can adapt its waiting time from your recent unprompted
returns to the task. It starts at 90 seconds; after five observations it chooses 45–180 seconds for the
next session. Timing stays fixed during a session. The last 20 unprompted return durations are saved
on this Mac. **Let Gemini refine my timing** also keeps up to 60 numeric episode/feedback records and
sends that summary through the existing Live connection for a silent review. It distinguishes spontaneous
returns from nudges, assisted returns, and requested breaks. Use **Check in sooner** / **Give me more time**
in Settings, or ask by voice during a check-in/push-to-talk, to express a future timing preference.
Accepted recommendations need recorded evidence, stay within 45–180 seconds, change by at most 15 seconds
per session, and apply to the next session. Settings shows that timing and its reason. Reviews wait until
at least 30 seconds after lock, run only while focused on the task with the model idle, and never run
during startup warmup, pause, demo, or offline mode. They store no screen, audio, task text, or page addresses.
Disable Gemini reviews to keep the local percentile algorithm; disable learning entirely to use 90 seconds.
**Reset learned timing** clears both histories and the saved recommendation. Demo stays at 15 seconds and does not learn.
**Pause session** and **End session** are available in the control window; the overlay offers one-click
actions during a check-in. The microphone stays off except during a check-in or push-to-talk.

Keyboard shortcuts: `⌘⇧Space` toggles push-to-talk, `⌘⇧P` pauses or resumes, and `⌘⇧D` toggles the live
status display.

On macOS, Nudge lives in the menu bar. Its **n** icon glows green while a session is running (including
snooze) and becomes monochrome when paused or stopped. Click it to show the setup window, pause/resume,
end the session, or **Quit Nudge**. Closing the setup window hides it while the session continues.
Nudge stays out of the Dock; reopen its window with **Show Nudge** in the menu-bar menu.
The menu-bar PNG assets include Retina versions; regenerate them with `npm run build:icons` after
editing the geometry in `scripts/build-menu-bar-icons.mjs`.

## Mac permissions

Open **Settings** in the control window for Screen Recording, Microphone, and Accessibility status
and links to System Settings. The session language picker, demo controls, live status, overlay previews, keyboard shortcuts,
and pause/end controls also live here; the home page shows just the task, duration, and save/start controls.
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

`npm run build:ocr` needs Apple's Command Line Tools (`swiftc`). It builds the Vision helper used for
guided return and document re-entry. If the helper is missing, Nudge uses Tesseract.js with bundled
English language data; the fallback does not need a network download. Captured pixels stay in memory.
If a task tab cannot be located, Nudge shows its title with a **Take me there** button instead.

After you return, Nudge waits briefly for the screen to settle, recognizes the visible task document,
and gives Gemini up to 60 numbered lines. Gemini pins one small question or prompt beside a selected
line. The note stays inside the task window, can be dismissed, and fades after three minutes. If OCR
fails or the selected line is unknown, the note uses the window margin; if Gemini does not pin a step
within ten seconds, Nudge supplies a simple “Pick up where you left off” reminder. OCR text and line
boxes are held only for the current return and are never saved to disk.

During a check-in, **Take me back** selects the locked tab in Safari, Chrome, Arc, Brave, or Edge;
other document apps are activated. Arrival is confirmed by window polling. **This is for my task** saves
the current page (including its query, so allowing one video does not allow every video) or non-browser
app in `state.json` under Electron's Nudge user-data directory. These allowances survive restarts.
Nudge also saves the locked browser tab's full URL at lock and refreshes it every 10 seconds while
monitoring, including when that tab is in the background. **Take me back** and **Take me there** reuse
an existing matching tab or reopen the saved address if it was closed. Only a matching task URL can
update this checkpoint; unrelated pages cannot replace it. Pause suspends URL checks, and End removes
the checkpoint. This recovers a closed tab during the current session; it does not restore ended sessions.
The full demo path and its remaining acceptance checks are in [TASKS.md](TASKS.md).
