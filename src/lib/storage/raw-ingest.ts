import { runArgv } from '../shell/argv'
import { uploadToR2 } from './r2'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'

export const SUPPORTED_RAW_FORMATS = [
  'braw',  // Blackmagic RAW
  'r3d',   // RED RAW
  'arri',  // ARRI
  'mxf',   // XAVC / DNxHD / ProRes
  'crm',   // Canon Cinema RAW Light
  'nraw',  // Nikon N-RAW
  'sraw',  // Sony RAW
]

interface CameraMetadata {
  make?: string
  model?: string
  fps?: number
  resolution?: { width: number; height: number }
  colorSpace?: string
  iso?: number
  exposure?: string
  duration?: number
}

export async function ingestRAWFile(filePath: string): Promise<{
  proxiedVideoUrl: string
  colorProfile: string
  ocioTransform: string
  metadata: CameraMetadata
}> {
  const jobId = nanoid()
  const tmpDir = `/tmp/raw-ingest-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    // Detect file format and colour space via ffprobe
    let colorProfile = 'rec709'
    let ocioTransform = 'identity'
    const metadata: CameraMetadata = {}

    try {
      const probeJson = runArgv("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", filePath]).toString()
      const probe = JSON.parse(probeJson) as {
        format?: { tags?: Record<string, string>; duration?: string }
        streams?: Array<{
          width?: number
          height?: number
          r_frame_rate?: string
          color_space?: string
          color_transfer?: string
        }>
      }

      const videoStream = probe.streams?.find((s) => s.width)
      if (videoStream) {
        metadata.resolution = { width: videoStream.width ?? 0, height: videoStream.height ?? 0 }
        if (videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number)
          metadata.fps = den ? num / den : num
        }
        colorProfile = videoStream.color_space ?? 'rec709'
        const transfer = videoStream.color_transfer ?? ''

        // Map colour transfer characteristics to OCIO transform
        if (transfer.includes('log') || transfer.includes('LogC')) {
          colorProfile = 'arri_logc'
          ocioTransform = 'LogC_to_Rec709'
        } else if (transfer.includes('slog3') || transfer.includes('S-Log3')) {
          colorProfile = 'sony_slog3'
          ocioTransform = 'SLog3_to_Rec709'
        } else if (transfer.includes('vlog')) {
          colorProfile = 'panasonic_vlog'
          ocioTransform = 'VLog_to_Rec709'
        } else if (transfer.includes('hlg')) {
          colorProfile = 'hlg'
          ocioTransform = 'HLG_to_Rec709'
        } else if (transfer.includes('pq') || transfer.includes('smpte2084')) {
          colorProfile = 'hdr_pq'
          ocioTransform = 'HDR_PQ_to_Rec709'
        }
      }

      if (probe.format?.duration) {
        metadata.duration = parseFloat(probe.format.duration)
      }
      if (probe.format?.tags) {
        metadata.make = probe.format.tags['com.apple.quicktime.make']
        metadata.model = probe.format.tags['com.apple.quicktime.model']
      }
    } catch (err) {
      console.warn("[caught] src/lib/storage/raw-ingest.ts:95", err instanceof Error ? { name: err.name, message: err.message } : err)

      // Probe failed — use defaults
    }

    // Generate low-res proxy for timeline scrubbing
    const proxyPath = join(tmpDir, 'proxy.mp4')
    const colour = colourExpr(colorProfile)
    const vf = colour ? `${colour},scale=960:540` : 'scale=960:540'
    runArgv('ffmpeg', ['-i', filePath, '-vf', vf, '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-c:a', 'aac', proxyPath, '-y'])

    const buffer = readFileSync(proxyPath)
    const proxiedVideoUrl = await uploadToR2(buffer, `raw-proxy/${jobId}.mp4`, 'video/mp4')

    return { proxiedVideoUrl, colorProfile, ocioTransform, metadata }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}

function colourExpr(colorProfile: string): string | null {
  switch (colorProfile) {
    case 'arri_logc':
      return 'colorspace=all=bt709:trc=bt709:primaries=bt709:matrixin=bt709'
    case 'sony_slog3':
      return "curves=all='0/0 0.1/0.05 0.5/0.5 0.9/0.95 1/1'"
    case 'hlg':
    case 'hdr_pq':
      return 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable,zscale=t=bt709:m=bt709:r=tv,format=yuv420p'
    default:
      return null
  }
}
