# TASKS.md — Nudge build plan

Spec: `AGENTS.md`. Agents: pick the first unchecked task in your lane. Check a box only after its acceptance
criteria pass on the demo Mac. Log blockers and decisions at the bottom.
Implementation/test results and remaining manual acceptance checks are listed separately where needed;
a milestone remains open until its **Accept** criteria pass.

**Lanes**
- **A — Desktop & perception:** Electron shell, overlay, active window, capture, rules, OS focus, OCR.
- **B — AI, voice & pitch:** Live client, prompts, tools, audio in/out, state-machine wiring, demo script, slides.

**Integration contract:** `src/shared/types.ts` + `src/shared/ipc.ts` (AGENTS.md §13). Both lanes build against it
with fakes (`FakeLiveClient`; fixed frames and fake window events) until the integration checkpoints.

Times are rough targets for a ~24–36h hackathon (H = hours since kickoff).

**Status — 2026-10-17:** M2 and integration checkpoint 1 are verified. M1's Safari interaction check is
confirmed; capture exclusion is still open. M3/M4 implementation is integrated and tested, with the real
15-minute reconnect and full drift-demo checks still open. M5 focus/guide/allow and closed-tab recovery
are implemented and Safari-tested. M6's document OCR and anchored-note implementation is connected;
Safari re-entry acceptance passed with real Gemini; remaining demo acceptance is recorded below.
Checkpoint 2's automated Safari/local-page subset now passes three consecutive cycles after the
screen-check reliability fix. The spoken Google Docs/YouTube demo remains open. M7 has several
completed components; M8 has a draft deck and script.

---

## M0 — Scaffold (both, H0–H2)

- [x] `electron-vite` React+TS project; strict TS; vitest, eslint wired; scripts from AGENTS.md §5
- [x] Three renderers (`media` hidden, `overlay`, `control`) + typed preload per window
- [x] `src/shared/{types,ipc,config}.ts` with zod schemas from AGENTS.md §13 and DEFAULTS/DEMO from §7.3
- [x] `.env.example`, `.gitignore` (`.env`, `resources/bin/*`), README with setup steps
- [x] **Grant macOS permissions on the demo laptop now** (Screen Recording, Mic, Automation) and restart.
  Verified on this Mac after a fresh direct Electron launch: Screen Recording, Microphone, and
  Accessibility report granted; the local mic probe received 74 chunks, capture streamed to Gemini,
  and Safari Automation performed actual focus actions. Recheck if the demo launch context changes.
- **Accept:** `npm run dev` opens the control window; `npm run typecheck && npm test` pass on an empty test.

## M1 — Overlay (A, H2–H5)

