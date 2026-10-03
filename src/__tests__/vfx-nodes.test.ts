import { applyOfx, applyParallax, applyParticles, applyRoto, ofxParams } from '@/lib/compositor/vfx'

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

  it('paints the same particles twice and shifts a 3D layer', () => {
    const a = applyParticles(frame(), 2, 2, 2, 3)
    const b = applyParticles(frame(), 2, 2, 2, 3)
    expect(a.equals(b)).toBe(true)
    const shifted = applyParallax(frame(), 2, 2, 1)
    expect(shifted.length).toBe(32)
  })

  it('runs a plugin as a number and drops any script', () => {
    const params = ofxParams('ofx.brightness', 0.5)
    expect(params).toEqual({ pluginId: 'ofx.brightness', amount: 0.5 })
    const dim = applyOfx(frame(), params.amount)
    expect(dim[0]).toBe(128)
    expect(JSON.stringify(params)).not.toMatch(/eval|function/)
  })
})
