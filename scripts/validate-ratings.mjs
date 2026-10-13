/**
 * OR-05: attributable ratings, purpose-scoped penalty, taste boost. No FAL submit.
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

if (core.signalFromScore(5) !== 2 || core.signalFromScore(1) !== -2) {
  fail('thumbs map', { up: core.signalFromScore(5), down: core.signalFromScore(1) })
} else if (core.signalForKind('thumbs_up', 'rating') !== 2 || core.signalForKind('kept') !== 1) {
  fail('rating above behaviour', {
    rating: core.signalForKind('thumbs_up', 'rating'),
    kept: core.signalForKind('kept'),
  })
} else {
  console.log('PASS 👍/👎 maps to +2/−2, above behavioural +1')
}

const consChips = core.failReasonsFor('consistency').map((chip) => chip.id)
const camChips = core.failReasonsFor('camera').map((chip) => chip.id)
if (!consChips.includes('character_drifted')) fail('consistency chips', consChips)
else if (!camChips.includes('wrong_motion')) fail('camera chips', camChips)
else if (core.ratingPromptFor('consistency') !== 'Did the character look consistent?') {
  fail('contextual prompt', core.ratingPromptFor('consistency'))
} else {
  console.log('PASS 👎 chips and prompt match purpose')
}

if (core.purposeForRatingReason('character_drifted', 'motion') !== 'consistency') {
  fail('reason attribution', core.purposeForRatingReason('character_drifted', 'motion'))
} else {
  console.log('PASS character_drifted attributes to consistency, not the shot purpose')
}

const overlay = {
  'kling-3.0': { consistency: { worked: 0, total: 4, score: 0.1 } },
}
const pool = ['kling-3.0', 'seedance-2.0']
const consistency = core.queryModelRAG({
  purpose: 'consistency',
  needs: { mode: 'text' },
  constraint: { tier: 'standard' },
}, pool, overlay)
const motion = core.queryModelRAG({
  purpose: 'motion',
  needs: { mode: 'text' },
  constraint: { tier: 'standard' },
}, pool, overlay)
if (consistency[0]?.model === 'kling-3.0') fail('consistency still first after 👎', consistency)
else if (!motion.some((row) => row.model === 'kling-3.0')) fail('motion lost kling', motion)
else console.log('PASS consistency 👎 deprioritises consistency only', {
  consistency: consistency.map((row) => row.model),
  motion: motion.map((row) => row.model),
})

let taste = core.emptyTaste()
for (let i = 0; i < 8; i++) {
  taste = core.foldTaste(taste, { model: 'seedance-2.0', worked: false, score: 1 }, 'standard')
}
const need = {
  purpose: 'dialogue',
  needs: { mode: 'text', audio: true },
  constraint: { tier: 'standard' },
}
const plain = core.queryModelRAG(need, pool)
const personal = core.queryModelRAG(need, pool, undefined, taste)
const seedPlain = plain.find((row) => row.model === 'seedance-2.0')?.fitScore
const seedTaste = personal.find((row) => row.model === 'seedance-2.0')?.fitScore
const boost = core.tasteBoost('seedance-2.0', 'standard', 'dialogue', taste)
if (taste.modelPreference['seedance-2.0'] >= 0) fail('taste fold', taste)
else if (!(boost < 0) || !(seedTaste < seedPlain)) fail('taste boost', { boost, seedPlain, seedTaste })
else console.log('PASS taste profile lowers the 👎 model in RAG', { boost, seedPlain, seedTaste })

if (process.exitCode) process.exit(process.exitCode)
console.log('ratings inspected; generation not run')
