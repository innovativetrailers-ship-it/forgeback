/** VFX node math. The compositor executor is the only caller. Plugin text is never run. */

export interface RotoPoint {
  x: number
  y: number
  feather?: number
}

export interface RotoLayer {
  points: RotoPoint[]
  combine?: 'add' | 'subtract' | 'intersect'
}

export interface RotoOptions {
  layers?: RotoLayer[]
  spline?: boolean
  motion?: { dx: number; dy: number }
}

export const OFX_PLUGINS = [
  { id: 'ofx.brightness', name: 'Brightness', params: ['amount'] },
] as const

export const DESKTOP_VFX_NODES = [
  'Roto',
  'Particle',
  'Layer3D',
  'Camera3D',
  'OfxPlugin',
  'Cryptomatte',
  'DeepMerge',
  'DeepHold',
  'VectorWarp',
] as const

export const DESKTOP_VFX_NOTE = 'Cryptomatte, deep EXR, vector warp, particles, and OFX are node types in this web compositor. The desktop app does not host that graph yet. Web keeps the basic mask.'

/** Live fal llms.txt 2026-10-04: BiRefNet is $0 per compute second. Still a guarded model op. */
export const AI_MATTE_CREDITS = 0

export function ofxParams(pluginId: string, amount: number): { pluginId: string; amount: number; installed: boolean } {
  const installed = OFX_PLUGINS.some((plugin) => plugin.id === pluginId)
  return { pluginId, amount, installed }
}

export function discoverOfx(): ReadonlyArray<{ id: string; name: string; params: readonly string[] }> {
  return OFX_PLUGINS
}

/** A plugin throw stays inside this function. The caller keeps the original frame. */
export function isolatePlugin(run: () => Buffer, fallback: Buffer): Buffer {
  try {
    return run()
  } catch (err) {
    console.warn('[ofx]', err instanceof Error ? err.message : err)
    return fallback
  }
}

export function runOfx(rgba: Buffer, pluginId: string, amount: number, script?: string): { rgba: Buffer; error?: string } {
  if (typeof script === 'string' && script.trim()) {
    return { rgba, error: 'Plugin script is not run' }
  }
  const known = ofxParams(pluginId, amount)
  if (!known.installed) return { rgba, error: `${pluginId} is not installed` }
  const next = isolatePlugin(() => applyOfx(rgba, known.amount), rgba)
  if (next === rgba && known.amount !== 1) {
    return { rgba, error: 'The plugin failed. The frame was kept.' }
  }
  return { rgba: next }
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

/** Closed uniform cubic b-spline. Four or more points. */
export function bspline(points: RotoPoint[], samples = 8): RotoPoint[] {
  if (points.length < 4) return points
  const out: RotoPoint[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const p0 = points[i]
    const p1 = points[(i + 1) % n]
    const p2 = points[(i + 2) % n]
    const p3 = points[(i + 3) % n]
    for (let step = 0; step < samples; step++) {
      const t = step / samples
      const t2 = t * t
      const t3 = t2 * t
      const x = ((p0.x * (1 - 3 * t + 3 * t2 - t3)) + (p1.x * (4 - 6 * t2 + 3 * t3)) + (p2.x * (1 + 3 * t + 3 * t2 - 3 * t3)) + (p3.x * t3)) / 6
      const y = ((p0.y * (1 - 3 * t + 3 * t2 - t3)) + (p1.y * (4 - 6 * t2 + 3 * t3)) + (p2.y * (1 + 3 * t + 3 * t2 - 3 * t3)) + (p3.y * t3)) / 6
      const feather = (p1.feather ?? 0) * (1 - t) + (p2.feather ?? 0) * t
      out.push({ x, y, feather })
    }
  }
  return out
}

export function propagateRoto(points: RotoPoint[], dx: number, dy: number): RotoPoint[] {
  return points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy }))
}

function coverage(width: number, height: number, points: RotoPoint[], spline: boolean): Float32Array {
  const shape = spline ? bspline(points) : points
  const mask = new Float32Array(width * height)
  if (shape.length < 3) return mask
  const feather = Math.max(...shape.map((point) => point.feather ?? 0), 0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x + 0.5) / width
      const ny = (y + 0.5) / height
      const covered = inside(nx, ny, shape)
      let value = covered ? 1 : 0
      if (!covered && feather > 0) {
        let nearest = Infinity
        for (const point of shape) {
          const dist = Math.hypot(nx - point.x, ny - point.y)
          if (dist < nearest) nearest = dist
        }
        const local = Math.max(...shape.map((point) => point.feather ?? feather), 0)
        value = Math.max(0, 1 - nearest / local)
      }
      mask[y * width + x] = value
    }
  }
  return mask
}

function combineMask(base: Float32Array, next: Float32Array, op: 'add' | 'subtract' | 'intersect'): void {
  for (let i = 0; i < base.length; i++) {
    if (op === 'subtract') base[i] = Math.max(0, base[i] - next[i])
    else if (op === 'intersect') base[i] = Math.min(base[i], next[i])
    else base[i] = Math.max(base[i], next[i])
  }
}

