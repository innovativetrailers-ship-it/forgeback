/**
 * PlanarTracker — tracks a surface through a clip using fal-ai/cotracker.
 * Returns corner-pin keyframe data for warping replacement textures.
 */

import { fal } from '@fal-ai/client'

export interface Quad {
  topLeft:     [number, number]
  topRight:    [number, number]
  bottomRight: [number, number]
  bottomLeft:  [number, number]
}

export interface TrackKeyframe {
  frame:       number
  timeSec:     number
  quad:        Quad
}

export interface TrackResult {
  keyframes:   TrackKeyframe[]
  fps:         number
  totalFrames: number
}

/**
 * Track a planar surface through a video clip.
 * @param videoUrl - Source clip
 * @param initialQuad - User-drawn quad in the first frame (normalised 0-1 coordinates)
 */
export async function trackPlanarSurface(params: {
  videoUrl:    string
  initialQuad: Quad
  fps?:        number
}): Promise<TrackResult> {
  const { videoUrl, initialQuad, fps = 30 } = params

  // CoTracker tracks points through video
  const trackPoints = [
    initialQuad.topLeft,
    initialQuad.topRight,
    initialQuad.bottomRight,
    initialQuad.bottomLeft,
  ]

  const result = await fal.subscribe('fal-ai/cotracker', {
    input: {
      video_url:   videoUrl,
      queries:     trackPoints.map(([x, y]) => [0, x, y]),  // frame 0 seed points
      grid_size:   0,     // point mode (not grid)
      backward_tracking: false,
    },
  })

  const data = result.data as {
    tracks: Array<Array<[number, number]>>   // [point_idx][frame_idx] = [x, y]
    visibilities?: Array<Array<boolean>>
  }

  const numFrames = data.tracks[0]?.length ?? 0
  const keyframes: TrackKeyframe[] = []

  for (let f = 0; f < numFrames; f++) {
    const points = data.tracks.map(track => track[f] ?? [0, 0]) as [number, number][]
    keyframes.push({
      frame:   f,
      timeSec: f / fps,
      quad: {
        topLeft:     points[0],
        topRight:    points[1],
        bottomRight: points[2],
        bottomLeft:  points[3],
      },
    })
  }

  return { keyframes, fps, totalFrames: numFrames }
}

/** Build FFmpeg perspective filter args from a quad for a single frame */
export function quadToFFmpegPerspective(quad: Quad, srcW: number, srcH: number): string {
  const scale = (p: [number, number]) => `${Math.round(p[0] * srcW)}:${Math.round(p[1] * srcH)}`
  return [
    `perspective=`,
    `x0=${scale(quad.topLeft)}:y0=${scale(quad.topLeft)}`,
    `:x1=${scale(quad.topRight)}:y1=${scale(quad.topRight)}`,
    `:x2=${scale(quad.bottomLeft)}:y2=${scale(quad.bottomLeft)}`,
    `:x3=${scale(quad.bottomRight)}:y3=${scale(quad.bottomRight)}`,
    `:interpolation=linear`,
  ].join('')
}
