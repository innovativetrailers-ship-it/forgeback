/**
 * Fail when a submitted provider endpoint string lives outside the registry.
 * Registry / family maps: packages/core/src/logic/**
 * Package imports of @fal-ai/client are not endpoints.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const scanRoots = [
  join(root, 'src'),
  join(root, 'cinematic-forge-v3', 'src'),
  join(root, 'packages', 'core', 'src'),
]
const ALLOW_PREFIX = 'packages/core/src/logic/'
const ENDPOINT = /(?<!@)fal-ai\/[A-Za-z0-9]/

function walk(dir, out = []) {
  let names
  try { names = readdirSync(dir) } catch { return out }
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'dist') continue
      walk(full, out)
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) out.push(full)
  }
  return out
}

function violationsIn(rel, text) {
  if (rel.startsWith(ALLOW_PREFIX)) return []
  const found = []
  text.split('\n').forEach((line, i) => {
    if (ENDPOINT.test(line)) found.push(`${rel}:${i + 1}  ${line.trim()}`)
  })
  return found
}

function selfTest() {
  const plantedRel = 'src/lib/__endpoint_probe.ts'
  const planted = join(root, plantedRel)
  writeFileSync(planted, "export const sneaky = 'fal-ai/probe-plant'\n")
  try {
    const hit = violationsIn(plantedRel, readFileSync(planted, 'utf8'))
    if (!hit.length) {
      console.error('check-endpoints: self-test missed planted endpoint')
      process.exit(1)
    }
    const allowed = violationsIn('packages/core/src/logic/endpointCatalog.ts', "export const id = 'fal-ai/probe-plant'\n")
    if (allowed.length) {
      console.error('check-endpoints: self-test flagged a registry file')
      process.exit(1)
    }
    console.log('check-endpoints: self-test RED (planted endpoint)')
    console.log(hit[0])
  } finally {
    try { unlinkSync(planted) } catch { /* already gone */ }
  }
}

selfTest()

const violations = []
for (const file of scanRoots.flatMap((dir) => walk(dir))) {
  const rel = relative(root, file).split('\\').join('/')
  violations.push(...violationsIn(rel, readFileSync(file, 'utf8')))
}

if (violations.length) {
  console.error(`check-endpoints: ${violations.length} endpoint string(s) outside the registry`)
  for (const row of violations) console.error(row)
  process.exit(1)
}

console.log('check-endpoints: 0 endpoint strings outside the registry')
