import { buildMocapPrompt } from '../../src/lib/character/characterMotion'
import { buildAppearanceBakePrompt } from '../../src/lib/character/appearanceBake'
import { matchCharacterForShot } from '../../src/lib/character/characterResolve'
import { defaultAppearance } from '../../src/lib/character/fccSchema'
import { buildIdentityTokens, injectCharacterTokens } from '../../src/lib/character/identityLock'

describe('character pipeline', () => {
  const char = {
    id: 'c1',
    name: 'Maya',
    projectId: 'p1',
    createdAt: new Date().toISOString(),
    faceEmbedding: [1, 2],
    bodyEmbedding: [1, 2],
    refFront: 'https://example.com/front.jpg',
    ref3Quarter: 'https://example.com/3q.jpg',
    appearance: { ...defaultAppearance(), structuralAge: 60, muscularityPct: 80 },
    wardrobe: [
      {
        id: 'w1',
        region: 'torso' as const,
        prompt: 'leather jacket',
        refImageUrl: '',
        lockedHash: 'x',
        appliedAt: '',
      },
    ],
    behavioralPrompt: 'confident',
  }

  test('matches character by name in prompt', () => {
    const hit = matchCharacterForShot([char], '', 'wide shot of Maya walking', null)
    expect(hit?.id).toBe('c1')
  })

  test('builds identity tokens and injects into payload', () => {
    const tokens = buildIdentityTokens(char)
    const out = injectCharacterTokens({ prompt: 'Maya in rain' }, tokens)
    expect(String(out.prompt)).toMatch(/leather jacket/)
    expect(out.image_url).toBe(char.refFront)
  })

  test('builds mocap prompt with character label', () => {
    expect(buildMocapPrompt('Maya', 'dramatic entrance')).toMatch(/Maya/)
    expect(buildMocapPrompt('Maya', 'dramatic entrance')).toMatch(/dramatic entrance/)
  })

  test('builds appearance bake prompt', () => {
    const prompt = buildAppearanceBakePrompt(char)
    expect(prompt).toMatch(/aged 60/)
    expect(prompt).toMatch(/leather jacket/)
  })
})
