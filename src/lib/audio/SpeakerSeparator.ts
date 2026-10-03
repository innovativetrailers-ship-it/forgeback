/**
 * Speaker separation engine (F09).
 * Calls fal.ai audio-separator to decompose mixed audio into stems.
 */
import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '@/lib/fal/client'
const falSubscribe = falSubscribeBound('lib.audio.SpeakerSeparator')
import { randomUUID } from 'crypto'
import { uploadToR2 } from '@/lib/storage/r2'

export interface SeparatedStem {
  label: string
  url: string
}

export interface SeparationResult {
  stems: SeparatedStem[]
}

interface FalStemEntry {
  label?: string
  url: string
}

function isFalStemEntry(v: unknown): v is FalStemEntry {
  if (typeof v !== 'object' || v === null) return false
  return typeof (v as Record<string, unknown>).url === 'string'
}

interface FalSeparationResponse {
  stems: FalStemEntry[]
}

function isFalSeparationResponse(v: unknown): v is FalSeparationResponse {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return Array.isArray(o.stems) && (o.stems as unknown[]).every(isFalStemEntry)
}

const DEFAULT_LABELS = ['voice_1', 'voice_2', 'background_music', 'ambient'] as const

export async function separateSpeakers(audioUrl: string, userId: string): Promise<SeparationResult> {
  if (!audioUrl) throw new Error('[SpeakerSeparator] audioUrl is required')

  let falResult: unknown
  try {
    falResult = await falSubscribe(falEndpoint('audio-separator'), {
      input: { audio_url: audioUrl },
      pollInterval: 2000,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'fal.ai call failed'
    throw new Error(`[SpeakerSeparator] Separation failed: ${message}`)
  }

  if (!isFalSeparationResponse(falResult)) {
    throw new Error('[SpeakerSeparator] Unexpected fal.ai response shape')
  }

  const batchId = randomUUID()
  const stems: SeparatedStem[] = []

  for (let i = 0; i < falResult.stems.length; i++) {
    const falStem = falResult.stems[i]
    const label = falStem.label ?? DEFAULT_LABELS[i] ?? `stem_${i}`

    const response = await fetch(falStem.url)
    if (!response.ok) throw new Error(`[SpeakerSeparator] Failed to fetch stem "${label}": HTTP ${response.status}`)

    const buffer = Buffer.from(await response.arrayBuffer())
    const r2Key = `stems/${userId}/${batchId}/${label}.wav`
    const r2Url = await uploadToR2(buffer, r2Key, 'audio/wav')
    stems.push({ label, url: r2Url })
  }

  return { stems }
}
