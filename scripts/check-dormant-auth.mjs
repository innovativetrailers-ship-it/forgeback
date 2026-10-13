/**
 * Fail when app code reads or writes the dormant lowercase auth tables.
 * Prisma `db.user` is the canonical User model and is not this check.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const scanRoots = [join(root, 'src'), join(root, 'packages', 'core', 'src'), join(root, 'cinematic-forge-v3', 'src')]
const DORMANT = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+"?(user|account|session|organization)"?(?![A-Za-z0-9_])/

function walk(dir, out = []) {
  let names
  try { names = readdirSync(dir) } catch { return out }
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'migrations') continue
      walk(full, out)
    } else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full)
  }
  return out
}

function hitsIn(rel, text) {
  if (rel.includes('prisma/migrations')) return []
  const found = []
  text.split('\n').forEach((line, i) => {
    const match = line.match(DORMANT)
    if (!match) return
    const table = match[1]
    if (table !== table.toLowerCase()) return
    if (/^[\s]*(\/\/|\*)/.test(line)) return
    found.push(`${rel}:${i + 1}  ${line.trim()}`)
  })
  return found
}

function selfTest() {
  const plantedRel = 'src/lib/__auth_probe.ts'
  const planted = join(root, plantedRel)
  writeFileSync(planted, "export const q = 'UPDATE \"user\" SET x = 1'\n")
  try {
    const hit = hitsIn(plantedRel, readFileSync(planted, 'utf8'))
    if (!hit.length) {
      console.error('check-dormant-auth: self-test missed a lowercase auth write')
      process.exit(1)
    }
    console.log('check-dormant-auth: self-test RED (lowercase auth write)')
    console.log(hit[0])
  } finally {
    try { unlinkSync(planted) } catch { /* already gone */ }
  }
}

selfTest()
const violations = []
for (const file of scanRoots.flatMap((dir) => walk(dir))) {
  const rel = relative(root, file).split('\\').join('/')
  violations.push(...hitsIn(rel, readFileSync(file, 'utf8')))
}
if (violations.length) {
  console.error(`check-dormant-auth: ${violations.length} live reference(s) to a dormant auth table`)
  for (const row of violations) console.error(row)
  process.exit(1)
}
console.log('check-dormant-auth: 0 live references to dormant auth tables')
