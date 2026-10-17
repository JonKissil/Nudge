import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import console from 'node:console'

if (process.platform !== 'darwin') {
  console.error('This launch command requires macOS.')
  process.exit(1)
}

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const launchEnv = { ...process.env }
delete launchEnv.ELECTRON_RUN_AS_NODE

const build = spawnSync('npm', ['run', 'build'], { cwd: projectRoot, env: launchEnv, stdio: 'inherit' })
if (build.error) { console.error('Could not start the build:', build.error.message); process.exit(1) }
if (build.status !== 0) process.exit(build.status ?? 1)

// Launch Services opens Electron.app directly instead of inheriting an editor's launch context.
const launch = spawnSync('/usr/bin/open', [
  '-n', '-a', join(projectRoot, 'node_modules/electron/dist/Electron.app'),
  '--args', projectRoot, ...process.argv.slice(2),
], { cwd: projectRoot, env: launchEnv, stdio: 'inherit' })
if (launch.error) { console.error('Could not open Nudge:', launch.error.message); process.exit(1) }
process.exit(launch.status ?? 1)
