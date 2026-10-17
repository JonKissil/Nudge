import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Presentation, PresentationFile } from '@oai/artifact-tool'

const root = '/Users/abepark/Desktop/Nudge'
const skillDir = '/Users/abepark/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations'
const buildDir = path.join(root, 'pitch/.build')
const outputDir = path.join(root, 'pitch/output')
const finalPath = path.join(outputDir, 'nudge-pitch.pptx')
const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } })
const dark = '#263D35'
const light = '#F7F7F1'
const muted = '#62796B'
const accent = '#CBE2B7'
const font = 'Helvetica Neue'

function addText(slide, value, x, y, width, height, size, color, bold = false) {
  const shape = slide.shapes.add({
    geometry: 'textbox',
    position: { left: x, top: y, width, height },
    fill: 'none',
    line: { style: 'solid', fill: 'none', width: 0 },
  })
  shape.text = value
  shape.text.style = { typeface: font, fontSize: size, color, bold }
  return shape
}

function addSlide({ background = light, eyebrow, title, body = [], notes }) {
  const slide = presentation.slides.add()
  slide.background.fill = background
  const onDark = background === dark
  addText(slide, eyebrow.toUpperCase(), 76, 58, 1080, 34, 16, onDark ? accent : muted, true)
  addText(slide, title, 76, 124, 1110, 152, 58, onDark ? light : dark, true)
  body.forEach((item, index) => {
    addText(slide, item.text, item.x ?? 76, item.y ?? 305 + index * 100,
      item.width ?? 1060, item.height ?? 78, item.size ?? 28,
      item.color ?? (onDark ? light : dark), item.bold ?? false)
  })
  slide.speakerNotes.text = notes
  return slide
}

addSlide({
  background: dark, eyebrow: 'Study with Nudge', title: 'Nudge',
  body: [{ text: 'A quiet companion for getting back to your work.', y: 328, size: 34, width: 960 }],
  notes: '0:00–0:20. “Students with ADHD can drift away from a task even when they want to do it. Nudge stays nearby and helps them return without judgment.” This is the product premise, not a measured outcome.',
})

addSlide({
  eyebrow: 'The problem', title: 'Coming back is the hard part',
  body: [
    { text: 'A break turns into a different tab.', y: 322, size: 34 },
    { text: 'The draft is still open. Restarting feels far away.', y: 414, size: 34, color: muted },
  ],
  notes: '0:20–0:40. “Most focus tools try to stop a detour. We designed for the moment after one happens. Nudge keeps the student in control and makes the first step back small.”',
})

addSlide({
  background: dark, eyebrow: 'Live demo', title: 'One essay. One detour. One return.',
  body: [
    { text: 'Google Docs essay', y: 322, size: 33 },
    { text: 'YouTube detour', y: 390, size: 33 },
    { text: '“Take me back”', y: 458, size: 33 },
    { text: 'A question beside the draft', y: 526, size: 33 },
  ],
  notes: '0:40–2:00. Run the live demo from TASKS.md: save the history essay task, lock the Google Doc, type a sentence, switch to YouTube, wait for the nudge, say “Ugh, I’m stuck. Take me back,” then show the note beside the document. If the live path is not ready, do not imply it worked; use the backup recording after it has been captured.',
})

addSlide({
  eyebrow: 'How it works', title: 'Quiet until help is useful',
  body: [
    { text: 'Live screen context shows what changed.', y: 322, size: 30 },
    { text: 'App rules own the timer and grace period.', y: 412, size: 30 },
    { text: 'A small prompt helps the student re-enter.', y: 502, size: 30 },
  ],
  notes: '2:00–2:25. “One Live session sees the screen, while deterministic rules decide when to check in. The model helps with the wording and the next step. The app keeps the timing, pause, and snooze controls.”',
})

addSlide({
  eyebrow: 'Student control', title: 'Support without pressure',
  body: [
    { text: 'Pause or snooze in one action.', y: 320, size: 32 },
    { text: 'Research and task related videos can count as work.', y: 414, size: 32 },
    { text: 'Next steps are questions, never assignment text.', y: 508, size: 32 },
  ],
  notes: '2:25–2:45. “Nudge never blocks a site or writes the assignment. The student can say a video is for the task, take a break, or turn the session off.”',
})

addSlide({
  background: dark, eyebrow: 'Next', title: 'A gentler way back',
  body: [
    { text: 'Broader app support and stronger privacy controls are next.', y: 335, size: 31, width: 1050 },
    { text: 'For now, we are proving one reliable study path.', y: 438, size: 31, color: accent, width: 1050 },
  ],
  notes: '2:45–3:00. “We are starting with a Google Docs essay in Chrome. We want to expand to other workflows and give students clearer control over what the app sees and keeps.” Invite questions. Do not claim these future capabilities exist today.',
})

await fs.mkdir(buildDir, { recursive: true })
await fs.mkdir(outputDir, { recursive: true })
for (let index = 0; index < presentation.slides.items.length; index += 1) {
  const slide = presentation.slides.items[index]
  const png = await presentation.export({ slide, format: 'png', scale: 1 })
  await fs.writeFile(path.join(buildDir, `slide-${index + 1}.png`), new Uint8Array(await png.arrayBuffer()))
}
const { finalizePresentation } = await import(pathToFileURL(
  path.join(skillDir, 'container_tools/artifact_tool_utils.mjs'),
).href)
const candidatePath = path.join(buildDir, 'candidate.pptx')
await (await PresentationFile.exportPptx(presentation)).save(candidatePath)
await finalizePresentation({
  explicitTotalSlideCount: 6,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  workspaceDir: root,
  candidatePath,
  finalPath,
  pythonExecutable: '/Users/abepark/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
  integrityValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit'],
  fontPolicy: { basis: 'design', families: [font] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, 'validation.json'),
})
