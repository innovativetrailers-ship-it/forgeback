'use client'

import { useState } from 'react'
import { cleanText } from '@/lib/features/request'

const KINDS = ['feature', 'tool', 'bug', 'other'] as const

export function FeatureRequestButton() {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<(typeof KINDS)[number]>('feature')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [route, setRoute] = useState(typeof window === 'undefined' ? '' : window.location.pathname)
  const [screen, setScreen] = useState('app')
  const [note, setNote] = useState('')
  const [queue, setQueue] = useState<Array<{ id: string; title: string; status: string; upvotes: number; body: string; devNote: string | null }>>([])

  async function submit() {
    const res = await fetch('/api/features', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind,
        title,
        body,
        context: { route, screen, platform: 'web', version: 'web' },
      }),
    })
    const payload = await res.json() as { message?: string; error?: string }
    setNote(payload.message || payload.error || 'The request was not saved')
    if (res.ok) {
      setTitle('')
      setBody('')
    }
  }

  async function loadQueue() {
    const res = await fetch('/api/admin/features', { credentials: 'include' })
    if (!res.ok) {
      setNote('The review queue is for admin accounts.')
      return
    }
    const payload = await res.json() as { requests: typeof queue }
    setQueue(payload.requests)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setRoute(window.location.pathname); setOpen(true) }}
        className="fixed bottom-4 left-16 z-40 rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-white/80"
      >
        Request a feature
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-start bg-black/40 p-4" onClick={() => setOpen(false)}>
          <form
            className="w-full max-w-sm space-y-2 rounded-xl bg-[#14141c] p-3 text-[11px] text-white/80"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => { event.preventDefault(); void submit() }}
          >
            <p className="text-[10px] uppercase tracking-wide text-white/40">Request a feature / tool</p>
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="w-full rounded border border-white/10 bg-black/40 px-2 py-1">
              {KINDS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="w-full rounded border border-white/10 bg-black/40 px-2 py-1" />
            <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="What should change, and why?" className="h-20 w-full rounded border border-white/10 bg-black/40 px-2 py-1" />
            <input value={route} onChange={(event) => setRoute(event.target.value)} className="w-full rounded border border-white/10 bg-black/40 px-2 py-1" />
            <input value={screen} onChange={(event) => setScreen(event.target.value)} className="w-full rounded border border-white/10 bg-black/40 px-2 py-1" />
            <button type="submit" className="rounded bg-[#00e5c8] px-2 py-1 text-black">Submit</button>
            <button type="button" className="ml-2 rounded bg-white/10 px-2 py-1" onClick={() => void loadQueue()}>Review queue</button>
            {note && <p>{cleanText(note, 200)}</p>}
            {queue.map((row) => (
              <label key={row.id} className="block">
                {cleanText(row.title, 80)} · {row.upvotes}
                <select
                  value={row.status}
                  onChange={(event) => {
                    const status = event.target.value
                    void fetch(`/api/admin/features/${row.id}`, {
                      method: 'PATCH',
                      credentials: 'include',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ status, devNote: row.devNote ?? '' }),
                    }).then(() => setQueue((current) => current.map((item) => item.id === row.id ? { ...item, status } : item)))
                      .catch((err: unknown) => {
                        console.warn('[feature-request]', err instanceof Error ? err.message : err)
                      })
                  }}
                  className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1"
                >
                  {['new', 'reviewing', 'planned', 'in_progress', 'implemented', 'declined'].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
            ))}
          </form>
        </div>
      )}
    </>
  )
}
