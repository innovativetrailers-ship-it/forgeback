import { extractCryptomatteMatte } from '@/lib/compositor/EXRLoader'
import {
  applyOfx,
  applyParallax,
  applyParticles,
  applyRoto,
  applyVectorWarp,
  bspline,
  cryptomatteCoverage,
  cryptomatteHash,
  deepMerge,
  isolatePlugin,
  ofxParams,
  propagateRoto,
  runOfx,
} from '@/lib/compositor/vfx'

function frame(): Buffer {
  return Buffer.alloc(8 * 4, 255)
}

describe('vfx nodes', () => {
  it('feathers a roto shape and keeps the other pixels', () => {
    const out = applyRoto(frame(), 2, 2, [
      { x: 0, y: 0, feather: 0 },
      { x: 0.6, y: 0, feather: 0 },
      { x: 0.6, y: 1, feather: 0 },
      { x: 0, y: 1, feather: 0 },
    ], 'add')
    expect(out[3]).toBe(255)
    expect(out.length).toBe(32)
  })

  it('tracks a b-spline and combines a second mask', () => {
    const points = [
      { x: 0.1, y: 0.1, feather: 0.05 },
      { x: 0.8, y: 0.1, feather: 0.2 },
      { x: 0.8, y: 0.8, feather: 0.05 },
      { x: 0.1, y: 0.8, feather: 0.05 },
    ]
    const curve = bspline(points)
    expect(curve.length).toBeGreaterThan(points.length)
    const moved = propagateRoto(points, 0.1, 0)
    expect(moved[0].x).toBeCloseTo(0.2)
    const combined = applyRoto(Buffer.alloc(4 * 4 * 4, 255), 4, 4, points, 'add', {
      spline: true,
      layers: [
        { points, combine: 'add' },
        { points: [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.2, y: 0.2 }, { x: 0, y: 0.2 }], combine: 'subtract' },
      ],
      motion: { dx: 0.05, dy: 0 },
    })
    expect(combined.length).toBe(64)
  })

  it('paints the same particles twice and shifts a 3D layer', () => {
    const a = applyParticles(frame(), 2, 2, 2, 3)
    const b = applyParticles(frame(), 2, 2, 2, 3)
    expect(a.equals(b)).toBe(true)
    const forced = applyParticles(frame(), 4, 4, 3, 3, { lifetime: 4, forceY: 1, sprite: 2 })
    expect(forced.equals(applyParticles(frame(), 4, 4, 3, 3, { lifetime: 4, forceY: 1, sprite: 2 }))).toBe(true)
    const shifted = applyParallax(frame(), 2, 2, 1)
    expect(shifted.length).toBe(32)
  })

  it('runs a plugin as a number and drops any script', () => {
    const params = ofxParams('ofx.brightness', 0.5)
    expect(params).toEqual({ pluginId: 'ofx.brightness', amount: 0.5, installed: true })
    const dim = applyOfx(frame(), params.amount)
    expect(dim[0]).toBe(128)
    expect(JSON.stringify(params)).not.toMatch(/eval|function/)
    const blocked = runOfx(frame(), 'ofx.brightness', 0.5, 'process.exit(1)')
    expect(blocked.error).toMatch(/not run/)
    expect(blocked.rgba.equals(frame())).toBe(true)
    const missing = runOfx(frame(), 'ofx.unknown', 2)
    expect(missing.error).toMatch(/not installed/)
    expect(missing.rgba.equals(frame())).toBe(true)
    const kept = isolatePlugin(() => { throw new Error('plugin crash') }, frame())
    expect(kept.equals(frame())).toBe(true)
  })

  it('picks a cryptomatte id, keeps the nearer deep sample, and warps', () => {
    const name = 'hero'
    const id = cryptomatteHash(name)
    const matte = cryptomatteCoverage([0, id, 0.4], name)
    expect(matte[1]).toBe(1)
    expect(matte[0]).toBe(0)
    const fromExr = extractCryptomatteMatte({
      width: 1,
      height: 3,
      channels: ['id.red'],
      hasDepth: false,
      hasCryptomatte: true,
      channelData: { 'id.red': [0, id, 0.4] },
    }, name)
    expect(fromExr?.[1]).toBe(1)
    const front = Buffer.from([255, 0, 0, 255])
    const back = Buffer.from([0, 0, 255, 255])
    const merged = deepMerge(front, back, [0.2], [0.8])
    expect(merged[0]).toBe(255)
    const behind = deepMerge(front, back, [0.9], [0.1])
    expect(behind[2]).toBe(255)
    const warped = applyVectorWarp(frame(), 2, 2, 1, 0)
    expect(warped.length).toBe(32)
  })
})