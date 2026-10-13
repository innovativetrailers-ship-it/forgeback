/** Deterministic control on a clip. Preview and export both sample this. */

export interface ChartBar {
  label: string
  value: number
}

export interface ClipOverlay {
  id: string
  lowerThird?: { title: string; subtitle?: string }
  chart?: { title: string; bars: ChartBar[] }
}

export interface TransformKey {
  timeSec: number
  x: number
  y: number
  scale: number
  rotation: number
  ease?: 'linear' | 'bezier'
}

export interface PlanarFrame {
  timeSec: number
  x: number
  y: number
  w: number
  h: number
}

export interface PlanarInsert {
  imageUrl: string
  frames: PlanarFrame[]
}

export interface DepthParallax {
  /** 0 is the back plane, 1 is the front. */
  depth: number
  driftX: number
  driftY: number
}

export interface ClipControl {
  overlays?: ClipOverlay[]
  transformKeys?: TransformKey[]
  planarInsert?: PlanarInsert
  parallax?: DepthParallax
}

export interface SampledControl {
  x: number
  y: number
  scale: number
  rotation: number
  lowerThird?: { title: string; subtitle?: string }
  chart?: { title: string; bars: Array<{ label: string; value: number; height: number }> }
  insert?: { imageUrl: string; x: number; y: number; w: number; h: number }
}

function clamp01(n: number): number {
  if (n <= 0) return 0
  if (n >= 1) return 1
  return n
}

/** Smoothstep is the cubic bezier ease used by preview and export. */
export function bezierEase(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function sampleTransform(keys: TransformKey[] | undefined, timeSec: number): { x: number; y: number; scale: number; rotation: number } {
  const identity = { x: 0, y: 0, scale: 1, rotation: 0 }
  if (!keys?.length) return identity
  const ordered = [...keys].sort((a, b) => a.timeSec - b.timeSec)
  if (timeSec <= ordered[0].timeSec) return { x: ordered[0].x, y: ordered[0].y, scale: ordered[0].scale, rotation: ordered[0].rotation }
  const last = ordered[ordered.length - 1]
  if (timeSec >= last.timeSec) return { x: last.x, y: last.y, scale: last.scale, rotation: last.rotation }
  const nextIndex = ordered.findIndex((key) => key.timeSec >= timeSec)
  const b = ordered[nextIndex]
  const a = ordered[nextIndex - 1]
  const span = b.timeSec - a.timeSec
  const raw = span <= 0 ? 1 : (timeSec - a.timeSec) / span
  const t = (b.ease ?? a.ease) === 'bezier' ? bezierEase(raw) : raw
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    scale: lerp(a.scale, b.scale, t),
    rotation: lerp(a.rotation, b.rotation, t),
  }
}

export function samplePlanar(insert: PlanarInsert | undefined, timeSec: number): PlanarFrame | null {
  if (!insert?.frames.length) return null
  const ordered = [...insert.frames].sort((a, b) => a.timeSec - b.timeSec)
  if (timeSec <= ordered[0].timeSec) return ordered[0]
  const last = ordered[ordered.length - 1]
  if (timeSec >= last.timeSec) return last
  const nextIndex = ordered.findIndex((frame) => frame.timeSec >= timeSec)
  const b = ordered[nextIndex]
  const a = ordered[nextIndex - 1]
  const span = b.timeSec - a.timeSec
  const t = span <= 0 ? 1 : (timeSec - a.timeSec) / span
  return {
    timeSec,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
  }
}

