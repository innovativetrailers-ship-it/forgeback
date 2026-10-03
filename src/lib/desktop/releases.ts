/** Desktop installer URLs — electron-updater generic feed on R2 (or custom CDN). */

export type DesktopPlatform = 'mac_arm' | 'mac_intel' | 'windows'

export interface DesktopDownloadUrls {
  mac_arm: string
  mac_intel: string
  windows: string
  version: string | null
}

export interface DesktopReleaseStatus extends DesktopDownloadUrls {
  feedBase: string
  available: boolean
  message?: string
}

/** Prefix inside the releases bucket when using the main media R2 public URL. */
export function getDesktopReleasesPrefix(): string {
  const raw = process.env.DESKTOP_RELEASES_PREFIX?.trim()
  return raw ? raw.replace(/^\/+|\/+$/g, '') : 'releases'
}

/** Public CDN base for installer artifacts (custom domain or R2 public URL). */
export function getReleaseFeedBase(): string {
  const fromEnv =
    process.env.DESKTOP_RELEASES_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_DESKTOP_RELEASES_URL
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, '')

  const pub = process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, '')
  if (pub) return `${pub}/${getDesktopReleasesPrefix()}`

  return 'https://releases.forgecinema.app'
}

/** @deprecated use getReleaseFeedBase() — kept for tests */
export const RELEASE_FEED_BASE = getReleaseFeedBase()

export function parseFeedVersion(yaml: string): string | null {
  const match = yaml.match(/^version:\s*(.+)$/m)
  return match?.[1]?.trim() ?? null
}

export function artifactFilename(platform: DesktopPlatform, version: string): string {
  switch (platform) {
    case 'mac_arm':
      return `CinematicForge-${version}-arm64.dmg`
    case 'mac_intel':
      return `CinematicForge-${version}-x64.dmg`
    case 'windows':
      return `CinematicForge-Setup-${version}.exe`
  }
}

function platformSubdir(platform: DesktopPlatform): string {
  switch (platform) {
    case 'mac_arm':
      return 'mac-arm'
    case 'mac_intel':
      return 'mac-intel'
    case 'windows':
      return 'windows'
  }
}

export function buildDesktopDownloadUrls(version: string): Omit<DesktopDownloadUrls, 'version'> {
  const base = getReleaseFeedBase()
  return {
    mac_arm: `${base}/${platformSubdir('mac_arm')}/${artifactFilename('mac_arm', version)}`,
    mac_intel: `${base}/${platformSubdir('mac_intel')}/${artifactFilename('mac_intel', version)}`,
    windows: `${base}/${platformSubdir('windows')}/${artifactFilename('windows', version)}`,
  }
}

export function buildFallbackDownloadUrls(): DesktopDownloadUrls {
  const base = getReleaseFeedBase()
  return {
    version: null,
    mac_arm: `${base}/CinematicForge-arm64.dmg`,
    mac_intel: `${base}/CinematicForge-x64.dmg`,
    windows: `${base}/CinematicForge-Setup.exe`,
  }
}

/** @deprecated use buildFallbackDownloadUrls() */
export const FALLBACK_DOWNLOAD_URLS: DesktopDownloadUrls = buildFallbackDownloadUrls()

export function keyFromReleaseUrl(url: string): string {
  const base = getReleaseFeedBase()
  if (url.startsWith(base + '/')) return url.slice(base.length + 1)
  try {
    const u = new URL(url)
    return u.pathname.replace(/^\//, '')
  } catch (err) {
    console.warn("[caught] src/lib/desktop/releases.ts:95", err instanceof Error ? { name: err.name, message: err.message } : err)

    return url
  }
}

export async function headPublicAsset(url: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchFn(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    return res.ok
  } catch (err) {
    console.warn("[caught] src/lib/desktop/releases.ts:104", err instanceof Error ? { name: err.name, message: err.message } : err)

    return false
  }
}

/** Fetch latest version from electron-updater yaml feeds (best-effort). */
export async function fetchLatestDesktopDownloads(
  fetchFn: typeof fetch = fetch,
): Promise<DesktopDownloadUrls> {
  const base = getReleaseFeedBase()
  try {
    const [macRes, winRes] = await Promise.all([
      fetchFn(`${base}/latest-mac.yml`, { next: { revalidate: 300 } }),
      fetchFn(`${base}/latest.yml`, { next: { revalidate: 300 } }),
    ])
    const macYaml = macRes.ok ? await macRes.text() : ''
    const winYaml = winRes.ok ? await winRes.text() : ''
    const version = parseFeedVersion(macYaml) ?? parseFeedVersion(winYaml)
    if (!version) return buildFallbackDownloadUrls()
    return { version, ...buildDesktopDownloadUrls(version) }
  } catch (err) {
    console.warn("[caught] src/lib/desktop/releases.ts:124", err instanceof Error ? { name: err.name, message: err.message } : err)

    return buildFallbackDownloadUrls()
  }
}

export async function resolveReleaseAsset(
  platform: DesktopPlatform,
  fetchFn: typeof fetch = fetch,
): Promise<{ key: string; publicUrl: string; version: string | null } | null> {
  const meta = await fetchLatestDesktopDownloads(fetchFn)
  const publicUrl = meta[platform]
  const version = meta.version
  if (!publicUrl) return null

  const key = keyFromReleaseUrl(publicUrl)
  const { releaseObjectExists, releaseObjectKey } = await import('@/lib/storage/releasesR2')
  const objectKey = releaseObjectKey(key)

  if (await releaseObjectExists(objectKey)) {
    return { key: objectKey, publicUrl, version }
  }

  if (await headPublicAsset(publicUrl, fetchFn)) {
    return { key: objectKey, publicUrl, version }
  }

  // Versioned builds only exist on the feed — unversioned fallbacks are legacy.
  if (!version) return null

  return null
}

export async function getDesktopReleaseStatus(
  fetchFn: typeof fetch = fetch,
): Promise<DesktopReleaseStatus> {
  const feedBase = getReleaseFeedBase()
  const meta = await fetchLatestDesktopDownloads(fetchFn)
  const { releaseObjectExists, releaseObjectKey } = await import('@/lib/storage/releasesR2')

  const checks = await Promise.all(
    (['mac_arm', 'mac_intel', 'windows'] as DesktopPlatform[]).map(async (platform) => {
      const url = meta[platform]
      const key = releaseObjectKey(keyFromReleaseUrl(url))
      const inR2 = await releaseObjectExists(key)
      const onCdn = inR2 ? true : await headPublicAsset(url, fetchFn)
      return inR2 || onCdn
    }),
  )

  const available = checks.some(Boolean)

  return {
    ...meta,
    feedBase,
    available,
    message: available
      ? undefined
      : 'Desktop installers are not published yet. Connect releases.forgecinema.app to your R2 bucket and run the v3 release workflow, or set NEXT_PUBLIC_DESKTOP_RELEASES_URL.',
  }
}
