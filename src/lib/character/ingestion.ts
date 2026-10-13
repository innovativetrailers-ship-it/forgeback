// V2 — photo / text ingestion for VaultCharacter (FAL schemas aligned to fal.ai docs).

import { falEndpoint } from '@cinema/core/endpoints'
import { safeFetch } from '@/lib/net/safeFetch'
import { hasFalKey } from '@/lib/config/keys'
import { claudeCall, claudeText } from '@/lib/llm/anthropicClient'
import { runFal, uploadToFal } from '@/lib/fal/client'
import { generateImage } from '@/lib/engines/imageGen'
import { defaultAppearance, type CharacterAppearance } from './fccSchema'

const INSTANT_CHARACTER_ENDPOINT = falEndpoint('instant-character')

export class CharacterIngestionError extends Error {
  readonly code = 'INGESTION_FAILED' as const
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = 'CharacterIngestionError'
    this.details = details
  }
}

/** Deterministic unit vector so vault rows satisfy hasFcc without a dedicated embed API. */
function referenceIdentityEmbedding(seed: string, dims = 512): number[] {
  const out = new Array<number>(dims).fill(0)
  for (let i = 0; i < seed.length; i++) {
    out[i % dims] += seed.charCodeAt(i) / 255
  }
  const norm = Math.hypot(...out) || 1
  return out.map((v) => v / norm)
}

/** Re-upload to FAL storage when R2 URLs may be private or unreachable from FAL workers. */
export async function ensureFalImageUrl(
  sourceUrl: string,
  buffer?: Buffer,
): Promise<string> {
  if (buffer?.length) {
    return uploadToFal(buffer)
  }
  if (/fal\.media|fal\.run|falcdn/i.test(sourceUrl)) {
    return sourceUrl
  }
  const res = await safeFetch(sourceUrl, [])
  if (!res.ok) throw new CharacterIngestionError(`The reference image could not be fetched (${res.status})`)
  return uploadToFal(Buffer.from(await res.arrayBuffer()))
}

async function analyseAppearanceWithClaude(imageUrl: string): Promise<CharacterAppearance> {
  if (!hasFalKey()) return defaultAppearance()
  try {
    const message = await claudeCall({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            {
              type: 'text',
              text: "Analyse appearance. Return JSON: skinTone, melanin, structuralAge, muscularityPct, bodyFatIndex, hairLength, wrinkleFreq. Only JSON.",
            },
          ],
        },
      ],
    }, { source: 'character.ingest' })
    const text = claudeText(message) || '{}'
    return { ...defaultAppearance(), ...JSON.parse(text.replace(/```json|```/g, '').trim()) }
  } catch (err) {
    console.warn("[caught] src/lib/character/ingestion.ts:72", err instanceof Error ? { name: err.name, message: err.message } : err)

    return defaultAppearance()
  }
}

export interface PhotoIngestResult {
  faceEmbedding: number[]
  bodyEmbedding: number[]
  appearance: CharacterAppearance
  /** FAL-reachable primary portrait used for identity lock */
  primaryFalUrl: string
}

/**
 * Text-only → Nano Banana Pro plate. Photo → optional instant-character sheet (I2I).
 */
export async function generateCharacterPlate(input: {
  name: string
  description: string
  referencePhotoUrl?: string
}): Promise<{ url: string; seed: number }> {
  const desc = input.description.trim()
  if (!desc) {
    throw new CharacterIngestionError('Character description is required for text-only creation')
  }

  const seed = Math.floor(Math.random() * 2_147_483_647)

  if (input.referencePhotoUrl) {
    const falUrl = await ensureFalImageUrl(input.referencePhotoUrl)
    try {
      const result = await runFal<{ images?: Array<{ url: string }>; seed?: number }>(
        INSTANT_CHARACTER_ENDPOINT,
        {
          prompt: `${desc}, character reference sheet, neutral pose, studio lighting, ${input.name}`,
          image_url: falUrl,
          image_size: 'portrait_4_3',
          negative_prompt: 'blur, distortion, multiple people, watermark',
          num_images: 1,
          seed,
        },
      )
      const sheetUrl = result.images?.[0]?.url
      return { url: sheetUrl ?? falUrl, seed: typeof result.seed === 'number' ? result.seed : seed }
    } catch (err) {
      const details = err instanceof Error ? err.message : err
      throw new CharacterIngestionError(
        'Instant-character rejected the reference photo',
        details,
      )
    }
  }

  const [plateUrl] = await generateImage(
    `Character reference: ${input.name}. ${desc}. Full body, neutral pose, ` +
    'studio lighting, plain background, character sheet style.',
    { quality: 'production', aspectRatio: '3:4', seed },
  )
  if (!plateUrl) {
    throw new CharacterIngestionError('Failed to generate character reference plate from description')
  }
  return { url: plateUrl, seed }
}

export async function ingestPhotoReferences(
  referenceUrls: string[],
  imageBuffers?: Buffer[],
): Promise<PhotoIngestResult> {
  if (referenceUrls.length === 0) {
    throw new CharacterIngestionError('At least one reference image required')
  }

  const primary = await ensureFalImageUrl(referenceUrls[0], imageBuffers?.[0])
  const appearance = await analyseAppearanceWithClaude(primary)

  return {
    faceEmbedding: referenceIdentityEmbedding(primary),
    bodyEmbedding: referenceIdentityEmbedding(`${primary}:body`),
    appearance,
    primaryFalUrl: primary,
  }
}

function extractImageUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const images = d.images as Array<{ url?: string }> | undefined
  if (images?.[0]?.url) return images[0].url
  const image = d.image as { url?: string } | undefined
  if (image?.url) return image.url
  return null
}

/** Video URL → appearance + embeddings (uses middle frame as portrait proxy). */
export async function ingestVideoReference(videoUrl: string): Promise<PhotoIngestResult & { frameUrl: string }> {
  const frame = await runFal(falEndpoint('ffmpeg-api/extract-frame'), {
    video_url: videoUrl,
    frame_type: 'middle',
  })
  const frameUrl = extractImageUrl(frame) ?? videoUrl
  const ingested = await ingestPhotoReferences([frameUrl])
  return { ...ingested, frameUrl }
}

/** Sketch data URL + prompts → rendered portrait → photo ingest. */
export async function ingestSketchReference(
  sketchDataUrl: string,
  prompts: string[],
): Promise<PhotoIngestResult & { portraitUrl: string }> {
  const list = prompts.length > 0 ? prompts : ['photorealistic character portrait']
  let portraitUrl = sketchDataUrl
  try {
    const gen = await runFal(falEndpoint('flux/dev'), { prompt: list[0] })
    portraitUrl = extractImageUrl(gen) ?? sketchDataUrl
  } catch (err) {
    console.warn("[caught] src/lib/character/ingestion.ts:186", err instanceof Error ? { name: err.name, message: err.message } : err)

    portraitUrl = sketchDataUrl
  }
  for (let i = 1; i < list.length; i++) {
    try {
      const refined = await runFal(falEndpoint('flux/dev'), {
        prompt: `${list[i]}, maintain exact same character`,
      })
      portraitUrl = extractImageUrl(refined) ?? portraitUrl
    } catch (err) {
      console.warn("[caught] src/lib/character/ingestion.ts:195", err instanceof Error ? { name: err.name, message: err.message } : err)

      // keep last good portrait
    }
  }
  const ingested = await ingestPhotoReferences([portraitUrl])
  return { ...ingested, portraitUrl }
}
