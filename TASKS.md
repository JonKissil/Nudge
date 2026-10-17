# TASKS.md — Nudge build plan

Spec: `AGENTS.md`. Agents: pick the first unchecked task in your lane. Check a box only after its acceptance
criteria pass on the demo Mac. Log blockers and decisions at the bottom.

**Lanes**
- **A — Desktop & perception:** Electron shell, overlay, active window, capture, rules, OS focus, OCR.
- **B — AI, voice & pitch:** Live client, prompts, tools, audio in/out, state-machine wiring, demo script, slides.

**Integration contract:** `src/shared/types.ts` + `src/shared/ipc.ts` (AGENTS.md §13). Both lanes build against it
with fakes (`FakeLiveClient`; fixed frames and fake window events) until the integration checkpoints.

Times are rough targets for a ~24–36h hackathon (H = hours since kickoff).

---

## M0 — Scaffold (both, H0–H2)

- [x] `electron-vite` React+TS project; strict TS; vitest, eslint wired; scripts from AGENTS.md §5
- [x] Three renderers (`media` hidden, `overlay`, `control`) + typed preload per window
- [x] `src/shared/{types,ipc,config}.ts` with zod schemas from AGENTS.md §13 and DEFAULTS/DEMO from §7.3
- [x] `.env.example`, `.gitignore` (`.env`, `resources/bin/*`), README with setup steps
- [ ] **Grant macOS permissions on the demo laptop now** (Screen Recording, Mic, Automation) and restart
- **Accept:** `npm run dev` opens the control window; `npm run typecheck && npm test` pass on an empty test.

## M1 — Overlay (A, H2–H5)

- [x] Transparent, click-through, always-on-top overlay over the full primary display; full-screen visibility configured
- [x] Hover-to-interact toggling for buttons
- [x] `setContentProtection(true)` enabled
- [ ] **Verify the overlay is absent from captured frames** on the demo Mac (Screen Recording currently denied; see log)
- [x] Components: `Pill`, `NudgeCard`, `Arrow`, `StickyNote`, `Captions`, driven only by `overlay:state`
- [x] Normalized (0–1) coordinates; reduced-motion support
- [ ] Manual demo-Mac check: overlay visible over full-screen Chrome; physical clicks pass through outside buttons
- **Accept:** a dev button in the control window cycles through every overlay component; clicks pass through
  everywhere except on buttons.

## M2 — Perception (A, H3–H8)

- [x] `os/activeWindow.ts`: 1s poll via `get-windows` (external, dynamic import), emits change events with `{app, bundleId, title, url, bounds}`
- [x] `drift/matchWindow.ts` + tests (Google Docs id, URL prefix, bundle+title)
- [x] `drift/rules.ts` + tests (`on`/`off`/`ask`/`ignore`)
- [x] Media window: `setDisplayMediaRequestHandler` + `getDisplayMedia`; frame diff (helper + tests); ≤1 fps JPEG at 1280w → `frame` IPC
- [x] Full-resolution frame on request (`frame:request-full`)
- [x] Control window: "Lock task window" 3-second countdown → stores the task window
- **Accept:** the HUD shows the live active window, the rule verdict, and frames/min (idle keyframes every 5s, rising when scrolling).

## M3 — Live session (B, H2–H8)

- [ ] `LiveClient` interface + `FakeLiveClient` (scripted tool calls/audio events)
- [ ] `liveClient.ts`: connect with the AGENTS.md §6.2 config; verify every field against the current docs
- [ ] Stream `frame` IPC → `sendRealtimeInput` video; turn queue that never sends `turnComplete:true` while the model is speaking
- [ ] Resumption handle storage, GoAway → reconnect, backoff, `[CONTEXT_RESTORE]` fallback (AGENTS.md §6.3)
- [ ] `prompts.ts` system instruction + turn templates (§6.4, §6.6)
- [ ] `tools.ts`: declarations (NON_BLOCKING), zod arg schemas, handlers that emit state-machine events, correct response scheduling (check the Tool use docs)
- [ ] Media window audio: mic worklet → 16 kHz PCM chunks (gated by `mic:set`); 24 kHz playback queue; flush on `interrupted`
- [ ] Output transcription → `Captions`
- **Accept:** start a session → hear the `[SESSION_START]` greeting; push-to-talk "what am I working on?" gets a
  correct one-sentence answer; a 15-minute session survives at least one reconnect (check the HUD).

## ⇄ Integration checkpoint 1 (H8)

- [ ] Real frames + real window events flow into the real Live session; the HUD shows `report_status` results from `[CHECK]` ticks
- [ ] Confirm the model stays silent on `[CHECK]`. If it's chatty: tighten the prompt → verify SILENT scheduling →
  last resort, move classification to a separate non-Live Flash call with structured output (log the decision)

## M4 — Drift loop (B owns the state machine, A wires timers, H8–H12)

