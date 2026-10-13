/**
 * WF-03 collab: roles, LWW recipe merge, concurrent generation claim.
 * No Claude, no FAL.
 */
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

if (!core.roleCanGenerate('owner') || !core.roleCanGenerate('director') || !core.roleCanGenerate('editor')) {
  fail('generate roles', 'owner/director/editor must generate')
}
if (core.roleCanGenerate('writer') || core.roleCanGenerate('reviewer') || core.roleCanGenerate('viewer')) {
  fail('generate gated', 'writer/reviewer/viewer must not generate')
}
if (!core.roleCanEditDoc('writer') || core.roleCanEditDoc('reviewer')) fail('edit doc', '')
if (!core.roleCanComment('reviewer') || core.roleCanComment('viewer')) fail('comment', '')
if (!core.roleCanAssignRoles('owner') || core.roleCanAssignRoles('director')) fail('assign', '')

const pending = {
  clipId: 'c1',
  status: 'PENDING',
  videoUrl: null,
  falRequestId: null,
  generateClaimJobId: null,
  generateClaimedBy: null,
  generateClaimedAt: null,
  generatingAt: null,
}
const first = core.decideShotClaim(pending, 1_000)
if (first.kind !== 'claim') fail('first claim', first)
const held = core.applyClaim(pending, 'job-a', 'user-a', 1_000)
const second = core.decideShotClaim(held, 1_001)
if (second.kind !== 'attach' || second.jobId !== 'job-a') fail('second attaches', second)
const third = core.decideShotClaim(held, 1_002)
if (third.kind !== 'attach' || third.jobId !== 'job-a') fail('third attaches same job', third)

const done = { ...held, status: 'COMPLETED', videoUrl: 'https://r2.example/c1.mp4' }
const skip = core.decideShotClaim(done, 2_000)
if (skip.kind !== 'skip-completed') fail('completed skip', skip)

const stale = core.decideShotClaim({ ...held, generateClaimedAt: 1, generatingAt: 1 }, 1 + core.CLAIM_STALE_MS + 1)
if (stale.kind !== 'claim') fail('stale claim reusable', stale)

const refuse = core.decideShotClaim({
  ...pending,
  falRequestId: 'req_1',
}, 1_000)
if (refuse.kind !== 'refuse-inflight') fail('falRequestId without job refuses', refuse)

const track = (id, clips) => ({ id, type: 'video', clips })
const clip = (id, start, extra = {}) => ({ id, trackId: 't1', startTime: start, endTime: start + 2, ...extra })
const baseDoc = core.emptyCollabDocument('p1', {
  id: 'r1',
  projectId: 'p1',
  tracks: [track('t1', [clip('a', 0, { prompt: 'wide' }), clip('b', 3, { prompt: 'close' })])],
})
const userA = core.applyRecipePatch(baseDoc, {
  id: 'r1',
  projectId: 'p1',
  tracks: [track('t1', [clip('a', 1, { prompt: 'wide moved' }), clip('b', 3, { prompt: 'close' })])],
}, 'alice', 10)
const userB = core.applyRecipePatch(baseDoc, {
  id: 'r1',
  projectId: 'p1',
  tracks: [track('t1', [clip('a', 0, { prompt: 'wide' }), clip('b', 5, { prompt: 'close moved' })])],
}, 'bob', 11)
const merged = core.mergeCollabDocument(userA.doc, userB.doc)
const clips = {}
for (const t of merged.doc.recipe.tracks) for (const c of t.clips) clips[c.id] = c
if (clips.a.startTime !== 1) fail('different clip a kept alice', clips.a)
if (clips.b.startTime !== 5) fail('different clip b kept bob', clips.b)
if (merged.warnings.length !== 0) fail('no warning on different clips', merged.warnings)

const sameA = core.applyRecipePatch(baseDoc, {
  id: 'r1', projectId: 'p1',
  tracks: [track('t1', [clip('a', 4, { prompt: 'alice trim' }), clip('b', 3, { prompt: 'close' })])],
}, 'alice', 20)
const sameB = core.applyRecipePatch(baseDoc, {
  id: 'r1', projectId: 'p1',
  tracks: [track('t1', [clip('a', 8, { prompt: 'bob trim' }), clip('b', 3, { prompt: 'close' })])],
}, 'bob', 21)
const sameMerge = core.mergeCollabDocument(sameA.doc, sameB.doc)
const sameClips = {}
for (const t of sameMerge.doc.recipe.tracks) for (const c of t.clips) sameClips[c.id] = c
if (sameClips.a.startTime !== 8 || sameClips.a.prompt !== 'bob trim') fail('same clip last-write bob', sameClips.a)
if (!sameMerge.warnings.some((w) => w.type === 'same_clip_overwrite' && w.clipId === 'a')) {
  fail('same clip warning', sameMerge.warnings)
}

const withMedia = core.applyRecipePatch(baseDoc, {
  id: 'r1', projectId: 'p1',
  tracks: [track('t1', [clip('a', 0, { prompt: 'wide', sourceUrl: 'https://r2.example/a.mp4' }), clip('b', 3)])],
}, 'server', 1)
const wipe = core.applyRecipePatch(withMedia.doc, {
  id: 'r1', projectId: 'p1',
  tracks: [track('t1', [clip('a', 2, { prompt: 'moved no url' }), clip('b', 3)])],
}, 'alice', 30)
if (!wipe.doc.recipe.tracks[0].clips.find((c) => c.id === 'a')?.sourceUrl) {
  fail('generation media is server-authoritative', wipe.doc.recipe.tracks[0].clips)
}

if (process.exitCode) {
  console.log('validate-collab FAILED')
} else {
  console.log('validate-collab ok')
}
