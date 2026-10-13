import { readFileSync } from 'node:fs'

function text(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('honest panels', () => {
  it('opens the panels that used to have no rail button', () => {
    const rail = text('src/components/layout/IconRail.tsx')
    for (const id of ['avatar', 'highlight', 'translate', 'transitions', 'cgi', 'audio', 'vfx']) {
      expect(rail).toContain(`id: '${id}'`)
    }
    expect(text('src/components/layout/TopBar.tsx')).toMatch(/setActivePanel\('settings'\)/)
    expect(text('src/app/(editor)/ultimate/page.tsx')).not.toMatch(/const TABS/)
  })

  it('says preview does not play the transition or the volume', () => {
    const panel = text('src/components/panels/RailTools.tsx')
    expect(panel).toMatch(/Preview does not/)
    expect(panel).toMatch(/Preview does not play it/)
    expect(panel).not.toMatch(/Preview and export read this transition/)
    expect(panel).not.toMatch(/Volume is heard in/)
  })

  it('says a brand kit does not redraw the title', () => {
    const panel = text('src/components/panels/RailTools.tsx')
    expect(panel).toMatch(/Titles are not redrawn/)
    expect(panel).toMatch(/The media file was not changed/)
  })

  it('does not offer a video matte from the green screen panel', () => {
    const panel = text('src/components/panels/GreenScreenPanel.tsx')
    expect(panel).toMatch(/Stills only/)
    expect(panel).not.toMatch(/Add video layers to timeline/)
  })

  it('reads makeup status from the look', () => {
    const panel = text('src/components/panels/SFXMakeupPanel.tsx')
    expect(panel).toMatch(/look\.methods\.bake/)
    expect(panel).toMatch(/look\.methods\.video/)
    expect(text('src/components/panels/MakeupViewport.tsx')).toMatch(/Tinted sphere/)
  })

  it('keeps an avatar take in component state', () => {
    const panel = text('src/components/panels/RailTools.tsx')
    expect(panel).toMatch(/takeUrl/)
    expect(panel).not.toMatch(/__avatarUrl/)
    expect(text('src/app/api/studio/avatar/route.ts')).not.toMatch(/slice\(0, 400\)/)
  })

  it('restores a fitted track height and keys the dock by workspace', () => {
    expect(text('src/components/editor/Timeline.tsx')).toMatch(/saved === 'fit'/)
    expect(text('src/components/editor/EditorDock.tsx')).toMatch(/cinema-editor:\$\{userId \?\? 'local'\}:\$\{workspace\}/)
  })

  it('drops vendor names from marketing surfaces', () => {
    expect(text('src/app/opengraph-image.tsx')).not.toMatch(/Kling/)
    expect(text('src/components/landing/FeaturesSection.tsx')).not.toMatch(/Veo 3/)
    expect(text('src/components/landing/FeaturesSection.tsx')).not.toMatch(/TikTok/)
    expect(text('src/components/panels/MoGRTPanel.tsx')).not.toMatch(/TikTok Like/)
    expect(text('src/lib/importers/DaVinciImporter.ts')).toMatch(/Colour project/)
    expect(text('src/lib/importers/CapCutImporter.ts')).toMatch(/Mobile editor project/)
    expect(text('src/components/panels/ImportProjectPanel.tsx')).not.toMatch(/split\(' '\)/)
  })

  it('loads open street map buildings and does not invent scout errors', () => {
    expect(text('src/app/location/aerial/page.tsx')).toMatch(/createOsmBuildingsAsync/)
    expect(text('src/app/location/aerial/page.tsx')).toMatch(/OpenStreetMap/)
    expect(text('src/app/api/location/search/route.ts')).not.toMatch(/KartaView nearby search returned HTTP 400/)
    expect(text('src/app/api/studio/location/scout-plate/route.ts')).toMatch(/MAPILLARY_LICENCE/)
  })
})
