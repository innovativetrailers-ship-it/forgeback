import { readFileSync } from 'node:fs'
import { assertPublicHost, hostAllowed } from '../lib/net/safeFetch'

describe('safeFetch hosts', () => {
  it('requires an exact host and refuses a lookalike', () => {
    expect(hostAllowed('images.pexels.com', ['images.pexels.com'])).toBe(true)
    expect(hostAllowed('evilpexels.com', ['images.pexels.com', 'pexels.com'])).toBe(false)
    expect(hostAllowed('pexels.com.evil.com', ['pexels.com'])).toBe(false)
  })

  it('refuses a loopback address before any request', async () => {
    await expect(assertPublicHost('127.0.0.1')).rejects.toThrow(/Private address/)
  })

  it('is the fetcher for stock, plates, references, ingest, and music links', () => {
    const files = [
      'src/app/api/stock/import/route.ts',
      'src/app/api/vault/location/save/route.ts',
      'src/lib/character/ingestion.ts',
      'src/lib/ingest/parse.ts',
      'src/app/api/generate/route.ts',
    ]
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text).toMatch(/safeFetch|assertPublicHost/)
      expect(text).not.toMatch(/host\.endsWith\(/)
    }
  })
})
