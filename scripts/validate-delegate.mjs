/**
 * OR-03: delegate by purpose through the RAG. No FAL submit.
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

const specialists = ['hailuo-02', 'seedance-2.0', 'happyhorse-1.0', 'ltx-2.3-fast', 'veo-3.1']

async function dialogueAt(tier) {
  return core.delegate(
    { visualPrompt: 'A woman speaks to her brother in a kitchen', hasDialogue: true, duration: 5 },
    { qualityTier: tier },
    specialists,
  )
}

const draft = await dialogueAt('draft')
const standard = await dialogueAt('standard')
const blockbuster = await dialogueAt('blockbuster')

if (draft.model !== 'hailuo-02') fail('draft dialogue', draft)
else console.log('PASS draft dialogue → hailuo-02', draft.reason)
if (standard.model !== 'seedance-2.0') fail('standard dialogue', standard)
else console.log('PASS standard dialogue → seedance-2.0', standard.reason)
if (blockbuster.model !== 'veo-3.1') fail('blockbuster live dialogue', blockbuster)
else console.log('PASS blockbuster auto dialogue → veo-3.1 (HappyHorse stays benched)', blockbuster.reason)

const ranked = core.queryModelRAG({
  purpose: 'dialogue',
  needs: { mode: 'text', audio: true },
  constraint: { tier: 'blockbuster' },
}, specialists)
if (ranked[0]?.model !== 'happyhorse-1.0') fail('blockbuster ranked', ranked)
else console.log('PASS RAG ranks HappyHorse for blockbuster dialogue when indexed')

const money = await core.delegate(
  { visualPrompt: 'A woman speaks', hasDialogue: true, duration: 5, moneyShot: true },
  { qualityTier: 'draft' },
  specialists,
)
if (money.model !== 'seedance-2.0') fail('money shot bump', money)
else console.log('PASS money shot on draft dialogue bumps to Seedance')

const manual = await core.delegate(
  { visualPrompt: 'A woman speaks', hasDialogue: true, duration: 5, modelOverride: 'kling-3.0' },
  { qualityTier: 'blockbuster' },
  specialists,
)
if (manual.model !== 'kling-3.0' || !manual.reason.includes('Manual override')) fail('manual override', manual)
else console.log('PASS manual override wins')

const liveDraft = await core.delegate(
  { visualPrompt: 'A woman speaks', hasDialogue: true, duration: 5 },
  { qualityTier: 'draft' },
)
if (liveDraft.model === 'happyhorse-1.0') fail('happyhorse auto', liveDraft)
else console.log('PASS live auto pool keeps HappyHorse out', liveDraft.model, liveDraft.reason)

if (core.deriveShotPurpose({ hasDialogue: true }) !== 'dialogue') fail('derive dialogue', '')
if (core.deriveShotPurpose({ chainFrom: 'shot-0' }) !== 'continuity') fail('derive continuity', '')
if (core.deriveShotPurpose({ cameraMove: 'dolly in' }) !== 'camera') fail('derive camera', '')
else console.log('PASS purpose derivation')

const loraShot = await core.delegate(
  {
    visualPrompt: 'A woman walks into the room',
    characterIds: ['char-1'],
    consistencyNeed: 8,
    characterLora: {
      loraUrl: 'https://example.com/char.safetensors',
      triggerPhrase: 'sks person',
      loraInference: 'minimax/h3/reference-to-video/lora',
    },
  },
  { qualityTier: 'standard' },
)
if (
  loraShot.model !== 'minimax/h3/reference-to-video/lora'
  || !loraShot.reason.includes('using trained LoRA for consistency')
) {
  fail('trained lora delegate', loraShot)
} else console.log('PASS consistency + character LoRA delegates to /lora endpoint')

const loraManual = await core.delegate(
  {
    visualPrompt: 'A woman walks into the room',
    characterIds: ['char-1'],
    consistencyNeed: 8,
    modelOverride: 'kling-3.0',
    characterLora: {
      loraUrl: 'https://example.com/char.safetensors',
      loraInference: 'minimax/h3/reference-to-video/lora',
    },
  },
  { qualityTier: 'blockbuster' },
)
if (loraManual.model !== 'kling-3.0' || !loraManual.reason.includes('Manual override')) {
  fail('lora does not replace manual', loraManual)
} else console.log('PASS manual override is not replaced by a trained LoRA')

if (process.exitCode) process.exit(process.exitCode)
console.log('delegation inspected; generation not run')
