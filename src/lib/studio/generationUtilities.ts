/** Live fal llms.txt 2026-10-04. Flux Dev is $0.025 per megapixel. SAM 3D Objects is $0.02 per reconstruction. 20 credits per dollar. */
const CREDITS_PER_DOLLAR = 20

export function creditsForUsd(usd: number): number {
  return Math.max(1, Math.ceil(usd * CREDITS_PER_DOLLAR))
}

export const AERIAL_CREDITS = creditsForUsd(0.025)
export const MESH_CREDITS = creditsForUsd(0.02)

export function aerialPrompt(place: string): string {
  const name = place.trim()
  if (name.length < 3) throw new Error('Name the place for the aerial plate')
  return `Aerial satellite establishing photograph of ${name}, nadir and slight oblique, photoreal terrain and buildings, no labels, no text, no watermark`
}
