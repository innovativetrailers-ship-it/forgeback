import type { TimelineRecipe } from '../timeline/schema'

export interface IMFPackageSpec {
  recipe: TimelineRecipe
  videoUrl: string
  audioTracks: Array<{ url: string; channels: number; label?: string }>
  profile: 'APP2' | 'APP2E' | 'APP4DI'
  videoProfile: 'j2k_2014' | 'h264_level4'
  frameRate: number
  resolution: { width: number; height: number }
  colourSpace: 'Rec.709' | 'DCI-P3' | 'Rec.2020'
  audioBitDepth: 16 | 24
  audioSampleRate: 48000 | 96000
  captions?: Array<{ language: string; url: string }>
  dolbyVision?: boolean
  hdr10?: boolean
}

export interface IMFPackageResult {
  downloadUrl: string
  cplId: string
  packageId: string
  totalSizeBytes: number
}

const IMF_SERVICE = process.env.IMF_SERVICE_URL ?? 'http://localhost:7433'

export async function packageIMF(spec: IMFPackageSpec): Promise<Response> {
  // Proxy the request to the Python IMF service and stream back the ZIP
  const response = await fetch(`${IMF_SERVICE}/package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl: spec.videoUrl,
      audioTracks: spec.audioTracks,
      profile: spec.profile,
      videoProfile: spec.videoProfile,
      frameRate: spec.frameRate,
      resolution: spec.resolution,
      colourSpace: spec.colourSpace,
      audioBitDepth: spec.audioBitDepth,
      audioSampleRate: spec.audioSampleRate,
      captions: spec.captions ?? [],
      dolbyVision: spec.dolbyVision ?? false,
      hdr10: spec.hdr10 ?? false,
    }),
  })

  if (!response.ok) {
    let msg = response.statusText
    try {
      const json = await response.json() as { error?: string }
      msg = json.error ?? msg
    } catch (err) {
      console.warn("[caught] src/lib/delivery/IMFPackager.ts:54", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
    throw new Error(`IMF packaging failed: ${msg}`)
  }

  return response
}

export async function checkIMFHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${IMF_SERVICE}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch (err) {
    console.warn("[caught] src/lib/delivery/IMFPackager.ts:65", err instanceof Error ? { name: err.name, message: err.message } : err)

    return false
  }
}
