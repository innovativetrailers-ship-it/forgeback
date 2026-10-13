/**
 * Fail when a child process is started through a shell or an interpolated command string.
 * ffmpeg and ffprobe go through src/lib/shell/argv.ts (execFile/spawn, no shell).
 */
import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const roots = ['src', 'scripts'].map((dir) => join(root, dir))
const probe = join(root, 'src/lib/__shell_probe.ts')

const BAD = [
  /\bexecSync\s*\(/,
  /\bexecFileSync\s*\(\s*`/,
  /\bexec\s*\(\s*`/,
  /shell\s*:\s*true/,
]

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(name)) acc.push(full)
  }
  return acc
}

function hitsIn(text, file) {
  const found = []
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return
    if (file.endsWith('src/lib/shell/argv.ts') && line.includes('shell: false')) return
    for (const pattern of BAD) {
      if (pattern.test(line)) found.push(`${file.slice(root.length).replace(/^\//, '')}:${index + 1}  ${line.trim()}`)
    }
  })
  return found
}

function scan(includeProbe) {
  const hits = []
  for (const dir of roots) {
    for (const file of walk(dir)) {
      if (file.endsWith('scripts/check-no-shell.mjs')) continue
      if (!includeProbe && file === probe) continue
      hits.push(...hitsIn(readFileSync(file, 'utf8'), file))
    }
  }
  return hits
}

writeFileSync(probe, 'export const planted = execSync(`echo hi`)\n')
const planted = scan(true).filter((row) => row.includes('__shell_probe'))
unlinkSync(probe)
if (planted.length === 0) {
  console.error('check-no-shell: self-test did not see the planted command')
  process.exit(1)
}
console.error('check-no-shell: self-test RED (planted command)')
for (const row of planted) console.error(row)

const hits = scan(false)
if (hits.length) {
  console.error(`check-no-shell: ${hits.length} shell command(s)`)
  for (const hit of hits) console.error(hit)
  process.exit(1)
}
console.log('check-no-shell: 0')
