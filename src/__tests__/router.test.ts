import { routeToModel, getDurationMultiplier } from '../lib/models/router'
import type { ModelRouterInput } from '../lib/models/types'

const base: ModelRouterInput = {
  quality: 'standard',
  sceneType: 'action',
  hasCharacterRef: false,
  hasLoRA: false,
  userRole: 'FREE',
  duration: 5,
}

describe('routeToModel', () => {
  it('routes FREE + draft to ltx', () => {
    const model = routeToModel({ ...base, quality: 'draft' })
    expect(model).toBe('ltx')
  })

  it('routes film + STUDIO to veo3', () => {
    const model = routeToModel({ ...base, quality: 'film', userRole: 'STUDIO' })
    expect(model).toBe('veo3')
  })

  it('routes FREE + film to kling_standard (tier cap)', () => {
    const model = routeToModel({ ...base, quality: 'film', userRole: 'FREE' })
    expect(model).toBe('kling_standard')
  })

  it('routes cinematic to kling_pro', () => {
    const model = routeToModel({ ...base, quality: 'cinematic', userRole: 'PRO', sceneType: 'general' })
    expect(model).toBe('kling_pro')
  })

  it('routes with LoRA to kling family', () => {
    const model = routeToModel({ ...base, hasLoRA: true, quality: 'standard' })
    expect(['kling_standard', 'kling_pro']).toContain(model)
  })

  it('routes action + cinematic to runway', () => {
    const model = routeToModel({ ...base, quality: 'cinematic', sceneType: 'action', userRole: 'PRO' })
    expect(model).toBe('runway')
  })

  it('routes aerial + standard to luma', () => {
    const model = routeToModel({ ...base, quality: 'standard', sceneType: 'aerial' })
    expect(model).toBe('luma')
  })

  it('routes character ref + standard to kling_standard', () => {
    const model = routeToModel({ ...base, hasCharacterRef: true, quality: 'standard' })
    expect(model).toBe('kling_standard')
  })
})

describe('getDurationMultiplier', () => {
  it('returns 1 for <=5s', () => {
    expect(getDurationMultiplier(5)).toBe(1)
  })

  it('returns 2 for 6-10s', () => {
    expect(getDurationMultiplier(10)).toBe(2)
  })

  it('returns 4 for 16-20s', () => {
    expect(getDurationMultiplier(20)).toBe(4)
  })
})
