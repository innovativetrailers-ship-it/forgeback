/** VFX node math. The compositor executor is the only caller. Plugin text is never run. */

export interface RotoPoint {
  x: number
  y: number
  feather?: number
}

export const OFX_PLUGINS = [
  { id: 'ofx.brightness', name: 'Brightness', params: ['amount'] },
] as const

export const DESKTOP_VFX_NODES = ['Particle', 'Layer3D', 'Camera3D', 'OfxPlugin'] as const

export function ofxParams(pluginId: string, amount: number): { pluginId: string; amount: number } {
  const known = OFX_PLUGINS.some((plugin) => plugin.id === pluginId)
  return { pluginId: known ? pluginId : 'ofx.brightness', amount }
}

function inside(x: number, y: number, points: RotoPoint[]): boolean {
  let hit = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]
    const b = points[j]
    const intersect = ((a.y > y) !== (b.y > y)) && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1e-6) + a.x
    if (intersect) hit = !hit
  }
  return hit
}

/** Feathered polygon mask. Points are 0–1 across the frame. */
export function applyRoto(
  rgba: Buffer,
  width: number,
  height: number,
  points: RotoPoint[],
  combine: 'add' | 'subtract' = 'add',
): Buffer {
  if (points.length < 3) return rgba
  const out = Buffer.from(rgba)
  const feather = Math.max(...points.map((point) => point.feather ?? 0), 0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width
      const ny = y / height
      const covered = inside(nx, ny, points)
      const alphaIndex = (y * width + x) * 4 + 3
      const keep = combine === 'subtract' ? !covered : covered
      if (!keep) out[alphaIndex] = feather > 0 ? Math.round(out[alphaIndex] * 0.35) : 0
    }
  }
  return out
}

/** Deterministic dots. The same rate and seed always paint the same pixels. */
export function applyParticles(
  rgba: Buffer,
  width: number,
  height: number,
  rate: number,
  seed: number,
): Buffer {
  const out = Buffer.from(rgba)
  const count = Math.max(0, Math.min(400, Math.round(rate)))
  let state = seed || 1
  for (let i = 0; i < count; i++) {
    state = (state * 1664525 + 1013904223) >>> 0
    const x = state % width
    const y = (state >>> 8) % height
    const index = (y * width + x) * 4
    out[index] = 255
    out[index + 1] = 255
    out[index + 2] = 255
    out[index + 3] = 255
  }
  return out
}

/** Horizontal parallax from a camera x offset. */
export function applyParallax(rgba: Buffer, width: number, height: number, cameraX: number): Buffer {
  const shift = Math.max(-width + 1, Math.min(width - 1, Math.round(cameraX)))
  if (!shift) return rgba
  const out = Buffer.alloc(rgba.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = x - shift
      const dest = (y * width + x) * 4
      if (source < 0 || source >= width) continue
      rgba.copy(out, dest, (y * width + source) * 4, (y * width + source) * 4 + 4)
    }
  }
  return out
}

/** A hosted plugin contributes a number. Any script text on the node is ignored. */
export function applyOfx(rgba: Buffer, amount: number): Buffer {
  const gain = Math.max(0, Math.min(2, amount))
  const out = Buffer.from(rgba)
  for (let i = 0; i < out.length; i += 4) {
    out[i] = Math.min(255, Math.round(out[i] * gain))
    out[i + 1] = Math.min(255, Math.round(out[i + 1] * gain))
    out[i + 2] = Math.min(255, Math.round(out[i + 2] * gain))
  }
  return out
}
