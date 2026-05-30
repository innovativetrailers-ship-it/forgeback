/**
 * Morph Cut — generative jump-cut concealer for dialogue takes.
 * Uses fal-ai/film-interpolation to generate a 15-frame crossfade
 * between two adjacent dialogue clips, hiding the edit.
 */

import { fal }       from '@fal-ai/client'
import { uploadToR2 } from '../storage/r2'
import { randomUUID } from 'crypto'

export interface MorphCutParams {
  clipAUrl:     string  // first clip URL (or last frame URL)
  clipBUrl:     string  // second clip URL (or first frame URL)
  frames?:      number  // transition frames (default 15 ≈ 0.5s at 30fps)
  blendMode?:   'film' | 'dissolve'
}

export interface MorphCutResult {
  transitionUrl:  string  // short video clip for the morph transition
  transitionSec:  number  // duration in seconds
}

export async function applyMorphCut(params: MorphCutParams): Promise<MorphCutResult> {
  const { clipAUrl, clipBUrl, frames = 15, blendMode = 'film' } = params

  if (blendMode === 'film') {
    // fal-ai/film-interpolation: interpolates between two image frames
    const result = await fal.subscribe('fal-ai/film-interpolation', {
      input: {
        image1_url:    clipAUrl,
        image2_url:    clipBUrl,
        num_frames:    frames,
        output_format: 'mp4',
      },
    })

    const outputData = result.data as { video?: { url: string }; url?: string }
    const videoUrl   = outputData.video?.url ?? outputData.url
    if (!videoUrl) throw new Error('FILM interpolation produced no output')

    // Download and re-host on R2
    const res    = await fetch(videoUrl)
    const buffer = Buffer.from(await res.arrayBuffer())
    const key    = `morphcut/${randomUUID()}.mp4`
    const hosted = await uploadToR2(buffer, key, 'video/mp4')

    return { transitionUrl: hosted, transitionSec: frames / 30 }
  }

  // Fallback: simple dissolve (crossfade) using a placeholder
  // In the absence of FILM model output, return clipBUrl (no-op transition)
  return { transitionUrl: clipBUrl, transitionSec: frames / 30 }
}