export function sampleControl(control: ClipControl | undefined, timeSec: number): SampledControl {
  const transform = sampleTransform(control?.transformKeys, timeSec)
  const parallax = control?.parallax
  const drift = parallax ? parallax.depth : 0
  const overlay = control?.overlays?.[0]
  const bars = overlay?.chart?.bars ?? []
  const max = Math.max(1, ...bars.map((bar) => bar.value))
  const insertFrame = samplePlanar(control?.planarInsert, timeSec)
  return {
    x: transform.x + (parallax ? parallax.driftX * drift : 0),
    y: transform.y + (parallax ? parallax.driftY * drift : 0),
    scale: transform.scale,
    rotation: transform.rotation,
    lowerThird: overlay?.lowerThird,
    chart: overlay?.chart
      ? { title: overlay.chart.title, bars: bars.map((bar) => ({ ...bar, height: bar.value / max })) }
      : undefined,
    insert: insertFrame && control?.planarInsert
      ? { imageUrl: control.planarInsert.imageUrl, ...insertFrame }
      : undefined,
  }
}

function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

/** FFmpeg filters for the same sample the preview draws. Adds pixels. Does not drop the clip. */
export function controlExportFilters(control: ClipControl | undefined, durationSec: number, width: number, height: number): string[] {
  if (!control) return []
  const start = sampleControl(control, 0)
  const end = sampleControl(control, Math.max(0, durationSec))
  const filters: string[] = []
  if (control.transformKeys?.length || control.parallax) {
    const frames = Math.max(1, Math.round(durationSec * 30))
    const bezier = control.transformKeys?.some((key) => key.ease === 'bezier') ?? false
    const t = bezier
      ? `(on/${frames})*(on/${frames})*(3-2*(on/${frames}))`
      : `on/${frames}`
    const z0 = start.scale
    const z1 = end.scale
    const x0 = Math.round(start.x)
    const x1 = Math.round(end.x)
    const y0 = Math.round(start.y)
    const y1 = Math.round(end.y)
    filters.push(
      `zoompan=z='${z0}+(${z1 - z0})*${t}':x='iw/2-(iw/zoom/2)+${x0}+(${x1 - x0})*${t}':y='ih/2-(ih/zoom/2)+${y0}+(${y1 - y0})*${t}':d=1:s=${width}x${height}:fps=30`,
    )
    const rot0 = start.rotation * Math.PI / 180
    const rot1 = end.rotation * Math.PI / 180
    if (Math.abs(rot1 - rot0) > 0.001 || Math.abs(rot0) > 0.001) {
      const span = Math.max(durationSec, 0.001)
      filters.push(`rotate='${rot0}+(${rot1 - rot0})*t/${span}':c=none:ow=iw:oh=ih`)
    }
  }
  const third = start.lowerThird
  if (third?.title) {
    filters.push(`drawtext=text='${escapeDrawtext(third.title)}':x=48:y=h-120:fontsize=36:fontcolor=white`)
    if (third.subtitle) {
      filters.push(`drawtext=text='${escapeDrawtext(third.subtitle)}':x=48:y=h-72:fontsize=22:fontcolor=white`)
    }
  }
  start.chart?.bars.forEach((bar, index) => {
    const barH = Math.round(bar.height * 80)
    filters.push(`drawbox=x=${48 + index * 36}:y=${height - 200 - barH}:w=24:h=${barH}:color=white@0.9:t=fill`)
  })
  return filters
}

/** Pixel placement for the pinned insert. Coordinates on the clip are 0–1. */
export function planarOverlayPlacement(
  control: ClipControl | undefined,
  durationSec: number,
  width: number,
  height: number,
): { imageUrl: string; x: string; y: string; w: number; h: number } | null {
  const start = sampleControl(control, 0).insert
  const end = sampleControl(control, Math.max(0, durationSec)).insert
  if (!start || !end) return null
  const span = Math.max(durationSec, 0.001)
  const x0 = Math.round(start.x * width)
  const x1 = Math.round(end.x * width)
  const y0 = Math.round(start.y * height)
  const y1 = Math.round(end.y * height)
  return {
    imageUrl: start.imageUrl,
    x: `${x0}+(${x1 - x0})*t/${span}`,
    y: `${y0}+(${y1 - y0})*t/${span}`,
    w: Math.max(2, Math.round(((start.w + end.w) / 2) * width)),
    h: Math.max(2, Math.round(((start.h + end.h) / 2) * height)),
  }
}
