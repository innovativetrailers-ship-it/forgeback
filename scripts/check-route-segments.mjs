/**
 * Fail when one directory has two different dynamic segment names.
 */
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const appRoot = join(root, 'src', 'app')
const SEGMENT = /^\[(.+)\]$/

function collisionsIn(dir, base = dir, out = []) {
  let names
  try { names = readdirSync(dir) } catch { return out }
  const dynamic = names.filter((name) => SEGMENT.test(name))
  if (dynamic.length > 1) out.push(`${relative(base, dir) || '.'}: ${dynamic.join(' + ')}`)
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collisionsIn(full, base, out)
  }
  return out
}

function selfTest() {
  const planted = mkdtempSync(join(tmpdir(), 'route-probe-'))
  mkdirSync(join(planted, '[id]'))
  mkdirSync(join(planted, '[projectId]'))
  try {
    const hit = collisionsIn(planted)
    if (!hit.length) {
      console.error('check-route-segments: self-test missed sibling segments')
      process.exit(1)
    }
    console.log('check-route-segments: self-test RED (sibling segments)')
    console.log(hit[0])
  } finally {
    rmSync(planted, { recursive: true, force: true })
  }
}

selfTest()
const collisions = collisionsIn(appRoot)
if (collisions.length) {
  console.error(`check-route-segments: ${collisions.length} dynamic collision(s)`)
  for (const row of collisions) console.error(row)
  process.exit(1)
}
console.log('check-route-segments: 0 dynamic collisions')
