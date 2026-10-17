# AGENTS.md — Nudge

Instructions for coding agents (Claude Code, Codex, Cursor, etc.) and humans working in this repo.
**Read this whole file before writing code.** The build plan and progress tracker live in `TASKS.md`.

> The Gemini Live API is in preview and its field names change. Every Live API detail here was
> checked against the docs in October 2026, but **if this file and the docs disagree, the docs win** —
> fix the code, then update this file. Links are in §20.

---

## 1. What we're building

A macOS desktop app that acts as a real-time AI "body double" for students with ADHD. During a study session it:

1. **Watches the screen live.** Frames are streamed to a Gemini Live session.
2. **Notices drift.** Deterministic rules plus model judgment decide on/off-task; the app owns the timer.
3. **Nudges gently by voice** once the student has been off-task past a grace period.
4. **Guides them back when asked.** Either it switches to the task window for them ("take me back"),
   or it points the way on screen and confirms they arrived ("show me").
5. **Helps them re-enter.** It pins one tiny next step as a sticky note on their actual document.

### Product principles (apply to every UX, copy, and prompt decision)

- **Never shame.** Breaks are allowed. No failure counts, streak-breaking, or "you wasted X minutes."
- **The student is always in control.** Pause, snooze, and "this is for my task" are always one action away.
- **Helping them come back beats punishing them for leaving.** Never block, close, or mute their apps.
- **One thing at a time.** Voice turns are one or two sentences. Captions are always on.
- **Never do their work.** Next-step notes are prompts or questions, never text to copy.

### Hackathon context

Two-person team; the demo is everything. Optimize for **one flawless demo path**: a Google Docs essay in
Chrome on macOS, the student drifts to YouTube, gets nudged, asks to go back, and a next step appears on the doc.
Generality (Windows, other browsers, multi-monitor) comes later and is out of scope unless `TASKS.md` says otherwise.

---

## 2. Architecture

```
┌──────────────────────────── Electron main process ─────────────────────────────┐
│                                                                                │
│  activeWindow poller (1s) ──► rules.ts ──┐                                     │
│                                          ▼                                     │
│  tick timer ──────────────────────► stateMachine.ts ◄──── tool calls ───┐      │
│                                          │                              │      │
│                                          ├─► [CHECK]/[NUDGE]/... turns ─┤      │
│                                          │                              │      │
│  frames (≤1 fps JPEG) ─────────────────► liveClient.ts ◄─── Gemini Live (WSS)  │
│  mic PCM 16k ──────────────────────────►      │  ──► model audio 24k / captions│
│                                               │                                │
│  os/focus.ts (osascript)   ocr/ (Vision helper)   store.ts (allow-list JSON)   │
└──────┬───────────────────────────┬──────────────────────────┬──────────────────┘
       │ IPC                       │ IPC                      │ IPC
┌──────▼────────┐        ┌─────────▼──────────┐      ┌────────▼─────────┐
│ media window  │        │ overlay window     │      │ control window   │
│ (hidden)      │        │ transparent,       │      │ start/stop,      │
│ screen capture│        │ click-through:     │      │ task setup,      │
│ frame diff    │        │ pill, nudge card,  │      │ settings,        │
│ mic + speaker │        │ arrow, sticky note,│      │ dev HUD          │
│               │        │ captions           │      │                  │
└───────────────┘        └────────────────────┘      └──────────────────┘
```

### Responsibilities

| Component | Owns |
|---|---|
| **main** | Session state machine, the single Gemini Live connection, active-window polling, drift rules, OS actions, OCR, config, and persistence. **The API key lives only here.** |
| **media window** (hidden) | `getDisplayMedia` screen capture, downscale, frame diffing, JPEG encoding; mic capture → 16 kHz PCM16; playback of 24 kHz PCM16 model audio. |
| **overlay window** | Everything drawn on top of the screen. Pure view: renders what main tells it, reports clicks back. |
| **control window** | Session setup (task, duration, lock task window), settings, demo-mode toggle, dev HUD. |

### Key design decisions (don't change without asking the humans)

- **One continuous Live session per study session**, with frames streaming the whole time, so the model genuinely sees live changes.
- **The model doesn't decide *when* to talk; the app does.** The model responds to turns, not frames. The app sends tagged
  text turns (§6.4); the model reports status through a tool call silently and speaks only on `[NUDGE]`,
  when the student talks, or on `[USER_RETURNED]`.
