/** One matte contract. The compositor Keyer and the Green Screen preview both call this. */

export interface GarbageRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface MatteParams {
  mode: 'chroma' | 'luma'
  colour?: string
  tolerance: number
  softness: number
  spill: number
  invert?: boolean
  lumaLow?: number
  lumaHigh?: number
  shrink?: number
  grow?: number
  holeFill?: boolean
  garbage?: GarbageRect | null
  width?: number
  height?: number
}

export interface IntegrateParams {
  lightWrap: number
  shadow: number
  colourMatch: number
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function parseColour(colour: string | undefined): [number, number, number] {
  const hex = (colour ?? '#00ff00').replace('#', '')
  if (hex.length < 6) return [0, 255, 0]
  return [
    Number.parseInt(hex.slice(0, 2), 16) || 0,
    Number.parseInt(hex.slice(2, 4), 16) || 0,
    Number.parseInt(hex.slice(4, 6), 16) || 0,
  ]
}

function colourMatch(r: number, g: number, b: number, target: [number, number, number]): number {
  const dr = r - target[0]
  const dg = g - target[1]
  const db = b - target[2]
  return 1 - Math.sqrt(dr * dr + dg * dg + db * db) / 441.67295593
}

type Rgba = Uint8Array | Uint8ClampedArray

function despill(rgba: Rgba, i: number, target: [number, number, number], spill: number): void {
  const [tr, tg, tb] = target
  if (tg >= tr && tg >= tb) {
    const cap = Math.max(rgba[i], rgba[i + 2])
    rgba[i + 1] = Math.round(rgba[i + 1] * (1 - spill) + Math.min(rgba[i + 1], cap) * spill)
  } else if (tb >= tr && tb >= tg) {
    const cap = Math.max(rgba[i], rgba[i + 1])
    rgba[i + 2] = Math.round(rgba[i + 2] * (1 - spill) + Math.min(rgba[i + 2], cap) * spill)
  }
}

function passAlpha(rgba: Rgba, width: number, height: number, grow: boolean): void {
  const src = new Uint8Array(rgba)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = grow ? 0 : 255
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx))
          const ny = Math.min(height - 1, Math.max(0, y + dy))
          const a = src[(ny * width + nx) * 4 + 3]
          v = grow ? Math.max(v, a) : Math.min(v, a)
        }
      }
      rgba[(y * width + x) * 4 + 3] = v
    }
  }
}

function fillHoles(rgba: Rgba, width: number, height: number): void {
  const src = new Uint8Array(rgba)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4
      if (src[i + 3] > 16) continue
      let opaque = 0
      let sum = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const a = src[((y + dy) * width + x + dx) * 4 + 3]
          if (a > 200) {
            opaque += 1
            sum += a
          }
        }
      }
      if (opaque >= 6) rgba[i + 3] = Math.round(sum / opaque)
    }
  }
}

export function applyMatte(rgba: Rgba, params: MatteParams): void {
  const target = parseColour(params.colour)
  const tol = clamp01(params.tolerance)
  const soft = clamp01(params.softness)
  const spill = clamp01(params.spill)
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]
    const g = rgba[i + 1]
    const b = rgba[i + 2]
    let keep = 1
    if (params.mode === 'luma') {
      const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      const low = params.lumaLow ?? tol
      const high = params.lumaHigh ?? Math.min(1, low + Math.max(soft, 0.02))
      if (y <= low) keep = 0
      else if (y >= high) keep = 1
      else keep = (y - low) / (high - low || 1)
    } else {
      const match = colourMatch(r, g, b, target)
      const cut = 1 - tol
      const band = Math.max(soft, 0.001)
      if (match >= cut) keep = 0
      else if (match <= cut - band) keep = 1
      else keep = (cut - match) / band
      if (spill > 0 && keep > 0) despill(rgba, i, target, spill)
    }
    rgba[i + 3] = Math.round(rgba[i + 3] * clamp01(keep))
  }

  const width = params.width ?? 0
  const height = params.height ?? 0
  if (width > 0 && height > 0 && width * height * 4 === rgba.length) {
    const shrink = Math.max(0, Math.min(2, Math.round(params.shrink ?? 0)))
    const grow = Math.max(0, Math.min(2, Math.round(params.grow ?? 0)))
    for (let n = 0; n < shrink; n++) passAlpha(rgba, width, height, false)
    for (let n = 0; n < grow; n++) passAlpha(rgba, width, height, true)
    if (params.holeFill) fillHoles(rgba, width, height)
    const box = params.garbage
    if (box && box.right > box.left && box.bottom > box.top) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const u = x / width
          const v = y / height
          if (u < box.left || u > box.right || v < box.top || v > box.bottom) {
            rgba[(y * width + x) * 4 + 3] = 0
          }
        }
      }
    }
  }

  if (params.invert) {
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255 - rgba[i]
  }
}

