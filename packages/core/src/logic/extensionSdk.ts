/** First-party extension contract. Extensions speak this surface only. */

export const FORGE_API_VERSION = '1.0.0'

export const EXTENSION_ENGINES = ['desktop', 'web'] as const
export type ExtensionEngine = (typeof EXTENSION_ENGINES)[number]

export const EXTENSION_PERMISSIONS = [
  'read-timeline',
  'write-timeline',
  'read-media',
  'run-generation',
] as const
export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number]

export interface ExtensionPoint {
  id: string
  title?: string
  label?: string
  commandId?: string
  extension?: string
}

export interface ExtensionContributions {
  panels: ExtensionPoint[]
  tools: ExtensionPoint[]
  effectNodes: ExtensionPoint[]
  exporters: ExtensionPoint[]
  importers: ExtensionPoint[]
  commands: ExtensionPoint[]
  menus: ExtensionPoint[]
}

export interface ExtensionManifest {
  id: string
  name: string
  version: string
  author: string
  forgeApiVersion: string
  entry: string
  contributes: ExtensionContributions
  permissions: string[]
  engines: ExtensionEngine[]
}

export interface ExtensionRecord {
  manifest: ExtensionManifest
  granted: string[]
  enabled: boolean
}

export interface ExtensionHostState {
  records: ExtensionRecord[]
  storage: Record<string, Record<string, string>>
}

export interface ExtensionClipView {
  id: string
  trackId: string
  start: number
  end: number
  sourceUrl: string
  label: string
}

export interface ExtensionPatch {
  op: 'add' | 'move' | 'trim' | 'add-take'
  clipId?: string
  trackId?: string
  start?: number
  end?: number
  sourceUrl?: string
  label?: string
}

export interface ExtensionDispatchContext {
  engine: ExtensionEngine
  clips: ExtensionClipView[]
  media: { id: string; label: string; url: string }[]
  trackIds: string[]
  mintId: () => string
  fetchImpl?: typeof fetch
  readFile?: (relativePath: string) => string
}

export interface ExtensionResponse {
  ok: boolean
  error?: string
  result?: unknown
  patches?: ExtensionPatch[]
  clips?: ExtensionClipView[]
  quote?: { credits: number; source: 'extension'; status: 'awaiting-confirm' }
}

const ID_RE = /^[a-z][a-z0-9_-]{1,48}$/
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const CONTRIBUTION_KEYS = ['panels', 'tools', 'effectNodes', 'exporters', 'importers', 'commands', 'menus'] as const
const SCOPED_PERMISSION = /^(network|filesystem):([a-z0-9.-]{1,80})$/

export const EXTENSION_REGISTRY: ExtensionManifest[] = [
  {
    id: 'sample-lower-third',
    name: 'Sample lower third',
    version: '1.0.0',
    author: 'Cinematic Forge',
    forgeApiVersion: FORGE_API_VERSION,
    entry: 'index.html',
    engines: ['desktop', 'web'],
    permissions: ['read-timeline', 'write-timeline'],
    contributes: {
      panels: [{ id: 'lower-third', title: 'Lower third' }],
      tools: [{ id: 'add-lower-third', label: 'Add lower third' }],
      effectNodes: [{ id: 'lower-third', label: 'Lower third' }],
      exporters: [],
      importers: [],
      commands: [{ id: 'add-lower-third', title: 'Add lower third' }],
      menus: [{ id: 'titles', label: 'Titles', commandId: 'add-lower-third' }],
    },
  },
]

export function emptyExtensionHost(): ExtensionHostState {
  return { records: [], storage: {} }
}

export function searchExtensionRegistry(query: string): ExtensionManifest[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return EXTENSION_REGISTRY.slice()
  return EXTENSION_REGISTRY.filter((item) =>
    `${item.id} ${item.name} ${item.author}`.toLowerCase().includes(needle),
  )
}

function majorOf(version: string): number {
  return Number(version.split('.')[0])
}

function semverNewer(next: string, current: string): boolean {
  const a = next.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false
  }
  return false
}

function entryLooksSafe(entry: string): boolean {
  return Boolean(entry) && !entry.includes('..') && !entry.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(entry)
}

function points(raw: unknown): ExtensionPoint[] | null {
  if (!Array.isArray(raw)) return null
  const out: ExtensionPoint[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!ID_RE.test(id)) return null
    const point: ExtensionPoint = { id }
    if (typeof row.title === 'string') point.title = row.title.trim()
    if (typeof row.label === 'string') point.label = row.label.trim()
    if (typeof row.commandId === 'string') point.commandId = row.commandId.trim()
    if (typeof row.extension === 'string') point.extension = row.extension.trim()
    out.push(point)
  }
  return out
}

