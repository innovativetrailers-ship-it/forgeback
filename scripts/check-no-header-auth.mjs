/**
 * Fail if a route trusts client identity headers. The proxy strips them; requireUser reads the session.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FORBIDDEN = [
  /headers\.get\(\s*['"]x-user-id['"]\s*\)/,
  /headers\.get\(\s*['"]x-user-role['"]\s*\)/,
  /headers\.get\(\s*['"]x-forge-desktop['"]\s*\)/,
]

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, acc)
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) acc.push(full)
  }
  return acc
}

const hits = []
for (const file of walk(join(ROOT, 'src'))) {
  if (file.endsWith(join('src', 'proxy.ts'))) continue
  const text = readFileSync(file, 'utf8')
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) hits.push(file.slice(ROOT.length + 1))
  }
}
if (hits.length) {
  console.error(`check-no-header-auth: ${hits.length} file(s) still read identity headers`)
  for (const hit of hits) console.error(hit)
  process.exit(1)
}
console.log('check-no-header-auth: 0')
