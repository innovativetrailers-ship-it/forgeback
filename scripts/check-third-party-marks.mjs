import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const scanRoots = [
  'src/components',
  'src/app',
  '../cinematic-forge-v3/src/renderer',
  '../cinema-mobile/app',
].map((dir) => join(root, dir)).filter((dir) => existsSync(dir))
const banned = [
  'Premiere',
  'Adobe',
  'After Effects',
  'DaVinci',
  'Blackmagic',
  'Final Cut',
  'CapCut',
  'ShotGrid',
  'Frame.io',
  'Logic Pro',
  'Lumetri',
  'Media Composer',
]
const probe = join(root, 'src/components/__mark_probe.tsx')

function walk(dir, hits) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name === '__mark_probe.tsx') continue
    if (statSync(path).isDirectory()) {
      if (name === 'api') continue
      walk(path, hits)
      continue
    }
    if (!name.endsWith('.tsx') && !name.endsWith('.ts')) continue
    const text = readFileSync(path, 'utf8')
    for (const word of banned) {
      if (text.includes(word)) hits.push(`${path} ${word}`)
    }
  }
}

writeFileSync(probe, 'export const label = "Premiere"\n')
const planted = readFileSync(probe, 'utf8')
unlinkSync(probe)
if (!planted.includes('Premiere')) {
  console.error('check-third-party-marks: self-test did not plant')
  process.exit(1)
}
console.log('check-third-party-marks: self-test RED (planted vendor label)')

const hits = []
for (const dir of scanRoots) walk(dir, hits)
if (hits.length) {
  console.error(hits.join('\n'))
  process.exit(1)
}
console.log('check-third-party-marks: 0')
