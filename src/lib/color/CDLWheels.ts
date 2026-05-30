/**
 * CDL Wheels — ASC CDL (Color Decision List) implementation.
 * Generates FFmpeg colorlevels filter from Lift/Gamma/Gain wheel values.
 */

export interface CDLChannel {
  r: number   // 0.0 – 2.0 (1.0 = neutral)
  g: number
  b: number
}

export interface CDLValues {
  lift:  CDLChannel   // shadows (additive offset)
  gamma: CDLChannel   // midtones (power curve)
  gain:  CDLChannel   // highlights (multiplicative)
}

export const NEUTRAL_CDL: CDLValues = {
  lift:  { r: 0, g: 0, b: 0 },
  gamma: { r: 1, g: 1, b: 1 },
  gain:  { r: 1, g: 1, b: 1 },
}

/**
 * Convert CDL values to FFmpeg colorlevels filter string.
 * CDL: out = clip((in + lift) * gain)^(1/gamma)
 */
export function cdlToFFmpeg(cdl: CDLValues): string {
  // FFmpeg colorlevels: ri/gi/bi = input scaling, ro/go/bo = output scaling
  // We approximate CDL via colorlevels + curves
  const filters: string[] = []

  // Lift (add to shadows) via colorlevels input range shift
  // Gain via colorlevels output range
  filters.push([
    'colorlevels=',
    `rin=${Math.max(0, -cdl.lift.r).toFixed(3)}:rout=${Math.min(1, cdl.gain.r).toFixed(3)}`,
    `:gin=${Math.max(0, -cdl.lift.g).toFixed(3)}:gout=${Math.min(1, cdl.gain.g).toFixed(3)}`,
    `:bin=${Math.max(0, -cdl.lift.b).toFixed(3)}:bout=${Math.min(1, cdl.gain.b).toFixed(3)}`,
  ].join(''))

  // Gamma via curves power function
  if (cdl.gamma.r !== 1 || cdl.gamma.g !== 1 || cdl.gamma.b !== 1) {
    const invGr = (1 / cdl.gamma.r).toFixed(3)
    const invGg = (1 / cdl.gamma.g).toFixed(3)
    const invGb = (1 / cdl.gamma.b).toFixed(3)
    filters.push(`curves=r='pow(val\\,${invGr})':g='pow(val\\,${invGg})':b='pow(val\\,${invGb})'`)
  }

  return filters.join(',')
}

/** Validate CDL values are within legal ASC CDL range */
export function validateCDL(cdl: CDLValues): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const channels = ['r', 'g', 'b'] as const

  for (const ch of channels) {
    if (cdl.lift[ch] < -1 || cdl.lift[ch] > 1) errors.push(`lift.${ch} out of range [-1, 1]`)
    if (cdl.gamma[ch] < 0.01 || cdl.gamma[ch] > 10) errors.push(`gamma.${ch} out of range [0.01, 10]`)
    if (cdl.gain[ch] < 0 || cdl.gain[ch] > 4) errors.push(`gain.${ch} out of range [0, 4]`)
  }

  return { valid: errors.length === 0, errors }
}

/** Interpolate between two CDL states (for animation) */
export function lerp(a: CDLValues, b: CDLValues, t: number): CDLValues {
  const mix = (x: number, y: number) => x + (y - x) * t
  return {
    lift:  { r: mix(a.lift.r,  b.lift.r),  g: mix(a.lift.g,  b.lift.g),  b: mix(a.lift.b,  b.lift.b) },
    gamma: { r: mix(a.gamma.r, b.gamma.r), g: mix(a.gamma.g, b.gamma.g), b: mix(a.gamma.b, b.gamma.b) },
    gain:  { r: mix(a.gain.r,  b.gain.r),  g: mix(a.gain.g,  b.gain.g),  b: mix(a.gain.b,  b.gain.b) },
  }
}
