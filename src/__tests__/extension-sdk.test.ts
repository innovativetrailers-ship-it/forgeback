import {
  activeContributions,
  commitInstall,
  dispatchExtensionMessage,
  emptyExtensionHost,
  proposeInstall,
  revokeExtension,
  setExtensionEnabled,
  uninstallExtension,
  validateExtensionManifest,
  FORGE_API_VERSION,
  EXTENSION_REGISTRY,
} from '@cinema/core'

const SAMPLE = EXTENSION_REGISTRY[0]

const ctx = {
  engine: 'web' as const,
  clips: [{ id: 'clip-1', trackId: 'track-1', start: 0, end: 4, sourceUrl: 'https://example.com/a.mp4', label: 'A' }],
  media: [{ id: 'clip-1', label: 'A', url: 'https://example.com/a.mp4' }],
  trackIds: ['track-1'],
  mintId: () => 'clip-2',
}

describe('extension sdk', () => {
  it('refuses an incompatible Forge API and parses a valid manifest', () => {
    const bad = validateExtensionManifest({ ...SAMPLE, forgeApiVersion: '2.0.0' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toMatch(/was not loaded/)
    const good = validateExtensionManifest(SAMPLE)
    expect(good.ok).toBe(true)
    if (good.ok) expect(good.manifest.forgeApiVersion).toBe(FORGE_API_VERSION)
  })

  it('installs only after an explicit grant and drops a disabled extension', () => {
    const proposed = proposeInstall(SAMPLE, 'web')
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return
    expect(() => commitInstall(emptyExtensionHost(), proposed.manifest, proposed.prompt, false)).toThrow(/granted by the user/)
    const installed = commitInstall(emptyExtensionHost(), proposed.manifest, ['read-timeline', 'write-timeline'], true)
    expect(activeContributions(installed)).toHaveLength(1)
    const disabled = setExtensionEnabled(installed, SAMPLE.id, false)
    expect(activeContributions(disabled)).toHaveLength(0)
    expect(activeContributions(revokeExtension(installed, SAMPLE.id))).toHaveLength(0)
    expect(uninstallExtension(installed, SAMPLE.id).records).toHaveLength(0)
  })

  it('edits only through forge methods and cannot delete or spend', () => {
    const wider = validateExtensionManifest({
      ...SAMPLE,
      id: 'sample-gen',
      permissions: ['read-timeline', 'write-timeline', 'run-generation', 'network:example.com'],
    })
    expect(wider.ok).toBe(true)
    if (!wider.ok) return
    const installed = commitInstall(emptyExtensionHost(), wider.manifest, wider.manifest.permissions, true)
    const read = dispatchExtensionMessage(installed, wider.manifest.id, { method: 'timeline.read' }, ctx)
    expect(read.response.ok).toBe(true)
    const added = dispatchExtensionMessage(installed, wider.manifest.id, {
      method: 'timeline.add',
      args: { trackId: 'track-1', start: 4, end: 6, sourceUrl: 'https://example.com/b.mp4', label: 'B' },
    }, ctx)
    expect(added.response.patches?.[0].op).toBe('add')
    expect(added.response.clips).toHaveLength(2)
    const deleted = dispatchExtensionMessage(installed, wider.manifest.id, { method: 'timeline.delete', args: { clipId: 'clip-1' } }, ctx)
    expect(deleted.response.ok).toBe(false)
    expect(deleted.response.error).toMatch(/cannot delete/)
    const quote = dispatchExtensionMessage(installed, wider.manifest.id, { method: 'generation.run', args: { credits: 8, confirm: true } }, ctx)
    expect(quote.response.quote).toEqual({ credits: 8, source: 'extension', status: 'awaiting-confirm' })
    const panel = dispatchExtensionMessage(installed, SAMPLE.id, { method: 'ui.panel', args: { id: 'lower-third' } }, ctx)
    expect(panel.response.ok).toBe(false)
    const hosted = commitInstall(installed, SAMPLE, ['read-timeline'], true)
    const registered = dispatchExtensionMessage(hosted, SAMPLE.id, { method: 'ui.panel', args: { id: 'lower-third' } }, ctx)
    expect(registered.response.ok).toBe(true)
    const stranger = dispatchExtensionMessage(hosted, SAMPLE.id, { method: 'ui.panel', args: { id: 'secret-panel' } }, ctx)
    expect(stranger.response.ok).toBe(false)
    const calls: { url: string; init?: RequestInit }[] = []
    const allowed = dispatchExtensionMessage(hosted, wider.manifest.id, { method: 'network.request', args: { url: 'https://example.com/x' } }, {
      ...ctx,
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init })
        return {} as Response
      }) as typeof fetch,
    })
    expect(allowed.response.ok).toBe(true)
    expect(calls[0].init?.credentials).toBe('omit')
    expect(JSON.stringify(calls[0].init?.headers)).not.toMatch(/authorization/i)
  })

  it('blocks an ungranted network call and contains a crash', () => {
    const installed = commitInstall(emptyExtensionHost(), SAMPLE, ['read-timeline'], true)
    const calls: string[] = []
    const blocked = dispatchExtensionMessage(installed, SAMPLE.id, { method: 'network.request', args: { url: 'https://example.com/x' } }, {
      ...ctx,
      fetchImpl: (async (url: string | URL | Request) => {
        calls.push(String(url))
        return {} as Response
      }) as typeof fetch,
    })
    expect(blocked.response.ok).toBe(false)
    expect(calls).toHaveLength(0)
    const boom = { ...ctx }
    Object.defineProperty(boom, 'clips', {
      get() { throw new Error('host blew up') },
    })
    const crashed = dispatchExtensionMessage(installed, SAMPLE.id, { method: 'timeline.read' }, boom)
    expect(crashed.response.ok).toBe(false)
    expect(crashed.response.error).toMatch(/host blew up/)
  })
})
