'use client'

import { useEffect, useState } from 'react'

type Prefs = { episodic: boolean; project: boolean }

export default function PrivacySettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    void fetch('/api/privacy', { credentials: 'include' })
      .then((res) => res.json())
      .then((body: { privacy?: Prefs }) => setPrefs(body.privacy ?? { episodic: true, project: true }))
      .catch((err) => {
        console.warn('[privacy] load', err instanceof Error ? err.message : err)
        setNote('Could not load privacy settings')
      })
  }, [])

  async function save(patch: Partial<Prefs>) {
    const res = await fetch('/api/privacy', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const body = await res.json() as { privacy?: Prefs; error?: string }
    if (!res.ok || !body.privacy) {
      setNote(body.error || 'Could not save')
      return
    }
    setPrefs(body.privacy)
    setNote('Saved.')
  }

  async function clearEpisodic() {
    const res = await fetch('/api/privacy', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clear: 'episodic' }),
    })
    setNote(res.ok ? 'Stored creative memory was cleared.' : 'Could not clear memory')
  }

  if (!prefs) return <p className="p-6 text-sm text-white/60">Loading privacy settings…</p>

  return (
    <main className="mx-auto max-w-lg space-y-4 p-6 text-sm text-white/80">
      <h1 className="text-lg text-white">Privacy</h1>
      <p>These switches are on by default. Off stops that store from being read or written for your account.</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={prefs.episodic} onChange={(event) => void save({ episodic: event.target.checked })} />
        Creative memory. On, decisions are remembered. Off, they are not stored or recalled.
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={prefs.project} onChange={(event) => void save({ project: event.target.checked })} />
        Project context. On, search context can inform a run. Off, that search context is not read.
      </label>
      <button type="button" className="rounded bg-white/10 px-3 py-1" onClick={() => void clearEpisodic()}>
        Clear stored creative memory
      </button>
      {note && <p>{note}</p>}
    </main>
  )
}
