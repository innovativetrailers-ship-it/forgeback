'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function AssetPrompt({ kind }: { kind: 'character' | 'style' | 'asset' }) {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [parents, setParents] = useState<Array<{ id: string; name: string }>>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
    setError(null)
    try {
      const res = await fetch('/api/studio/assets/t2i', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, prompt, name: name || kind, parentId: parentId || undefined }),
      })
      const body = await res.json() as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Could not save the asset')
      await queryClient.invalidateQueries({ queryKey: ['trained-assets'] })
      setPrompt('')
    } catch (err) {
      console.warn('[asset-t2i]', err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : 'Could not save the asset')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded border border-[var(--border)] p-2 space-y-1.5">
      <p className="text-[10px] text-[var(--text-tertiary)]">Generate a reference image into the asset library</p>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name"
        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1"
      />
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={parentId ? 'Modifier only, e.g. about 12 years younger' : 'Describe the character, style, or asset'}
        rows={2}
        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1"
      />
      <select
        value={parentId}
        onChange={(event) => setParentId(event.target.value)}
        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1"
      >
        <option value="">New primary</option>
        {parents.map((parent) => (
          <option key={parent.id} value={parent.id}>Variation of {parent.name}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || prompt.trim().length < 3}
        onClick={() => void generate()}
        className="w-full py-1.5 rounded bg-[var(--teal-bright)] text-[var(--bg-primary)] font-semibold disabled:opacity-50"
      >
        {busy ? 'Saving…' : parentId ? 'Add variation' : 'Generate reference'}
      </button>
      {error && <p className="text-[10px] text-red-300">{error}</p>}
    </div>
  )
}
