import { deepGradeFragment, gradeHasDesktopDepth } from '@cinema/core'

describe('deep grade', () => {
  it('turns an offset wheel into the same filter the export uses, and does not run a DCTL', () => {
    const fragment = deepGradeFragment({
      offset: { r: 0.2, g: 0, b: -0.1 },
      dctlName: 'process.exit(1)',
      colourSpace: { input: 'rec709', output: 'pq' },
    })
    expect(fragment).toMatch(/colorbalance=/)
    expect(fragment).toMatch(/smpte2084/)
    expect(fragment).not.toMatch(/process\.exit/)
    expect(gradeHasDesktopDepth({ dctlName: 'look' })).toBe(true)
    expect(deepGradeFragment(undefined)).toBe('')
  })
})
