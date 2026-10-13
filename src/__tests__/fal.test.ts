// Mock the fal client
jest.mock('../lib/fal/client', () => ({
  runFal: jest.fn(),
  fal: {
    queue: {
      submit: jest.fn(),
      status: jest.fn(),
      result: jest.fn(),
    },
    subscribe: jest.fn(),
  },
}))

import { runFal } from '../lib/fal/client'
import { relightScene, generateDepthMapFromUrl, generateNormalMap } from '../lib/fal/lighting'
import { upscaleImage, removeBackground } from '../lib/fal/enhancement'
import { buildIPAdapterPayload } from '../lib/fal/character'

const mockRunFal = runFal as jest.MockedFunction<typeof runFal>

describe('fal/lighting', () => {
  beforeEach(() => jest.clearAllMocks())

  it('relightScene calls ic-light and returns outputUrl', async () => {
    mockRunFal.mockResolvedValue({ images: [{ url: 'https://r2.example.com/relit.jpg' }] })

    const result = await relightScene({
      imageUrl: 'https://example.com/input.jpg',
      prompt: 'neon lights from left',
    })

    expect(mockRunFal).toHaveBeenCalledWith(expect.stringContaining('iclight'), expect.any(Object))
    expect(result.outputUrl).toBe('https://r2.example.com/relit.jpg')
  })

  it('generateDepthMapFromUrl calls depth-anything and returns depthUrl', async () => {
    mockRunFal.mockResolvedValue({ image: { url: 'https://r2.example.com/depth.jpg' } })

    const result = await generateDepthMapFromUrl('https://example.com/input.jpg')
    expect(result.depthUrl).toBe('https://r2.example.com/depth.jpg')
  })
})

describe('fal/enhancement', () => {
  beforeEach(() => jest.clearAllMocks())

  it('upscaleImage returns upscaledUrl', async () => {
    mockRunFal.mockResolvedValue({ image: { url: 'https://r2.example.com/upscaled.jpg' } })

    const result = await upscaleImage('https://example.com/input.jpg', 'aura-sr')
    expect(result.upscaledUrl).toBeTruthy()
  })

  it('removeBackground returns maskedUrl', async () => {
    mockRunFal.mockResolvedValue({ image: { url: 'https://r2.example.com/rembg.png' } })

    const result = await removeBackground('https://example.com/input.jpg')
    expect(result.maskedUrl).toBeTruthy()
  })
})

describe('fal/character', () => {
  it('buildIPAdapterPayload with references returns ip_adapter_image_url', () => {
    const payload = buildIPAdapterPayload(['https://example.com/face1.jpg'])
    expect(payload.ip_adapter_image_url).toBe('https://example.com/face1.jpg')
    expect(payload.ip_adapter_scale).toBe(0.7)
  })

  it('buildIPAdapterPayload with loraId includes lora_url', () => {
    const payload = buildIPAdapterPayload(['https://example.com/face.jpg'], 'https://lora.com/model.safetensors')
    expect(payload.lora_url).toBe('https://lora.com/model.safetensors')
    expect(payload.lora_scale).toBe(0.85)
  })

  it('buildIPAdapterPayload with empty references returns empty object', () => {
    const payload = buildIPAdapterPayload([])
    expect(payload.ip_adapter_image_url).toBeUndefined()
  })
})