function permissionAllowed(value: string): boolean {
  if ((EXTENSION_PERMISSIONS as readonly string[]).includes(value)) return true
  const match = SCOPED_PERMISSION.exec(value)
  if (!match) return false
  if (match[1] === 'network' && (match[2] === '*' || match[2].includes('*'))) return false
  if (match[1] === 'filesystem' && (match[2].includes('..') || match[2].startsWith('/'))) return false
  return true
}

export function validateExtensionManifest(raw: unknown): { ok: true; manifest: ExtensionManifest } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Extension manifest is not an object.' }
  }
  const row = raw as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const version = typeof row.version === 'string' ? row.version.trim() : ''
  const author = typeof row.author === 'string' ? row.author.trim() : ''
  const forgeApiVersion = typeof row.forgeApiVersion === 'string' ? row.forgeApiVersion.trim() : ''
  const entry = typeof row.entry === 'string' ? row.entry.trim() : ''
  if (!ID_RE.test(id)) return { ok: false, error: 'Extension id must be a lowercase slug.' }
  if (!name || !author) return { ok: false, error: 'Extension name and author are required.' }
  if (!SEMVER_RE.test(version)) return { ok: false, error: 'Extension version must be semver.' }
  if (!SEMVER_RE.test(forgeApiVersion)) return { ok: false, error: 'forgeApiVersion must be semver.' }
  if (majorOf(forgeApiVersion) !== majorOf(FORGE_API_VERSION)) {
    return {
      ok: false,
      error: `This extension needs Forge API ${forgeApiVersion}. This Forge speaks ${FORGE_API_VERSION}. It was not loaded.`,
    }
  }
  if (!entryLooksSafe(entry)) return { ok: false, error: 'Extension entry must stay inside the package.' }
  if (!row.contributes || typeof row.contributes !== 'object' || Array.isArray(row.contributes)) {
    return { ok: false, error: 'Extension contributions are missing.' }
  }
  const source = row.contributes as Record<string, unknown>
  const contributes = {} as ExtensionContributions
  for (const key of CONTRIBUTION_KEYS) {
    const parsed = points(source[key] ?? [])
    if (!parsed) return { ok: false, error: `Contribution ${key} did not parse.` }
    contributes[key] = parsed
  }
  if (!Array.isArray(row.permissions)) return { ok: false, error: 'Extension permissions must be a list.' }
  const permissions = row.permissions.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
  if (permissions.some((item) => !permissionAllowed(item))) {
    return { ok: false, error: 'Extension declared a permission this Forge does not know.' }
  }
  if (!Array.isArray(row.engines) || row.engines.length === 0) {
    return { ok: false, error: 'Extension must declare desktop, web, or both.' }
  }
  const engines = row.engines.filter((item): item is ExtensionEngine =>
    item === 'desktop' || item === 'web',
  )
  if (engines.length !== row.engines.length) return { ok: false, error: 'Extension engine is not desktop or web.' }
  return {
    ok: true,
    manifest: { id, name, version, author, forgeApiVersion, entry, contributes, permissions, engines },
  }
}

export function proposeInstall(raw: unknown, engine: ExtensionEngine):
  | { ok: true; manifest: ExtensionManifest; prompt: string[] }
  | { ok: false; error: string } {
  const checked = validateExtensionManifest(raw)
  if (!checked.ok) return checked
  if (!checked.manifest.engines.includes(engine)) {
    return { ok: false, error: `This extension does not run on ${engine}.` }
  }
  return { ok: true, manifest: checked.manifest, prompt: checked.manifest.permissions.slice() }
}

export function commitInstall(
  state: ExtensionHostState,
  manifest: ExtensionManifest,
  granted: readonly string[],
  userConfirmed: boolean,
): ExtensionHostState {
  if (!userConfirmed) throw new Error('Permissions must be granted by the user before install.')
  const allowed = new Set(manifest.permissions)
  const nextGranted = [...new Set(granted.filter((item) => allowed.has(item)))]
  const records = state.records.filter((item) => item.manifest.id !== manifest.id)
  records.push({ manifest, granted: nextGranted, enabled: true })
  return { ...state, records }
}

export function setExtensionEnabled(state: ExtensionHostState, id: string, enabled: boolean): ExtensionHostState {
  return {
    ...state,
    records: state.records.map((item) => item.manifest.id === id ? { ...item, enabled } : item),
  }
}

