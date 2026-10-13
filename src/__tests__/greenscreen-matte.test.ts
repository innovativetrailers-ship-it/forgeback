import { greenScreenGraph as buildGraph } from '../lib/greenscreen/graph'
import { applyMatte, compositeSubject, dominantScreen } from '../lib/greenscreen/matte'

function pixel(r: number, g: number, b: number, a = 255): Uint8Array {
  return new Uint8Array([r, g, b, a])
}

describe('green screen matte', () => {
  it('keys green and keeps a foreground colour', () => {
    const screen = pixel(0, 255, 0)
    applyMatte(screen, { mode: 'chroma', colour: '#00ff00', tolerance: 0.4, softness: 0.05, spill: 0 })
    expect(screen[3]).toBe(0)
    const subject = pixel(180, 40, 40)
    applyMatte(subject, { mode: 'chroma', colour: '#00ff00', tolerance: 0.4, softness: 0.05, spill: 1 })
    expect(subject[3]).toBe(255)
  })

  it('keys blue and luma separately', () => {
    const blue = pixel(0, 0, 255)
    applyMatte(blue, { mode: 'chroma', colour: '#0000ff', tolerance: 0.4, softness: 0.05, spill: 0 })
    expect(blue[3]).toBe(0)
    const dark = pixel(10, 10, 10)
    applyMatte(dark, { mode: 'luma', tolerance: 0.2, softness: 0.05, spill: 0, lumaLow: 0.2, lumaHigh: 0.35 })
    expect(dark[3]).toBe(0)
    const bright = pixel(240, 240, 240)
    applyMatte(bright, { mode: 'luma', tolerance: 0.2, softness: 0.05, spill: 0, lumaLow: 0.2, lumaHigh: 0.35 })
    expect(bright[3]).toBe(255)
  })

  it('picks a dominant screen and composites the subject over the plate', () => {
    const frame = new Uint8Array(8)
    frame.set([0, 255, 0, 255], 0)
    frame.set([0, 255, 0, 255], 4)
    expect(dominantScreen(frame)).toBe('green')
    const fg = pixel(200, 20, 20)
    const bg = pixel(0, 0, 180)
    const out = compositeSubject(fg, bg, 1, 1, { lightWrap: 0, shadow: 0, colourMatch: 0 })
    expect(out[0]).toBe(200)
    const keyed = pixel(0, 255, 0, 0)
    const plate = compositeSubject(keyed, bg, 1, 1, { lightWrap: 0, shadow: 0, colourMatch: 0 })
    expect(plate[2]).toBe(180)
  })

  it('builds a keyer graph and an AI graph that does not pretend to be video matting', () => {
    const local = buildGraph({
      mode: 'chroma', colour: '#00ff00', tolerance: 0.4, softness: 0.05, spill: 0.2,
      invert: false, shrink: 0, grow: 0, holeFill: false, backdrop: true,
      lightWrap: 0.3, shadow: 0.3, colourMatch: 0.2,
    })
    expect(local.nodes.some((node) => node.type === 'Keyer')).toBe(true)
    expect(local.nodes.some((node) => node.type === 'Merge')).toBe(true)
    const ai = buildGraph({
      mode: 'ai', colour: '#00ff00', tolerance: 0.4, softness: 0, spill: 0,
      invert: false, shrink: 0, grow: 0, holeFill: false, backdrop: true,
      lightWrap: 0, shadow: 0, colourMatch: 0,
    })
    expect(ai.nodes.some((node) => node.type === 'Keyer')).toBe(false)
  })
})
