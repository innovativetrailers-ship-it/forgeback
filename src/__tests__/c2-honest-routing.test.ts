import { resolveHailuoEndpoint } from '../lib/fal/hailuoEndpoints'
import { EmbeddingsUnavailable, embed } from '../lib/cognition/memory/embeddings'

describe('C2 honest routing', () => {
  it('refuses to send SkyReels through Hailuo', () => {
    expect(() => resolveHailuoEndpoint('skyreels-v3', false)).toThrow(/not substituted/)
  })

  it('says embeddings are unavailable when the provider key is missing', async () => {
    const previous = process.env.VOYAGE_API_KEY
    delete process.env.VOYAGE_API_KEY
    await expect(embed('a shot')).rejects.toBeInstanceOf(EmbeddingsUnavailable)
    if (previous) process.env.VOYAGE_API_KEY = previous
  })
})
