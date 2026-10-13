import { GenerationPausedError, generationPausedFromEnv, guardedFalSubmit, mergeTimelineClips } from '@cinema/core'
import { ledgerBalance, shouldMeter } from '@/lib/credits/meter'

describe('launch invariants', () => {
  it('keeps a user clip and an imported clip when a reconcile arrives', () => {
    const userClip = { id: 'user-clip', sourceUrl: 'https://cdn.example/a.mp4', startTime: 0, endTime: 4 }
    const imported = { id: 'import-clip', sourceUrl: 'https://cdn.example/b.mp4', startTime: 4, endTime: 8 }
    const merged = mergeTimelineClips({
      clips: [userClip, imported],
      incoming: [{ id: 'shot-from-elsewhere', sourceUrl: 'https://cdn.example/c.mp4', startTime: 0, endTime: 2 }],
    })
    expect(merged.clips.map((clip) => clip.id)).toEqual(['user-clip', 'import-clip', 'shot-from-elsewhere'])
  })

  it('keeps the ledger as the balance and blocks a user with no credits', () => {
    const balance = ledgerBalance([
      { amount: 50 },
      { amount: -8 },
      { amount: -12 },
      { amount: 4 },
    ])
    expect(balance).toBe(34)
    expect(shouldMeter({ isInternal: false, balance: 0, required: 8 }).allowed).toBe(false)
    expect(shouldMeter({ isInternal: true, balance: 0, required: 8 })).toEqual({ allowed: true, hold: 0, metered: false })
    expect(shouldMeter({ isInternal: false, balance, required: 8 }).hold).toBe(8)
  })

  it('throws when a paid submit runs while generation is paused', async () => {
    expect(generationPausedFromEnv(undefined)).toBe(true)
    expect(generationPausedFromEnv('true')).toBe(true)
    expect(generationPausedFromEnv('false')).toBe(false)
    await expect(guardedFalSubmit({
      endpoint: 'probe-endpoint',
      input: {},
      source: 'launch-test',
      falKey: 'test-key',
    })).rejects.toBeInstanceOf(GenerationPausedError)
  })
})
