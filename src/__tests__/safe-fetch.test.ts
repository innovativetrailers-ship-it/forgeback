import { hostAllowed } from '../lib/net/safeFetch'

describe('safeFetch hosts', () => {
  it('requires an exact host and refuses a lookalike', () => {
    expect(hostAllowed('images.pexels.com', ['images.pexels.com'])).toBe(true)
    expect(hostAllowed('evilpexels.com', ['images.pexels.com', 'pexels.com'])).toBe(false)
    expect(hostAllowed('pexels.com.evil.com', ['pexels.com'])).toBe(false)
  })
})
