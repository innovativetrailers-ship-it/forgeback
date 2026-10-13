import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '@/lib/fal/client'
const falSubscribe = falSubscribeBound('lib.character.anime')
import type { FCCCharacter } from './fccSchema'
import { buildModificationPrompt } from './identityLock'
import type { AnimeStyle } from './characterMotion'

const ANIME_STYLE_PROMPTS: Record<AnimeStyle, string> = {
  shonen: 'shonen anime style, clean linework, vibrant colours',
  seinen: 'seinen anime, detailed realistic anime aesthetic',
  cell_shade: 'cel-shaded 3D anime, clean outlines',
}

function extractVideoUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const video = d.video as { url?: string } | undefined
  if (video?.url) return video.url
  if (typeof d.video_url === 'string') return d.video_url
  return null
}

export async function animeTransformVideo(
  videoUrl: string,
  style: AnimeStyle,
  character: FCCCharacter,
): Promise<string> {
  const mod = buildModificationPrompt(character.appearance)
  const result = await falSubscribe(falEndpoint('pixverse/v5.5/video-to-video'), {
    input: {
      video_url: videoUrl,
      prompt: `${ANIME_STYLE_PROMPTS[style]}, ${mod}`,
      style_strength: 0.75,
    },
  })
  const url = extractVideoUrl(result.data)
  if (!url) throw new Error('Anime transform returned no video.')
  return url
}