export function revokeExtension(state: ExtensionHostState, id: string): ExtensionHostState {
  return {
    ...state,
    records: state.records.map((item) => item.manifest.id === id ? { ...item, granted: [], enabled: false } : item),
    storage: { ...state.storage, [id]: {} },
  }
}

export function uninstallExtension(state: ExtensionHostState, id: string): ExtensionHostState {
  const storage = { ...state.storage }
  delete storage[id]
  return { ...state, records: state.records.filter((item) => item.manifest.id !== id), storage }
}

export function extensionUpdate(record: ExtensionRecord): ExtensionManifest | null {
  const listing = EXTENSION_REGISTRY.find((item) => item.id === record.manifest.id)
  if (!listing || !semverNewer(listing.version, record.manifest.version)) return null
  return listing
}

export function activeContributions(state: ExtensionHostState): { extensionId: string; contributes: ExtensionContributions }[] {
  return state.records
    .filter((item) => item.enabled)
    .map((item) => ({ extensionId: item.manifest.id, contributes: item.manifest.contributes }))
}

function declared(manifest: ExtensionManifest, group: keyof ExtensionContributions, id: string): boolean {
  return manifest.contributes[group].some((item) => item.id === id)
}

function mediaUrl(value: string): boolean {
  if (value.startsWith('data:image/') || value.startsWith('data:video/')) return value.length <= 1_500_000
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch {
    return false
  }
}

function refuse(error: string): ExtensionResponse {
  return { ok: false, error }
}

function hostOf(permission: string): string | null {
  const match = /^network:(.+)$/.exec(permission)
  return match ? match[1] : null
}

