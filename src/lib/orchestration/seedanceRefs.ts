import type { PatientZeroAssets } from './types'

export function seedanceAssetRefs(
  shot: { charactersPresent?: string[]; locationsPresent?: string[] },
  assets: PatientZeroAssets,
): { url: string; label?: string; role: 'character' | 'location'; primary?: boolean }[] {
  const images: { url: string; label?: string; role: 'character' | 'location'; primary?: boolean }[] = []
  let primaryTaken = false
  for (const name of shot.charactersPresent ?? []) {
    const found = (assets.characters ?? []).find((character) => character.name === name)
    const url = found?.imageUrl?.trim()
    if (!url) continue
    const primary = !primaryTaken
    primaryTaken = true
    images.push({ url, label: name, role: 'character', primary })
  }
  for (const name of shot.locationsPresent ?? []) {
    const found = (assets.locations ?? []).find((location) => location.name === name)
    const url = found?.imageUrl?.trim()
    if (url) images.push({ url, label: name, role: 'location' })
  }
  return images
}
