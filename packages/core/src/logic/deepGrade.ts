/** Additive colourist fields. The same fragment is the preview and the export. */

export interface RgbWheel {
  r: number
  g: number
  b: number
}

export interface DeepGrade {
  offset?: RgbWheel
  log?: { shadow: RgbWheel; mid: RgbWheel; high: RgbWheel }
  hdr?: { shadow: RgbWheel; mid: RgbWheel; high: RgbWheel }
  hueVsHue?: number
  hueVsSat?: number
  hueVsLum?: number
  lumVsSat?: number
  satVsSat?: number
  nodes?: Array<{ id: string; mode: 'serial' | 'parallel' | 'layer' | 'mixer' }>
  colourSpace?: { input: 'rec709' | 'acescg' | 'rec2020'; output: 'rec709' | 'pq' | 'hlg' }
  /** A grade script name. Forge does not execute it. */
  dctlName?: string
}

const n = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0

function wheel(prefix: 's' | 'm' | 'h', wheel: RgbWheel | undefined): string[] {
  if (!wheel) return []
  const r = n(wheel.r)
  const g = n(wheel.g)
  const b = n(wheel.b)
  if (!r && !g && !b) return []
  return [`r${prefix}=${r.toFixed(3)}`, `g${prefix}=${g.toFixed(3)}`, `b${prefix}=${b.toFixed(3)}`]
}

/** Leading-comma FFmpeg fragment. A DCTL name never becomes code. */
export function deepGradeFragment(grade: DeepGrade | null | undefined): string {
  if (!grade) return ''
  const parts: string[] = []
  const balance = [
    ...wheel('s', grade.offset),
    ...wheel('m', grade.offset),
    ...wheel('h', grade.offset),
    ...wheel('s', grade.log?.shadow),
    ...wheel('m', grade.log?.mid),
    ...wheel('h', grade.log?.high),
    ...wheel('s', grade.hdr?.shadow),
    ...wheel('m', grade.hdr?.mid),
    ...wheel('h', grade.hdr?.high),
  ]
  if (balance.length) parts.push(`colorbalance=${balance.join(':')}`)
  const hue = n(grade.hueVsHue) * 30
  const sat = 1 + n(grade.hueVsSat) * 0.5 + n(grade.satVsSat) * 0.25
  if (hue || sat !== 1) parts.push(`hue=h=${hue.toFixed(2)}:s=${sat.toFixed(3)}`)
  const lum = n(grade.hueVsLum) + n(grade.lumVsSat)
  if (lum) parts.push(`eq=brightness=${(lum * 0.15).toFixed(3)}`)
  if (grade.colourSpace?.output === 'pq') parts.push('zscale=transfer=smpte2084')
  if (grade.colourSpace?.output === 'hlg') parts.push('zscale=transfer=arib-std-b67')
  return parts.length ? `,${parts.join(',')}` : ''
}

/** CSS preview of the same numbers. Desktop-only fields that CSS cannot key stay in the fragment. */
export function deepGradeCss(grade: DeepGrade | null | undefined): string {
  if (!grade) return ''
  const parts: string[] = []
  const offset = n(grade.offset?.r) - n(grade.offset?.b)
  if (offset) parts.push(`hue-rotate(${(offset * 12).toFixed(1)}deg)`)
  const sat = 1 + n(grade.hueVsSat)
  if (sat !== 1) parts.push(`saturate(${sat.toFixed(3)})`)
  const bright = 1 + n(grade.hueVsLum) * 0.2
  if (bright !== 1) parts.push(`brightness(${bright.toFixed(3)})`)
  return parts.join(' ')
}

export function gradeHasDesktopDepth(grade: DeepGrade | null | undefined): boolean {
  if (!grade) return false
  return Boolean(
    grade.offset || grade.log || grade.hdr || grade.nodes?.length || grade.colourSpace || grade.dctlName
    || grade.hueVsHue || grade.hueVsSat || grade.hueVsLum || grade.lumVsSat || grade.satVsSat,
  )
}
