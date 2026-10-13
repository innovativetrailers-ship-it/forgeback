/**
 * Fail when one BullMQ queue has two consumers.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const scanRoots = [join(root, 'src', 'workers'), join(root, 'src', 'lib', 'queue', 'workers')]
const WORKER = /new\s+Worker(?:<[^>]*>)?\s*\(\s*([A-Za-z0-9_]+|'[^']+'|"[^"]+")/g

function walk(dir, out = []) {
  let names
  try { names = readdirSync(dir) } catch { return out }
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full)
  }
  return out
}

function queueOf(text, token) {
  if (token.startsWith("'") || token.startsWith('"')) return token.slice(1, -1)
  const local = text.match(new RegExp(`(?:const|let)\\s+${token}\\s*=\\s*['"]([^'"]+)['"]`))
  return local?.[1] ?? token
}

function consumersIn(files) {
  const counts = new Map()
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(WORKER)) {
      const queue = queueOf(text, match[1])
      const rel = relative(root, file)
      const list = counts.get(queue) ?? []
      list.push(rel)
      counts.set(queue, list)
    }
  }
  return [...counts.entries()].filter(([, files]) => files.length > 1)
}

function selfTest() {
  const planted = join(root, 'src', 'workers', '__worker_probe.ts')
  writeFileSync(planted, "const a = new Worker('probe-queue', () => {})\nconst b = new Worker('probe-queue', () => {})\n")
  try {
    const hit = consumersIn([planted])
    if (!hit.length) {
      console.error('check-one-worker: self-test missed a second consumer')
      process.exit(1)
    }
    console.log('check-one-worker: self-test RED (two consumers)')
    console.log(`${hit[0][0]}  ${hit[0][1].join(', ')}`)
  } finally {
    try { unlinkSync(planted) } catch { /* already gone */ }
  }
}

selfTest()
const dupes = consumersIn(scanRoots.flatMap((dir) => walk(dir)))
if (dupes.length) {
  console.error(`check-one-worker: ${dupes.length} queue(s) have more than one consumer`)
  for (const [queue, files] of dupes) console.error(`${queue}  ${files.join(', ')}`)
  process.exit(1)
}
console.log('check-one-worker: 0 queues with two consumers')
