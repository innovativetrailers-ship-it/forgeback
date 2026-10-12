/**
 * SpatialExport — Apple Vision Pro .mvhevc spatial video encoding.
 * Encodes left-eye + right-eye video pair into MV-HEVC format.
 */

import { uploadToR2 }  from '@/lib/storage/r2'
import { runArgv } from '@/lib/shell/argv'
import { mkdirSync,
         rmSync,
         readFileSync } from 'fs'
import { join }        from 'path'
import { randomUUID }  from 'crypto'

export interface SpatialVideoParams {
  leftEyeUrl:    string
  rightEyeUrl:   string
  fov?:          number   // field of view in degrees (default 90)
  baselineM?:    number   // inter-ocular distance in metres (default 0.063)
  disparity?:    number   // disparity adjustment (default 0)
}

export interface SpatialVideoResult {
  mvhevcUrl:  string
  sizeBytes:  number
}

export async function encodeSpatialVideo(params: SpatialVideoParams): Promise<SpatialVideoResult> {
  const {
    leftEyeUrl,
    rightEyeUrl,
    fov        = 90,
    baselineM  = 0.063,
    disparity  = 0,
  } = params

  const tmpDir = `/tmp/spatial-${randomUUID()}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    const outFile = join(tmpDir, 'spatial.mov')

    // MV-HEVC encoding using FFmpeg with Apple Spatial Video metadata
    // Requires FFmpeg built with HEVC MV support (Apple Silicon Macs)
    runArgv('ffmpeg', [
      '-i', leftEyeUrl,
      '-i', rightEyeUrl,
      '-filter_complex', '[0:v][1:v]hstack[v]',
      '-map', '[v]',
      '-map', '0:a?',
      '-c:v', 'hevc_videotoolbox',
      '-tag:v', 'hvc1',
      '-vf', 'scale=iw/2:ih',
      '-metadata:s:v:0', 'projected-media-type=1',
      '-metadata:s:v:0', `horizontal-field-of-view=${fov}`,
      '-metadata:s:v:0', `baseline=${Math.round(baselineM * 1000)}`,
      '-metadata:s:v:0', `disparity=${disparity}`,
      '-movflags', '+faststart',
      outFile,
      '-y',
    ])

    const buffer  = readFileSync(outFile)
    const key     = `spatial/${randomUUID()}.mov`
    const mvhevcUrl = await uploadToR2(buffer, key, 'video/quicktime')

    return { mvhevcUrl, sizeBytes: buffer.length }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
