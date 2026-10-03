/**
 * ADX-3: control-status helpers. No FAL submit.
 */
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const requireCore = createRequire(fileURLToPath(import.meta.url))
const core = requireCore(path.join(path.dirname(fileURLToPath(import.meta.url)), '../packages/core/dist/index.js'))

function fail(label, detail) {
  console.log('FAIL', label, detail)
  process.exitCode = 1
}

const heading = core.parseControlHeading('### Native-audio toggle   [UI-ONLY → TIER 1]')
if (!heading || heading.status !== 'ui-only' || heading.name !== 'Native-audio toggle') fail('parse ui-only', heading)
else console.log('PASS parse UI-ONLY heading')

const wired = core.parseControlHeading('### Prompt   [WIRED]')
if (!wired || wired.status !== 'wired') fail('parse wired', wired)
else console.log('PASS parse WIRED heading')

const stub = core.parseControlHeading('### Stem separation   [STUB → TIER 3]')
if (!stub || stub.status !== 'stub') fail('parse stub', stub)
else console.log('PASS parse STUB heading')

const claim = core.parseControlHeading('### 200+ effect library   [ABSENT/FALSE-CLAIM → TIER 1 honesty]')
if (!claim || claim.status !== 'absent' || !claim.falseClaim) fail('parse false-claim', claim)
else console.log('PASS parse FALSE-CLAIM heading')

const slug = core.controlSlug('generation', 'Quality tier (Draft / Studio / Blockbuster)')
if (slug !== 'generation/quality-tier-draft-studio-blockbuster') fail('slug', slug)
else console.log('PASS control slug')

const spec = `### Prompt   [WIRED]\n### Native-audio toggle   [UI-ONLY → TIER 1]\n`
const rows = core.parseSpecControls(spec, 'generation')
if (rows.length !== 2 || rows[1].id !== 'generation/native-audio-toggle') fail('parse spec', rows)
else console.log('PASS parse spec controls')

const dead = core.deadControls(rows)
if (dead.length !== 1 || dead[0].status !== 'ui-only') fail('dead', dead)
else console.log('PASS dead inventory is ui-only/stub')

const fresh = core.unlistedIds(['generation/brand-new-slider', 'generation/native-audio-toggle'], core.KNOWN_UI_ONLY)
if (fresh.length !== 1 || fresh[0] !== 'generation/brand-new-slider') fail('new ui-only', fresh)
else console.log('PASS new UI-ONLY id is flagged')

const header = core.parseAuditHeader('Audit: 16 WIRED / 2 UI-ONLY / 0 STUB / 6 ABSENT')
const counts = core.countByStatus([
  ...Array.from({ length: 16 }, (_, i) => ({ id: `x/${i}`, name: 'n', system: 'generation', status: 'wired' })),
  { id: 'a', name: 'a', system: 'generation', status: 'ui-only' },
  { id: 'b', name: 'b', system: 'generation', status: 'ui-only' },
  ...Array.from({ length: 6 }, (_, i) => ({ id: `abs/${i}`, name: 'n', system: 'generation', status: 'absent' })),
])
if (!header || !core.auditCountsMatch(counts, header)) fail('audit match', { header, counts })
else console.log('PASS audit header counts match parsed rows')

const hidden = core.gateModelControl({
  lastFrame: false, firstFrame: true, voice: 'none', audioToggle: false, seed: false, negative: false, reference: false,
}, 'lastFrame')
if (hidden.visible || !hidden.reason) fail('gate hide', hidden)
else console.log('PASS last-frame hidden with reason')

const shown = core.gateModelControl({
  lastFrame: true, firstFrame: true, voice: 'audio_tag', audioToggle: false, seed: false, negative: false, reference: true,
}, 'lastFrame')
if (!shown.visible) fail('gate show', shown)
else console.log('PASS last-frame shown when schema-backed')

if (!core.claimOverstated(200, 15) || core.claimMatches(4, 4) !== true) fail('claims', { over: core.claimOverstated(200, 15) })
else console.log('PASS overstated claim vs backed count')

const mismatches = core.claimHonesty([
  { id: 'fx', label: 'effects', claimed: 200, backed: 15, unit: 'effects' },
  { id: 'luts', label: 'LUTs', claimed: 4, backed: 4, unit: 'luts' },
])
if (mismatches.length !== 1 || mismatches[0].id !== 'fx') fail('honesty', mismatches)
else console.log('PASS claim honesty flags 200+ vs 15')

if (process.exitCode) process.exit(process.exitCode)
console.log('capability net inspected; generation not run')
