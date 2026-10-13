import { ageYears } from '../lib/privacy/age'

describe('consent age', () => {
  it('treats a birthday that has not happened this year as one year younger', () => {
    const now = new Date('2026-10-13T00:00:00.000Z')
    expect(ageYears(new Date('2008-10-14T00:00:00.000Z'), now)).toBe(17)
    expect(ageYears(new Date('2008-10-13T00:00:00.000Z'), now)).toBe(18)
  })
})
