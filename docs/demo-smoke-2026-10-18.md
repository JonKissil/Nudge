# Demo verification — 2026-10-18

Tested `main` at `aa52bd9`, plus the window and caption corrections in this working tree.
Native checks use the built Electron app launched through macOS Launch Services, Safari,
temporary local essay/entertainment pages, and an isolated user-data directory. Gemini
responses are real. Automated requests use realtime text; microphone chunks are withheld
from Gemini. No desktop frames, OCR content, or microphone/model audio are saved.

| Check | Result |
| --- | --- |
| TypeScript, ESLint, production build | Pass |
| Vitest | 191 tests in 38 files pass |
| Swift Vision helper build | Pass |
| Boot: capture/microphone remain off | Pass |
| Three sandboxed, isolated renderers | Pass |
| Native Screen Recording, Microphone, Accessibility | Granted; capture and Safari Automation exercised |
| Local microphone probe | Pass: 74 chunks |
| Compact Home/Settings, ten native language labels, four themes | Pass |
| Five minutes on the task | Pass: frames continue, mic closed, zero additional playback |
| Fifteen-minute study session | Pass, including real socket loss/recovery and pause/resume |
| Three complete automated demo cycles | Pass: nine nudges, six anchored notes, three saved allowances |
| Note latency | 2.002–2.602 seconds from arrival |
| Silent CHECKs | Pass: zero playback chunks; injected CHECK narration blocked |
| Quiet Mode | Pass: mic/speech/captions off; real return and OCR pin still work |
| Background task URL and closed-tab recovery | Pass: latest full URL, no focus theft, one reopened tab |
| Snooze | Pass: capture retained, mic closed, pause/resume available |
| Failed resume | Five injected rejections honor backoff; real fresh connection receives CONTEXT_RESTORE |
| API outage | Simulated failures exhaust retries; offline drift/card/chime/return/fallback note work |
| Native close/reopen and second launch | Pass: same three-window instance, 440 × 440 restored, three shortcuts registered |
| Final dev/UI smoke | Pass: fresh launch, supplied Gorilla frames/animation, four buttons, reduced motion, narrow layout |
| Caption timing | Pass: actual worklet consumption gates three ordered seven-word cues 2.027s apart |
| Quiet caption clearing | Pass: current text clears; late transcript/stale progress cannot restore it; previews also hidden |

The three-cycle baseline used four real connections (including forced recovery), 210 frames,
and six question notes. All 1,321 captured microphone chunks were withheld from Gemini.
Its 15-minute soak and repeat cycles preceded the caption follow-up. The latest caption change
received the complete test suite, fresh build/dev/UI checks, a synthetic six-second PCM/text fixture
through the actual audio worklet, real greeting playback, and real quiet drift/return/OCR pin checks.
The caption test measures playback consumption and readable cue intervals, rather than word-level
alignment to a recorded spoken script; headphone listening remains deferred.

The control window could grow to 440 × 472 during native activation changes. Startup now
awaits Dock hiding, and reopening restores the intended 440 × 440 bounds before centering.
Initial tests also encountered stalled native browser reads while an older Nudge copy was
running. That copy was stopped before the successful single-instance run. An interrupted
silence test correctly detected VS Code becoming foreground; the final observation kept Safari
in front. These interrupted attempts are not counted as passed acceptance runs.

The student deferred spoken checks. Real Google Docs/YouTube speech recognition, headphone
sound/volume, physical tab/button interaction, and venue Wi-Fi loss remain manual rehearsal
checks. The local Safari/text automation does not replace those checks. A packaged app and
a backup demo recording are also not verified by this run.

Before presenting: fully quit older Nudge copies, launch with `npm run start:mac`, enable
Demo timing, disable Quiet Mode for the spoken demo, and keep the task tab in front during
the five-second lock countdown. Use headphones and rehearse with the exact Google Doc and
YouTube page you plan to show; a previously allowed video will stay allowed.
