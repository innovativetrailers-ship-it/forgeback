'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { REFERENCE_IMAGE_CAP } from '@/lib/studio/referenceImage'

type MediaItem = { name: string; url: string; kind: 'image' | 'video' | 'audio'; selected: boolean }

export function AssetPrompt({
  kind,
  media,
  onToggle,
  consent,
}: {
  kind: 'character' | 'style' | 'asset' | 'location'
  media: MediaItem[]
  onToggle: (url: string) => void
  consent: boolean
}) {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [parents, setParents] = useState<Array<{ id: string; name: string }>>([])
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const selected = media.filter((item) => item.selected && item.kind === 'image')

  useEffect(() => {
    setArmed(false)
    void fetch(`/api/studio/assets/t2i?kind=${kind}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((body: { assets?: Array<{ id: string; name: string }> }) => setParents(body.assets ?? []))
      .catch((err) => {
        console.warn('[asset-t2i] parents', err instanceof Error ? err.message : err)
        setParents([])
      })
  }, [kind])

  async function generate() {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/studio/assets/t2i', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          prompt,
          name: name || kind,
          parentId: parentId || undefined,
          referenceUrls: selected.map((item) => item.url),
          confirm: armed,
          consent,
        }),
      })
      const body = await res.json() as { error?: string; estimateCredits?: number; model?: string; referenceCount?: number }
      if (!res.ok) throw new Error(body.error ?? 'Could not save the asset')
      if (!armed) {
        setArmed(true)
        const used = body.referenceCount ?? selected.length
        setNote(used
          ? `${body.estimateCredits ?? 1} credit. Uses ${used} reference image(s) on ${body.model}. Confirm to run.`
          : `${body.estimateCredits ?? 1} credit. Text only. Confirm to run.`)
        return
      }
      setArmed(false)
      setPrompt('')
      setNote('Saved in the library. It was not placed on the timeline.')
      await queryClient.invalidateQueries({ queryKey: ['trained-assets'] })
      await queryClient.invalidateQueries({ queryKey: ['studio-locations'] })
    } catch (err) {
      setArmed(false)
      console.warn('[asset-t2i]', err instanceof Error ? err.message : err)
      setNote(err instanceof Error ? err.message : 'Could not save the asset')
    } finally {
      setBusy(false)
    }
  }

  const label = busy
    ? 'Saving…'
    : armed
      ? 'Confirm reference'
      : selected.length
        ? `Generate from ${selected.length} reference${selected.length === 1 ? '' : 's'}`
        : parentId
          ? 'Add variation'
          : 'Generate reference'

  return (
    <div className="rounded border border-[var(--border)] p-2 space-y-1.5">
      <p className="text-[10px] text-[var(--text-tertiary)]">Generate a reference image into the asset library. Cap {REFERENCE_IMAGE_CAP} images.</p>
      <input
        value={name}
        onChange={(event) => { setName(event.target.value); setArmed(false) }}
        placeholder="Name"
        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1"
      />
      <textarea
        value={prompt}
        onChange={(event) => { setPrompt(event.target.value); setArmed(false) }}
        placeholder={parentId ? 'Modifier only, e.g. night, wet streets' : 'Describe the character, location, style, or asset'}
        rows={2}
        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1"
      />
      <select
        value={parentId}
        onChange={(event) => { setParentId(event.target.value); setArmed(false) }}
        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1"
      >
        <option value="">New primary</option>
        {parents.map((parent) => (
          <option key={parent.id} value={parent.id}>Variation of {parent.name}</option>
        ))}
      </select>
      {media.filter((item) => item.kind === 'image').map((item) => (
        <label key={item.url} className="flex items-center gap-1 text-[10px]">
          <input type="checkbox" checked={item.selected} onChange={() => { onToggle(item.url); setArmed(false) }} />
          {item.name}
        </label>
      ))}
      <button
        type="button"
        disabled={busy || prompt.trim().length < 3 || ((kind === 'character' || kind === 'location') && selected.length > 0 && !consent)}
        onClick={() => void generate()}
        className="w-full py-1.5 rounded bg-[var(--teal-bright)] text-[var(--bg-primary)] font-semibold disabled:opacity-50"
      >
        {label}
      </button>
      {note && <p className="text-[10px] text-white/60">{note}</p>}
    </div>
  )
}
