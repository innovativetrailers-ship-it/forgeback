/** Desktop installer URLs — electron-updater generic feed on R2 (or custom CDN). */

export type DesktopPlatform = 'mac_arm' | 'mac_intel' | 'windows'

export interface DesktopDownloadUrls {
  mac_arm: string
  mac_intel: string
  windows: string
  version: string | null
}

export interface PlatformReleaseRecord {
  signed: boolean
  notarized: boolean
}

export interface DesktopReleaseManifest {
  version: string | null
  verifiedAt: string | null
  mac: PlatformReleaseRecord
  windows: PlatformReleaseRecord
  sha256: { arm64: string | null; x64: string | null }
}

const SHA256_HEX = /^[a-f0-9]{64}$/i

/** Mac buttons need a notarised build at or after 3.0.4 whose published hash matches the sidecar. */
export function macReleaseReady(input: {
  version: string | null
  notarized: boolean
  sha256: string | null
  sidecar: string | null
}): boolean {
  if (!input.notarized || !versionAtLeast(input.version, '3.0.4')) return false
  const left = input.sha256?.trim().toLowerCase() ?? ''
  const right = input.sidecar?.trim().toLowerCase() ?? ''
  return SHA256_HEX.test(left) && left === right
}

export function versionAtLeast(version: string | null, floor: string): boolean {
  if (!version) return false
  const parse = (value: string) => value.split('.').map((part) => {
    const n = Number.parseInt(part, 10)
    return Number.isFinite(n) ? n : 0
  })
  const left = parse(version)
  const right = parse(floor)
  for (let i = 0; i < 3; i += 1) {
    const a = left[i] ?? 0
    const b = right[i] ?? 0
    if (a > b) return true
    if (a < b) return false
  }
  return true
}

export interface DesktopReleaseStatus extends DesktopDownloadUrls {
  feedBase: string
  available: boolean
  macNotarized: boolean
  signed: boolean
  notarized: boolean
  windowsSigned: boolean
  verifiedAt: string | null
  message?: string
}

/** A download link is offered only when the account may download and CI recorded a notarised Mac build. */
export function macDownloadOffered(input: { entitled: boolean; notarized: boolean }): boolean {
  return input.entitled && input.notarized
}

/** Windows is offered only when CI recorded a signed installer. */
export function windowsDownloadOffered(input: { entitled: boolean; signed: boolean }): boolean {
  return input.entitled && input.signed
}

/** Prefix inside the releases bucket when using the main media R2 public URL. */
export function getDesktopReleasesPrefix(): string {
  const raw = process.env.DESKTOP_RELEASES_PREFIX?.trim()
  return raw ? raw.replace(/^\/+|\/+$/g, '') : 'releases'
}

/** One public feed. Set DESKTOP_RELEASES_PUBLIC_URL to replace the R2 host with a custom domain. */
export const DESKTOP_RELEASES_PUBLIC_URL_DEFAULT =
  'https://pub-850afd32bb2b4b3aa0f4ab57b4b30969.r2.dev/releases'

export function getReleaseFeedBase(): string {
  const fromEnv = process.env.DESKTOP_RELEASES_PUBLIC_URL?.trim()
  return (fromEnv || DESKTOP_RELEASES_PUBLIC_URL_DEFAULT).replace(/\/$/, '')
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

const EMPTY_MANIFEST: DesktopReleaseManifest = {
  version: null,
  verifiedAt: null,
  mac: { signed: false, notarized: false },
  windows: { signed: false, notarized: false },
  sha256: { arm64: null, x64: null },
}

function shaField(value: unknown): string | null {
  return typeof value === 'string' && SHA256_HEX.test(value.trim()) ? value.trim().toLowerCase() : null
}

export async function fetchReleaseManifest(fetchFn: typeof fetch = fetch): Promise<DesktopReleaseManifest> {
  const base = getReleaseFeedBase()
  try {
    const res = await fetchFn(`${base}/desktop-release-manifest.json`, { next: { revalidate: 300 } })
    if (!res.ok) return EMPTY_MANIFEST
    const body = await res.json() as Partial<DesktopReleaseManifest>
    return {
      version: typeof body.version === 'string' ? body.version : null,
      verifiedAt: typeof body.verifiedAt === 'string' ? body.verifiedAt : null,
      mac: {
        signed: body.mac?.signed === true,
        notarized: body.mac?.notarized === true,
      },
      windows: {
        signed: body.windows?.signed === true,
        notarized: body.windows?.notarized === true,
      },
      sha256: {
        arm64: shaField(body.sha256?.arm64),
        x64: shaField(body.sha256?.x64),
      },
    }
  } catch (err) {
    console.warn('[desktop-release]', err instanceof Error ? err.message : err)
    return EMPTY_MANIFEST
  }
}

export async function fetchShaSidecar(
  version: string | null,
  arch: 'arm64' | 'x64',
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  if (!version) return null
  try {
    const res = await fetchFn(`${getReleaseFeedBase()}/CinematicForge-${version}-${arch}.dmg.sha256`, { next: { revalidate: 300 } })
    if (!res.ok) return null
    const text = (await res.text()).trim().toLowerCase()
    return SHA256_HEX.test(text) ? text : null
  } catch (err) {
    console.warn('[desktop-release]', err instanceof Error ? err.message : err)
    return null
  }
}

export async function macNotarizedMarkerPresent(fetchFn: typeof fetch = fetch): Promise<boolean> {
  const base = getReleaseFeedBase()
  const { releaseObjectExists, releaseObjectKey } = await import('@/lib/storage/releasesR2')
  const key = releaseObjectKey('mac-notarized.txt')
  if (await releaseObjectExists(key)) return true
  return headPublicAsset(`${base}/mac-notarized.txt`, fetchFn)
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

  const manifest = await fetchReleaseManifest(fetchFn)
  const [armSidecar, intelSidecar] = await Promise.all([
    fetchShaSidecar(manifest.version, 'arm64', fetchFn),
    fetchShaSidecar(manifest.version, 'x64', fetchFn),
  ])
  const macNotarized = macReleaseReady({
    version: manifest.version,
    notarized: manifest.mac.notarized,
    sha256: manifest.sha256.arm64,
    sidecar: armSidecar,
  }) && macReleaseReady({
    version: manifest.version,
    notarized: manifest.mac.notarized,
    sha256: manifest.sha256.x64,
    sidecar: intelSidecar,
  })
  const checks = await Promise.all(
    (['mac_arm', 'mac_intel', 'windows'] as DesktopPlatform[]).map(async (platform) => {
      if (platform !== 'windows' && !macNotarized) return false
      if (platform === 'windows' && !manifest.windows.signed) return false
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
    macNotarized,
    signed: manifest.mac.signed,
    notarized: manifest.mac.notarized,
    windowsSigned: manifest.windows.signed,
    verifiedAt: manifest.verifiedAt,
    message: available
      ? undefined
      : 'The Mac app is being prepared — signed builds are coming. Use the web app meanwhile.',
  }
}
