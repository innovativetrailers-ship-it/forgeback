import {
  advanceApproval,
  applyRecipePatch,
  defaultApprovalChain,
  emptyCollabDocument,
  type CollabRecipe,
} from '@cinema/core'
import { expiryDate, hashReviewPin, verifyReviewPin, watermarkLabel } from '@/lib/review/pin'

describe('review portal and collab', () => {
  it('gates a share with a PIN and an expiry', () => {
    const stored = hashReviewPin('2468')
    expect(verifyReviewPin('2468', stored)).toBe(true)
    expect(verifyReviewPin('0000', stored)).toBe(false)
    expect(verifyReviewPin('2468', null)).toBe(false)
    expect(expiryDate('never')).toBeNull()
    expect(expiryDate('24h', 0)?.getTime()).toBe(24 * 60 * 60 * 1000)
    expect(watermarkLabel('North Client', true, new Date('2026-09-30T00:00:00.000Z'))).toBe('North Client · 2026-09-30')
  })

  it('advances a three-step chain and approves the shot only at the end', () => {
    const chain = defaultApprovalChain()
    const director = advanceApproval(chain, { decision: 'approved', actor: 'Ada', at: '2026-09-30T00:00:00.000Z' })
    expect(director.chain[0].status).toBe('approved')
    expect(director.shotApproved).toBe(false)
    const bounced = advanceApproval(director.chain, { decision: 'changes-requested', actor: 'Bea', note: 'Shorter', at: '2026-09-30T01:00:00.000Z' })
    expect(bounced.overall).toBe('changes-requested')
    expect(bounced.chain[0].status).toBe('pending')
    expect(bounced.chain[1].note).toMatch(/Shorter/)
    expect(bounced.shotApproved).toBe(false)
    let next = bounced.chain
    for (let i = 0; i < 3; i++) {
      const step = advanceApproval(next, { decision: 'approved', actor: 'Ada', at: '2026-09-30T02:00:00.000Z' })
      next = step.chain
      if (i < 2) expect(step.shotApproved).toBe(false)
      else expect(step.shotApproved).toBe(true)
    }
  })

  it('keeps both clips when two people edit at once', () => {
    const baseRecipe: CollabRecipe = {
      id: 'recipe',
      projectId: 'project',
      tracks: [{ id: 'v1', type: 'video', clips: [{ id: 'a', trackId: 'v1', startTime: 0, endTime: 2, sourceUrl: 'https://example.com/a.mp4' }] }],
    }
    const base = emptyCollabDocument('project', baseRecipe)
    const incoming: CollabRecipe = {
      ...baseRecipe,
      tracks: [{ id: 'v1', type: 'video', clips: [{ id: 'b', trackId: 'v1', startTime: 2, endTime: 4, sourceUrl: 'https://example.com/b.mp4' }] }],
    }
    const merged = applyRecipePatch(base, incoming, 'editor-b', 10)
    const ids = merged.doc.recipe.tracks.flatMap((track) => track.clips.map((clip) => clip.id)).sort()
    expect(ids).toEqual(['a', 'b'])
  })
})
