import type { Clip } from './schema'

export const GENERATIVE_EDIT_CREDITS = 8

export const SNAP_TO_CUT = [
  { t: 0, speedPct: 100 },
  { t: 0.5, speedPct: 400 },
  { t: 1, speedPct: 100 },
]

export function sampleSpeed(clip: Clip, localSec: number, duration: number): number {
  const ramp = clip.timeRemap
  if (!ramp?.enabled || !ramp.keyframes.length || duration <= 0) return 1
  const t = Math.min(1, Math.max(0, localSec / duration))
  const keys = [...ramp.keyframes].sort((a, b) => a.t - b.t)
  if (t <= keys[0].t) return keys[0].speedPct / 100
  const last = keys[keys.length - 1]
  if (t >= last.t) return last.speedPct / 100
  const next = keys.findIndex((key) => key.t >= t)
  const b = keys[next]
  const a = keys[next - 1]
  const span = b.t - a.t
  const u = span <= 0 ? 1 : (t - a.t) / span
  return (a.speedPct + (b.speedPct - a.speedPct) * u) / 100
}

/** FFmpeg retime for the snap curve: 1x at the ends, 4x in the middle. */
export function speedRampFilter(clip: Clip, durationSec: number): string | null {
  const ramp = clip.timeRemap
  if (!ramp?.enabled || !ramp.keyframes.length) return null
  const mid = ramp.keyframes.find((key) => key.t === 0.5)?.speedPct ?? 100
  const ends = ramp.keyframes.filter((key) => key.t === 0 || key.t === 1).every((key) => key.speedPct === 100)
  if (ends && mid === 400) {
    const span = Math.max(durationSec, 0.1)
    return `setpts=PTS/(1+3*sin(PI*T/${span})*sin(PI*T/${span}))`
  }
  const avg = ramp.keyframes.reduce((sum, key) => sum + key.speedPct, 0) / ramp.keyframes.length
  const factor = Math.max(0.25, avg / 100)
  return `setpts=PTS/${factor}`
}

export function peakBlurFilter(clip: Clip): string | null {
  const blur = clip.timeRemap?.motionBlur
  if (!blur || blur.amountPct <= 0) return null
  const frames = Math.max(2, Math.min(8, Math.round(blur.amountPct / 20)))
  return `tmix=frames=${frames}:weights=1`
}
