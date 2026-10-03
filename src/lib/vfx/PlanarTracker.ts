/**
 * PlanarTracker — corner-pin keyframes for warping a replacement texture.
 * The gateway has no live point-tracker id (OpenAPI 404), so tracking is not submitted.
 */

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
  void params
  console.warn('[planar] point tracker is not on the gateway (OpenAPI 404). Nothing submitted.')
  throw new Error('Point tracking is not on the gateway. Nothing was submitted.')
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
