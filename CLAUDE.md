@AGENTS.md
@TASKS.md

## Claude Code specifics

- Start each work session by reading TASKS.md and stating which unchecked task you're taking and in which lane.
- Use plan mode before starting any milestone; implement one checkbox at a time.
- After each task: `npm run typecheck && npm test`, then confirm `npm run dev` still launches. Then check the box and add a line to the TASKS.md log.
- For any Gemini Live API field, fetch the relevant page in AGENTS.md §20 before writing code.
- Don't run commands that change macOS permissions or system settings; ask the human to do it.
