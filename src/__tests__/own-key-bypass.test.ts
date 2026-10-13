jest.mock('@/lib/desktop/cloudAuth', () => ({
  validateDesktopCloudRequest: jest.fn(async () => 'user-1'),
}))

const findUnique = jest.fn()
const create = jest.fn()

jest.mock('@/lib/db', () => ({
  db: {
    user: { findUnique },
    creditTransaction: { create },
  },
}))

import { POST } from '../app/api/desktop/generate/own-key/route'

describe('own-key billing bypass', () => {
  beforeEach(() => jest.clearAllMocks())

  it('refuses an account that is not flagged', async () => {
    findUnique.mockResolvedValue({ canUseOwnKeys: false, creditBalance: 40 })
    const res = await POST(new Request('http://local/own-key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpointKey: 'veo' }),
    }) as never)
    expect(res.status).toBe(403)
    expect(create).not.toHaveBeenCalled()
  })

  it('records a zero charge only when the own-key flag is set', async () => {
    findUnique.mockResolvedValue({ canUseOwnKeys: true, creditBalance: 40 })
    create.mockResolvedValue({})
    const res = await POST(new Request('http://local/own-key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpointKey: 'veo' }),
    }) as never)
    expect(res.status).toBe(200)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: 0, type: 'own-key' }),
    }))
  })
})
