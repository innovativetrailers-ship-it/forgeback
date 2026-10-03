/**
 * OR-06: unified run composition, bypass, closed rating loop. No FAL submit.
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

const pool = ['hailuo-02', 'seedance-2.0', 'kling-3.0', 'ltx-2.3-fast']

const scheduled = core.scheduleDAG({
  shots: [
    { id: 'a', chainLink: 'none' },
    { id: 'b', chainLink: 'video' },
    { id: 'c', chainLink: 'none' },
  ],
})
if (scheduled.chains[0]?.shots.map((shot) => shot.id).join() !== 'a,b') fail('chain schedule', scheduled)
else if (scheduled.independents.map((shot) => shot.id).join() !== 'c') fail('independent schedule', scheduled)
else console.log('PASS scheduleDAG chains sequential units, independents alongside')

if (core.handleGate('pass') !== 'continue') fail('handle pass', core.handleGate('pass'))
else if (core.handleGate('regenerate') !== 'regenerate') fail('handle regen', core.handleGate('regenerate'))
else if (core.gateChainLink('manual', true, 0) !== 'await_user') fail('manual gate', core.gateChainLink('manual', true, 0))
else if (core.gateChainLink('auto', false, 0) !== 'regenerate') fail('auto fail gate', core.gateChainLink('auto', false, 0))
else console.log('PASS gateMode auto regenerates, manual awaits the user')

const outcomes = []
let premiseCalls = 0
const host = {
  async premiseLock(script) {
    premiseCalls += 1
    return {
      characters: [{ id: 'c1', name: 'Ada', description: 'a woman' }],
      settings: [],
      story: script.slice(0, 80) || 'Ada walks',
      genre: 'drama',
      tone: 'quiet',
    }
  },
  async interpretToShots() {
    return {
      shots: [
        { id: 's0', visualPrompt: 'Ada walks into the kitchen', hasDialogue: false, chainLink: 'none' },
        { id: 's1', visualPrompt: 'Ada keeps walking', chainFrom: 's0', chainLink: 'video' },
        { id: 's2', visualPrompt: 'Cut to the street at night', chainLink: 'none', startsAtHardCut: true },
      ],
    }
  },
  async generateShot() { return { ok: true } },
  async qualityGate() { return 'pass' },
  async recordOutcome(shot, delegated, signal) {
    outcomes.push({ id: shot.id, model: delegated.model, purpose: delegated.purpose, signal })
  },
  async assemble() { return { ok: true } },
}

const film = await core.orchestrate(
  'Ada walks into the kitchen then the street',
  { qualityTier: 'standard', gateMode: 'auto' },
  host,
  pool,
)
if (film.stages.join() !== core.ORCHESTRATE_STAGES.join()) fail('stages', film.stages)
else if (film.shots.length !== 3) fail('shot count', film.shots)
else if (outcomes.filter((row) => row.signal === 'approved_at_gate').length !== 3) fail('outcomes', outcomes)
else console.log('PASS orchestrate premise → plan → delegate → generate → gate → learn → assemble')

const bypass = core.resolveBypass(
  { qualityTier: 'standard', gateMode: 'manual', skipInterpret: true },
  { visualPrompt: 'Ada waves', modelOverride: 'kling-3.0' },
)
if (!bypass.skipInterpret || bypass.manualModel !== 'kling-3.0' || bypass.gateMode !== 'manual') {
  fail('bypass flags', bypass)
}

premiseCalls = 0
const directed = await core.orchestrate(
  'ignored',
  {
    qualityTier: 'draft',
    gateMode: 'auto',
    skipInterpret: true,
    directedShots: [{ id: 'd0', visualPrompt: 'Ada waves', modelOverride: 'kling-3.0' }],
  },
  host,
  pool,
)
if (premiseCalls !== 0) fail('skip interpret still locked premise', premiseCalls)
else if (directed.shots[0]?.delegation.model !== 'kling-3.0') fail('manual override', directed.shots[0]?.delegation)
else if (!directed.skippedInterpret) fail('skipped flag', directed)
else console.log('PASS skip interpret + manual override wins')

const before = core.queryModelRAG({
  purpose: 'consistency',
  needs: { mode: 'text' },
  constraint: { tier: 'standard' },
}, pool)
const target = before[0]?.model
const overlay = { [target]: { consistency: { worked: 0, total: 4, score: 0.1 } } }
const shift = core.delegationShiftsForPurpose('consistency', pool, overlay, { qualityTier: 'standard' })
const motion = core.queryModelRAG({
  purpose: 'motion',
  needs: { mode: 'text' },
  constraint: { tier: 'standard' },
}, pool, overlay)
if (!shift.shifted) fail('rating loop', shift)
else if (!motion.some((row) => row.model === target)) fail('loop spilled to motion', { shift, motion })
else console.log('PASS film-1 consistency rating shifts film-2 consistency delegation', shift)

if (process.exitCode) process.exit(process.exitCode)
console.log('unified run inspected; generation not run')
