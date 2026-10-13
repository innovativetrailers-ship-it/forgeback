/** Live fal llms.txt 2026-10-04. 20 credits per dollar. */

export const MULTI_VIDEO_LIMIT =
  'Several whole video clips are not a native reference. Use one clip plus stills (Wan VACE), or generate each clip and composite it.'

const ELEMENTS_USD_PER_SEC = 0.056
const REFERENCE_USD_PER_SEC = 0.112
const REFERENCE_4K_USD_PER_SEC = 0.42
const VACE_USD_PER_SEC = { '480p': 0.04, '580p': 0.06, '720p': 0.08 } as const

export type ReferenceTier = 'standard' | '4k'
export type VaceResolution = keyof typeof VACE_USD_PER_SEC
export type MultiMode = 'elements' | 'reference' | 'condition'

export const ELEMENTS_KEY = 'kling-video/v1.6/standard/elements'
export const REFERENCE_KEY = 'kling-video/o1/reference-to-video'
export const REFERENCE_4K_KEY = 'kling-video/o3/4k/reference-to-video'
export const VACE_KEY = 'wan-vace-14b/inpainting'

function creditsForRate(seconds: number, usdPerSecond: number): number {
  const cents = Math.round(seconds * usdPerSecond * 100)
  return Math.max(1, Math.ceil(cents / 5))
}

function httpUrls(urls: string[]): string[] {
  return urls.map((url) => url.trim()).filter((url) => url.startsWith('http'))
}

export function quoteMultiRef(args: {
  mode: MultiMode
  seconds: number
  tier?: ReferenceTier
  resolution?: VaceResolution
}): number {
  const seconds = args.seconds
  if (!Number.isFinite(seconds) || seconds < 1) throw new Error('Duration must be at least 1 second')
  if (args.mode === 'elements') {
    if (seconds !== 5 && seconds !== 10) throw new Error('Kling Elements duration is 5 or 10 seconds')
    return creditsForRate(seconds, ELEMENTS_USD_PER_SEC)
  }
  if (args.mode === 'reference') {
    const tier = args.tier === '4k' ? '4k' : 'standard'
    const max = tier === '4k' ? 15 : 10
    if (seconds < 3 || seconds > max) throw new Error(`Reference-to-video duration is 3–${max} seconds`)
    return creditsForRate(seconds, tier === '4k' ? REFERENCE_4K_USD_PER_SEC : REFERENCE_USD_PER_SEC)
  }
  const resolution = args.resolution ?? '480p'
  if (!(resolution in VACE_USD_PER_SEC)) throw new Error('Wan VACE resolution is 480p, 580p, or 720p')
  return creditsForRate(Math.ceil(seconds), VACE_USD_PER_SEC[resolution])
}

export function buildElementsInput(prompt: string, imageUrls: string[], seconds: number): Record<string, unknown> {
  const urls = httpUrls(imageUrls)
  if (urls.length < 2 || urls.length > 4) throw new Error('Kling Elements combines 2 to 4 reference images')
  if (seconds !== 5 && seconds !== 10) throw new Error('Kling Elements duration is 5 or 10 seconds')
  const text = prompt.trim()
  if (text.length < 3) throw new Error('A prompt is required')
  return {
    prompt: text.slice(0, 2500),
    input_image_urls: urls,
    duration: String(seconds),
    aspect_ratio: '16:9',
  }
}

export function buildReferenceInput(
  prompt: string,
  imageUrl: string,
  seconds: number,
  tier: ReferenceTier,
): { key: string; input: Record<string, unknown> } {
  const url = imageUrl.trim()
  if (!url.startsWith('http')) throw new Error('Reference-to-video needs one image')
  const text = prompt.trim()
  if (text.length < 3) throw new Error('A prompt is required')
  const tagged = text.includes('@Image1') ? text : `${text} @Image1`
  if (tier === '4k') {
    if (seconds < 3 || seconds > 15) throw new Error('Reference-to-video duration is 3–15 seconds')
    return {
      key: REFERENCE_4K_KEY,
      input: {
        prompt: tagged.slice(0, 2500),
        image_urls: [url],
        duration: String(seconds),
        aspect_ratio: '16:9',
        generate_audio: false,
      },
    }
  }
  if (seconds < 3 || seconds > 10) throw new Error('Reference-to-video duration is 3–10 seconds')
  return {
    key: REFERENCE_KEY,
    input: {
      prompt: tagged.slice(0, 2500),
      image_urls: [url],
      duration: String(seconds),
      aspect_ratio: '16:9',
    },
  }
}

export function buildConditionInput(args: {
  prompt: string
  videoUrl: string
  imageUrls: string[]
  maskUrl?: string
  resolution?: VaceResolution
}): Record<string, unknown> {
  const videoUrl = args.videoUrl.trim()
  if (!videoUrl.startsWith('http')) throw new Error('Video conditioning needs one clip')
  const images = httpUrls(args.imageUrls)
  if (!images.length) throw new Error('Video conditioning needs at least one reference image')
  const text = args.prompt.trim()
  if (text.length < 3) throw new Error('A prompt is required')
  const resolution = args.resolution ?? '480p'
  const input: Record<string, unknown> = {
    prompt: text.slice(0, 2500),
    video_url: videoUrl,
    ref_image_urls: images,
    resolution,
    enable_prompt_expansion: false,
  }
  const mask = args.maskUrl?.trim()
  if (mask?.startsWith('http')) input.mask_image_url = mask
  return input
}

export function videoUrlOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const row = data as { video?: { url?: string } }
  return typeof row.video?.url === 'string' && row.video.url.trim() ? row.video.url : null
}
