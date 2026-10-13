import { generateImage } from '@/lib/engines/imageGen'
import type { StructuredShot, PatientZeroAssets } from './types'

const ANCHOR_ATTEMPT_MS = 45_000

/**
 * One reference still per unique location, bounded by scene count.
 * A failed or slow plate is skipped. The film continues without it.
 */
export async function buildSceneStyleAnchors(
  shots: StructuredShot[],
  assets: PatientZeroAssets,
  options?: { maxAnchors?: number },
): Promise<Map<string, string>> {
  const anchors = new Map<string, string>()
  const cap = Math.max(0, options?.maxAnchors ?? 8)
  const locationNames = [...new Set((shots ?? []).flatMap((s) => s.locationsPresent ?? []).filter(Boolean))]
  let generated = 0

  for (const name of locationNames) {
    const loc = assets.locations.find((l) => l.name === name)
    if (loc?.imageUrl) {
      anchors.set(name, loc.imageUrl)
      continue
    }
    if (generated >= cap) continue
    generated += 1
    const shot = shots.find((s) => (s.locationsPresent ?? []).includes(name))
    const desc = shot?.visualPrompt ?? name
    try {
      const [url] = await generateImage(
        `Cinematic location plate: ${name}. ${desc}. Establishing colour palette and lighting.`,
        { quality: 'reference', aspectRatio: '16:9', timeoutMs: ANCHOR_ATTEMPT_MS },
      )
      if (url) anchors.set(name, url)
    } catch (err) {
      console.warn(
        '[director] style anchor skipped:',
        name,
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  return anchors
}

export function injectStyleAnchor(
  shot: StructuredShot,
  anchors: Map<string, string>,
): string | undefined {
  const loc = shot.locationsPresent?.[0]
  return loc ? anchors.get(loc) : undefined
}
