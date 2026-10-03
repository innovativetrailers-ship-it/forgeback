/**
 * ADX-2: quality-check verdicts. No FAL / Vision submit.
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

const same = core.cosineSimilarity([1, 0, 0], [1, 0, 0])
if (Math.abs(same - 1) > 1e-9) fail('cosine same', same)
else console.log('PASS identical vectors cosine = 1')

const ortho = core.cosineSimilarity([1, 0], [0, 1])
if (Math.abs(ortho) > 1e-9) fail('cosine ortho', ortho)
else console.log('PASS orthogonal vectors cosine = 0')

if (core.firstPassCharacterMatch([], [1, 2]) != null) fail('empty embedding', core.firstPassCharacterMatch([], [1, 2]))
else console.log('PASS missing embedding skips numeric first pass')

const off = core.qualityCheckFromChecks(
  { onIntent: false, artifacts: false },
  { prompt: 'a woman walks into a kitchen' },
)
if (off.verdict !== 'fail' || off.dimension !== 'off_prompt') fail('off prompt', off)
else console.log('PASS off-prompt → fail / off_prompt')

const drift = core.qualityCheckFromChecks(
  { onIntent: true, artifacts: false, characterMatch: 0.2 },
  { prompt: 'close-up of Maya', characterIds: ['c1'] },
)
if (drift.verdict !== 'fail' || drift.dimension !== 'character_drifted') fail('drift', drift)
else console.log('PASS character 0.2 → fail / character_drifted')

const camera = core.qualityCheckFromChecks(
  { onIntent: true, artifacts: false, cameraMatch: false },
  { prompt: 'dolly in', cameraIntent: 'dolly_in' },
)
if (camera.verdict !== 'soft_fail' || camera.dimension !== 'camera') fail('camera', camera)
else console.log('PASS ignored camera → soft_fail / camera')

const loc = core.qualityCheckFromChecks(
  { onIntent: true, artifacts: false, locationMatch: 0.3 },
  { prompt: 'the alley', locationId: 'loc1' },
)
if (loc.verdict !== 'fail' || loc.dimension !== 'location') fail('location', loc)
else console.log('PASS location 0.3 → fail / location')

const art = core.qualityCheckFromChecks(
  { onIntent: true, artifacts: true },
  { prompt: 'wide shot' },
)
if (art.verdict !== 'fail' || art.dimension !== 'artifacts') fail('artifacts', art)
else console.log('PASS artifacts → fail')

const ok = core.qualityCheckFromChecks(
  { onIntent: true, artifacts: false, characterMatch: 0.92, cameraMatch: true, locationMatch: 0.88 },
  { prompt: 'Maya walks the alley', characterIds: ['c1'], cameraIntent: 'dolly_in', locationId: 'loc1' },
)
if (ok.verdict !== 'pass' || ok.reason) fail('pass', ok)
else console.log('PASS on-intent / match → pass')

const unexplained = core.qualityCheckFromChecks(
  { onIntent: true, artifacts: false },
  { prompt: 'x' },
  { reason: '   ' },
)
if (unexplained.verdict !== 'pass') {
  // onIntent true + no artifacts = pass; force unexplained via helper
}
if (!core.isUnexplainedQuality('fail', '') || !core.isUnexplainedQuality('soft_fail', null)) {
  fail('unexplained helper', { failEmpty: core.isUnexplainedQuality('fail', '') })
} else console.log('PASS unexplained bucket is fail/soft_fail with no reason')

const score = core.qualityScoreFromCheck(drift)
if (score.passed) fail('legacy score should fail', score)
else console.log('PASS QualityCheck maps onto chain/Job-4 score.passed=false')

if (core.dimensionFromRatingReason('character_drifted') !== 'character_drifted') fail('rating dim', core.dimensionFromRatingReason('character_drifted'))
else console.log('PASS 👎 character_drifted maps onto quality dimension')

if (core.blendCharacterMatch(0.9, 0.3) !== 0.3) fail('blend', core.blendCharacterMatch(0.9, 0.3))
else console.log('PASS numeric first pass floors an optimistic Vision match')

if (process.exitCode) process.exit(process.exitCode)
console.log('quality net inspected; generation not run')
