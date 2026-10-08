import { LOOK_CATEGORIES, MAKEUP_LOOKS, lookConflict, looksIn } from '@cinema/core'

describe('makeup looks', () => {
  it('covers every category and warns without changing the shot', () => {
    for (const category of LOOK_CATEGORIES) {
      expect(looksIn(category).length).toBeGreaterThan(0)
    }
    expect(MAKEUP_LOOKS.every((row) => row.methods.bake === 'live' || row.methods.procedural === 'live')).toBe(true)
    expect(MAKEUP_LOOKS.every((row) => row.methods.video === 'needs-model')).toBe(true)
    expect(lookConflict(['age-older'], [])).toMatch(/not changed/)
    expect(lookConflict(['age-older'], ['age-older'])).toBeNull()
  })
})