export function dominantScreen(rgba: Rgba): 'green' | 'blue' | null {
  let green = 0
  let blue = 0
  let count = 0
  const step = Math.max(4, Math.floor(rgba.length / 1600) * 4)
  for (let i = 0; i < rgba.length; i += step) {
    count += 1
    const r = rgba[i]
    const g = rgba[i + 1]
    const b = rgba[i + 2]
    if (g - Math.max(r, b) > 40) green += 1
    if (b - Math.max(r, g) > 40) blue += 1
  }
  if (count === 0) return null
  if (green > blue && green / count > 0.2) return 'green'
  if (blue > green && blue / count > 0.2) return 'blue'
  return null
}

export function matchColour(fg: Rgba, bg: Rgba, amount: number): void {
  const mix = clamp01(amount)
  if (mix === 0 || fg.length !== bg.length) return
  let fr = 0
  let fgG = 0
  let fb = 0
  let br = 0
  let bgG = 0
  let bb = 0
  let n = 0
  for (let i = 0; i < fg.length; i += 4) {
    if (fg[i + 3] < 16) continue
    fr += fg[i]
    fgG += fg[i + 1]
    fb += fg[i + 2]
    br += bg[i]
    bgG += bg[i + 1]
    bb += bg[i + 2]
    n += 1
  }
  if (n === 0) return
  const dr = ((br - fr) / n) * mix
  const dg = ((bgG - fgG) / n) * mix
  const db = ((bb - fb) / n) * mix
  for (let i = 0; i < fg.length; i += 4) {
    if (fg[i + 3] < 16) continue
    fg[i] = Math.max(0, Math.min(255, Math.round(fg[i] + dr)))
    fg[i + 1] = Math.max(0, Math.min(255, Math.round(fg[i + 1] + dg)))
    fg[i + 2] = Math.max(0, Math.min(255, Math.round(fg[i + 2] + db)))
  }
}

/** Subject over plate. Same function for the panel preview and the compositor Merge. */
export function compositeSubject(fg: Rgba, bg: Rgba, width: number, height: number, opts: IntegrateParams): Uint8Array {
  const out = new Uint8Array(bg)
  const wrap = clamp01(opts.lightWrap)
  const shadow = clamp01(opts.shadow)
  const shift = Math.max(2, Math.round(height * 0.02))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = fg[i + 3] / 255
      if (shadow > 0) {
        const sy = Math.min(height - 1, y + shift)
        const above = fg[(sy * width + x) * 4 + 3] / 255
        if (above > 0.4 && a < 0.2) {
          const k = shadow * above * (1 - a)
          out[i] = Math.round(out[i] * (1 - k))
          out[i + 1] = Math.round(out[i + 1] * (1 - k))
          out[i + 2] = Math.round(out[i + 2] * (1 - k))
        }
      }
      if (a <= 0) continue
      let r = fg[i]
      let g = fg[i + 1]
      let b = fg[i + 2]
      if (wrap > 0 && a < 0.95) {
        const edge = (1 - a) * wrap
        r = Math.round(r * (1 - edge) + out[i] * edge)
        g = Math.round(g * (1 - edge) + out[i + 1] * edge)
        b = Math.round(b * (1 - edge) + out[i + 2] * edge)
      }
      out[i] = Math.round(r * a + out[i] * (1 - a))
      out[i + 1] = Math.round(g * a + out[i + 1] * (1 - a))
      out[i + 2] = Math.round(b * a + out[i + 2] * (1 - a))
      out[i + 3] = 255
    }
  }
  return out
}
