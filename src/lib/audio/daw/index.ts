/**
 * Audio DAW processing utilities.
 * All processing is delegated to FFmpeg via the render pipeline.
 * These functions build FFmpeg filter strings for each audio effect.
 */

// ─── F03: Parametric EQ ──────────────────────────────────────────────────────

export interface EQBand {
  type:      'lowshelf' | 'peak' | 'highshelf'
  frequency: number   // Hz
  gain:      number   // dB (-20 to +20)
  q?:        number   // quality factor (default 1.0)
}

export function buildParametricEQ(bands: EQBand[]): string {
  return bands
    .filter(b => Math.abs(b.gain) > 0.1)
    .map(b => {
      const q = b.q ?? 1.0
      if (b.type === 'lowshelf')  return `equalizer=f=${b.frequency}:t=l:w=${q}:g=${b.gain}`
      if (b.type === 'highshelf') return `equalizer=f=${b.frequency}:t=h:w=${q}:g=${b.gain}`
      return `equalizer=f=${b.frequency}:t=q:w=${q}:g=${b.gain}`
    })
    .join(',')
}

// ─── F04: Dynamics ────────────────────────────────────────────────────────────

export interface CompressorParams {
  threshold: number   // dBFS (default -20)
  ratio:     number   // compression ratio (default 4:1)
  attack:    number   // ms (default 20)
  release:   number   // ms (default 150)
  makeupGain: number  // dB (default 0)
  knee?:     number   // soft knee dB (default 2)
}

export interface GateParams {
  threshold: number   // dBFS (default -50)
  attack:    number   // ms
  release:   number   // ms
}

export function buildCompressor(p: CompressorParams): string {
  return [
    `acompressor=`,
    `threshold=${p.threshold}dB`,
    `:ratio=${p.ratio}`,
    `:attack=${p.attack}`,
    `:release=${p.release}`,
    `:makeup=${p.makeupGain}dB`,
    p.knee != null ? `:knee=${p.knee}dB` : '',
  ].filter(Boolean).join('')
}

export function buildGate(p: GateParams): string {
  return `agate=threshold=${p.threshold}dB:attack=${p.attack}:release=${p.release}`
}

export function buildLimiter(ceilingDb = 0): string {
  return `alimiter=level_in=1:level_out=${Math.pow(10, ceilingDb / 20).toFixed(4)}:limit=${Math.pow(10, ceilingDb / 20).toFixed(4)}`
}

// ─── F05: Reverb + Delay ─────────────────────────────────────────────────────

export interface ReverbParams {
  roomSize: number    // 0.0 – 1.0
  decay:    number    // seconds
  wetDry:   number    // 0.0 – 1.0
}

export interface DelayParams {
  timeMs:   number    // delay time in milliseconds
  feedback: number    // 0.0 – 0.9
  wetDry:   number    // 0.0 – 1.0
}

export function buildReverb(p: ReverbParams): string {
  const predelay = Math.round(p.roomSize * 40)
  return `areverb=roomsize=${p.roomSize}:pre_delay=${predelay}:wet=${p.wetDry}:dry=${1 - p.wetDry}`
}

export function buildDelay(p: DelayParams): string {
  const delays  = `${p.timeMs}|${p.timeMs}`
  const decays  = `${p.feedback}|${p.feedback}`
  const speeds  = '1.0|1.0'
  return `aecho=0.8:${p.wetDry}:${delays}:${decays}`
}

// ─── F06: De-esser ───────────────────────────────────────────────────────────

export interface DeEsserParams {
  frequency: number   // sibilance frequency Hz (default 8000)
  threshold: number   // dBFS (default -20)
  depth:     number   // reduction amount 0-1 (default 0.5)
}

export function buildDeEsser(p: DeEsserParams): string {
  const bw = 3000  // bandwidth around sibilance freq
  return `adeclick,equalizer=f=${p.frequency}:t=q:w=${bw}:g=${-Math.abs(p.depth) * 20}`
}

// ─── F13: Stem Export Buses ───────────────────────────────────────────────────

export interface StemBus {
  name:     'dialogue' | 'music' | 'sfx'
  tracks:   string[]  // audio track URLs assigned to this bus
}

export function buildStemExportFilter(buses: StemBus[]): string {
  const parts: string[] = []
  let inputIdx = 0

  for (const bus of buses) {
    const inputs = bus.tracks.map(() => `[${inputIdx++}:a]`).join('')
    parts.push(`${inputs}amix=inputs=${bus.tracks.length}[${bus.name}]`)
  }

  return parts.join(';')
}

