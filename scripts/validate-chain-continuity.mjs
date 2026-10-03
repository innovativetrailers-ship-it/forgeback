/**
 * Chain decisions and Wan 3.0 reference payload. No FAL submit.
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

const scene = 'scene-1'
const prev = { id: 'shot-0', sceneId: scene, continuityPriority: 'normal' }
const next = { id: 'shot-1', sceneId: scene, continuityPriority: 'normal' }
const cut = { id: 'shot-2', sceneId: 'scene-2', isCut: true, continuityPriority: 'normal' }
const low = { id: 'shot-3', sceneId: scene, continuityPriority: 'low' }

if (!core.shouldChain(next, prev, { videoReferenceCapable: true })) fail('should chain', next)
else if (core.shouldChain(next, prev, { videoReferenceCapable: false })) fail('veo must not chain', '')
else if (core.shouldChain(cut, prev, { videoReferenceCapable: true })) fail('cut chained', '')
else if (core.shouldChain(low, prev, { videoReferenceCapable: true })) fail('low chained', '')
else if (core.shouldChain(next, null, { videoReferenceCapable: true })) fail('no prev', '')
else console.log('PASS shouldChain')

if (core.chainLink(next, prev, false) !== 'still') fail('still fallback', '')
else if (core.chainModelChoice('veo-3.1', ['veo-3.1', 'seedance-2.0']) !== 'seedance-2.0') fail('seedance choice', '')
else if (core.chainModelChoice('veo-3.1', ['veo-3.1', 'wan-3.0', 'seedance-2.0']) !== 'wan-3.0') fail('wan choice', '')
else if (core.chainModelChoice('veo-3.1', ['veo-3.1']) !== null) fail('no capable model', '')
else console.log('PASS reroute and still fallback')

const scheduled = [
  { id: 'a', link: 'none' },
  { id: 'b', link: 'video' },
  { id: 'c', link: 'none' },
  { id: 'd', link: 'still' },
]
const parts = core.partitionContinuity(scheduled)
if (parts.chains.length !== 2 || parts.independents.length !== 0) {
  // a+b is a chain, c+d is a chain. no solo independents.
  if (parts.chains.length !== 2) fail('partition', parts)
  else console.log('PASS partition', parts.chains.map((group) => group.shots.map((shot) => shot.id).join('>')))
} else console.log('PASS partition', parts.chains.map((group) => group.shots.map((shot) => shot.id).join('>')))

const solo = core.partitionContinuity([{ id: 'cut', link: 'none' }])
if (solo.independents.length !== 1 || solo.chains.length !== 0) fail('independent', solo)
else console.log('PASS cut is independent')

if (core.wanChainOutputSeconds(28, 3) !== 27) fail('budget', core.wanChainOutputSeconds(28, 3))
else if (core.wanChainOutputSeconds(5, 3) !== 5) fail('short output', '')
else console.log('PASS wan clip+output budget')

const wan = core.buildWan30Payload({
  mode: 'reference',
  prompt: 'Maya keeps walking.',
  durationSec: core.wanChainOutputSeconds(8, 3),
  imageUrls: ['https://example.com/still.jpg', 'https://example.com/maya.jpg'],
  videoUrls: ['https://example.com/clip.mp4'],
})
if (wan.reference_video_urls?.[0] !== 'https://example.com/clip.mp4' || !wan.reference_image_urls?.includes('https://example.com/still.jpg') || 'start_image_url' in wan || 'end_image_url' in wan || wan.duration !== 8 || wan.audio !== false) {
  fail('wan payload', wan)
} else console.log('PASS wan reference payload has no keyframe')

const composition = core.selectReferences([
  { url: 'https://example.com/clip.mp4', bucket: 'video', role: 'continuation', label: 'previous shot' },
  { url: 'https://example.com/maya.jpg', bucket: 'image', role: 'character', primary: true, label: 'Maya' },
])
const seedance = core.buildSeedancePayload({
  mode: 'reference',
  prompt: 'Maya keeps walking.',
  composition,
})
if (!seedance.video_urls?.length || !String(seedance.prompt).includes('@Video1') || 'end_image_url' in seedance) {
  fail('seedance payload', seedance)
} else console.log('PASS seedance @Video1')

if (core.gateChainLink('auto', false, 0) !== 'regenerate') fail('auto regen', '')
else if (core.gateChainLink('auto', false, 1) !== 'await_user') fail('auto popup', '')
else if (core.gateChainLink('manual', true, 0) !== 'await_user') fail('manual', '')
else if (core.gateChainLink('both', true, 0) !== 'await_user') fail('both', '')
else if (core.gateChainLink('auto', true, 0) !== 'pass') fail('auto pass', '')
else console.log('PASS gates')

if (!core.isVideoReferenceCapable('wan-3.0') || !core.isVideoReferenceCapable('seedance-2.0') || core.isVideoReferenceCapable('veo-3.1')) {
  fail('capability flag', '')
} else console.log('PASS video reference models')

if (process.exitCode) process.exit(process.exitCode)
console.log('chain continuity inspected; generation not run')
