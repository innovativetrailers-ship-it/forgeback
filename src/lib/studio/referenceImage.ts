/** Registry cap for nano-banana-2 edit image_urls. Live schema has no maxItems; the catalog cap is 14. */
export const REFERENCE_IMAGE_CAP = 14

export function referenceImagePlan(input: {
  uploads: string[]
  primaryUrl?: string | null
}): { model: 'flux/dev' | 'nano-banana-2-edit'; imageUrls: string[]; capped: boolean } {
  const urls = [input.primaryUrl ?? '', ...input.uploads]
    .map((url) => url.trim())
    .filter((url) => url.startsWith('http'))
  const unique = [...new Set(urls)]
  if (!unique.length) return { model: 'flux/dev', imageUrls: [], capped: false }
  return {
    model: 'nano-banana-2-edit',
    imageUrls: unique.slice(0, REFERENCE_IMAGE_CAP),
    capped: unique.length > REFERENCE_IMAGE_CAP,
  }
}
