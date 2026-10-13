import { referenceImagePlan } from '@/lib/studio/referenceImage'

describe('reference image plan', () => {
  it('stays text-only with no uploads and sends every selected image when present', () => {
    expect(referenceImagePlan({ uploads: [] }).model).toBe('flux/dev')
    expect(referenceImagePlan({ uploads: [] }).imageUrls).toEqual([])
    const planned = referenceImagePlan({
      uploads: ['https://cdn.example/a.png', 'https://cdn.example/b.png'],
      primaryUrl: 'https://cdn.example/primary.png',
    })
    expect(planned.model).toBe('nano-banana-2-edit')
    expect(planned.imageUrls).toEqual([
      'https://cdn.example/primary.png',
      'https://cdn.example/a.png',
      'https://cdn.example/b.png',
    ])
  })
})