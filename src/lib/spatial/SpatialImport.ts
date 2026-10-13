export type SpatialFormat = 'mv-hevc' | 'sbs-3d' | 'tab-3d' | '2d'

export interface SpatialMetadata {
  format: SpatialFormat
  fov: number          // degrees
  baseline: number     // metres (inter-ocular distance)
  stereoOffset: number
  width: number
  height: number
  fps: number
}

export interface SpatialClipData {
  sourceUrl: string
  format: SpatialFormat
  metadata: SpatialMetadata
  isCompatibleWithVisionPro: boolean
}

export function detectSpatialFormat(url: string): SpatialFormat {
  const lower = url.toLowerCase()
  if (lower.includes('.mv-hevc') || lower.includes('spatial') || lower.includes('apple_immersive')) return 'mv-hevc'
  if (lower.includes('_sbs') || lower.includes('-sbs') || lower.includes('side.by.side')) return 'sbs-3d'
  if (lower.includes('_tab') || lower.includes('-tab') || lower.includes('top.and.bottom')) return 'tab-3d'
  return '2d'
}

export function extractSpatialMetadata(url: string): SpatialMetadata {
  const format = detectSpatialFormat(url)
  // TODO: In production, use ffprobe to extract actual metadata from the file.
  return {
    format,
    fov: 90,
    baseline: 0.063,  // standard iPhone inter-ocular distance
    stereoOffset: 0,
    width: 1920,
    height: 1080,
    fps: 30,
  }
}

export function importSpatialClip(url: string): SpatialClipData {
  const format = detectSpatialFormat(url)
  const metadata = extractSpatialMetadata(url)
  return {
    sourceUrl: url,
    format,
    metadata,
    isCompatibleWithVisionPro: format === 'mv-hevc' || format === 'sbs-3d',
  }
}