export function dispatchExtensionMessage(
  state: ExtensionHostState,
  extensionId: string,
  message: unknown,
  ctx: ExtensionDispatchContext,
): { state: ExtensionHostState; response: ExtensionResponse } {
  try {
    const record = state.records.find((item) => item.manifest.id === extensionId)
    if (!record || !record.enabled) return { state, response: refuse('Extension is disabled.') }
    if (!message || typeof message !== 'object') return { state, response: refuse('Extension message was not understood.') }
    const method = (message as { method?: unknown }).method
    const args = ((message as { args?: unknown }).args ?? {}) as Record<string, unknown>
    if (typeof method !== 'string') return { state, response: refuse('Extension message was not understood.') }
    const granted = new Set(record.granted)
    const needs = (permission: string): ExtensionResponse | null =>
      granted.has(permission) ? null : refuse(`Permission ${permission} was not granted.`)

    if (method === 'timeline.delete') {
      return { state, response: refuse('Extensions cannot delete a clip. Use the explicit delete in the editor.') }
    }
    if (method === 'timeline.read') {
      const denied = needs('read-timeline')
      if (denied) return { state, response: denied }
      return { state, response: { ok: true, result: ctx.clips, clips: ctx.clips } }
    }
    if (method === 'media.read') {
      const denied = needs('read-media')
      if (denied) return { state, response: denied }
      return { state, response: { ok: true, result: ctx.media } }
    }
    if (method === 'timeline.add' || method === 'timeline.move' || method === 'timeline.trim' || method === 'timeline.addTake') {
      const denied = needs('write-timeline')
      if (denied) return { state, response: denied }
      const clips = ctx.clips.map((clip) => ({ ...clip }))
      let patch: ExtensionPatch
      if (method === 'timeline.add') {
        const sourceUrl = typeof args.sourceUrl === 'string' ? args.sourceUrl : ''
        const trackId = typeof args.trackId === 'string' ? args.trackId : ''
        const start = typeof args.start === 'number' ? args.start : NaN
        const end = typeof args.end === 'number' ? args.end : NaN
        if (!mediaUrl(sourceUrl) || !ctx.trackIds.includes(trackId) || !(end > start)) {
          return { state, response: refuse('That clip edit is not a valid add.') }
        }
        const clip: ExtensionClipView = {
          id: ctx.mintId(),
          trackId,
          start,
          end,
          sourceUrl,
          label: typeof args.label === 'string' ? args.label.slice(0, 120) : '',
        }
        clips.push(clip)
        patch = { op: 'add', clipId: clip.id, trackId, start, end, sourceUrl, label: clip.label }
      } else if (method === 'timeline.addTake') {
        const clipId = typeof args.clipId === 'string' ? args.clipId : ''
        const sourceUrl = typeof args.sourceUrl === 'string' ? args.sourceUrl : ''
        const host = clips.find((clip) => clip.id === clipId)
        if (!host || !mediaUrl(sourceUrl)) return { state, response: refuse('That take needs an existing clip and a media URL.') }
        const span = host.end - host.start
        const clip: ExtensionClipView = {
          id: ctx.mintId(),
          trackId: host.trackId,
          start: host.end,
          end: host.end + span,
          sourceUrl,
          label: typeof args.label === 'string' ? args.label.slice(0, 120) : host.label,
        }
        clips.push(clip)
        patch = { op: 'add-take', clipId: clip.id, trackId: clip.trackId, start: clip.start, end: clip.end, sourceUrl, label: clip.label }
      } else {
        const clipId = typeof args.clipId === 'string' ? args.clipId : ''
        const start = typeof args.start === 'number' ? args.start : NaN
        const end = typeof args.end === 'number' ? args.end : NaN
        const clip = clips.find((item) => item.id === clipId)
        if (!clip || !(end > start)) return { state, response: refuse('That clip edit is not a valid trim.') }
        clip.start = start
        clip.end = end
        patch = { op: method === 'timeline.move' ? 'move' : 'trim', clipId, start, end }
      }
      return { state, response: { ok: true, patches: [patch], clips } }
    }
    if (method === 'generation.run') {
      const denied = needs('run-generation')
      if (denied) return { state, response: denied }
      const credits = typeof args.credits === 'number' && args.credits > 0 ? Math.min(64, Math.round(args.credits)) : 1
      return {
        state,
        response: {
          ok: true,
          quote: { credits, source: 'extension', status: 'awaiting-confirm' },
          result: { status: 'awaiting-confirm', credits },
        },
      }
    }
    if (method === 'storage.get' || method === 'storage.set') {
      const key = typeof args.key === 'string' ? args.key.trim() : ''
      if (!key || key.length > 64) return { state, response: refuse('Storage key is empty or too long.') }
      const bucket = { ...(state.storage[extensionId] ?? {}) }
      if (method === 'storage.get') {
        return { state, response: { ok: true, result: bucket[key] ?? null } }
      }
      const value = typeof args.value === 'string' ? args.value : ''
      if (value.length > 8_000) return { state, response: refuse('Storage value is too large.') }
      bucket[key] = value
      return { state: { ...state, storage: { ...state.storage, [extensionId]: bucket } }, response: { ok: true, result: true } }
    }
    if (method === 'network.request') {
      const urlText = typeof args.url === 'string' ? args.url : ''
      let url: URL
      try { url = new URL(urlText) } catch { return { state, response: refuse('Network URL was refused.') } }
      const allowed = [...granted].some((item) => hostOf(item) === url.hostname)
      if (!allowed) return { state, response: refuse('That host is not on the extension allow-list.') }
      if (ctx.fetchImpl) {
        void ctx.fetchImpl(url.toString(), { method: 'GET', credentials: 'omit', headers: { accept: 'application/json' } })
      }
      return { state, response: { ok: true, result: { allowed: true, host: url.hostname } } }
    }
    if (method === 'filesystem.read') {
      if (ctx.engine !== 'desktop') return { state, response: refuse('Filesystem access is desktop-only.') }
      const relativePath = typeof args.path === 'string' ? args.path : ''
      const scopes = [...granted].filter((item) => item.startsWith('filesystem:')).map((item) => item.slice('filesystem:'.length))
      if (!scopes.length || relativePath.includes('..') || relativePath.startsWith('/')) {
        return { state, response: refuse('That file is outside the extension directory.') }
      }
      if (!ctx.readFile) return { state, response: refuse('Filesystem access is desktop-only.') }
      return { state, response: { ok: true, result: ctx.readFile(relativePath) } }
    }
    const registration: Record<string, keyof ExtensionContributions> = {
      'ui.panel': 'panels',
      'ui.tool': 'tools',
      'ui.command': 'commands',
      'ui.menu': 'menus',
      'effect.register': 'effectNodes',
      'exporter.register': 'exporters',
      'importer.register': 'importers',
    }
    const group = registration[method]
    if (group) {
      const id = typeof args.id === 'string' ? args.id : ''
      if (!declared(record.manifest, group, id)) {
        return { state, response: refuse('That contribution was not declared in the manifest.') }
      }
      return { state, response: { ok: true, result: { id, group } } }
    }
    if (method === 'events.subscribe') {
      const topic = args.topic
      if (topic !== 'selection' && topic !== 'playhead' && topic !== 'render') {
        return { state, response: refuse('Unknown editor event.') }
      }
      return { state, response: { ok: true, result: { topic } } }
    }
    return { state, response: refuse('Unknown forge method.') }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Extension call failed.'
    return { state, response: refuse(error) }
  }
}
