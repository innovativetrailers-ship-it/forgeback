jest.mock('jose', () => ({
  jwtVerify: jest.fn(async (token: string, key: Uint8Array) => {
    const secret = new TextDecoder().decode(key)
    if (token === 'good' && secret === 'server-secret') return { payload: { sub: 'user-1' } }
    throw new Error('bad signature')
  }),
}))

import { mobileUserId } from '../lib/auth/mobileJwt'

describe('mobile JWT', () => {
  it('accepts a token signed with the server secret and rejects another secret', async () => {
    expect(await mobileUserId('good', 'server-secret')).toBe('user-1')
    expect(await mobileUserId('good', 'other-secret')).toBeNull()
  })
})
