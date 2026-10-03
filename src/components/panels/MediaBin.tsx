'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePlaybackStore } from '@/store/playbackStore'
import type { LibraryFolder, LibraryItem, LibraryKind } from '@/lib/library/model'

const FILTERS: Array<{ id: 'all' | LibraryKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'video', label: 'Video' },
  { id: 'imported', label: 'Imported' },
  { id: 'music', label: 'Music' },
  { id: 'voice', label: 'Voice' },
]

export function MediaBin({ projectId }: { projectId: string }) {
  const [folders, setFolders] = useState<LibraryFolder[]>([])
  const [items, setItems] = useState<LibraryItem[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [name, setName] = useState('')
  const [status, setStatus] = useState('')
  const recipe = usePlaybackStore((state) => state.recipe)

  const load = useCallback(async () => {
    if (!projectId) return
    const res = await fetch(`/api/studio/library?projectId=${encodeURIComponent(projectId)}`)
    const body = await res.json() as { folders?: LibraryFolder[]; items?: LibraryItem[]; error?: string }
    if (!res.ok) {
      setStatus(body.error || 'Library unavailable')
      return
    }
    setFolders(body.folders ?? [])
    setItems(body.items ?? [])
    setFolderId((current) => current ?? body.folders?.find((folder) => folder.kind === 'main')?.id ?? null)
  }, [projectId])

  useEffect(() => { void load() }, [load])

  const active = folders.find((folder) => folder.id === folderId) ?? folders.find((folder) => folder.kind === 'main')
  const visible = items.filter((item) => {
    if (active && item.folderId !== active.id) return false
    if (filter === 'all') return true
    return item.kind === filter
  })
  const primaries = visible.filter((item) => !item.variationOf)
  const variationsOf = (id: string) => visible.filter((item) => item.variationOf === id)

  async function createFolder() {
    const folderName = name.trim()
    if (!folderName) return
    const res = await fetch('/api/studio/library/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, name: folderName, parentId: active?.id }),
    })
    const body = await res.json() as { error?: string }
    setStatus(res.ok ? '' : (body.error || 'Could not create the folder'))
    if (res.ok) {
      setName('')
      await load()
    }
  }

  async function renameFolder() {
    if (!active || active.kind === 'main') return
    const next = name.trim()
    if (!next) return
    const res = await fetch('/api/studio/library/folders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, folderId: active.id, name: next }),
    })
    const body = await res.json() as { error?: string }
    setStatus(res.ok ? '' : (body.error || 'Could not rename the folder'))
    if (res.ok) await load()
  }

  async function deleteFolder() {
    if (!active || active.kind === 'main') return
    const res = await fetch('/api/studio/library/folders', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, folderId: active.id }),
    })
    const body = await res.json() as { error?: string }
    setStatus(res.ok ? 'Items moved to Main.' : (body.error || 'Could not delete the folder'))
    if (res.ok) {
      setFolderId(null)
      await load()
    }
  }

  async function moveItem(itemId: string, nextFolderId: string) {
    const res = await fetch('/api/studio/library/items', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, itemId, folderId: nextFolderId }),
    })
    if (res.ok) await load()
  }

  async function deleteItem(item: LibraryItem) {
    const placed = (recipe?.tracks ?? []).some((track) => track.clips.some((clip) => {
      const mediaId = (clip.metadata as { mediaId?: string } | undefined)?.mediaId
      return mediaId === item.id || clip.id === item.id
    }))
    if (placed && !window.confirm('This take is on the timeline. Delete it from the library and from those slots?')) return
    const res = await fetch('/api/studio/library/items', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, itemId: item.id, confirmPlaced: true }),
    })
    if (!res.ok) return
    const store = usePlaybackStore.getState()
    for (const track of store.recipe?.tracks ?? []) {
      for (const clip of track.clips) {
        const mediaId = (clip.metadata as { mediaId?: string } | undefined)?.mediaId
        if (mediaId === item.id) {
          store.suppressShot(clip.id)
          store.removeTimelineClip(clip.id)
        }
      }
    }
    store.removeLibrary(item.id)
    await load()
  }

  function onDragStart(event: React.DragEvent, item: LibraryItem) {
    event.dataTransfer.setData('application/x-cinema-media', JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="flex flex-col gap-2 text-xs text-white/80">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((row) => (
          <button key={row.id} type="button" className={`rounded px-2 py-1 ${filter === row.id ? 'bg-white/15 text-white' : 'bg-white/5'}`} onClick={() => setFilter(row.id)}>
            {row.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className={`rounded px-2 py-1 ${folder.id === active?.id ? 'bg-[#00e5c8]/20 text-white' : 'bg-white/5'}`}
            onClick={() => setFolderId(folder.id)}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('application/x-cinema-media')) event.preventDefault()
            }}
            onDrop={(event) => {
              const raw = event.dataTransfer.getData('application/x-cinema-media')
              if (!raw) return
              event.preventDefault()
              try {
                const item = JSON.parse(raw) as LibraryItem
                if (item.id) void moveItem(item.id, folder.id)
              } catch (err) {
                console.warn('[library] folder drop', err instanceof Error ? err.message : err)
              }
            }}
          >
            {folder.name}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <input className="flex-1 rounded bg-black/40 px-2 py-1" placeholder="Folder name" value={name} onChange={(event) => setName(event.target.value)} />
        <button type="button" className="rounded bg-white/10 px-2" onClick={() => void createFolder()}>Create</button>
        <button type="button" className="rounded bg-white/10 px-2" onClick={() => void renameFolder()}>Rename</button>
        <button type="button" className="rounded bg-white/10 px-2" onClick={() => void deleteFolder()}>Delete</button>
      </div>
      {primaries.map((item) => (
        <div key={item.id}>
          <article
            draggable
            onDragStart={(event) => onDragStart(event, item)}
            className="rounded border border-white/10 p-2"
          >
            {item.thumbUrl && (
              <img src={item.thumbUrl} alt="" className="mb-1 h-16 w-full rounded object-cover" />
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-white">{item.label}</span>
              <span className="text-[10px] uppercase text-white/40">{item.kind}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {folders.filter((folder) => folder.id !== item.folderId).map((folder) => (
                <button key={folder.id} type="button" className="rounded bg-white/5 px-1" onClick={() => void moveItem(item.id, folder.id)}>
                  {folder.name}
                </button>
              ))}
              <button type="button" className="rounded bg-white/5 px-1 text-red-300" onClick={() => void deleteItem(item)}>Delete</button>
            </div>
          </article>
          {variationsOf(item.id).map((take) => (
            <article key={take.id} draggable onDragStart={(event) => onDragStart(event, take)} className="ml-3 mt-1 rounded border border-white/10 p-2">
              {take.thumbUrl && <img src={take.thumbUrl} alt="" className="mb-1 h-12 w-full rounded object-cover" />}
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/70">{take.label}</span>
                <span className="text-[10px] uppercase text-white/40">variation</span>
              </div>
              <button type="button" className="mt-1 rounded bg-white/5 px-1 text-red-300" onClick={() => void deleteItem(take)}>Delete</button>
            </article>
          ))}
        </div>
      ))}
      {status && <p>{status}</p>}
      <p className="text-[10px] text-white/40">Drag a take onto a timeline track. Moving it between folders does not change the timeline.</p>
    </div>
  )
}
