import { AERIAL_CREDITS, MESH_CREDITS, aerialPrompt, creditsForUsd } from '@/lib/studio/generationUtilities'

describe('generation utilities', () => {
  it('prices the live per-unit rates and writes an aerial prompt', () => {
    expect(creditsForUsd(0.025)).toBe(1)
    expect(creditsForUsd(0.02)).toBe(1)
    expect(AERIAL_CREDITS).toBe(1)
    expect(MESH_CREDITS).toBe(1)
    expect(aerialPrompt('Circular Quay')).toMatch(/Aerial satellite/)
    expect(() => aerialPrompt('a')).toThrow(/place/)
  })
})