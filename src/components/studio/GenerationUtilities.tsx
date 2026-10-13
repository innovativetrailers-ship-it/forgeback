'use client'

import { useState } from 'react'

export function GenerationUtilities() {
  const [place, setPlace] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [note, setNote] = useState('')
  const [armed, setArmed] = useState<'aerial' | 'mesh' | null>(null)

  async function run(op: 'aerial' | 'mesh') {
    const path = op === 'aerial' ? '/api/studio/location/aerial' : '/api/studio/assets/mesh'
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(op === 'aerial'
        ? { place, confirm: armed === 'aerial' }
        : { imageUrl, confirm: armed === 'mesh' }),
    })
    const body = await res.json() as { estimateCredits?: number; error?: string; imageUrl?: string; meshUrl?: string | null; splatUrl?: string | null }
    if (!res.ok) {
      setArmed(null)
      setNote(body.error || 'The utility did not run')
      return
    }
    if (armed !== op) {
      setArmed(op)
      setNote(`${body.estimateCredits ?? 1} credit. Confirm to run. Real map capture is unchanged.`)
      return
    }
    setArmed(null)
    setNote(body.imageUrl
      ? 'Aerial plate saved on the location. Real map capture is unchanged.'
      : body.meshUrl
        ? '3D reference saved. Use stills, not the raw mesh, for generation.'
        : body.splatUrl
          ? 'SAM 3D returned a splat and no mesh. The still was kept.'
          : 'Saved. The original stays.')
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/10 p-2 text-[10px] text-white/60">
      <p className="uppercase tracking-wider text-white/35">Location and 3D utilities</p>
      <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Place for a synthetic aerial plate" className="w-full rounded border border-white/10 bg-black/40 px-2 py-1" />
      <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void run('aerial').catch((err: unknown) => { console.warn('[aerial]', err instanceof Error ? err.message : err); setNote('The aerial plate did not run') })}>
        {armed === 'aerial' ? 'Confirm aerial · 1 cr' : 'Aerial plate · 1 cr'}
      </button>
      <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="Still address for image-to-3D" className="w-full rounded border border-white/10 bg-black/40 px-2 py-1" />
      <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void run('mesh').catch((err: unknown) => { console.warn('[mesh]', err instanceof Error ? err.message : err); setNote('The 3D reconstruction did not run') })}>
        {armed === 'mesh' ? 'Confirm 3D · 1 cr' : 'Image to 3D · 1 cr'}
      </button>
      {note && <p>{note}</p>}
    </div>
  )
}
