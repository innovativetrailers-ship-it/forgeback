import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '@/lib/fal/client'
const falSubscribe = falSubscribeBound('lib.character.roto')
import { UTILITY_FAL_ENDPOINTS } from '@/lib/models/registry'
import type { FCCCharacter } from './fccSchema'
import { animatePortraitWithMotion } from './mocap'
import type { FccRotoMode } from './characterMotion'

function extractVideoUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const video = d.video as { url?: string } | undefined
  if (video?.url) return video.url
  if (typeof d.video_url === 'string') return d.video_url
  return null
}

function extractMaskVideoUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const maskVideo = d.mask_video as { url?: string } | undefined
  if (maskVideo?.url) return maskVideo.url
  if (typeof d.mask_url === 'string') return d.mask_url
  return null
}

export async function rotoAndOverlay(
  liveVideoUrl: string,
  mode: FccRotoMode,
  character?: FCCCharacter,
): Promise<string> {
  const rembgEndpoint = UTILITY_FAL_ENDPOINTS['rembg-video']
  const inpaintEndpoint = UTILITY_FAL_ENDPOINTS['video-inpaint']

  const rotoResult = await falSubscribe(rembgEndpoint, {
    input: { video_url: liveVideoUrl, output_mask: true },
  })
  const maskUrl = extractMaskVideoUrl(rotoResult.data)

  if (mode === 'character' && character?.refFront) {
    const prompt = character.behavioralPrompt || `${character.name} matching live action energy`
    const charUrl = await animatePortraitWithMotion(character.refFront, liveVideoUrl, {
      prompt,
      portraitLabel: character.name,
    })
    const composite = await falSubscribe(inpaintEndpoint, {
      input: {
        prompt,
        video_url: liveVideoUrl,
        mask_video_url: maskUrl ?? undefined,
        ref_image_urls: [character.refFront],
        first_frame_url: charUrl,
      },
    })
    const out = extractVideoUrl(composite.data)
    if (!out) throw new Error('Roto composite returned no video.')
    return out
  }

  if (mode === 'aura') {
    const glow = await falSubscribe(falEndpoint('video-upscaler'), {
      input: { video_url: liveVideoUrl, scale: 1 },
    })
    const out = extractVideoUrl(glow.data) ?? liveVideoUrl
    return out
  }

  const vfx = await falSubscribe(inpaintEndpoint, {
    input: {
      prompt: 'Cinematic visual effects enhancement in the masked region',
      video_url: liveVideoUrl,
      mask_video_url: maskUrl ?? undefined,
    },
  })
  const out = extractVideoUrl(vfx.data)
  if (!out) throw new Error('VFX overlay returned no video.')
  return out
}