- [ ] `session/stateMachine.ts`: pure reducer for all states in AGENTS.md §7.2 + full test suite with an injected clock
- [ ] `effects.ts` + `session.ts`: ticks (every `tickMs` and on window change, only when rules say `ask`), grace timer, nudge rate limit
- [ ] `[NUDGE]` → nudge card + mic opens → `CHECKIN`; silence timeout → silent snooze
- [ ] Overlay buttons dispatch the same events as tools (works with voice off)
- **Accept (DEMO_MODE):** on-task stays silent for 5+ minutes; YouTube music triggers a nudge after ~15s; "this is for my task" stops nudges for that video.

## M5 — Getting back (A: focus/guide; B: tool + prompt wiring, H12–H16)

- [ ] `os/focus.ts`: Chrome tab AppleScript (escaped), Safari variant, generic `activate`; returns `ok`/`not_found`
- [ ] `focus_task_window` → `RETURNING` → arrival detected by the poller → `REENTRY`
- [ ] `guide_to_task`: OCR the tab strip for the task title → `Arrow`; fallback card with a *Take me there* button
- [ ] `RETURNING` timeout → `DRIFTING`; student returning on their own during `CHECKIN` → `REENTRY`
- [ ] `snooze`, `allow_current_window` end to end (allow-list persisted in `store.ts`)
- **Accept:** "take me back" switches to the doc tab in under ~1s from three different distracting tabs; "show me" draws an arrow on the correct tab.

## M6 — Re-entry note (A: OCR; B: prompt, H14–H18)

- [ ] `native/ocr-helper/main.swift` + `scripts/build-ocr.sh` (Vision, normalized top-left boxes, JSON out)
- [ ] `ocr/lines.ts` + tests (bounds filter, grouping, L-numbering, 60-line cap)
- [ ] `REENTRY`: full frame → OCR → `[USER_RETURNED]` + `[DOC_LINES]` → `pin_next_step` → `StickyNote` at the line; fallbacks per AGENTS.md §11 and §16
- [ ] tesseract.js fallback when the helper binary is missing
- **Accept:** after returning, a note appears beside the last written line within ~3s, phrased as a question/prompt (not text to copy).

## ⇄ Integration checkpoint 2 (H18): full demo path

- [ ] Run AGENTS.md §19 steps 1–7 end to end, three times in a row, without restarting the app

## M7 — Demo hardening (both, H18–H24)

- [ ] Demo mode: DEMO params, pre-filled task, HUD on (`DEMO_MODE=1` + toggle)
- [ ] Degraded mode (Live unreachable → rules-only + chime + card); test with wifi off
- [ ] Permission checklist screen in the control window
- [ ] `scripts/demo-reset.sh`
- [ ] Hotkeys: ⌘⇧Space, ⌘⇧P, ⌘⇧D
- [ ] Polish: pill states, note styling, caption timing, a calm voice choice
- [ ] Record a backup demo video of the full path
- **Accept:** AGENTS.md §19 steps 1–9 all pass on the demo laptop.

## M8 — Pitch (B, in parallel from H16)

- [ ] 3-minute demo script (below) rehearsed 5+ times on the demo laptop
- [ ] Slides: problem (blockers punish leaving; coming back is the hard part) → live demo → how it works (live vision + deterministic timing) → accessibility principles → what's next
- [ ] One-line answers ready for: cost per hour, why not a blocker, what happens offline, privacy roadmap

## Stretch (only after M7 passes)

- [ ] Session recap (focused minutes, returns, steps completed; framed as wins)
- [ ] Ambient "co-working" presence (quiet sounds or a small avatar)
- [ ] Adaptive grace period from the student's history
- [ ] Packaged `.app` build (verify `get-windows` and the OCR helper inside the bundle)

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

- [ ] Permissions granted, app fully restarted
- [ ] Headphones connected; output volume checked
- [ ] `scripts/demo-reset.sh` run; DEMO_MODE on
- [ ] Chrome: the Google Doc open at ≥100% zoom; a YouTube tab ready; notifications silenced (Focus mode)
- [ ] Wifi tested at the venue; backup video on the desktop

---

## Log

<!-- Date/time — lane — what happened / decision / blocker -->

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
  were granted for Electron; a full restart was needed before Safari URL reads worked reliably. The
  native helper also uses Apple Events, so browser Automation access is required (documented in README
  and AGENTS). Actual Safari URL/window locking and the on-task HUD verdict passed. A local scrolling
  page produced 3 frames during the initial 5.5s settling/idle period and 9 during 10.5s of scrolling;
  every JPEG was 1280px wide and successive sends were at least 1s apart. Native PNG IPC returned
  2816×1762, pause sent no frames, resume/end worked, and ending setup cancelled its pending lock.
  No captured pixels were logged or saved. The idle acceptance wording now accounts for the required
  5s keyframe heartbeat in AGENTS §8 (about 12/minute once settled), rather than expecting zero frames.
- 2026-10-16 — Checkout scope: earlier conversational M1 work is absent from this checkout; its boxes
  remain unchecked. M2 builds on the existing scaffold. Packaged-app verification remains a stretch task.
- 2026-10-16 — M2 checks passed: typecheck, 31 tests (matching, rules, frame diff, IPC including large
  native-frame payload validation), lint, production build, and `git diff --check`. `npm run dev`
  launched all three sandboxed renderers; DevTools checks confirmed the rendered control form/HUD,
  isolated preload APIs, native active-window polling, and capture off before window locking.
