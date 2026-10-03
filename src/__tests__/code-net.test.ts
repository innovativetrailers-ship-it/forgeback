import {
  asArray,
  asRecord,
  KLING_V3_IMAGE,
  KLING_V3_TEXT,
  parseJsonObject,
  payloadFitsSchema,
  shotMode,
  resolveEndpoint,
  capPromptText,
  interpretErrorRules,
  selectReferences,
  composeSeedanceReference,
  buildSeedancePayload,
  SEEDANCE_CAPS,
  SEEDANCE_FIELDS,
  SEEDANCE_ENDPOINTS,
  seedanceModeModel,
  type ModeModel,
  type ModeShot,
} from '@cinema/core'

describe('code net — undefined.map class', () => {
  it('asArray turns missing into [] so .map does not throw', () => {
    expect(asArray(undefined).map((n) => n)).toEqual([])
    expect(asArray(null).length).toBe(0)
    expect(asArray([1, 2]).length).toBe(2)
  })

  it('asRecord turns missing into {}', () => {
    expect(asRecord(undefined)).toEqual({})
    expect(asRecord('x')).toEqual({})
    expect(asRecord({ a: 1 }).a).toBe(1)
  })
})

describe('code net — boundary JSON', () => {
  it('parseJsonObject fails loud on malformed LLM text', () => {
    expect(() => parseJsonObject('not json', 'llm')).toThrow(/not a JSON object/)
  })

  it('parseJsonObject extracts a fenced object', () => {
    expect(parseJsonObject('```json\n{"onIntent":true}\n```')).toEqual({ onIntent: true })
  })
})

describe('code net — shotMode / resolveEndpoint', () => {
  const model: ModeModel = {
    id: 'seedance-2.0',
    provider: 'fal',
    endpoints: SEEDANCE_ENDPOINTS,
    fields: SEEDANCE_FIELDS,
    limits: { maxPromptChars: 0 },
    nativeAudio: true,
  }

  it('reference shotMode when characterIds are present', () => {
    expect(shotMode({ prompt: 'Maya walks', characterIds: ['c1'] })).toBe('reference')
  })

  it('text shotMode when there is no subject to condition on', () => {
    expect(shotMode({ prompt: 'rain on the window' })).toBe('text')
  })

  it('resolveEndpoint keeps the reference endpoint', () => {
    const shot: ModeShot = { prompt: 'Maya walks', characterIds: ['c1'] }
    const resolved = resolveEndpoint(model, shot, [model])
    expect(resolved.mode).toBe('reference')
    expect(resolved.endpoint).toBe(SEEDANCE_ENDPOINTS.reference)
  })

  it('a keyframe on Seedance stays reference-to-video', () => {
    const shot: ModeShot = {
      prompt: 'Maya walks',
      characterIds: ['c1'],
      anchorFrameUrl: 'https://example.com/key.jpg',
    }
    const resolved = resolveEndpoint(model, shot, [model])
    expect(resolved.mode).toBe('reference')
    expect(resolved.endpoint).toBe(SEEDANCE_ENDPOINTS.reference)
  })

  it('a keyframe on Kling uses image-to-video, not text-to-video', () => {
    const kling: ModeModel = {
      ...model,
      id: 'kling-3.0',
      endpoints: {
        text: KLING_V3_TEXT,
        first_frame: KLING_V3_IMAGE,
        reference: KLING_V3_IMAGE,
      },
    }
    const shot: ModeShot = {
      prompt: 'Maya walks',
      characterIds: ['c1'],
      anchorFrameUrl: 'https://example.com/key.jpg',
    }
    const resolved = resolveEndpoint(kling, shot, [kling])
    expect(resolved.mode).toBe('first_frame')
    expect(resolved.endpoint).toBe(KLING_V3_IMAGE)
    expect(resolved.endpoint).not.toBe(kling.endpoints.text)
  })
})

describe('code net — capToLength', () => {
  it('shortens on a word boundary', () => {
    expect(capPromptText('one two three four', 10)).toBe('one two')
  })
})

describe('code net — interpreter', () => {
  it('maps undefined.map crashes to code_error', () => {
    const hit = interpretErrorRules("Cannot read properties of undefined (reading 'map')")
    expect(hit.category).toBe('code_error')
  })
})

describe('code net — zod boundary', () => {
  it('rejects a malformed quality check', async () => {
    const { parseBoundary, qualityChecksSchema } = await import('@/lib/diagnostics/boundary')
    expect(() => parseBoundary(qualityChecksSchema, { onIntent: 'yes' }, 'quality')).toThrow(/quality/)
  })

  it('accepts a valid quality check', async () => {
    const { parseBoundary, qualityChecksSchema } = await import('@/lib/diagnostics/boundary')
    expect(parseBoundary(qualityChecksSchema, { onIntent: true, artifacts: false }, 'quality').onIntent).toBe(true)
  })
})

describe('code net — Seedance reference contract (offline)', () => {
  const schema = {
    required: ['prompt'],
    properties: [
      'prompt',
      'image_urls',
      'video_urls',
      'audio_urls',
      'duration',
      'resolution',
      'aspect_ratio',
      'generate_audio',
    ],
    enums: {
      duration: ['auto', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'],
      resolution: ['480p', '720p', '1080p', '4k'],
    },
  }

  it('selectReferences stays ≤12 files and tags @ImageN', () => {
    const extras = Array.from({ length: 20 }, (_, i) => ({
      url: `https://example.com/extra-${i}.jpg`,
      bucket: 'image' as const,
      role: 'character' as const,
    }))
    const composition = selectReferences([
      { url: 'https://example.com/maya.jpg', label: 'Maya', bucket: 'image', role: 'character', primary: true },
      { url: 'https://example.com/line.mp3', label: "Maya's line", bucket: 'audio', role: 'dialogue' },
      { url: 'https://example.com/move.mp4', label: 'motion', bucket: 'video', role: 'motion_ref' },
      ...extras,
    ])
    const total = composition.images.length + composition.videos.length + composition.audios.length
    expect(total).toBeLessThanOrEqual(SEEDANCE_CAPS.total)
    expect(composition.images[0]?.tag).toBe('@Image1')
    const composed = composeSeedanceReference({ prompt: 'Maya walks the diner', composition })
    expect(composed.prompt).toContain('@Image1')
    expect(composed.image_urls.length + composed.video_urls.length + composed.audio_urls.length).toBeLessThanOrEqual(12)
  })

  it('buildSeedancePayload reference fits the OpenAPI field set', () => {
    const composition = selectReferences([
      { url: 'https://example.com/maya.jpg', label: 'Maya', bucket: 'image', role: 'character', primary: true },
    ])
    const payload = buildSeedancePayload({
      mode: 'reference',
      prompt: 'Maya walks the diner',
      durationSec: 5,
      composition,
    })
    const report = payloadFitsSchema(payload, schema)
    expect(report.ok).toBe(true)
    expect(payload.generate_audio).toBe(false)
    expect(seedanceModeModel().id).toBe('seedance-2.0')
  })
})
