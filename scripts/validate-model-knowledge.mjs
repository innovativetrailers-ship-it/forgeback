/**
 * Model-knowledge RAG: retrieve by need, not by name. No FAL submit.
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

const ids = core.listModelKnowledge().map((row) => row.id)
for (const id of ['veo-3.1', 'kling-3.0', 'seedance-2.0', 'wan-2.7', 'wan-3.0', 'grok-imagine-video', 'pixverse-v5.6', 'happyhorse-1.0', 'ltx-2.3-fast', 'hailuo-02']) {
  const entry = core.getModelKnowledge(id)
  if (!entry) fail('missing', id)
  else if (!entry.liveModes.length) fail('no live modes', id)
  else if (entry.learned.hero.total !== 0) fail('learned not empty', id)
}

if (core.getModelKnowledge('runway-gen4')) fail('runway has no family map', '')
else console.log('PASS seeded wired families; runway stays unindexed')

const dialogue = core.queryModelRAG({
  purpose: 'dialogue',
  needs: { mode: 'reference', audio: true },
  constraint: { tier: 'standard' },
})
if (!dialogue.length || dialogue[0].model !== 'seedance-2.0') fail('dialogue need', dialogue)
else if (dialogue.some((row) => row.model === 'ltx-2.3-fast')) fail('ltx served dialogue reference', dialogue)
else console.log('PASS dialogue need ranks Seedance')

const draft = core.queryModelRAG({
  purpose: 'draft',
  needs: { mode: 'text' },
  constraint: { tier: 'draft' },
})
if (!draft.length || draft[0].model !== 'ltx-2.3-fast') fail('draft need', draft)
else console.log('PASS draft need ranks LTX')

const chain = core.queryModelRAG({
  purpose: 'continuity',
  needs: { mode: 'reference', continuity: true },
  constraint: { tier: 'blockbuster' },
})
if (!chain.every((row) => ['wan-3.0', 'seedance-2.0'].includes(row.model))) fail('continuity filter', chain)
else if (!chain[0].reason.includes('continuity')) fail('reason', chain[0])
else console.log('PASS continuity need filters to video-ref models')

const before = core.queryModelRAG({
  purpose: 'hero',
  needs: { mode: 'text' },
  constraint: { tier: 'blockbuster' },
}).map((row) => row.model)

core.indexModelKnowledge({
  id: 'new-eval-model',
  strengths: ['hero quality'],
  weaknesses: [],
  bestFor: ['hero'],
  tools: { camera: true, reference: false, firstLast: false, nativeAudio: false, voice: false, videoReference: false },
  cost: { perSecond: { '720p': 9, '1080p': 9 }, tier: 'premium' },
  ranks: { consistency: 5, motion: 5, camera: 5, audio: 5, quality: 10 },
  maxDuration: 8,
  nativeAudio: false,
  videoRefCapable: false,
  liveModes: ['text'],
  liveFields: { text: ['prompt'] },
  liveLimits: { maxPromptChars: 1000 },
  learned: Object.fromEntries(core.SHOT_PURPOSES.map((p) => [p, { worked: 0, total: 0, score: 0 }])),
  embedding: [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
})
const after = core.queryModelRAG({
  purpose: 'hero',
  needs: { mode: 'text' },
  constraint: { tier: 'blockbuster' },
})
if (!after.some((row) => row.model === 'new-eval-model')) fail('new model not retrieved', after)
else if (before.includes('new-eval-model')) fail('seed leaked', before)
else console.log('PASS indexing a new model makes it retrievable')

if (process.exitCode) process.exit(process.exitCode)
console.log('model knowledge RAG inspected; generation not run')
