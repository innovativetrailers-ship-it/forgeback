import { rankGeoHits } from '@cinema/core'
import { proposeReel } from '@/lib/highlight/propose'

describe('highlight reel proposal', () => {
  it('prefers a focused line and does not exceed the target', () => {
    const picks = proposeReel([
      { id: 'a', prompt: 'wide street', start: 0, end: 20 },
      { id: 'b', prompt: 'the founder speaking', start: 20, end: 40 },
    ], 15, 'founder')
    expect(picks[0].id).toBe('b')
    expect(picks.reduce((sum, pick) => sum + (pick.end - pick.start), 0)).toBeLessThanOrEqual(15)
    expect(picks[0].reason).toMatch(/founder/)
  })
})

describe('rail geocode still ranks a street', () => {
  it('keeps the highway first', () => {
    const ranked = rankGeoHits([
      { lat: 0, lng: 0, displayName: 'City', kind: 'place:city', city: 'Melbourne' },
      { lat: 1, lng: 1, displayName: 'King Street', kind: 'highway:trunk', street: 'King Street', city: 'Melbourne' },
    ], 'king street melbourne')
    expect(ranked[0].kind.startsWith('highway')).toBe(true)
  })
})
