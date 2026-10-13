/**
 * Premise lock, grounding, and enrichment. No Claude call and no FAL submit.
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

const premise = core.parsePremiseLock({
  characters: [{ id: 'c1', name: 'the alien', description: 'a stranded traveler' }],
  settings: [{ id: 's1', name: 'the desert', description: 'open dunes' }],
  story: 'An alien stranded in the desert searches for water.',
  genre: 'science fiction',
  tone: 'lonely',
})

if (!premise || premise.characters[0].name !== 'the alien' || premise.settings[0].name !== 'the desert') {
  fail('premise lock', premise)
}

const alien = { visualPrompt: 'the alien walks the desert', premiseElementIds: ['c1', 's1'] }
const drift = { visualPrompt: 'stone hands close up', premiseElementIds: ['c1'] }
const untagged = { visualPrompt: 'the alien walks the desert', premiseElementIds: [] }

if (!core.groundingCheck(alien, premise).grounded) fail('alien shot', '')
else if (core.groundingCheck(drift, premise).grounded) fail('stone hands passed', '')
else if (core.groundingCheck(untagged, premise).grounded) fail('untagged passed', '')

const kept = core.cutUngrounded([alien, drift, untagged], premise)
if (kept.length !== 1 || kept[0] !== alien) fail('cut drift', kept.length)

const treated = 'the alien walks the desert at golden hour, slow push in'
const replaced = 'stone hands rest in a cave'
if (!core.enrichmentKeepsPremise(alien.visualPrompt, treated, premise)) fail('treatment dropped the alien', '')
else if (core.enrichmentKeepsPremise(alien.visualPrompt, replaced, premise)) fail('treatment changed who', '')

const spec = core.applyShotSpec([
  { shotIndex: 0, sceneNumber: 1, contentType: 'physical_action', visualPrompt: alien.visualPrompt, premiseElementIds: ['c1', 's1'], startsAtHardCut: true },
  { shotIndex: 1, sceneNumber: 1, contentType: 'dialogue_closeup', visualPrompt: 'the alien speaks in the desert', premiseElementIds: ['c1', 's1'], startsAtHardCut: false },
  { shotIndex: 2, sceneNumber: 2, contentType: 'aerial_establishing', visualPrompt: 'the desert stretches out', premiseElementIds: ['s1'], startsAtHardCut: true },
], premise)

if (spec[0].chainFrom !== null || spec[0].purpose !== 'motion') fail('head spec', spec[0])
else if (spec[0].charactersPresent[0] !== 'the alien' || spec[0].locationsPresent[0] !== 'the desert') fail('refs', spec[0])
else if (spec[1].chainFrom !== 'shot-0' || !spec[1].purpose) fail('chain spec', spec[1])
else if (spec[2].chainFrom !== null) fail('cut kept a chain', spec[2])
else console.log('premise lock: pass')
