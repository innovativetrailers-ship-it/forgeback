import {
  buildConditionInput,
  buildElementsInput,
  buildReferenceInput,
  MULTI_VIDEO_LIMIT,
  quoteMultiRef,
} from '@/lib/studio/multiReference'

describe('multi-reference generation', () => {
  it('prices the live per-second rates and builds each mode', () => {
    expect(quoteMultiRef({ mode: 'elements', seconds: 5 })).toBe(6)
    expect(quoteMultiRef({ mode: 'elements', seconds: 10 })).toBe(12)
    expect(quoteMultiRef({ mode: 'reference', seconds: 5 })).toBe(12)
    expect(quoteMultiRef({ mode: 'reference', seconds: 5, tier: '4k' })).toBe(42)
    expect(quoteMultiRef({ mode: 'condition', seconds: 5, resolution: '480p' })).toBe(4)
    expect(quoteMultiRef({ mode: 'condition', seconds: 5, resolution: '720p' })).toBe(8)

    const elements = buildElementsInput('two people in the street', ['https://a.example/1.png', 'https://a.example/2.png'], 5)
    expect(elements.input_image_urls).toHaveLength(2)
    expect(elements.duration).toBe('5')

    const standard = buildReferenceInput('a person walks', 'https://a.example/1.png', 5, 'standard')
    expect(standard.key).toBe('kling-video/o1/reference-to-video')
    expect(standard.input.image_urls).toEqual(['https://a.example/1.png'])
    expect(standard.input.generate_audio).toBeUndefined()
    expect(String(standard.input.prompt)).toContain('@Image1')

    const fourK = buildReferenceInput('a person walks', 'https://a.example/1.png', 5, '4k')
    expect(fourK.input.generate_audio).toBe(false)

    const vace = buildConditionInput({
      prompt: 'keep the motion',
      videoUrl: 'https://a.example/clip.mp4',
      imageUrls: ['https://a.example/1.png'],
      resolution: '480p',
    })
    expect(vace.video_url).toBe('https://a.example/clip.mp4')
    expect(vace.ref_image_urls).toEqual(['https://a.example/1.png'])
    expect(vace.enable_prompt_expansion).toBe(false)
    expect(MULTI_VIDEO_LIMIT).toMatch(/not a native reference/)
    expect(() => buildElementsInput('two people', ['https://a.example/1.png'], 5)).toThrow(/2 to 4/)
  })
})