import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/components', import.meta.url))
const banned = 'Select a clip or use the timeline below'
const hits = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      walk(path)
      continue
    }
    if (!name.endsWith('.tsx') && !name.endsWith('.ts')) continue
    const text = readFileSync(path, 'utf8')
    if (text.includes(banned) || text.includes('function PlaceholderPanel')) hits.push(path)
  }
}

walk(root)
if (hits.length) {
  console.error('check-no-stub-panels:\n' + hits.join('\n'))
  process.exit(1)
}
console.log('check-no-stub-panels: 0')