/** Feathered polygon or b-spline. Points are 0–1 across the frame. */
export function applyRoto(
  rgba: Buffer,
  width: number,
  height: number,
  points: RotoPoint[],
  combine: 'add' | 'subtract' = 'add',
  options?: RotoOptions,
): Buffer {
  const layers: RotoLayer[] = options?.layers?.length
    ? options.layers
    : [{ points, combine }]
  if (layers.every((layer) => layer.points.length < 3)) return rgba
  let mask = new Float32Array(width * height)
  let started = false
  for (const layer of layers) {
    const shifted = options?.motion
      ? coverage(width, height, propagateRoto(layer.points, options.motion.dx, options.motion.dy), Boolean(options?.spline))
      : null
    const here = coverage(width, height, layer.points, Boolean(options?.spline))
    if (shifted) {
      for (let i = 0; i < here.length; i++) here[i] = (here[i] + shifted[i]) / 2
    }
    if (!started) {
      mask.set(here)
      if ((layer.combine ?? combine) === 'subtract') {
        for (let i = 0; i < mask.length; i++) mask[i] = 1 - mask[i]
      }
      started = true
      continue
    }
    combineMask(mask, here, layer.combine ?? combine)
  }
  const out = Buffer.from(rgba)
  const pixels = Math.min(mask.length, Math.floor(out.length / 4))
  for (let i = 0; i < pixels; i++) {
    out[i * 4 + 3] = Math.round(out[i * 4 + 3] * mask[i])
  }
  return out
}

export interface ParticleOptions {
  lifetime?: number
  forceY?: number
  sprite?: number
}

/** Deterministic sprites. The same rate and seed always paint the same pixels. */
export function applyParticles(
  rgba: Buffer,
  width: number,
  height: number,
  rate: number,
  seed: number,
  options?: ParticleOptions,
): Buffer {
  const out = Buffer.from(rgba)
  const count = Math.max(0, Math.min(400, Math.round(rate)))
  const sprite = Math.max(1, Math.min(8, Math.round(options?.sprite ?? 1)))
  const life = Math.max(1, Math.round(options?.lifetime ?? 1))
  const force = options?.forceY ?? 0
  let state = seed || 1
  for (let i = 0; i < count; i++) {
    state = (state * 1664525 + 1013904223) >>> 0
    const age = i % life
    const x0 = state % width
    const y0 = ((state >>> 8) % height + Math.round(force * age)) % height
    const y = y0 < 0 ? y0 + height : y0
    for (let sy = 0; sy < sprite; sy++) {
      for (let sx = 0; sx < sprite; sx++) {
        const x = (x0 + sx) % width
        const py = (y + sy) % height
        const index = (py * width + x) * 4
        out[index] = 255
        out[index + 1] = 255
        out[index + 2] = 255
        out[index + 3] = 255
      }
    }
  }
  return out
}

/** Horizontal parallax from a camera x offset. */
export function applyParallax(rgba: Buffer, width: number, height: number, cameraX: number): Buffer {
  return applyLayer3D(rgba, width, height, { cameraX })
}

export function applyLayer3D(
  rgba: Buffer,
  width: number,
  height: number,
  camera: { cameraX?: number; cameraY?: number; cameraZ?: number; depth?: number; light?: number },
): Buffer {
  const depth = camera.depth ?? 1
  const z = Math.max(0.25, camera.cameraZ ?? 1)
  const shiftX = Math.max(-width + 1, Math.min(width - 1, Math.round(((camera.cameraX ?? 0) * depth) / z)))
  const shiftY = Math.max(-height + 1, Math.min(height - 1, Math.round(((camera.cameraY ?? 0) * depth) / z)))
  const light = Math.max(0, Math.min(2, camera.light ?? 1))
  const out = Buffer.alloc(rgba.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceX = x - shiftX
      const sourceY = y - shiftY
      const dest = (y * width + x) * 4
      if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) continue
      const source = (sourceY * width + sourceX) * 4
      out[dest] = Math.min(255, Math.round(rgba[source] * light))
      out[dest + 1] = Math.min(255, Math.round(rgba[source + 1] * light))
      out[dest + 2] = Math.min(255, Math.round(rgba[source + 2] * light))
      out[dest + 3] = rgba[source + 3]
    }
  }
  if (!shiftX && !shiftY && light === 1) return rgba
  return out
}

/** Optical-flow style displace. dx/dy are pixels. */
export function applyVectorWarp(rgba: Buffer, width: number, height: number, dx: number, dy: number): Buffer {
  const shiftX = Math.round(dx)
  const shiftY = Math.round(dy)
  if (!shiftX && !shiftY) return rgba
  const out = Buffer.alloc(rgba.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceX = x - shiftX
      const sourceY = y - shiftY
      if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) continue
      rgba.copy(out, (y * width + x) * 4, (sourceY * width + sourceX) * 4, (sourceY * width + sourceX) * 4 + 4)
    }
  }
  return out
}

/** Nearer sample wins. Depth is linear distance; smaller is closer. */
export function deepMerge(front: Buffer, back: Buffer, frontZ: ArrayLike<number>, backZ: ArrayLike<number>): Buffer {
  const out = Buffer.from(back)
  const pixels = Math.floor(Math.min(front.length, back.length) / 4)
  for (let i = 0; i < pixels; i++) {
    const frontDepth = frontZ[i] ?? Number.POSITIVE_INFINITY
    const backDepth = backZ[i] ?? Number.POSITIVE_INFINITY
    if (frontDepth <= backDepth) front.copy(out, i * 4, i * 4, i * 4 + 4)
  }
  return out
}

/** Stable id in 0–1 for a Cryptomatte pick. */
export function cryptomatteHash(name: string): number {
  let hash = 2166136261
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

export function cryptomatteCoverage(ids: ArrayLike<number>, name: string): Float32Array {
  const target = cryptomatteHash(name)
  const out = new Float32Array(ids.length)
  for (let i = 0; i < ids.length; i++) {
    out[i] = Math.abs(ids[i] - target) < 1e-4 ? 1 : 0
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
