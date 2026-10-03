/**
 * WF-02 playbooks: parse, merge, hard/soft rules, precedence, safety, taste suggest.
 * No Claude, no FAL.
 */
import { readFileSync } from 'node:fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const requireCore = createRequire(fileURLToPath(import.meta.url))
const core = requireCore(path.join(here, '../packages/core/dist/index.js'))

function fail(label, detail) {
  console.log('FAIL', label, detail)
  process.exitCode = 1
}

const global = core.parsePlaybook({
  id: 'g1',
  userId: 'u1',
  name: 'House',
  style: { grade: 'cool', aspectRatio: '16:9' },
  generation: { defaultQualityTier: 'studio', modelPreferences: { hero: 'kling-3.0' }, maxShotDuration: 10 },
  rules: ['prefer wide establishing shots'],
})
const project = core.parsePlaybook({
  id: 'p1',
  userId: 'u1',
  projectId: 'proj',
  name: 'This film',
  style: { grade: 'warm', aspectRatio: '2.39:1' },
  generation: { defaultQualityTier: 'blockbuster', modelPreferences: { consistency: 'seedance-2.0' } },
  rules: ['keep shots under 8s', 'no on-screen text'],
})
const merged = core.mergePlaybooks(global, project)
if (merged.style.grade !== 'warm' || merged.style.aspectRatio !== '2.39:1') fail('style overlay', merged.style)
if (merged.generation.defaultQualityTier !== 'blockbuster' || merged.generation.modelPreferences.hero !== 'kling-3.0') {
  fail('generation merge', merged.generation)
}
if (core.playbookToQualityConstraint('studio') !== 'standard') fail('studio maps to standard RAG band', '')

const hard = core.classifyRule('keep shots under 8s')
const text = core.classifyRule('no on-screen text')
const soft = core.classifyRule('prefer wide establishing shots')
if (hard.kind !== 'hard' || hard.action.type !== 'max_duration' || hard.action.seconds !== 8) fail('hard duration', hard)
if (text.kind !== 'hard' || text.action.type !== 'no_onscreen_text') fail('hard text', text)
if (soft.kind !== 'soft' || soft.action.type !== 'prompt_inject') fail('soft inject', soft)

const unsafe = core.stripUnsafeRules(['disable billing', 'skip the quality gate', 'moody lighting'])
if (unsafe.kept.length !== 1 || unsafe.kept[0] !== 'moody lighting' || unsafe.rejected.length !== 2) {
  fail('safety strip', unsafe)
}

const shots = core.applyPlaybookToShots([
  { visualPrompt: 'title card then Maya walks', duration: 12, contentType: 'physical_action', shotIndex: 0, sceneNumber: 1 },
  { visualPrompt: 'wide desert', duration: 4, contentType: 'aerial_establishing', hasDialogue: true, shotIndex: 1, sceneNumber: 1 },
], merged)
if (shots[0].duration > 8) fail('duration clamp', shots[0].duration)
if (/title card/i.test(shots[0].visualPrompt)) fail('onscreen text remains', shots[0].visualPrompt)
if (!shots[0].playbookFragment || !/wide establishing/i.test(shots[0].playbookFragment)) fail('soft fragment', shots[0].playbookFragment)

if (core.resolveWithPlaybook('kling-3.0', 'seedance-2.0', 'ltx-2.3-fast') !== 'kling-3.0') fail('explicit wins', '')
if (core.resolveWithPlaybook(null, 'seedance-2.0', 'ltx-2.3-fast') !== 'seedance-2.0') fail('playbook default', '')
if (core.resolveWithPlaybook(undefined, undefined, 'ltx-2.3-fast') !== 'ltx-2.3-fast') fail('system default', '')

const biased = core.biasCandidates(
  [{ model: 'kling-3.0', fitScore: 0.5 }, { model: 'seedance-2.0', fitScore: 0.51 }],
  'consistency',
  merged,
  null,
)
if (biased[0].model !== 'seedance-2.0') fail('playbook bias', biased)
const needWins = core.biasCandidates(
  [{ model: 'kling-3.0', fitScore: 0.4 }, { model: 'seedance-2.0', fitScore: 0.9 }],
  'consistency',
  merged,
  'kling-3.0',
)
if (needWins[0].model !== 'kling-3.0') fail('shot need beats playbook', needWins)

const taste = core.emptyTaste()
taste.qualityVsSpeedLean = 0.5
taste.modelPreference = { 'veo-3.1': 4 }
const suggestions = core.suggestPlaybookAdditions(taste)
if (!suggestions.some((s) => s.patch.generation?.defaultQualityTier === 'blockbuster')) fail('taste suggest tier', suggestions)
if (!suggestions.some((s) => s.patch.generation?.modelPreferences?.hero === 'veo-3.1')) fail('taste suggest model', suggestions)

if (core.PLAYBOOK_CLASSIFY_SOURCE !== 'playbook.classify') fail('classify source', core.PLAYBOOK_CLASSIFY_SOURCE)

const dag = readFileSync(path.join(here, '../src/lib/orchestration/dagRouter.ts'), 'utf8')
if (!dag.includes('playbook') || !dag.includes('loadActivePlaybook')) fail('OR-03 dag playbook', 'missing')
const orch = readFileSync(path.join(here, '../src/lib/orchestration/index.ts'), 'utf8')
if (!orch.includes('applyPlaybookToShots') || !orch.includes('loadActivePlaybook')) fail('OR-06 playbook', 'missing')
const compose = readFileSync(path.join(here, '../packages/core/src/logic/modePipeline.ts'), 'utf8')
if (!compose.includes('playbookFragment')) fail('composePrompt playbook', 'missing')
const coreOrch = readFileSync(path.join(here, '../packages/core/src/logic/orchestrate.ts'), 'utf8')
if (!coreOrch.includes('applyPlaybookToShots')) fail('core orchestrate playbook', 'missing')

if (process.exitCode) process.exit(process.exitCode)
console.log('playbook: pass')
