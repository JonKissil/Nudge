# Nudge

<<<<<<< HEAD
A macOS study companion built with Electron, React, and TypeScript.

Use Node 22.12+ and install dependencies with `npm install`. Copy `.env.example` to `.env`
when configuring Gemini; M2 perception works without an API key. Run `npm run dev` to launch.
If your shell sets `ELECTRON_RUN_AS_NODE`, launch with `env -u ELECTRON_RUN_AS_NODE npm run dev`.

For screen perception, save a task, click **Lock task window**, and switch to your document within
three seconds. Capture starts after the lock succeeds. **Show developer HUD** displays the active
window, its URL, the deterministic rule verdict, capture status, and frames sent in the last minute.
Pause capture or end the session using the control window.

In **System Settings → Privacy & Security**, enable **Screen Recording** and **Accessibility**
for Electron (and the launching terminal/editor if macOS lists it). Allow Electron to access Safari
or Chrome under **Automation** when prompted; browser URL detection needs that access too.
Fully quit and restart Electron after changing grants. If Electron is missing, add
`node_modules/electron/dist/Electron.app` using the picker. Microphone access is needed for M3 voice.

Frames stay in memory. Capture sends JPEGs at 1280px wide, at most once per second, when the screen
changes. An unchanged screen still sends a keyframe every five seconds (about 12 frames/minute).
Unknown screens, including YouTube, produce `ask`; model classification and voice arrive in M3/M4.

Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` to verify changes.
The milestone tracker and verification log are in [TASKS.md](TASKS.md).
=======
Run `npm run dev`, then use **Next overlay preview** in the control window to cycle through the pill,
check-in card, arrow, next-step note, captions, and session states. **Hide overlay** clears the preview.
The preview buttons simulate their actions. Notes fade and disappear after three minutes.

If your environment sets `ELECTRON_RUN_AS_NODE`, launch with `env -u ELECTRON_RUN_AS_NODE npm run dev`.

M1's demo-Mac capture-exclusion and full-screen Chrome checks are tracked in [TASKS.md](TASKS.md).
>>>>>>> origin/main
