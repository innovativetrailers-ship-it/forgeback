/**
 * OR-04: learned Layer 3 blend + circuit-break. No FAL submit.
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
const need = {
  purpose: 'dialogue',
  needs: { mode: 'text', audio: true },
  constraint: { tier: 'standard' },
}

const baseline = core.queryModelRAG(need, pool)
if (baseline[0]?.model !== 'seedance-2.0') fail('baseline dialogue', baseline)
else console.log('PASS static seed ranks Seedance for dialogue')

for (let i = 0; i < 12; i++) {
  core.applyLearnedSignal('kling-3.0', 'dialogue', 1, 'behaviour')
  core.applyLearnedSignal('seedance-2.0', 'dialogue', -1, 'behaviour')
}
const learned = core.queryModelRAG(need, pool)
if (learned[0]?.model !== 'kling-3.0') fail('learned shift', learned)
else console.log('PASS after N positives Kling outranks Seedance on dialogue', learned[0].reason)

for (let i = 0; i < 5; i++) core.applyLearnedSignal('hailuo-02', 'dialogue', -1, 'behaviour')
const afterBreak = core.queryModelRAG({
  purpose: 'dialogue',
  needs: { mode: 'text' },
  constraint: { tier: 'draft' },
}, ['hailuo-02', 'ltx-2.3-fast'])
if (afterBreak.some((row) => row.model === 'hailuo-02') && afterBreak[0].model === 'hailuo-02') {
  fail('circuit still first', afterBreak)
} else if (afterBreak[0]?.model !== 'ltx-2.3-fast') fail('circuit fallback', afterBreak)
else console.log('PASS circuit-break drops Hailuo from draft dialogue')

const dim = core.purposeForRatingReason('character_drifted', 'motion')
if (dim !== 'consistency') fail('reason map', dim)
else console.log('PASS rating reason character_drifted → consistency')

const w0 = core.learnedBlendWeight(0)
const w8 = core.learnedBlendWeight(8)
if (w0 !== 0 || w8 < 0.49 || w8 > 0.51) fail('blend weight', { w0, w8 })
else console.log('PASS learned weight grows with n')

if (process.exitCode) process.exit(process.exitCode)
console.log('learning loop inspected; generation not run')
