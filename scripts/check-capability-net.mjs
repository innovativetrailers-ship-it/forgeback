import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const requireCore = createRequire(fileURLToPath(import.meta.url))
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const core = requireCore(path.join(root, 'packages/core/dist/index.js'))

function fail(label, detail) {
  console.error('FAIL', label, detail ?? '')
  process.exitCode = 1
}

const specDir = join(root, 'docs/spec-references')
const registry = []
for (const spec of core.SPEC_SYSTEM_FILES) {
  const markdown = readFileSync(join(specDir, spec.file), 'utf8')
  const rows = core.parseSpecControls(markdown, spec.system)
  registry.push(...rows)
  const header = core.parseAuditHeader(markdown)
  if (header) {
    const counts = core.countByStatus(rows)
    if (!core.auditCountsMatch(counts, header)) {
      console.warn('WARN audit header drift', spec.file, { parsed: counts, header })
    }
  }
}

const uiOnly = registry.filter((row) => row.status === 'ui-only').map((row) => row.id)
const stubs = registry.filter((row) => row.status === 'stub').map((row) => row.id)
const falseClaims = registry.filter((row) => row.falseClaim).map((row) => row.id)
const newUiOnly = core.unlistedIds(uiOnly, core.KNOWN_UI_ONLY)
const newStubs = core.unlistedIds(stubs, core.KNOWN_STUBS)
const newClaims = core.unlistedIds(falseClaims, core.KNOWN_FALSE_CLAIMS)

if (newUiOnly.length) fail('new ui-only control without a wired effect path', newUiOnly)
else console.log('PASS no new UI-ONLY controls', uiOnly.length)

if (newStubs.length) fail('new STUB control not in the known inventory', newStubs)
else console.log('PASS stub inventory unchanged', stubs.length)

if (newClaims.length) fail('new FALSE-CLAIM not in the known inventory', newClaims)
else console.log('PASS false-claim inventory unchanged', falseClaims.length)

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.') || name === 'cinematic-forge-v3') continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const srcRoot = join(root, 'src')
const todoHits = []
for (const file of walk(srcRoot)) {
  const rel = relative(root, file).split('\\').join('/')
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!/TODO:\s*wire/i.test(line)) return
    todoHits.push(`${rel}:${i + 1}`)
  })
}
const unknownTodos = todoHits.filter((hit) => !core.KNOWN_DEAD_HANDLERS.some((known) => hit.startsWith(known)))
if (unknownTodos.length) fail('new unwired handler (TODO: wire)', unknownTodos)
else console.log('PASS no new TODO:wire handlers', todoHits.length)

const claimHits = []
for (const file of walk(join(srcRoot, 'app')).concat(walk(join(srcRoot, 'components')))) {
  const rel = relative(root, file).split('\\').join('/')
  if (rel.includes('probe-battery')) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!/(100\+|200\+)/.test(line)) return
    claimHits.push(`${rel}:${i + 1}`)
  })
}
const knownClaimFiles = ['src/app/download/page.tsx']
const unknownClaims = claimHits.filter((hit) => !knownClaimFiles.some((known) => hit.startsWith(known)))
if (unknownClaims.length) fail('new overstated count in UI copy', unknownClaims)
else console.log('PASS no new 100+/200+ UI claims', claimHits.length)

const grok = core.exposedControls('grok-imagine-video', core.GROK_FIELDS)
const grokLast = core.gateModelControl(grok, 'lastFrame')
if (grokLast.visible) fail('grok last-frame must stay hidden', grok)
else console.log('PASS grok last-frame gated off')

const kling = core.exposedControls('kling-3.0', core.KLING_FIELDS)
const klingVoice = core.gateModelControl(kling, 'voice')
if (klingVoice.visible) fail('kling voice must stay hidden', kling)
else console.log('PASS kling voice gated off')

const seedance = core.exposedControls('seedance-2.0', core.SEEDANCE_FIELDS)
const seedanceLast = core.gateModelControl(seedance, 'lastFrame')
if (!seedanceLast.visible) fail('seedance last-frame should show', seedance)
else console.log('PASS seedance last-frame shown from tool matrix')

const dead = core.deadControls(registry)
console.log(`capability net: ${registry.length} controls, ${dead.length} dead (ui-only/stub/false-claim)`)

if (process.exitCode) process.exit(process.exitCode)
console.log('capability net inspected; generation not run')