- **The app owns time.** Grace periods, snoozes, and nudge rate limits are deterministic code, never model judgment.
- **Deterministic first, model second.** Window rules settle the easy cases; the model only judges ambiguous screens.
- **The Live session runs in main (Node)**, not the renderer, so the API key never reaches a renderer and we can set
  `apiVersion: 'v1beta'` without ephemeral-token constraints. Proactive audio is permanently enabled on
  `gemini-3.8-live` (per the current model page); do not set `proactiveAudio: false`.

---

## 3. Stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node 20+, latest stable Electron | |
| Build | `electron-vite` (React + TS template) | Three renderers: `media`, `overlay`, `control`. |
| UI | React + TypeScript (strict) | Plain CSS modules. No component library unless needed. |
| AI | `@google/genai` → Live API, model `gemini-3.8-live` | Main process only. |
| Active window | `get-windows` (sindresorhus) | ESM-only and ships a native binary. **Keep it external** (don't bundle) and load it with dynamic `import()`. Verify in dev and in a packaged build. |
| OCR (primary) | `native/ocr-helper`: a tiny Swift CLI using Apple Vision `VNRecognizeTextRequest` | Fast, accurate, returns boxes. Built with `swiftc`. |
| OCR (fallback) | `tesseract.js` | Only if the Swift helper is unavailable. |
| Validation | `zod` | Every tool-call argument and every IPC payload. |
| Persistence | A JSON file in `app.getPath('userData')` | Allow-list and settings. No database. |
| Tests | `vitest` | Pure modules only (§17). |

Don't add dependencies beyond these without a one-line justification in the commit message.

---

## 4. Repo layout

```
.
├── AGENTS.md  CLAUDE.md  TASKS.md  README.md
├── .env.example                 # GEMINI_API_KEY=, DEMO_MODE=0
├── electron.vite.config.ts
├── native/ocr-helper/main.swift # Vision OCR CLI → resources/bin/ocr-helper
├── resources/bin/               # built native helpers (gitignored binaries)
├── scripts/
│   ├── build-ocr.sh
│   └── demo-reset.sh            # clears allow-list/state for a clean demo run
├── src/
│   ├── shared/
│   │   ├── types.ts             # IPC payloads, tool arg types (zod schemas)
│   │   ├── ipc.ts               # channel name constants
│   │   └── config.ts            # DEFAULTS and DEMO parameters
│   ├── main/
│   │   ├── index.ts             # app bootstrap, windows, hotkeys
│   │   ├── windows.ts           # create media/overlay/control windows
│   │   ├── session/
│   │   │   ├── stateMachine.ts  # PURE reducer: (state, event, now) → (state, effects[])
│   │   │   ├── effects.ts       # executes effects (send turn, open mic, focus window…)
│   │   │   └── session.ts       # wires poller, ticks, live client, effects
│   │   ├── drift/
│   │   │   ├── rules.ts         # PURE: window → 'on' | 'off' | 'ask'
│   │   │   └── matchWindow.ts   # PURE: does this window match the locked task window?
│   │   ├── gemini/
│   │   │   ├── liveClient.ts    # the ONLY module that imports @google/genai
│   │   │   ├── config.ts        # LiveConnectConfig builder
│   │   │   ├── prompts.ts       # system instruction + turn templates
│   │   │   └── tools.ts         # function declarations + zod arg schemas + handlers
│   │   ├── os/
│   │   │   ├── activeWindow.ts  # get-windows wrapper, 1s poll, change events
│   │   │   └── focus.ts         # osascript: activate app / select Chrome tab
│   │   ├── ocr/
│   │   │   ├── ocr.ts           # runs helper → boxes
│   │   │   └── lines.ts         # PURE: boxes → numbered lines (L1…Ln)
│   │   └── store.ts             # allow-list + settings JSON
│   ├── preload/index.ts         # contextBridge APIs per window (typed)
│   └── renderer/
│       ├── media/               # capture, frameDiff (PURE helper), mic worklet, player
│       ├── overlay/             # Pill, NudgeCard, Arrow, StickyNote, Captions
│       └── control/             # Setup, SessionView, Settings, DevHUD
└── tests/                       # vitest specs for pure modules + FakeLiveClient
```

---

## 5. Commands

```bash
npm install
npm run build:ocr      # compiles native/ocr-helper → resources/bin/ocr-helper
npm run dev            # electron-vite dev (all windows, hot reload)
npm run start:mac      # build, then open Electron.app directly with macOS Launch Services
npm run typecheck
npm test               # vitest
npm run lint
DEMO_MODE=1 npm run dev
```

**After every task:** `npm run typecheck && npm test` must pass, and `npm run dev` must launch.

---

## 6. Gemini Live integration

### 6.1 Rules

- `src/main/gemini/liveClient.ts` is the **only** file that imports `@google/genai`. Everything else talks to a
  `LiveClient` interface, so tests can use `FakeLiveClient`.
- Exactly **one** Live connection per study session. Reconnect with session resumption; never open parallel sessions.
- Never call `sendClientContent({ turnComplete: true })` while the model is speaking or during `CHECKIN`:
  `turnComplete: true` **unconditionally interrupts** active generation. Queue the turn until idle.
- Native-audio Live models only return AUDIO. Get text through `outputAudioTranscription`.
- Omit `thinkingLevel`; it isn't supported on `gemini-3.8-live`.

### 6.2 Connection config (main process)

```ts
// src/main/gemini/config.ts — verify field names against the current Live API reference
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { apiVersion: 'v1beta' },        // required for proactive audio
});

const config = {
  responseModalities: [Modality.AUDIO],
  systemInstruction: buildSystemInstruction(session),   // §6.6
  tools: [{ functionDeclarations: TOOL_DECLARATIONS }], // §6.5
  mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW, // raise to MEDIUM only if it can't read the doc
  contextWindowCompression: { slidingWindow: {} },       // REQUIRED: audio+video sessions die at 2 min without it
  sessionResumption: { handle: lastHandle ?? undefined },
  // No proactivity field: gemini-3.8-live enables proactive audio by default.
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
};

session = await ai.live.connect({ model: 'gemini-3.8-live', config, callbacks });
```

### 6.3 Session lifecycle and reconnection

- **Connect** when the student starts a session (state `SETUP` → `FOCUSED`).
- **Store** the newest `sessionResumptionUpdate.newHandle` whenever `resumable` is true.
- **On `goAway`** (sent before the server closes the connection, roughly every 10 minutes):
  reconnect immediately with the stored handle, buffering outgoing frames and turns until it's open.
- **On unexpected close:** reconnect with the handle, using exponential backoff (0.5s, 1s, 2s, 4s; max 5 tries).
  Handles are valid for about 2 hours.
- **If resumption fails:** open a fresh session and send a `[CONTEXT_RESTORE]` turn (`turnComplete: false`)
  summarizing the task, the task window, the current state, and the last next step.
- **If all reconnects fail:** enter **degraded mode** (§16). Never crash the session.
- **Track speaking state:** `modelSpeaking = true` on the first audio chunk; `false` on `turnComplete`,
  `generationComplete`, or `interrupted`. On `interrupted`, the media window must flush its playback queue.

### 6.4 Turn protocol (app → model)

All app-originated text turns use `sendClientContent` with `role: 'user'` and a leading tag. The model is told
about these tags in the system instruction.

| Tag | When | `turnComplete` | Expected model behavior |
|---|---|---|---|
| `[SESSION_START]` | Session connected | true | One short greeting confirming the task (e.g. "Got it, history essay for 45. I'm here."). |
| `[CHECK]` | Each tick when rules say `ask` | true | Call `report_status`. **No speech.** |
| `[NUDGE]` | Grace period exceeded | true | One gentle sentence, then wait for the student. |
| `[USER_RETURNED]` + `[DOC_LINES]` | Student is back in the task window after a check-in | true | Call `pin_next_step`, then say one short sentence. |
| `[ARRIVED]` | Guided return succeeded | (sent together with `USER_RETURNED`) | Same as above. |
| `[SNOOZE_OVER]` | Snooze timer ends | false | Context only. |
| `[CONTEXT_RESTORE]` | After a fresh reconnect | false | Context only. |

The `[CHECK]` payload always includes the current window, because text is a much stronger signal than pixels alone:

```
[CHECK] app="Google Chrome" title="Why the French Revolution Happened - YouTube" url="youtube.com/watch?v=…"
Task: "History essay on causes of the French Revolution". Call report_status. Do not speak.
```

### 6.5 Tools

Declare each with `behavior: 'NON_BLOCKING'` (async function calling). Validate every call's arguments with zod.
On invalid arguments, reply `{ ok: false, error }`. Never throw. Always send a tool response for every call `id`.

| Tool | Args | App action | Response scheduling |
|---|---|---|---|
| `report_status` | `on_task: boolean`, `activity: string` (≤8 words), `confidence: number` (0–1) | Feed to the state machine. | **SILENT** (the model must not narrate) |
| `focus_task_window` | — | `os/focus.ts` switches to the task window or tab. Go to `RETURNING`. | WHEN_IDLE |
| `guide_to_task` | — | Overlay shows an arrow or card toward the task tab; poll for arrival. Go to `RETURNING(guided)`. | WHEN_IDLE |
| `pin_next_step` | `text: string` (≤120 chars), `line_id: string` (`"L7"` or `"none"`) | Overlay sticky note anchored to that OCR line (or the window's margin). Go to `FOCUSED`. | WHEN_IDLE |
| `snooze` | `minutes: int` (1–30, default 5) | Pause drift detection, then resume. Go to `SNOOZED`. | WHEN_IDLE |
| `allow_current_window` | `reason: string` | Add the window to the allow-list. Go to `FOCUSED`. | WHEN_IDLE |
| `end_checkin` | — | Close the mic. | SILENT |
| `set_task` | `task: string`, `minutes: int` | Optional voice-driven setup. | WHEN_IDLE |

> The current API reference and `@google/genai` 2.30.0 place `scheduling` at the top level of
> `FunctionResponse` (`{ id, name, response, scheduling }`). The Live API Tool use example still shows it inside
> `response`; use the API reference/SDK shape. `SILENT` and `WHEN_IDLE` are the values used here.

Tool responses tell the truth, e.g. `{ ok: true }`, `{ ok: false, error: "Chrome tab not found" }`, or
`{ ok: true, arrived: true }`. The model is instructed never to claim success without `ok: true`.

### 6.6 System instruction (`src/main/gemini/prompts.ts`)

Template; values in `{}` are filled in at connect time.

```
You are Nudge, a calm, warm study companion — a "body double" — for a college student with ADHD.
You see their screen as a live stream of images. The app also sends you messages that start with a tag
in square brackets. Those come from the app, not the student.

SESSION
- Task: {task}
- Planned length: {minutes} minutes
- Task window: {app} — "{title}" {url}

DEFAULT: STAY SILENT. Talking interrupts focus. Speak only when:
  (a) the app sends [NUDGE], (b) the student speaks to you, (c) the app sends [USER_RETURNED], or
  (d) the app sends [SESSION_START].

[CHECK]: Look at the latest screen. Call report_status. Do not speak.
  Judge on-task generously: reading sources, research, notes, looking up a word, and music playing in the
  background all count as on-task. Videos, feeds, games, and shopping unrelated to the task are off-task.
  If you're unsure, report on_task=true with low confidence.

[NUDGE]: Say ONE short, kind sentence that asks a question. Example: "Hey, quick check — still with the
  essay, or taking a break?" Never mention how long they've been away. Never guilt them.

WHEN THE STUDENT REPLIES, pick a tool:
  - Wants you to take them back → focus_task_window
  - Wants to get back themselves / asks how → guide_to_task, then say briefly what to click
  - Says it's for the task → allow_current_window, then say "Got it" or similar
  - Wants a break or more time → snooze (default 5), then say when you'll check back
  - Says they're stuck → ask ONE question about where they are; you'll pin a step when they return
  - Says goodbye or is done talking → end_checkin

[USER_RETURNED] with [DOC_LINES]: Call pin_next_step with ONE small step (under five minutes) anchored to
  the line where they most likely stopped (usually the last non-empty line). Then say one short sentence
  pointing to it.

RULES
- At most two sentences per turn. No lists, no lectures, no over-the-top praise.
- Next steps are prompts or questions ("What's one reason the Estates-General was called?"), never text
  for them to copy. Never write their assignment.
- Never claim you did something unless the tool response says ok: true.
- If the student asks for something you can't do, say so in one sentence.
```

---

## 7. Drift detection and the session state machine

### 7.1 Rules layer (`drift/rules.ts`, pure)

Input: the active window `{ app, bundleId, title, url, bounds }`, the locked task window, the allow-list, and config.
Output: `'on' | 'off' | 'ask' | 'ignore'`.

1. One of our own windows (control or overlay) → `ignore`.
2. Matches the locked task window (§7.4) → `on`.
3. Matches the allow-list → `on`.
4. Domain is in `hardBlocklist` (tiktok.com, instagram.com, reddit.com, x.com, netflix.com) → `off`.
5. Anything else, **including YouTube** (it could be a lecture) → `ask`, meaning the next tick sends `[CHECK]` to the model.

A model `report_status` counts as off-task only if `on_task === false && confidence >= offTaskConfidence`.

### 7.2 States

`IDLE → SETUP → FOCUSED ⇄ DRIFTING → NUDGING → CHECKIN → (RETURNING → REENTRY | SNOOZED | FOCUSED)`, plus
`PAUSED` (reachable from any active state) and `ENDED`.

| State | Behavior | Transitions |
|---|---|---|
| `SETUP` | The student enters the task and duration (form or `set_task`). "Lock task window": a 3-second countdown captures the active window. | Locked → `FOCUSED` (connect, send `[SESSION_START]`) |
| `FOCUSED` | Frames stream. Every `tickMs` (and on each window change): if the rules say `ask`, send `[CHECK]`. | Off-task verdict → `DRIFTING` (start the timer) |
| `DRIFTING` | Timer accumulates. | Back on-task → `FOCUSED` (reset timer). Timer ≥ `graceMs` and the nudge rate limit allows → `NUDGING` |
| `NUDGING` | Send `[NUDGE]`. Show the overlay nudge card. Open the mic. | → `CHECKIN` |
| `CHECKIN` | Mic open. No `[CHECK]` ticks. Tool calls route as in §6.5. | `focus_task_window`/`guide_to_task` → `RETURNING`. `snooze` → `SNOOZED`. `allow_current_window` → `FOCUSED`. `end_checkin`, or silence ≥ `checkinSilenceMs` → close mic → `SNOOZED` for `silentSnoozeMs` (prevents a nag loop). Student switches to the task window on their own → `REENTRY` |
| `RETURNING` | Poll the active window every 500 ms. | Matches the task window → `REENTRY`. Timeout (`returnTimeoutMs`) → `DRIFTING` (the nudge counter persists) |
| `REENTRY` | Wait about 800 ms for the frame to settle, OCR the task-window region, send `[USER_RETURNED][ARRIVED?][DOC_LINES]`. | `pin_next_step` → `FOCUSED`. No pin within 10s → pin a fallback note ("Pick up where you left off ↓") → `FOCUSED` |
| `SNOOZED` | No ticks, no drift timer. Frames keep streaming. Overlay pill shows the time remaining. | Timer ends → `FOCUSED` (send `[SNOOZE_OVER]`) |
| `PAUSED` | No frames, no ticks, mic closed. | Resume → `FOCUSED` |
| `ENDED` | Close the Live session. Show the recap (stretch). | — |

**Implementation:** `stateMachine.ts` is a pure reducer
`reduce(state, event, now) → { state, effects }`, where effects are data
(`{ type: 'SEND_TURN', tag, text }`, `{ type: 'OPEN_MIC' }`, `{ type: 'FOCUS_TASK' }`, `{ type: 'SHOW_OVERLAY', … }`).
`effects.ts` executes them. All timing uses the injected `now`, so tests control the clock.

### 7.3 Parameters (`src/shared/config.ts`)

```ts
export const DEFAULTS = {
  tickMs: 10_000, graceMs: 90_000, offTaskConfidence: 0.6,
  checkinSilenceMs: 20_000, silentSnoozeMs: 120_000, returnTimeoutMs: 60_000,
  maxNudgesPer10Min: 3, snoozeDefaultMin: 5,
  frameMaxFps: 1, keyframeMs: 5_000, diffThreshold: 0.02, frameWidth: 1280, jpegQuality: 0.7,
};
export const DEMO = { ...DEFAULTS, tickMs: 4_000, graceMs: 15_000, checkinSilenceMs: 12_000 };
```

### 7.4 Matching the task window (`drift/matchWindow.ts`, pure)

- **Browsers** (Chrome, Safari, Arc): match on URL. For Google Docs, match on the document ID
  (`/document/d/<id>`). Otherwise match on origin + path.
- **Other apps:** match on `bundleId`, and the title must contain the locked title's first ~20 characters (case-insensitive).
- **Allow-list entries** are stored as `{ kind: 'url-prefix' | 'bundle', value }`.

---

## 8. Screen capture (media window)

- In main: `session.defaultSession.setDisplayMediaRequestHandler((req, cb) => desktopCapturer.getSources({ types: ['screen'] }).then(s => cb({ video: s[0] })))`, using the primary display only.
- In the media renderer: `navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })`, then read frames with
  `MediaStreamTrackProcessor` (or a `<video>` element plus `requestVideoFrameCallback`) and draw them to an `OffscreenCanvas`.
- **Diff:** downscale to 64×36 grayscale and compute mean absolute difference vs. the last *sent* frame.
  Send when `diff > diffThreshold`, or when `keyframeMs` has passed since the last send. **Never more than `frameMaxFps`.**
- **Encode:** resize to `frameWidth` wide, JPEG at `jpegQuality`, base64, then IPC to main → `sendRealtimeInput({ video: { data, mimeType: 'image/jpeg' } })`.
- Also send main the latest frame **at native resolution** on request (for OCR in `REENTRY`).
- Do not stream frames while `PAUSED`. Never log or persist frames.

## 9. Overlay window

- `BrowserWindow` covering the primary display's bounds: `transparent: true, frame: false, focusable: false,
  hasShadow: false, skipTaskbar: true`; `setAlwaysOnTop(true, 'screen-saver')`;
  `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`; `setIgnoreMouseEvents(true, { forward: true })`.
  On macOS, use `type: 'panel'` and `enableLargerThanScreen: true` so the window covers the full display,
  including the menu bar / Dock areas, rather than being clamped to the work area.
- **Interactive elements** (the nudge card's buttons, the note's dismiss ✕): on `mouseenter`, ask main to call
  `setIgnoreMouseEvents(false)`; on `mouseleave`, set it back to `(true, { forward: true })`.
- **Hide the overlay from the model:** enable `overlay.setContentProtection(true)`, but do not assume exclusion.
  [Electron documents](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows)
  that newer macOS capture apps using ScreenCaptureKit can still capture protected windows.
  **Verify this on the demo Mac in the first hours.** Record the result in `TASKS.md`; until exclusion is verified,
  tell the model in the system instruction that the small "Nudge" UI is its own and should be ignored for task judgment.
- **Components:**
  - `Pill`: small, top-right. Shows state (focused / snoozed 4:12 / paused) and has a pause button.
  - `NudgeCard`: the nudge text plus three buttons that mirror voice: *Take me back*, *5 more min*, *This is for my task*.
    The buttons dispatch the same events as the tools, so everything works without voice.
  - `Arrow`: animated arrow toward a screen point, with a label.
  - `StickyNote`: anchored to a box, slightly offset into the right margin. Dismissible. Auto-fades after 3 minutes.
  - `Captions`: the model's current utterance (from output transcription), bottom-center.
- Coordinates arrive from main as **normalized 0–1 relative to the display**; the overlay multiplies by its own size.
  This avoids Retina scale-factor bugs.
- Respect `prefers-reduced-motion`: no bouncing arrows; use a static highlight instead.

## 10. Returning to the task (`os/focus.ts`)

- **Chrome (the demo path):** AppleScript via `execFile('osascript', ['-e', script])`, with the URL escaped
  (escape `\` and `"`):

  ```applescript
  tell application "Google Chrome"
    activate
    repeat with w in windows
      set i to 0
      repeat with t in tabs of w
        set i to i + 1
        if URL of t contains "{DOC_ID_OR_URL}" then
          set active tab index of w to i
          set index of w to 1
          return "ok"
        end if
      end repeat
    end repeat
    return "not_found"
  end tell
  ```

- **Safari:** the same pattern with `current tab of w`. **Any other app:** `tell application "{name}" to activate`.
- The first run triggers a macOS **Automation** permission prompt (§15).
- User-requested closed-tab recovery: save the locked browser's complete URL at lock and refresh it
  every 10 seconds by reading matching open tabs, including background tabs. Preserve query/fragment
  changes and Google Docs view changes, but never replace the task with an unrelated page. Store one
  checkpoint in the existing local JSON; Pause suspends reads and End clears it. Read requests must
  not launch browsers or change focus. An explicit return first selects an existing matching tab; only
  when none exists does it open the saved HTTP(S) URL in that browser. Do this in one AppleScript
  action, without automatically retrying an action after an error. The native poller still confirms arrival.
- **Guided mode (`guide_to_task`):** OCR the top ~12% of the latest frame (the tab strip) for the task tab's title
  (fuzzy match on its first 20 characters). If found, point the `Arrow` at it, labeled "Your essay's here". If not, show a
  card at the top center saying "Click: {title}" with a *Take me there* button. Arrival is confirmed **deterministically**
  by the active-window poller, not the model.

## 11. OCR and anchoring

- `native/ocr-helper/main.swift`: CLI `ocr-helper <png-path>` prints JSON `[{ text, x, y, w, h }]`, normalized 0–1
  with a **top-left origin**. (Vision returns a bottom-left origin; convert `y = 1 - y - h`.) Use
  `VNRecognizeTextRequest`, `recognitionLevel = .accurate`, and `usesLanguageCorrection = true`.
  Built by `scripts/build-ocr.sh` with `swiftc -O`.
- `ocr/lines.ts` (pure): keep only boxes inside the task window's bounds, group boxes into lines by vertical overlap,
  sort top to bottom, number them `L1…Ln`, and trim each to 100 characters. Send at most 60 lines.
- The `[DOC_LINES]` payload is plain text, one `Lk: text` per line.
- `pin_next_step.line_id` → that line's box → note placed at the box's right edge (clamped to the window's bounds).
  `"none"` or an unknown ID → the window's right margin at 40% height.
- Fallback: if the helper binary is missing, use `tesseract.js` (slower). Log a warning in the dev HUD.

## 12. Audio (media window)

- **Mic:** `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })` → an
  `AudioWorklet` that downsamples to 16 kHz Int16 → ~40 ms chunks → IPC → `sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } })`.
- **The mic is gated, not always on.** It opens in `CHECKIN` and while the push-to-talk hotkey is toggled on.
  Hackathon rooms are loud, and an always-hot mic makes the model answer strangers.
  When the mic closes, send `sendRealtimeInput({ audioStreamEnd: true })`.
- **Playback:** model audio is 24 kHz Int16 PCM. Convert to Float32, schedule `AudioBufferSourceNode`s back-to-back on one
  `AudioContext`. On `interrupted`, stop and clear everything queued.
- **Recommend headphones for the demo** to prevent echo; barge-in still works.

## 13. IPC contract (`src/shared/types.ts`)

Define a zod schema for every payload. Channel names live in `src/shared/ipc.ts`.

```ts
// media → main
'frame'          { jpegBase64: string; width: number; height: number; ts: number }
'frame:full'     { pngBase64: string; width: number; height: number }        // reply to 'frame:request-full'
'mic:chunk'      { pcm16Base64: string }
// main → media
'mic:set'        { open: boolean }
'audio:play'     { pcm24Base64: string }
'audio:flush'    {}
'frame:request-full' {}
'capture:set'    { running: boolean }
'mic:test-start' { id: string }                                      // local probe, no Gemini forwarding
// media → main (local probe)
'mic:test-result' { id: string; ok: boolean; chunks: number; peak: number; error?: string }
// main → overlay
'overlay:state'  { pill: PillState; nudge?: NudgeView; arrow?: ArrowView; notes: NoteView[]; caption?: string }
// overlay → main
'overlay:action' { kind: 'take-me-back' | 'snooze' | 'allow' | 'dismiss-note' | 'pause' | 'resume'; id?: string }
'overlay:hover'  { interactive: boolean }
// control ↔ main
'session:start'  { task: string; minutes: number }
'session:lock-window' {}
'session:end'    {}
'session:pause-toggle' {}
'mic:test'       {}                                                  // control asks main to run local probe
'permissions:request-microphone' {}
'session:snapshot' { state: SessionState; taskWindow?: WindowInfo; lastStatus?: Status; conn: ConnState; stats: HudStats }
'settings:set'   Partial<Settings>
```

## 14. Hotkeys and demo mode

- `⌘⇧Space`: push-to-talk toggle. `⌘⇧P`: pause/resume. `⌘⇧D`: show/hide the dev HUD.
- **Demo mode** (`DEMO_MODE=1` or the control-window toggle): uses `DEMO` parameters, pre-fills the task
  ("History essay: causes of the French Revolution", 30 min), and shows the HUD.
- **Dev HUD** (in the control window): state, the current window's rule verdict, the last `report_status`, frames per
  minute, connection state and resumption-handle age, and the last 10 state transitions.
  It's useful for debugging and good to show judges.
- `scripts/demo-reset.sh` clears the allow-list and stored state.

## 15. macOS permissions

The app needs **Screen Recording** (capture and window titles), **Microphone**, **Accessibility** for
browser details, and **Automation → the supported browser in use**, including Safari and Google Chrome.
The native window helper uses Apple Events for browser URL reads as well as the later focus actions.

- In dev, macOS attributes permissions to the launching app (Terminal, iTerm, VS Code, or Xcode) *and* Electron. Grant them, then **fully restart**.
- `npm run start:mac` builds and opens Electron.app through Launch Services for a direct launch. Use it
  after fully quitting an editor-launched copy when access was granted to Electron. It uses built pages;
  `npm run dev` remains the hot-reload workflow and may need permissions for its launching editor/terminal.
- On start, the control window shows a permission checklist (`systemPreferences.getMediaAccessStatus('screen'|'microphone')`)
  with buttons that open the right System Settings pane.
- Refresh this checklist on focus, visibility changes, and periodically while visible. Accessibility's
  `isTrustedAccessibilityClient(false)` result describes the current process; false is `not-trusted`,
  not evidence of an explicit denial in Settings. Show actual running capture/browser URL access as
  capabilities separately from raw permission flags. Never infer or fabricate a macOS grant.
- Do all permission granting on the **demo laptop** early in the hackathon, not on demo day.

## 16. Error handling and degraded mode

- **Never crash a session.** Every async edge gets try/catch, logs to the HUD, and falls back gracefully.
- **Degraded mode** (Live API unreachable): the rules layer alone drives drift (`ask` is treated as on-task). Nudges
  become a chime plus the overlay `NudgeCard` text, and the buttons still work. The pill shows "offline mode".
- **Focus failure:** the tool response is `{ ok: false }` and the model says it couldn't switch. The overlay falls back to guided mode.
- **OCR failure:** pin the note at the window margin using the model's text.
- Never retry a tool action that may already have happened (e.g., don't re-focus twice).

## 17. Testing

- **Unit (vitest)**, required for all pure modules:
  - `rules.ts`
  - `matchWindow.ts` (Google Docs IDs, URL prefixes, titles)
  - `stateMachine.ts`: every transition in §7.2, the grace timer, the nudge rate limit, silence → snooze, and return timeout, using an injected clock
  - `lines.ts`: grouping, ordering, bounds filtering
  - The frame-diff helper
  - AppleScript string escaping
- **`FakeLiveClient`:** implements the `LiveClient` interface, records sent turns and frames, and can emit scripted tool
  calls and audio events. Use it to test the full loop drift → `[NUDGE]` → `focus_task_window` → `REENTRY` → `pin_next_step`
  without the network.
- **Manual:** the demo checklist in `TASKS.md`. Run it on the demo laptop before marking any milestone done.

## 18. Rules for agents working in this repo

1. **Start by reading** `AGENTS.md` and `TASKS.md`. Pick the first unchecked task in your assigned lane (A or B).
   Check boxes only after the acceptance criteria are actually verified.
2. **Keep the app runnable.** After every task, `npm run typecheck && npm test` pass and `npm run dev` launches.
3. **Pure core, effects at the edges.** State machine, rules, matching, line grouping, and diffing are pure and tested.
   IO lives in `effects.ts`, `liveClient.ts`, and `os/*`.
4. **Only `liveClient.ts` imports `@google/genai`.** Before using any Live API field, check the docs (§20). Docs win;
   then update this file.
5. **Validate at boundaries** with zod: IPC payloads and tool-call arguments.
6. **Security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for renderers. The API key is read in main
   from `.env`. Never pass it to a renderer, never log it, never commit `.env`.
7. **Logging:** state transitions, tool calls (name and arguments), and connection events go to the HUD and console. **Never log frames or audio.**
8. **Scope:** don't build anything not in `TASKS.md`. If something seems necessary, add it under "Proposed" in
   `TASKS.md` and ask.
9. **Ask the humans before:** changing the stack, adding native modules, changing the demo flow, or changing the
   product principles in §1.
10. **When blocked** for more than about 15 minutes on an OS, permission, or API issue: stop, write what you tried in the
    `TASKS.md` log, and report. Don't work around security (e.g., disabling sandboxing).
11. **Commits** are small, prefixed by milestone: `M3: reconnect with session resumption`.
12. **Code style:** TypeScript strict, no `any` (use `unknown` and narrow), named exports, files under ~300 lines,
    React function components, no global mutable state outside `session.ts`.

## 19. Definition of done (demo)

On the demo Mac, with headphones, in `DEMO_MODE`:

1. Start a session by typing or saying the task; lock the Google Doc as the task window; hear a one-line greeting.
2. Write a sentence. Nothing happens (silent while on-task).
3. Open a YouTube music video. Within the grace period plus one tick, the nudge plays and the card appears with captions.
4. Say "ugh, take me back." Chrome switches to the doc tab within about 1 second.
5. A sticky note appears next to the last line with one small question-style step, and the model says one sentence.
6. Repeat with "show me how to get back": an arrow points at the doc's tab; clicking it triggers re-entry.
7. "This is for my essay" on a YouTube lecture adds it to the allow-list. No further nudges on that video.
8. Unplug the wifi: degraded mode keeps nudging via the card.
9. A 15-minute session runs without disconnecting (compression and resumption working).

## 20. Reference links

- Live API overview: https://ai.google.dev/gemini-api/docs/live-api
- Capabilities (video frames, VAD, proactive audio, media resolution, limits): https://ai.google.dev/gemini-api/docs/live-api/capabilities
- Tool use (async function calling, response scheduling): https://ai.google.dev/gemini-api/docs/live-api/tools
- Session management (compression, resumption, GoAway): https://ai.google.dev/gemini-api/docs/live-api/session-management
- Model page: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live
- Electron: `BrowserWindow` (setIgnoreMouseEvents, setContentProtection, setAlwaysOnTop), `desktopCapturer`,
  `session.setDisplayMediaRequestHandler`, `globalShortcut`, `systemPreferences`: https://www.electronjs.org/docs/latest/api/browser-window
- get-windows: https://github.com/sindresorhus/get-windows
- Apple Vision text recognition: https://developer.apple.com/documentation/vision/vnrecognizetextrequest
