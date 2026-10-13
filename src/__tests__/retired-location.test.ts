import { execFileSync } from 'node:child_process'

describe('retired location tables', () => {
  it('has no reader or writer of the retired location models', () => {
    const result = execFileSync('node', ['scripts/check-retired-location.mjs'], { encoding: 'utf8' })
    expect(result).toMatch(/check-retired-location: 0/)
  })
})
