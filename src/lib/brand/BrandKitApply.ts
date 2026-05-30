/**
 * BrandKitApply — applies a user's brand kit to a video project.
 * Inserts logo watermark, applies brand colours to MoGRTs, overlays lower thirds.
 */

import { db } from '@/lib/db'

export interface BrandKitConfig {
  id:                string
  name:              string
  primaryColor:      string
  secondaryColor:    string
  accentColor:       string
  fontFamily:        string
  logoUrl?:          string | null
  watermarkUrl?:     string | null
  watermarkPosition: string
  watermarkOpacity:  number
  introClipUrl?:     string | null
  outroClipUrl?:     string | null
}

export async function getBrandKit(userId: string, kitId?: string): Promise<BrandKitConfig | null> {
  const kit = await db.brandKit.findFirst({
    where: kitId
      ? { id: kitId, userId }
      : { userId, isDefault: true },
  })
  return kit
}

export async function listBrandKits(userId: string): Promise<BrandKitConfig[]> {
  return db.brandKit.findMany({
    where:   { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function createBrandKit(
  userId: string,
  data: Omit<BrandKitConfig, 'id'>,
): Promise<BrandKitConfig> {
  // If this is the first kit, make it default
  const existing = await db.brandKit.count({ where: { userId } })

  return db.brandKit.create({
    data: {
      userId,
      name:              data.name,
      primaryColor:      data.primaryColor,
      secondaryColor:    data.secondaryColor,
      accentColor:       data.accentColor,
      fontFamily:        data.fontFamily,
      logoUrl:           data.logoUrl,
      watermarkUrl:      data.watermarkUrl ?? data.logoUrl,
      watermarkPosition: data.watermarkPosition ?? 'bottom-right',
      watermarkOpacity:  data.watermarkOpacity ?? 0.6,
      lowerThirdStyle:   { font: data.fontFamily, color: data.primaryColor },
      introClipUrl:      data.introClipUrl,
      outroClipUrl:      data.outroClipUrl,
      isDefault:         existing === 0,
    },
  })
}

/**
 * Generate FFmpeg filter args to apply brand watermark to a video.
 * Returns the overlay filter string for use in FFmpeg complex filter.
 */
export function buildWatermarkFilter(kit: BrandKitConfig, videoWidth = 1920, videoHeight = 1080): string {
  if (!kit.watermarkUrl) return ''

  const padding = 20
  const logoSize = Math.round(videoWidth * 0.12) // 12% of width

  const positions: Record<string, string> = {
    'top-left':      `x=${padding}:y=${padding}`,
    'top-right':     `x=W-w-${padding}:y=${padding}`,
    'bottom-left':   `x=${padding}:y=H-h-${padding}`,
    'bottom-right':  `x=W-w-${padding}:y=H-h-${padding}`,
    'center':        `x=(W-w)/2:y=(H-h)/2`,
  }

  const pos = positions[kit.watermarkPosition] ?? positions['bottom-right']
  const alpha = Math.round(kit.watermarkOpacity * 255)

  return [
    `[1:v]scale=${logoSize}:-1,format=rgba,colorchannelmixer=aa=${kit.watermarkOpacity}[logo]`,
    `[0:v][logo]overlay=${pos}[branded]`,
  ].join(';')
}

/**
 * Apply brand kit to export — returns modified FFmpeg arguments.
 * Used by the export pipeline.
 */
export async function applyBrandKitToExport(params: {
  userId:   string
  kitId?:   string
  videoUrl: string
  burnLogo?: boolean
}): Promise<{
  inputs:    string[]
  filter:    string
  kitName:   string | null
}> {
  const kit = await getBrandKit(params.userId, params.kitId)

  if (!kit || !params.burnLogo) {
    return { inputs: [params.videoUrl], filter: '', kitName: kit?.name ?? null }
  }

  const inputs  = [params.videoUrl]
  const filters: string[] = []

  if (kit.watermarkUrl) {
    inputs.push(kit.watermarkUrl)
    filters.push(buildWatermarkFilter(kit))
  }

  return {
    inputs,
    filter:  filters.join(';'),
    kitName: kit.name,
  }
}
