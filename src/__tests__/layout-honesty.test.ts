import { readFileSync } from 'node:fs'

describe('scout, avatar, and layout', () => {
  it('drags a pin on the aerial viewer', () => {
    const page = readFileSync('src/app/location/aerial/page.tsx', 'utf8')
    expect(page).toContain('ScreenSpaceEventType.LEFT_DOWN')
    expect(page).toContain('Pinned place')
  })

  it('returns a long avatar take as segments instead of an error', () => {
    const route = readFileSync('src/app/api/studio/avatar/route.ts', 'utf8')
    expect(route).toContain('submitted: false')
    expect(route).toContain('segments: parts')
    expect(route).not.toContain('slice(0, 400)')
    const panel = readFileSync('src/components/panels/RailTools.tsx', 'utf8')
    expect(panel).toContain('/api/studio/voices')
    expect(panel).toContain('Speech is not synthesised here')
  })

  it('does not stack a separate track-height bar or an ultimate edit row', () => {
    expect(readFileSync('src/components/editor/Timeline.tsx', 'utf8')).not.toContain('Track height')
    expect(readFileSync('src/components/layout/TopBar.tsx', 'utf8')).toContain('!isUltimate')
  })
})
