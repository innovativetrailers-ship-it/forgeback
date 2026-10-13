import { readFileSync } from 'node:fs'

describe('public copy', () => {
  it('does not put vendor names in the site keywords', () => {
    const text = readFileSync('src/app/layout.tsx', 'utf8')
    expect(text).not.toMatch(/Luma Dream Machine/)
    expect(text).not.toMatch(/'Kling'/)
    expect(text).not.toMatch(/'Runway'/)
  })

  it('has a privacy page', () => {
    const text = readFileSync('src/app/(legal)/privacy/page.tsx', 'utf8')
    expect(text).toMatch(/Privacy/)
    expect(text).toMatch(/consent/)
  })
})
