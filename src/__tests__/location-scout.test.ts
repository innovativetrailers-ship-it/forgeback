import { rankGeoHits, rankScoutFrames, sampleAlong, scoutDropReason, scoutPlatePrompt, type GeoHit, type ScoutFrame } from '@cinema/core'

const king: GeoHit[] = [
  { lat: -37.8136, lng: 144.9631, displayName: 'Melbourne', city: 'Melbourne', state: 'Victoria', postcode: '3000', kind: 'place:city' },
  { lat: -37.818, lng: 144.9565, displayName: 'King Street, Melbourne', street: 'King Street', city: 'Melbourne', state: 'Victoria', postcode: '3000', kind: 'highway:trunk', line: [[144.9554, -37.8159], [144.9565, -37.818], [144.9576, -37.8203]] },
]

describe('location scout', () => {
  it('ranks the street above the city centre for a street query', () => {
    const ranked = rankGeoHits(king, 'king st, Melbourne, Victoria, 3000')
    expect(ranked[0].street).toBe('King Street')
    expect(ranked[0].kind.startsWith('highway')).toBe(true)
    const samples = sampleAlong(ranked[0].line, { lat: ranked[0].lat, lng: ranked[0].lng }, 80, 6)
    expect(samples.length).toBeGreaterThan(1)
  })

  it('drops fisheye and near-duplicate frames and keeps a pano', () => {
    expect(scoutDropReason('fisheye', 2000)).toBe('fisheye')
    const frames: ScoutFrame[] = [
      frame('a', false, 'fisheye', 4000, 1),
      frame('b', false, 'perspective', 2000, 1),
      frame('c', false, 'perspective', 2000, 1.001),
      frame('d', true, 'equirectangular', 4000, 2),
    ]
    const ranked = rankScoutFrames(frames)
    expect(ranked.filtered.some((row) => row.filteredReason === 'fisheye')).toBe(true)
    expect(ranked.filtered.some((row) => row.filteredReason === 'near-duplicate')).toBe(true)
    expect(ranked.shown[0].id).toBe('d')
    expect(scoutPlatePrompt({ name: 'King Street', lat: -37.82, lng: 144.96, time: 'dusk' })).toMatch(/dusk/)
  })
})

function frame(id: string, isPano: boolean, cameraType: string, width: number, lng: number): ScoutFrame {
  return {
    id,
    thumbUrl: 'https://example.com/t.jpg',
    fullUrl: 'https://example.com/f.jpg',
    capturedAt: '2024-01-01',
    lat: -37.82,
    lng: 144.95 + lng / 1000,
    compassAngle: 10,
    isPano,
    cameraType,
    width,
    height: width / 2,
    licence: 'CC BY-SA 4.0',
    source: 'mapillary',
  }
}
