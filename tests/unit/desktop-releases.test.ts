import {
  buildDesktopDownloadUrls,
  getReleaseFeedBase,
  parseFeedVersion,
  artifactFilename,
  macDownloadOffered,
  windowsDownloadOffered,
} from '../../src/lib/desktop/releases'

describe('desktop releases', () => {
  it('parses version from electron-updater yaml', () => {
    const yaml = `version: 3.0.1\npath: CinematicForge-3.0.1-arm64.zip\n`
    expect(parseFeedVersion(yaml)).toBe('3.0.1')
  })

  it('builds artifact filenames per platform', () => {
    expect(artifactFilename('mac_arm', '3.0.1')).toBe('CinematicForge-3.0.1-arm64.dmg')
    expect(artifactFilename('mac_intel', '3.0.1')).toBe('CinematicForge-3.0.1-x64.dmg')
    expect(artifactFilename('windows', '3.0.1')).toBe('CinematicForge-Setup-3.0.1.exe')
  })

  it('builds R2 download URLs from version', () => {
    const base = getReleaseFeedBase()
    const urls = buildDesktopDownloadUrls('3.0.1')
    expect(urls.mac_arm).toBe(`${base}/mac-arm/CinematicForge-3.0.1-arm64.dmg`)
    expect(urls.mac_intel).toBe(`${base}/mac-intel/CinematicForge-3.0.1-x64.dmg`)
    expect(urls.windows).toBe(`${base}/windows/CinematicForge-Setup-3.0.1.exe`)
  })

  it('does not offer a Mac or Windows download until CI records a signed release', () => {
    expect(macDownloadOffered({ entitled: true, notarized: false })).toBe(false)
    expect(macDownloadOffered({ entitled: false, notarized: true })).toBe(false)
    expect(macDownloadOffered({ entitled: true, notarized: true })).toBe(true)
    expect(windowsDownloadOffered({ entitled: true, signed: false })).toBe(false)
    expect(windowsDownloadOffered({ entitled: true, signed: true })).toBe(true)
  })
})