- [x] Transparent, click-through, always-on-top overlay over the full primary display; full-screen visibility configured
- [x] Hover-to-interact toggling for buttons
- [x] `setContentProtection(true)` enabled
- [ ] **Verify the overlay is absent from captured frames** on the demo Mac (Screen Recording is now granted
  in the verified launch context; exclusion remains unverified, so the model prompt ignores Nudge's UI)
- [x] Components: `Pill`, `NudgeCard`, `Arrow`, `StickyNote`, `Captions`, driven only by `overlay:state`
- [x] Normalized (0–1) coordinates; reduced-motion support
- [x] Manual full-screen Safari check, as requested: overlay visible; physical clicks pass through outside
  buttons; Pause/Resume buttons work (student confirmed on 2026-10-16)
- **Accept:** a dev button in the control window cycles through every overlay component; clicks pass through
  everywhere except on buttons.

## M2 — Perception (A, H3–H8)

- [x] `os/activeWindow.ts`: 1s poll via `get-windows` (external, dynamic import), emits change events with `{app, bundleId, title, url, bounds}`
- [x] `drift/matchWindow.ts` + tests (Google Docs id, URL prefix, bundle+title)
- [x] `drift/rules.ts` + tests (`on`/`off`/`ask`/`ignore`)
- [x] Media window: `setDisplayMediaRequestHandler` + `getDisplayMedia`; frame diff (helper + tests); ≤1 fps JPEG at 1280w → `frame` IPC
- [x] Full-resolution frame on request (`frame:request-full`)
- [x] Control window: "Lock task window" 3-second countdown → stores the task window
- **Accept — passed with Safari:** the HUD shows the live active window, the rule verdict, and frames/min
  (required idle keyframes every 5s, about 12/min once settled; rising when scrolling). Native PNG, pause,
  resume, end, and countdown cancellation passed; see the M2 and checkpoint 1 logs.

## M3 — Live session (B, H2–H8)

- [x] `LiveClient` interface + `FakeLiveClient` (scripted tool calls/audio events)
- [x] `liveClient.ts`: connect with the AGENTS.md §6.2 config; fields checked against current docs and a real connection verified
- [x] Continuous `frame` IPC delivery to Live: fresh images travel with CHECK text, other frames use
  realtime video; turn queue prevents complete turns during model speech (real frame flow + transport tests)
- [x] Resumption handle storage and GoAway → resume with buffered media/turns (real handle received; resume path tested with mocked transport)
- [ ] Verify unexpected-close backoff, failed resumption → `[CONTEXT_RESTORE]`, and exhausted-retry fallback
  (implemented; failure-path/live acceptance remains open)
- [x] `prompts.ts` system instruction + turn templates (§6.4, §6.6)
- [x] Requested session language picker: selected BCP-47 code reaches Live input transcription config
  and the spoken-language instruction (boundary, reducer, and transport tests; multilingual audio still needs a listening check)
- [x] Language choices use their native names/scripts in Settings, with language/direction metadata
  (all ten rendered choices verified; typecheck, 138 tests, lint, build, and dev launch passed)
- [x] `tools.ts`: NON_BLOCKING declarations, zod validation, state-machine handlers, and response scheduling (SILENT verified live)
- [x] Media window audio: gated 16 kHz mic worklet and 24 kHz playback; interruption flush routed (Terminal voice check + bridge tests)
- [x] Output transcription → `Captions` (bridge tests, overlay preview, and real output transcription)
- [x] Manual voice check: heard `[SESSION_START]`, used ⌘⇧Space, and heard the correct task answer (TextEdit, Terminal launch; 2026-10-17)
- [ ] Run a real 15-minute session and verify at least one reconnect in the HUD
- **Accept:** start a session → hear the `[SESSION_START]` greeting; push-to-talk "what am I working on?" gets a
  correct one-sentence answer; a 15-minute session survives at least one reconnect (check the HUD).

## ⇄ Integration checkpoint 1 (H8)

- [x] Real frames + real window events flow into the real Live session; the HUD shows `report_status` results from `[CHECK]` ticks
- [x] Student-facing `[CHECK]` silence: initial real model checks emitted no audio; the transport now
  also suppresses unsolicited CHECK audio/captions while preserving SILENT tool responses and backend
  speaking-state tracking. Injected check narration was blocked at playback/caption IPC in the final run.

## M4 — Drift loop (B owns the state machine, A wires timers, H8–H12)

- [x] `session/stateMachine.ts`: pure reducer with injected-clock tests for state transitions, grace/rate limits, silence, return timeout, and failed-check recovery
- [x] `effects.ts` + `session.ts`: classification ticks, window-change observations, grace timer, and nudge rate limit (tests + real CHECK flow)
- [x] `[NUDGE]` → card/mic effects → `CHECKIN`; silence → snooze (FakeLiveClient tests; real state transitions recorded)
- [x] Overlay buttons dispatch through the same engine as tools (routing/tests complete; actual return/allow verified in M5/M6)
- [ ] Manual DEMO_MODE acceptance: verify 5+ minutes of on-task silence, the ~15s YouTube nudge's voice/card,
  and allowing that video through “This is for my task”
- **Accept (DEMO_MODE):** on-task stays silent for 5+ minutes; YouTube music triggers a nudge after ~15s; "this is for my task" stops nudges for that video.

## M5 — Getting back (A: focus/guide; B: tool + prompt wiring, H12–H16)

- [x] `os/focus.ts`: Chrome tab AppleScript (escaped), Safari variant, generic `activate`; returns `ok`/`not_found` (script unit tests; actual Safari switching)
- [x] `focus_task_window` → `RETURNING` → arrival detected by the poller → `REENTRY` (Safari runtime checks, 500ms return polling)
- [x] `guide_to_task`: OCR the tab strip for the task title → `Arrow`; fallback card with a *Take me there* button (actual Safari OCR, arrival and missing-tab fallback verified)
- [x] `RETURNING` timeout → `DRIFTING`; self-return during `CHECKIN` → `REENTRY` (reducer/FakeLiveClient tests)
- [x] `snooze` tool/button routing and timer transitions (tests; real silence → snooze recorded)
- [x] `allow_current_window` end to end with persisted allow-list in `store.ts` (tool tests, actual overlay action and saved-page classification after a full Electron restart)
- [x] Requested follow-up: checkpoint the locked task URL every 10s; reuse an open tab or reopen a closed tab on an explicit return request (background Safari URL update, closed-tab recovery through both return controls, no duplicate, and End cleanup verified)
- [ ] Repeat return/guide/allow with spoken requests in a real Live check-in; Chrome has script tests but no native acceptance run
- Main supplies focus, tab-strip OCR guidance, and persisted allow actions. Earlier Safari acceptance
  used scripted tool calls; the checkpoint 2 attempt also verified actual Gemini-selected focus,
  guide, and allow tools from text test requests. Spoken requests remain open. Document OCR/anchoring
  is connected and verified in M6.
- **Accept:** "take me back" switches to the doc tab in under ~1s from three different distracting tabs; "show me" draws an arrow on the correct tab.

## M6 — Re-entry note (A: OCR; B: prompt, H14–H18)

- [x] `native/ocr-helper/main.swift` + `scripts/build-ocr.sh` (built for M5 tab guidance; Vision, normalized top-left boxes, JSON out; stdin avoids frame files)
- [x] `ocr/lines.ts` + tests (bounds/overlay filtering, grouping, L-numbering, 100-character trim, last 60 visible lines)
- [x] `REENTRY`: full frame → OCR → `[USER_RETURNED]` + `[DOC_LINES]` → `pin_next_step` → `StickyNote` at the line; fallbacks per AGENTS.md §11 and §16 (actual Safari capture/OCR/note coordinates; real Gemini pin verified)
- [x] tesseract.js fallback when the helper binary is missing (actual missing-helper Safari run; bundled English data, no runtime download)
- [x] `pin_next_step` → three-minute dismissible overlay note with margin fallback (FakeLiveClient and note/preview tests)
- [x] Real Gemini re-entry acceptance: generated question, accepted pin tool on the last line, model audio/captions received, note in 2.34s after arrival
- Safari tests verified exact line placement in 2.15s with Vision and 2.43s with Tesseract, unknown-line
  margin fallback, and dismissal. Pure/FakeLiveClient tests cover stale OCR and pin cancellation.
- **Accept — passed with Safari/local essay:** after returning, a note appears beside the last written
  line within ~3s, phrased as a question/prompt. Real run used the overlay return button after the nudge
  finished; the full spoken Google Docs demo remains integration checkpoint 2. Active speech/Live queueing
  can add delay when returning immediately during a nudge.

## ⇄ Integration checkpoint 2 (H18): full demo path

- [x] Automated prerequisites: typecheck, 136 tests, lint, production build, three-renderer dev launch,
  direct-launch permissions, and local microphone probe
- [x] Three consecutive automated Safari/local-page cycles with real Gemini in one app process:
  greeting → drift → voiced/captioned nudge → return → OCR-anchored question note → guided
  arrow/return/note → persisted page allowance; three connections and 49 captured frames in the final run
- [x] Screen-check regressions: stale window replies rejected by check ID; missing status calls release
  the pending flag; expired/stalled checks retry/recover; CHECK narration cannot reach playback/captions
- [ ] Run AGENTS.md §19 steps 1–7 end to end, three times in a row, without restarting the app
  The initial failure and its fix are logged below. Automated repeatability now passes with temporary
  local pages, realtime text requests, a simulated transcription/user-activity notification, and script-driven
  Safari tab selection. Microphone audio was withheld from Gemini. Spoken input, listening quality,
  physical tab clicks, and Google Docs/YouTube acceptance remain deferred at the student's request.

## M7 — Demo hardening (both, H18–H24)

- [x] Requested home-page cleanup: task field, duration, and save/start controls only; Settings holds
  session actions, demo/HUD toggles, permissions, overlay previews, shortcuts, and diagnostics
  (native UI navigation, draft retention, countdown, and narrow layouts verified in an isolated dev copy)
- [x] Requested compact window: fixed 440 × 440 square, centered on launch/reopen; smaller fields and
  spacing, both setup buttons visible without scrolling, and scrollable Settings with sticky navigation
  (native geometry, reactivation, setup/countdown, navigation, and layout checks passed in an isolated dev copy)
- [x] Demo-mode implementation: DEMO params, pre-filled task, HUD, environment flag, and control toggle (configuration tests/UI wiring)
- [x] Degraded-mode implementation: rules-only judgment, offline pill, chime, and card (rule tests; media/overlay wiring)
- [ ] Manual wifi-off acceptance with the connected M5 controls
- [x] Permission checklist, System Settings links, native mic request, and local three-second mic probe (UI/recorded mic verification)
- [x] Checklist refresh on focus/visibility and every 3s; distinguish launch-specific trust from denial
  and show working capture/browser access; direct macOS launcher and Safari setup copy verified
- [ ] `scripts/demo-reset.sh`
- [x] Hotkeys registered: ⌘⇧Space, ⌘⇧P, ⌘⇧D; push-to-talk manually verified
- [x] Requested macOS menu-bar integration: session indicator, pause/resume/end controls, hide-on-close,
  reopen, and quit; icon glows during running/snoozed sessions and dims when paused or stopped
  (Retina assets, real Safari lock/capture, native menu actions, and quit verified)
- [ ] Polish: pill states, note styling, caption timing, a calm voice choice
- [ ] Record a backup demo video of the full path
- **Accept:** AGENTS.md §19 steps 1–9 all pass on the demo laptop.

## M8 — Pitch (B, in parallel from H16)

- [x] Three-minute script drafted in `pitch/demo-script.md`
- [ ] Script rehearsed 5+ times on the demo laptop
- [x] Six-slide deck drafted in `pitch/output/nudge-pitch.pptx` (layout/package and visual checks recorded in log)
- [x] One-line answers drafted in the script for cost, blockers, offline behavior, and privacy roadmap; measured hourly cost remains unverified

## Stretch (only after M7 passes)

- [x] Language support
- [ ] Custom theme support from uploaded jpg or png file (also font support)
- [ ] Several included base themes
- [ ] Session recap (focused minutes, returns, steps completed; framed as wins)
- [ ] Ambient "co-working" presence (quiet sounds or a small avatar)
- [ ] Adaptive grace period from the student's history
- [ ] Packaged `.app` build (verify `get-windows` and the OCR helper inside the bundle)
- [ ] Animation support

## Proposed (agents add here; humans approve)

-

---

## Demo script (3 min)

1. "Students with ADHD don't need another blocker — they need someone to help them come *back*." Open the app, say the task, lock the Google Doc.
2. Write one sentence. Point out: it's watching, and it's silent.
3. "Just one video…" Open YouTube. Nudge arrives: *"Hey, quick check — still with the essay, or taking a break?"*
4. "Ugh, I'm stuck — take me back." The tab switches; the sticky note appears on the doc with a single question; the voice points at it.
5. Show "this is for my essay" on a lecture video → no nudge.
6. Close: live vision + deterministic timing + never doing your work for you. What's next.

## Pre-demo checklist

- [x] Permissions granted, app fully restarted (verified for the direct Electron launch on this Mac)
- [ ] Headphones connected; output volume checked
- [ ] `scripts/demo-reset.sh` run; DEMO_MODE on
- [ ] Chrome: the Google Doc open at ≥100% zoom; a YouTube tab ready; notifications silenced (Focus mode)
- [ ] Wifi tested at the venue; backup video on the desktop

---

## Log

<!-- Date/time — lane — what happened / decision / blocker -->

- 2026-10-17 — Screen-check diagnosis: reproduced the failure while inspecting outgoing JPEGs with
  in-memory Vision OCR flags only. Entertainment frames kept arriving, but one CHECK response omitted
  `report_status`; `checkPending` then remained set indefinitely. Checks could also start against the
  preceding essay frame, and results had no request/window identity. Prompt-only changes and waiting
  for the next realtime frame improved behavior but did not reliably ground the model's later judgments.
  The Live API documents that ordering between realtime media and clientContent is not guaranteed:
  https://ai.google.dev/api/live#BidiGenerateContentRealtimeInput
- 2026-10-17 — Screen-check fix: each CHECK now carries its fresh JPEG and foreground metadata in one
  clientContent turn, using MEDIUM visual detail. Other frames continue through realtime video; each
  capture is sent once and the latest cached image is cleared on pause/disconnect. Unique `check_id`
  values continue across study sessions, supersede earlier window checks, and reject stale replies or
  failures. Completing a check without a valid status releases the pending flag. A ten-second reducer
  watchdog retries missing results, including while focused; a transport watchdog recovers a stalled
  CHECK without forcing an interrupting complete turn. Obsolete queued checks cannot block a nudge.
  Unknown results remain generous/on-task rather than becoming forced off-task verdicts.
- 2026-10-17 — Voice guard and prompt follow-up: unsolicited CHECK audio/captions are suppressed while
  backend generation is still tracked for queue safety. Audible app turns and gated student audio remain
  enabled. Clarified that SESSION_START confirms the already locked task without calling set_task, and
  that an allowance needs an actual successful tool call before acknowledgement. The automated text
  driver now sends the app's user-activity notification as real input transcription would, and permits
  connection recovery rather than incorrectly requiring exactly one connect attempt per study session.
- 2026-10-17 — Final automated checkpoint subset passed three consecutive cycles in one process:
  three real Live connections, 49 captures, nine voiced/captioned nudges, three focus returns, three
  OCR-guided arrows/returns, six anchored question notes, and three persisted allowances. Note timings
  after arrival were 2.482s/2.007s, 3.152s/2.010s, and 2.841s/2.226s. Every note used `L5`; timing can
  still slightly exceed three seconds. Zero CHECK audio chunks reached playback. An injected CHECK
  utterance and caption were both blocked; greetings/nudges/user replies still reached playback. Actual
  mic capture ran, but 1,434 chunks were withheld from Gemini. The test used local Safari fixtures and
  realtime text, so it does not replace the deferred spoken Google Docs/YouTube acceptance.
  Typecheck, all 136 tests, lint, production build, and the final three-renderer development smoke check
  passed. Original saved state was restored, temporary Safari windows closed, and test instances quit.

- 2026-10-17 — Integration checkpoint 2 attempted with Safari, as previously requested. Typecheck,
  all 125 tests, lint, production build, and the three-renderer development smoke check passed.
  Started a fresh built app through Launch Services: Screen Recording, Microphone, and Accessibility
  all reported granted; the local mic probe received 74 chunks. Marked the current-launch permission
  tasks complete. No macOS permission was changed.
- 2026-10-17 — Checkpoint 2 automated Live subset: one app process hosted two study sessions without
  restarting. Real Gemini received 39 screen frames; 36 completed `[CHECK]` turns emitted zero audio
  chunks and zero caption characters. Both greetings produced audio/captions; five voiced/captioned
  nudges opened the mic. Two `focus_task_window` actions succeeded in 209ms and 213ms from tool call
  to response. Two `guide_to_task` actions produced actual tab-strip OCR arrows; selecting the task
  tab triggered deterministic arrival and document OCR. Four real `pin_next_step` calls placed prompt
  notes at `L5`; arrival-to-pin times were 3.509s, 2.145s, 3.091s, and 2.624s, so timing was not always
  within three seconds. One real `allow_current_window` call persisted the current page, immediately
  reclassified it on-task, and kept it focused through the observation interval.
- 2026-10-17 — Checkpoint 2 result: one complete automated cycle passed. The second cycle's final
  distraction never reached `CHECKIN` within 65s: rules returned `ask`, but the model's final accepted
  judgment was on-task at confidence 1. The test stopped; a third cycle was not run, and the three-pass
  checkpoint remains unchecked. These were temporary local essay/entertainment pages with actual
  Gemini-selected tools from realtime text requests, not a Google Docs/YouTube spoken demo. Check-ins
  exercised local mic capture, but 820 microphone chunks were withheld from Gemini during automation.
  The student requested automated checks first and voice checks later. The existing Google Doc was
  untouched; test Safari windows were closed, the original saved state restored, capture/Live stopped,
  and the test app quit. No frames, microphone audio, or OCR text were logged or saved.

- 2026-10-17 — Requested menu-bar integration: added a native macOS Nudge icon with monochrome
  inactive/paused and green active states, including Retina representations. The real session snapshot
  drives its status; overlay previews cannot light it, and snoozed/offline sessions remain enabled.
  Pause/resume/end reuse the control window's session actions. Closing the native control window hides
  it without stopping capture; Show Nudge restores it, and Quit ends the session and exits. The app
  stays out of the Dock. Verified the built app through Launch Services with a temporary Safari page:
  task lock → lit icon/capture, close → continued capture, native Pause → dim/capture off, Resume →
  relit, End → dim/disconnected, and Quit → process exit. The Live transport was stubbed for this check;
  no model/network behavior was changed. `npm run typecheck`, all 110 tests, lint, production build,
  and the `npm run dev` launch passed. Icon sources regenerate with `npm run build:icons`.

- 2026-10-16 — M0 (both lanes): Implemented the Electron/React/strict-TS scaffold, three sandboxed renderers,
  per-window typed preload APIs, validated IPC contracts, DEFAULTS/DEMO, and setup documentation. The control
  form saves task setup in main memory; capture, audio, Live sessions, and window locking remain in their
  planned milestones. `build:ocr` reports that its Swift source is scheduled for M6.
- 2026-10-16 — M0 verification on this development Mac: `npm run typecheck`, `npm test` (7 IPC validation
  tests), `npm run lint`, `npm run build`, and `git diff --check` passed. Launched the control window with
  `npm run dev`; local DevTools checks confirmed all three React entry points and isolated preload APIs,
  no renderer Node access, task setup IPC, invalid-payload rejection, and an honest failure for the pending
  window-lock action. Inspected a control-window screenshot. Demo-laptop permission grants/restart and
  screen-capture exclusion remain unverified and unchecked.
- 2026-10-16 — M0 tooling: Installed current stable Electron 44.8 / electron-vite 6. Electron now needs
  an explicit binary install, so `postinstall` runs its official installer. Node 22.12+ is required by the
  installed Electron package. This agent environment sets `ELECTRON_RUN_AS_NODE=1`; the desktop launch
  check used `env -u ELECTRON_RUN_AS_NODE npm run dev`. The sandbox stayed enabled for every renderer.
- 2026-10-16 — M0 naming: Renamed the app to Nudge in UI copy, Electron/window titles, package metadata,
  preload APIs (`window.nudge` / `NudgeApi`), and project instructions. Typecheck, all 7 tests, lint,
  production build, and desktop launch passed; no old-name references remain in project sources or docs.
- 2026-10-16 — M1 implementation: Added all five overlay components, button-only hover interaction, normalized
  anchoring, live snooze countdown, three-minute note fade/removal, reduced-motion styling, and a control-window
  preview cycle with hide/reset. Preview actions stay in main and simulate interactions without starting a study
  session or switching applications. An overlay-ready handshake restores state on renderer reload, and view
  changes / reloads / renderer exits restore click-through. Display changes update primary-display bounds.
- 2026-10-16 — M1 desktop verification: Electron initially clamped the window to the work area; `type: 'panel'`
  plus `enableLargerThanScreen: true` fixed it. Native bounds now exactly match the primary display (1408×881
  display points on this Retina Mac). Local DevTools checks verified every preview, the control preview button,
  all six overlay actions, mouse-hover changes to native hit testing, return to click-through on empty space,
  reduced-motion emulation, note expiry using an injected clock, and state recovery after renderer reload.
  Inspected an overlay-only screenshot; no desktop frames were recorded or persisted.
- 2026-10-16 — M1 final checks: `npm run typecheck`, `npm test` (11 tests), `npm run lint`,
  `npm run build`, and `git diff --check` passed. The final desktop run also verified snooze expiry,
  renderer-reload recovery, and clamping of note/arrow labels at normalized display-edge coordinates.
- 2026-10-16 — M1 manual checks pending: `getMediaAccessStatus('screen')` returns `denied`, so no screen
  capture was attempted and exclusion remains unverified. Electron's current docs warn that ScreenCaptureKit
  can include protected windows; AGENTS.md §9 now records this limitation and the prompt fallback for M3.
  After granting Screen Recording and restarting, verify capture exclusion, full-screen Chrome visibility,
  and physical click-through on the demo laptop before marking the remaining M1 checks complete.
- 2026-10-16 — M2 (A): Added the external/dynamically imported `get-windows` poller, deterministic window
  matching and drift rules, primary-display capture, grayscale diffing against the last sent frame,
  1280px JPEG IPC capped at 1 fps, native PNG requests, a main-owned three-second window lock, pause/resume,
  and the live perception HUD. Unknown windows remain `ask`; Live forwarding is reserved for M3.
- 2026-10-16 — M2 acceptance on this Mac used Safari, as requested. Screen Recording and Accessibility
  were granted for Electron; a full restart was needed before Safari URL reads worked reliably. The native
  helper also uses Apple Events, so browser Automation access is required (documented in README and AGENTS).
  Actual Safari URL/window locking and the on-task HUD verdict passed. A local scrolling page produced
  3 frames during the initial 5.5s settling/idle period and 9 during 10.5s of scrolling; every JPEG was
  1280px wide and successive sends were at least 1s apart. Native PNG IPC returned 2816×1762, pause sent
  no frames, resume/end worked, and ending setup cancelled its pending lock. No captured pixels were logged
  or saved. The idle acceptance wording accounts for the required 5s keyframe heartbeat (about 12/minute
  once settled), rather than expecting zero frames.
- 2026-10-16 — M2 checks passed: typecheck, 31 tests (matching, rules, frame diff, IPC including large
  native-frame payload validation), lint, production build, and `git diff --check`. `npm run dev` launched
  all three sandboxed renderers; DevTools checks confirmed the rendered control form/HUD, isolated preload
  APIs, native active-window polling, and capture off before window locking.
- 2026-10-16 — B / M3 progress: Added the LiveClient contract and scriptable FakeLiveClient, Gemini Live
  transport with tagged-turn queue, frame/audio input, tool responses, resumption and reconnect paths,
  prompt templates, tool declarations with zod validation, and media-window mic/playback. Installed
  `@google/genai` 2.30.0, the SDK specified in AGENTS.md §3 (dependency justification: the Live API
  integration needs Google's supported JavaScript client). The current model docs say proactive audio is
  already enabled; the API reference and SDK place response scheduling on FunctionResponse. Updated
  AGENTS.md §6 accordingly. Typecheck, 14 tests, lint, production build, and dev startup passed on this
  development Mac. M3 stays unchecked pending main-process session wiring, real API/audio checks, and
  15-minute reconnect verification on the demo Mac; M0 permissions remain unchecked.
- 2026-10-16 — B / M3 follow-up: A local `.env` key was added (`.gitignore` covers it; owner-only file permissions).
  A direct `gemini-3.8-live` setup succeeded; a short greeting turn returned audio and output transcription.
  Added the main-process Live bridge for validated frame/mic IPC, audio playback, captions, connection state,
  tool responses, and a hook for M2's task-window lock. Implemented the pure M4 session reducer with injected
  time and transition tests. Typecheck, 23 tests, lint, production build, and desktop startup passed on this
  development Mac. M3/M4 acceptance remains open until Track A's window lock/capture and the demo-Mac checks.
- 2026-10-16 — B / M3–M4 wiring: Connected Live tool calls to the pure session reducer through an effect
  executor, routed session setup/end and overlay actions through the same engine, added timed state checks,
  and exposed window-observation/OS-action hooks for Track A. A FakeLiveClient test covers screen judgment →
  nudge → focus request → arrival → OCR lines → pinned step, including truthful focus failure with guided
  fallback. Typecheck, 26 tests, lint, production build, and desktop launch passed on this Mac.
  System Settings shows Nudge/Electron has not yet requested Screen Recording or Microphone access, and no
  app has requested Automation access. Track A's capture and Chrome-focus paths must trigger those prompts
  before the permissions can be granted and the demo-Mac acceptance boxes can be checked.
- 2026-10-16 — B / post-rebase integration: Track A's M1 overlay is connected to live session notes.
  `pin_next_step` creates a three-minute note with an OCR line anchor when available and a margin fallback.
  Fixed the Live turn queue so a nudge waiting behind `[CHECK]` still speaks. Typecheck, 33 tests, lint,
  build, and desktop launch passed. M2 perception was still pending at that point.
- 2026-10-16 — B / voice and demo hardening: Added Live input transcription, push-to-talk, pause, and HUD
  shortcuts, microphone state in the overlay, a demo toggle, live HUD, permission checklist, and offline
  rules/chime behavior. Typecheck, 36 tests, lint, build, and desktop launch passed. Screen Recording was
  granted and Microphone denied on this development Mac; no permission was changed.
- 2026-10-16 — B / pitch preparation: Drafted a six-slide deck and three-minute speaker script with cost,
  offline, privacy, and blocker answers. The deck passed package/layout validation and visual inspection.
  Rehearsals and backup video remain pending until the full demo path works.
- 2026-10-16 — B / Track A handoff: Reconciled committed rebase conflict markers while retaining M2 window
  polling and capture, M1 overlay, and B Live/session/voice work. Restored the control-window lock countdown,
  demo settings, permissions, pause control, and HUD. The lock-to-Live/capture path now builds; typecheck,
  59 tests, lint, and production build pass. The desktop app launches and saving a task exposes the real
  lock step. Screen Recording is granted, but Microphone remains denied; a real screen-to-Gemini run,
  voice check-in, reconnect check, and three full demo passes remain unverified. Track A's focus/OCR/allow
  action ports are not connected yet.
- 2026-10-16 — B / local capture smoke test: With Gemini disabled, the lock-to-session path reached
  `FOCUSED`, capture reported `running`, and the HUD counted frames. Pause changed capture to `off`,
  resume changed it back to `running`, and End stopped it. The always-on-top overlay initially hid the
  underlying window from `get-windows`; the active-window wrapper now skips Nudge's own overlay. The UI
  automation helper was selected as the task window in this run, so the real Chrome tab lock and live
  screen-to-Gemini behavior remain pending. Accessibility and Microphone both report denied on this Mac.
- 2026-10-16 — B / microphone permission and probe: Added a native macOS microphone request and a
  three-second local mic check through the same media-window AudioWorklet used by check-ins. The check
  reports PCM chunk count and peak level without forwarding test audio to Gemini. The first request
  inherited ChatGPT's denied status; launching Nudge from Terminal let macOS prompt for separate access.
  Terminal now has microphone access, Nudge reports `granted`, and the local test received 74 chunks with
  a 40% peak level in three seconds. The PCM signal calculation is covered by a pure test. A full Gemini
  voice check-in remains unverified.
- 2026-10-17 — B / live smoke test: Added Terminal to macOS Screen & System Audio Recording and restarted;
  Nudge now reports Screen Recording and Microphone granted. A live session connected to Gemini, screen
  capture ran, and the HUD received a resumption handle. The window lock selected the computer-control
  helper instead of the intended blank TextEdit document, so the session was ended before checking voice.
  Capture then reported off. Fixed the HUD to show `disconnected` and clear its stale resumption-handle age
  when a study session ends. Typecheck, 60 tests, lint, and diff checks pass. The greeting, push-to-talk,
  real Chrome lock, and reconnect acceptance checks remain open.
- 2026-10-17 — B / follow-up Live check: A second session connected, streamed frames, received a
  resumption handle, and reported an on-task judgment for the TextEdit test document on a `[CHECK]` turn.
  Computer-use windows still displaced the intended task window during the three-second lock, so the
  locked window was incorrect. Closed the test session; do not count greeting, push-to-talk, or the demo
  path as verified. A clean manual lock without computer-control activity is needed next.
- 2026-10-17 — B / manual TextEdit lock and voice check: The student locked the intended TextEdit window
  without computer-control activity during the countdown. The HUD showed Live connected, screen capture
  running, and a resumption handle. The student heard the `[SESSION_START]` greeting, opened the mic with
  ⌘⇧Space, asked what they were working on, heard the correct spoken answer, and closed the mic. Nudge
  stayed quiet for about five minutes while TextEdit was on task. The student ended the session before
  15 minutes, so reconnect acceptance remains open. The HUD's old `Model status` label retained a prior
  judgment when the current window matched the task; relabeled it `Last AI screen check` with an explanation
  for rule `on`. Typecheck, 60 tests, lint, and diff checks pass; the live app launched from Terminal.
- 2026-10-17 — B / extended live run: A fresh TextEdit-locked session stayed connected with capture running
  and a resume handle; the updated HUD wording appeared in the restarted app. The HUD recorded a real
  `DRIFTING → NUDGING → CHECKIN → SNOOZED` path around 12:52–12:53 AM. Two return attempts reported
  `The task window could not be opened`, consistent with Track A's focus action still unwired. The study
  session ended at 12:54:14 AM after about ten minutes; the connection log contained no server reconnect.
  The 15-minute M3 gate and M4 nudge voice/card acceptance remain open pending the student's report.
- 2026-10-17 — Integration checkpoint 1 verified using Safari and local history-essay/research pages.
  The actual three-second lock selected Safari and its essay URL; navigating to the research URL produced
  a real `ask` window observation. One real Gemini connection received seven screen frames and completed
  three `[CHECK]` turns, each returning an accepted `report_status` response with `SILENT` scheduling.
  The real status rendered in the control HUD. All three checks emitted zero audio chunks and zero
  output-transcription characters; the greeting emitted 17 audio chunks, confirming audio was available.
  The microphone stayed closed, and the test session was ended. Only diagnostic counts and validation
  metadata were collected; no frame or audio payloads were logged or saved. This short checkpoint does
  not verify M3's 15-minute/reconnect gate or integration checkpoint 2.
- 2026-10-17 — Checkpoint fixes: simultaneous native window probes stalled while individual probes
  succeeded, so polling and countdown locking now share a serial read queue with a fresh read per request.
  A real model status used nine activity words and was correctly rejected, but left `checkPending` set;
  failed status handling now releases that pending check without changing the verdict or drift timer,
  allowing the next scheduled check. Reinforced the eight-word activity limit in the prompt. Added
  regression coverage for read ordering/failure recovery and invalid-status retry. Typecheck, 65 tests,
  lint, and production build pass. Restored the existing declared dependencies with `npm install` after
  finding `@google/genai` missing from the local install; package files were unchanged.
  `npm run dev` also launched all three renderers; the rendered HUD, isolated APIs, native polling,
  and capture-off-before-lock behavior passed the final smoke check. `git diff --check` passed.
- 2026-10-17 — Tracker reconciliation: restored the verified M2 checkmarks, recorded the student's
  full-screen Safari/click-through confirmation, and updated completed Live, drift-engine, note-fallback,
  demo/permissions/hotkey, and pitch work from the source, tests, and verification log. Separated
  implementation results from outstanding manual/failure-path acceptance. Capture exclusion, final
  launch-context permissions, the 15-minute reconnect, real focus/guide/allow actions, OCR, wifi-off,
  full demo passes, backup video, and rehearsals remain open. Historical permission-denial entries above
  describe earlier launch contexts; they are not the latest observed Screen Recording status.
  This documentation update passed typecheck, all 65 tests, the dev-launch smoke check, and diff checks.
- 2026-10-17 — Permission/browser fix: the checklist previously read status only once and labeled a false
  Accessibility trust check as denied. It now refreshes on focus/visibility and every three seconds while
  visible, discards stale replies, and reports `not-trusted` as “Not active for this launch.” Actual running
  capture/browser URL reads appear as working capabilities, without changing or fabricating OS grants.
  Added `npm run start:mac` to build and launch Electron.app directly through Launch Services; the separate
  test instance reported Screen Recording, Microphone, and Accessibility granted. Runtime tests with
  temporary permission responses verified focus and periodic refresh, plus Safari/document-app setup
  instructions and browser-neutral Automation copy. The original running instance was left open.
  Added four permission-presentation tests; all 69 tests, typecheck/build, lint, and diff checks passed.
  The separate `npm run dev` instance also passed the three-window/HUD launch smoke check and was closed.
- 2026-10-17 — Live voice playback fix: the student reported intermittent beeps during speech. The media
  player could hit a WebSocket/IPC gap and restart raw PCM at a nonzero sample; interruptions also stopped
  audio abruptly. Added an 80 ms start cushion, short fades only at stream edges or gaps, and a smooth
  interruption fade while preserving continuous chunk boundaries. Reconnection now clears stale audio.
  Tests cover adjacent/delayed chunks, interruption, malformed PCM, and reconnection cleanup. Typecheck,
  72 tests, lint, production build, and diff checks passed. `npm run dev` built and started its renderer
  server, but the tool launch could not open Electron in this sandbox; `npm run start:mac` launched the
  built app through Launch Services for the desktop smoke check. A real listening check is still needed
  to confirm the reported beep is gone.
- 2026-10-17 — Voice follow-up: the student confirmed the electronic squeak still occurred inside speech
  after the buffer scheduling fix. Two isolated Gemini Live comparisons, with no microphone or screen
  input, showed large sample-to-sample jumps in Kore's raw PCM (307 and 44 jumps above 0.5 full scale),
  versus zero in both Aoede responses to the same prompt. No audio was saved or printed; only numeric
  continuity counts were used. Switched the configured voice to Aoede and retained the existing tested
  playback path; the exploratory AudioWorklet rewrite was removed. The student has not yet listened to
  the updated in-app voice, so audible acceptance remains open. Typecheck, 72 tests, lint, production
  build, and diff checks passed; a temporary dev instance launched and was closed without stopping the
  student's existing app.
- 2026-10-17 — Voice playback follow-up: the student still heard an electronic squeak inside speech after
  restarting with Aoede. The prior player faded while waiting for each next chunk and inserted another
  80 ms pause when that chunk arrived after playback ran dry. Replaced the per-chunk buffer sources with
  a continuous 24 kHz speaker worklet. It buffers 180 ms of delivery jitter, preserves adjacent PCM samples,
  and fades only on underrun or interruption. Added tests for byte order, stream continuity, underrun,
  and queue clearing. Typecheck, 74 tests, lint, production build, and a separate `npm run dev` launch
  passed; the built speaker worklet asset is present. The separate app was closed after the launch check.
  An in-app listening check is still needed for audible acceptance.
- 2026-10-17 — Session audio cleanup: the student observed speech persisting across end/start cycles. Only
  one Nudge Electron app was running. The Live reconnect loop previously checked a shared `active` flag,
  so a reconnect from an ended session could wake after a new session set that flag again. Reconnects
  now carry a lifecycle ID, stale connects close, and the Live bridge waits for old disconnects before
  starting anew. Session end sends `audio:reset` to close the speaker worklet and audio context; start
  waits for end cleanup. Added restart/reconnect, cancelled-start, and fresh-player tests. Typecheck,
  77 tests, lint, production build, diff checks, and a separate `npm run dev` launch passed. The separate
  app was closed after the launch check. Audible acceptance remains open.
- 2026-10-17 — Voice follow-up: the checked-out `BeepFix` branch still pointed to the commit before the
  merged voice fixes, and an older development Nudge process was running beside the built app. Fast-forwarded
  this branch to the merged fix, closed the duplicate, and added Electron's single-instance lock so a
  second terminal launch focuses the first window. Smoothed the speaker worklet's gain when a late chunk
  refills an almost empty queue; a regression test covers that boundary. Typecheck, 99 tests, lint,
  production build, and diff checks passed. A second launch exited while the first remained; the older
  development app was then closed and one updated built app was opened and inspected in its idle state.
  Audible acceptance remains open because the student could not provide a recording or listening check yet.
- 2026-10-17 — M6 implemented: full-resolution frames are cropped to the current task window's content
  region and recognized by Vision. Pure line grouping filters bounds and Nudge UI, joins row fragments,
  trims text to 100 characters, and retains the last 60 visible lines. `[USER_RETURNED][DOC_LINES]` and
  the cached `line_id` boxes share the same numbering. `pin_next_step` places the question beside that
  line, clamped inside the visible task window; missing/unknown lines and OCR errors use the margin.
  Notes remain dismissible and expire after three minutes; the existing ten-second no-pin fallback remains.
  Superseded OCR is aborted, old session results cannot enter a newer re-entry, and a cancelled pin cannot
  restore a paused/ended session. Independent frame capture, native reads, and local OCR overlap to
  reduce latency; document text is sent only after the foreground/window checks pass. Full-frame requests
  are serialized so guided-return capture cannot collide with document capture. No frames, audio, OCR
  text, or line maps are logged or saved.
- 2026-10-17 — M6 dependency justification: added the planned `tesseract.js` 7 fallback and
  `@tesseract.js-data/eng` 1 language data so missing-helper OCR works offline without runtime downloads.
  Tesseract stays external for its Node worker/WASM assets; workers are reused, bounded by a timeout,
  and terminated on cancellation/quit. The dev HUD reports fallback use. The Swift helper still accepts
  image bytes on stdin; normalized edge coordinates are clamped against floating-point overshoot.
- 2026-10-17 — M6 Safari verification: local essay capture with scripted model replies produced five
  numbered lines and a note beside the last line in 2.15s after arrival; native OCR boxes and rendered
  note coordinates agreed within three display points on this Retina Mac. Temporarily removing the
  helper exercised actual local Tesseract, which anchored beside the same line in 2.43s. Unknown `L999`
  placed the model's question in the margin, and dismissal worked. Restored the helper and original
  saved state and closed temporary Safari windows. Pure/controller/FakeLiveClient regressions cover
  geometry, ordering/grouping/caps, failure paths, moved windows, cancellation, and stale async results.
- 2026-10-17 — M6 real Gemini acceptance passed on the local Safari essay. After the nudge finished,
  the overlay return action led to actual OCR lines, a real `pin_next_step` on the last line, and the
  question “What specific demands did the people make?” in 2.34s after native arrival. The optimized
  capture/OCR/queue portion took 1.65s and Gemini's pin call arrived 0.49s later; five model audio chunks
  and 27 output-transcription characters were received. Test microphone audio was withheld. An earlier
  immediate return during the nudge took 4.96s; waiting for existing speech can still add latency, as
  required by the no-interruption turn protocol. This verifies M6, not the full spoken Google Docs demo
  or checkpoint 2. Swift build, typecheck, all 104 tests, lint, production build, diff checks, and the
  final three-renderer dev-launch smoke check passed; test instances were closed.
- 2026-10-17 — Added a session language picker with ten supported choices. The validated code travels
  through setup, state, and Live context to `inputAudioTranscription.languageCodes`; the system
  instruction asks for spoken replies and pinned steps in the selected language. The native-audio
  model does not accept an output speech language code, so its voice config stays on Aoede. Tests
  cover language validation, state retention, and the Live configuration. Typecheck, 138 tests,
  lint, production build, and the three-renderer dev launch passed; the picker and all ten choices
  appeared in the running control window. An actual multilingual listening check remains open.
- 2026-10-17 — Combined language support with the compact UI during rebase. All ten choices live in
  Settings; the home page stays limited to task, duration, and save/start. Start saves the latest language
  before locking, including changes made after Save. Typecheck, all 138 tests, lint, production build,
  and an isolated three-renderer dev check passed. Native checks confirmed the centered 440 × 440
  window, draft retention, French setup, a later Japanese change reaching Start, and Settings navigation.
  No capture or Live connection was started by this UI check; multilingual listening remains open.
