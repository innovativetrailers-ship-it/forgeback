'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  activeContributions,
  commitInstall,
  emptyExtensionHost,
  extensionUpdate,
  proposeInstall,
  revokeExtension,
  searchExtensionRegistry,
  setExtensionEnabled,
  uninstallExtension,
  dispatchExtensionMessage,
  type ExtensionHostState,
  type ExtensionManifest,
} from '@cinema/core'
import { applyExtensionPatches, clipsForExtension } from '@/lib/extensions/apply'
import type { TimelineRecipe } from '@/lib/timeline/schema'

const STORAGE_KEY = 'cinema-extensions'

function loadHost(): ExtensionHostState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyExtensionHost()
    const parsed = JSON.parse(raw) as ExtensionHostState
    if (!parsed || !Array.isArray(parsed.records)) return emptyExtensionHost()
    return { records: parsed.records, storage: parsed.storage ?? {} }
  } catch (err) {
    console.warn('[extensions]', err instanceof Error ? err.message : err)
    return emptyExtensionHost()
  }
}

export function ExtensionManager({
  recipe,
  onCommit,
}: {
  recipe: TimelineRecipe
  onCommit: (recipe: TimelineRecipe) => void
}) {
  const [host, setHost] = useState<ExtensionHostState>(emptyExtensionHost)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<ExtensionManifest | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [confirmed, setConfirmed] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [quote, setQuote] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => { setHost(loadHost()) }, [])
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(host)) }, [host])

  const listings = useMemo(() => searchExtensionRegistry(query), [query])
  const live = activeContributions(host)

  const stage = (raw: unknown) => {
    const proposed = proposeInstall(raw, 'web')
    if (!proposed.ok) {
      setPending(null)
      setNote(proposed.error)
      return
    }
    setPending(proposed.manifest)
    setPicked(Object.fromEntries(proposed.prompt.map((item) => [item, false])))
    setConfirmed(false)
    setNote(null)
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { source?: string; id?: string; method?: string; args?: unknown; extensionId?: string }
      if (!data || data.source !== 'forge-extension' || typeof data.extensionId !== 'string') return
      const view = clipsForExtension(recipe)
      const dispatched = dispatchExtensionMessage(host, data.extensionId, { method: data.method, args: data.args }, {
        engine: 'web',
        clips: view.clips,
        trackIds: view.trackIds,
        media: view.clips.map((clip) => ({ id: clip.id, label: clip.label, url: clip.sourceUrl })),
        mintId: () => crypto.randomUUID(),
      })
      setHost(dispatched.state)
      if (dispatched.response.patches?.length) onCommit(applyExtensionPatches(recipe, dispatched.response.patches))
      if (dispatched.response.quote) setQuote(`${dispatched.response.quote.credits} credits — confirm in the editor before anything is generated.`)
      frameRef.current?.contentWindow?.postMessage({ id: data.id, ...dispatched.response }, '*')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [host, onCommit, recipe])

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2 text-[11px] text-white/75">
      <p className="text-[10px] uppercase tracking-wide text-white/40">Extensions</p>
      <input
        className="rounded border border-white/10 bg-black/40 px-2 py-1"
        placeholder="Search the registry"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {listings.map((item) => (
        <button key={item.id} type="button" className="rounded border border-white/10 px-2 py-1 text-left" onClick={() => stage(item)}>
          {item.name} · v{item.version}
        </button>
      ))}
      <label className="rounded border border-dashed border-white/15 px-2 py-2 text-white/50">
        Sideload a manifest
        <input
          className="mt-1 block w-full text-[10px]"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            void file.text().then((text) => {
              try { stage(JSON.parse(text)) } catch (err) {
                console.warn('[extensions]', err instanceof Error ? err.message : err)
                setNote('That file is not a manifest.')
              }
            })
          }}
        />
      </label>
      {pending && (
        <div className="rounded border border-white/10 p-2">
          <p className="text-white/90">{pending.name} wants:</p>
          {pending.permissions.map((permission) => (
            <label key={permission} className="mt-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(picked[permission])}
                onChange={(event) => setPicked((current) => ({ ...current, [permission]: event.target.checked }))}
              />
              {permission}
            </label>
          ))}
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            Grant the checked permissions
          </label>
          <button
            type="button"
            disabled={!confirmed}
            className="mt-2 rounded bg-white/10 px-2 py-1 disabled:opacity-40"
            onClick={() => {
              const granted = pending.permissions.filter((item) => picked[item])
              setHost((current) => commitInstall(current, pending, granted, true))
              setPending(null)
              setNote(`${pending.name} installed.`)
            }}
          >
            Install
          </button>
        </div>
      )}
      {note && <p>{note}</p>}
      {quote && <p>{quote}</p>}
      {host.records.map((record) => {
        const update = extensionUpdate(record)
        return (
          <div key={record.manifest.id} className="rounded border border-white/10 p-2">
            <p className="text-white/90">{record.manifest.name} · v{record.manifest.version}</p>
            <p className="text-white/45">{record.enabled ? 'Enabled' : 'Disabled'} · {record.granted.join(', ') || 'no permissions'}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => setHost((current) => setExtensionEnabled(current, record.manifest.id, !record.enabled))}>
                {record.enabled ? 'Disable' : 'Enable'}
              </button>
              <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => setHost((current) => revokeExtension(current, record.manifest.id))}>Revoke</button>
              <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => setHost((current) => uninstallExtension(current, record.manifest.id))}>Uninstall</button>
              {update && (
                <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => stage(update)}>
                  Update to {update.version}
                </button>
              )}
            </div>
          </div>
        )
      })}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-white/40">Contributing now</p>
        {live.length === 0 && <p className="text-white/40">Nothing enabled.</p>}
        {live.map((item) => (
          <p key={item.extensionId}>
            {item.contributes.panels.map((panel) => panel.title || panel.id).join(', ') || item.extensionId}
          </p>
        ))}
      </div>
      {live[0] && (
        <iframe
          ref={frameRef}
          title={live[0].extensionId}
          sandbox="allow-scripts"
          className="h-24 w-full rounded border border-white/10 bg-black"
          srcDoc={`<!doctype html><script>
            window.forge = {
              call(method, args) {
                const id = Math.random().toString(36).slice(2);
                return new Promise((resolve) => {
                  function onMessage(event) {
                    if (!event.data || event.data.id !== id) return;
                    window.removeEventListener('message', onMessage);
                    resolve(event.data);
                  }
                  window.addEventListener('message', onMessage);
                  parent.postMessage({ source: 'forge-extension', id, method, args, extensionId: ${JSON.stringify(live[0].extensionId)} }, '*');
                });
              }
            };
          </script>`}
        />
      )}
    </div>
  )
}
