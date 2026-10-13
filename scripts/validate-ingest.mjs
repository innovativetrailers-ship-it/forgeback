/**
 * WF-01 ingest: detect, parse, premise merge, understand source. No Claude, no FAL.
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

const scriptText = `INT. DESERT CAMP - NIGHT
MAYA
We wait for the signal.
EXT. DUNES - DAWN
The alien walks the ridge.`

if (core.detectType({ filename: 'act2.fountain', text: scriptText }) !== 'script') {
  fail('script detect', core.detectType({ filename: 'act2.fountain', text: scriptText }))
}
if (core.detectType({ filename: 'grey-alien-headshot.png', mime: 'image/png' }) !== 'character_ref') {
  fail('character detect', core.detectType({ filename: 'grey-alien-headshot.png', mime: 'image/png' }))
}
if (core.detectType({ filename: 'plaza-establishing.jpg', mime: 'image/jpeg' }) !== 'location_ref') {
  fail('location detect', core.detectType({ filename: 'plaza-establishing.jpg', mime: 'image/jpeg' }))
}
if (core.detectType({ filename: 'assembly-rough.mp4', mime: 'video/mp4' }) !== 'rough_cut') {
  fail('rough cut detect', core.detectType({ filename: 'assembly-rough.mp4', mime: 'video/mp4' }))
}
if (core.detectType({ filename: 'look-moodboard.png', mime: 'image/png' }) !== 'style_ref') {
  fail('style detect', core.detectType({ filename: 'look-moodboard.png', mime: 'image/png' }))
}
if (core.detectType({ url: 'https://example.com/notes' }) !== 'link') {
  fail('link detect', core.detectType({ url: 'https://example.com/notes' }))
}
if (core.detectType({ filename: 'bible.pdf', mime: 'application/pdf' }) !== 'pdf') {
  fail('pdf detect', core.detectType({ filename: 'bible.pdf', mime: 'application/pdf' }))
}
if (core.detectType({ filename: 'maya-voice.wav', mime: 'audio/wav' }) !== 'audio_sample') {
  fail('audio detect', core.detectType({ filename: 'maya-voice.wav', mime: 'audio/wav' }))
}

const treatment = 'Logline: An alien stranded in the desert searches for water.\nTone: lonely\nGenre: science fiction'
if (core.detectType({ filename: 'treatment.md', text: treatment }) !== 'treatment') {
  fail('treatment detect', core.detectType({ filename: 'treatment.md', text: treatment }))
}

const parsed = core.parseFountainLocal(scriptText)
if (!parsed.characters.includes('Maya') || parsed.scenes.length < 2) {
  fail('fountain parse', parsed)
}

const lockA = core.parsePremiseLock({
  characters: [{ id: 'c1', name: 'Maya', description: 'a scout' }],
  settings: [{ id: 's1', name: 'the desert', description: 'open dunes' }],
  story: 'Maya waits.',
  genre: '',
  tone: 'tense',
})
const lockB = core.premiseFromTreatmentText(treatment)
const merged = core.mergePremiseLocks(lockA, lockB)
if (!merged.story.includes('alien') || merged.characters[0].name !== 'Maya') {
  fail('premise merge from treatment', merged)
}

const understood = core.parseUnderstandJson({
  role: 'character reference of Maya',
  description: 'grey alien scout',
  type: 'character_ref',
  links: { characterName: 'Maya' },
}, 'unknown')
if (understood.type !== 'character_ref' || understood.links.characterName !== 'Maya') {
  fail('understand parse', understood)
}

if (core.matchEntityName('maya', ['Maya', 'Kael']) !== 'Maya') {
  fail('name match', core.matchEntityName('maya', ['Maya', 'Kael']))
}

core.assertIngestConsent(true)
let consentThrew = false
try { core.assertIngestConsent(false) } catch (err) {
  consentThrew = err instanceof core.IngestConsentError || err?.name === 'IngestConsentError'
}
if (!consentThrew) fail('consent', 'did not throw')

if (core.INGEST_UNDERSTAND_SOURCE !== 'ingest.understand') {
  fail('understand source constant', core.INGEST_UNDERSTAND_SOURCE)
}

const hostUnderstand = readFileSync(path.join(here, '../src/lib/ingest/understand.ts'), 'utf8')
if (!hostUnderstand.includes("source: INGEST_UNDERSTAND_SOURCE") && !hostUnderstand.includes("'ingest.understand'")) {
  fail('understand gated source', 'src/lib/ingest/understand.ts missing ingest.understand')
}

const directed = readFileSync(path.join(here, '../src/lib/orchestration/directedRun.ts'), 'utf8')
if (!directed.includes('loadProjectGenerationContext')) {
  fail('OR-06 directed ingest', 'directedRun does not load ingested context')
}

const orch = readFileSync(path.join(here, '../src/lib/orchestration/index.ts'), 'utf8')
if (!orch.includes('loadPremiseLock') || !orch.includes('loadProjectGenerationContext')) {
  fail('OR-01/06 ingest', 'orchestrateGeneration missing stored premise / vault context')
}

const dag = readFileSync(path.join(here, '../src/lib/orchestration/dagRouter.ts'), 'utf8')
if (!dag.includes('queryProjectRAG')) {
  fail('OR-02 ingest RAG', 'dagRouter does not query project RAG')
}

const chain = readFileSync(path.join(here, '../src/lib/orchestration/chainGeneration.ts'), 'utf8')
if (!chain.includes('PROJECT CONTEXT')) {
  fail('OR-06 consume RAG', 'chainGeneration does not inject shotMemory')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('ingest: pass')
