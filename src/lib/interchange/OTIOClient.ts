import type { TimelineRecipe } from '../timeline/schema'

export type InterchangeFormat = 'edl' | 'fcpxml' | 'aaf' | 'resolve_xml' | 'otioz'

const OTIO_SERVICE = process.env.OTIO_SERVICE_URL ?? 'http://localhost:7432'

export async function exportTimeline(params: {
  recipe: TimelineRecipe
  format: InterchangeFormat
}): Promise<Buffer> {
  const response = await fetch(`${OTIO_SERVICE}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeline: params.recipe,
      format: params.format,
    }),
  })
  if (!response.ok) {
    const err = await response.text().catch((err) => {
      console.warn("[caught] src/lib/interchange/OTIOClient.ts:20", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (response.statusText)
    })
    throw new Error(`OTIO export failed: ${err}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

export async function importTimeline(file: Blob, filename: string): Promise<TimelineRecipe> {
  const formData = new FormData()
  formData.append('file', file, filename)
  const response = await fetch(`${OTIO_SERVICE}/import`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    const err = await response.text().catch((err) => {
      console.warn("[caught] src/lib/interchange/OTIOClient.ts:34", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (response.statusText)
    })
    throw new Error(`OTIO import failed: ${err}`)
  }
  return response.json() as Promise<TimelineRecipe>
}

export async function checkOTIOHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OTIO_SERVICE}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch (err) {
    console.warn("[caught] src/lib/interchange/OTIOClient.ts:44", err instanceof Error ? { name: err.name, message: err.message } : err)

    return false
  }
}
