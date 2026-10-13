/**
 * Dolby Atmos spatial audio mixer (F07).
 * Manages bed (7.1.2) + object channels; queues BullMQ export job.
 */
import { randomUUID } from 'crypto'
import { renderQueue } from '@/lib/queue'

export interface AtmosObject {
  trackId: string
  x: number  // -1 to 1
  y: number
  z: number
}

export interface AtmosBed {
  channels: '7.1.2'
  tracks: string[]
}

export interface AtmosExportParams {
  beds: AtmosBed[]
  objects: AtmosObject[]
  outputPath: string
}

export interface AtmosExportResult {
  outputUrl: string
  jobId: string
  channelCount: number
}

export interface AtmosJobPayload {
  jobId: string
  beds: AtmosBed[]
  objects: AtmosObject[]
  outputR2Key: string
  metadataXml: string
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildAtmosMetadataXml(beds: AtmosBed[], objects: AtmosObject[]): string {
  const bedEls = beds.map((bed, i) =>
    `  <Bed id="bed_${i}" channels="${bed.channels}">\n` +
    bed.tracks.map((t, j) => `    <Track index="${j}" ref="${escapeXml(t)}"/>`).join('\n') +
    '\n  </Bed>'
  ).join('\n')

  const objEls = objects.map((obj) =>
    `  <Object id="${escapeXml(obj.trackId)}" x="${obj.x.toFixed(3)}" y="${obj.y.toFixed(3)}" z="${obj.z.toFixed(3)}"/>`
  ).join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DolbyAtmosMetadata version="1.0">',
    `  <Program bedCount="${beds.length}" objectCount="${objects.length}"/>`,
    '  <Beds>', bedEls, '  </Beds>',
    '  <Objects>', objEls, '  </Objects>',
    '</DolbyAtmosMetadata>',
  ].join('\n')
}

export async function exportAtmos(params: AtmosExportParams): Promise<AtmosExportResult> {
  const { beds, objects, outputPath } = params

  if (beds.length === 0 && objects.length === 0) throw new Error('[AtmosMixer] At least one bed or object required')

  for (const obj of objects) {
    for (const [axis, val] of [['x', obj.x], ['y', obj.y], ['z', obj.z]] as const) {
      if (val < -1 || val > 1) throw new Error(`[AtmosMixer] Object ${obj.trackId}.${axis} = ${val} out of range (-1 to 1)`)
    }
  }

  const metadataXml = buildAtmosMetadataXml(beds, objects)
  const jobId = `atmos-${randomUUID()}`
  const outputR2Key = `${outputPath}/${jobId}.atmos.wav`
  const payload: AtmosJobPayload = { jobId, beds, objects, outputR2Key, metadataXml }

  try {
    await renderQueue.add('atmos_export', payload, { jobId, priority: 2 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Queue submission failed'
    throw new Error(`[AtmosMixer] Failed to queue Atmos export: ${message}`)
  }

  const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''
  return {
    outputUrl: `${r2PublicUrl}/${outputR2Key}`,
    jobId,
    channelCount: beds.length * 10 + objects.length,
  }
}
