'use client'

import { useState } from 'react'
import { MULTI_VIDEO_LIMIT } from '@/lib/studio/multiReference'

interface RefImage {
  name: string
  imageUrl: string
  kind: string
}

export function MultiReferencePanel({ images, consent }: { images: RefImage[]; consent: boolean }) {
  const [picked, setPicked] = useState<string[]>([])
  const [mode, setMode] = useState<'elements' | 'reference' | 'condition'>('elements')
  const [prompt, setPrompt] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [seconds, setSeconds] = useState(5)
  const [tier, setTier] = useState<'standard' | '4k'>('standard')
  const [resolution, setResolution] = useState<'480p' | '580p' | '720p'>('480p')
  const [armed, setArmed] = useState(false)
  const [note, setNote] = useState(MULTI_VIDEO_LIMIT)

  function toggle(url: string) {
    setArmed(false)
    setPicked((rows) => rows.includes(url) ? rows.filter((row) => row !== url) : [...rows, url].slice(0, 4))
  }

  async function run() {
    const path = mode === 'condition' ? '/api/studio/timeline/edit' : '/api/studio/references/multi'
    const payload = mode === 'condition'
      ? {
          op: 'inpaint',
          confirm: armed,
          consent,
          prompt,
          videoUrl,
          refImageUrls: picked,
          seconds,
          resolution,
        }
      : {
          mode,
          confirm: armed,
          consent,
          prompt,
          imageUrls: picked,
          seconds: mode === 'elements' ? (seconds === 10 ? 10 : 5) : seconds,
          tier,
        }
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json() as { estimateCredits?: number; error?: string; videoUrl?: string; takeUrl?: string }
    if (!res.ok) {
      setArmed(false)
      setNote(body.error || 'The reference shot did not run')
      return
    }
    if (!armed) {
      setArmed(true)
      setNote(`${body.estimateCredits ?? 0} credits. Confirm to run. The result is a library take. ${MULTI_VIDEO_LIMIT}`)
      return
    }
    setArmed(false)
    setNote(body.videoUrl || body.takeUrl
      ? 'Saved as a library take. It was not placed on the timeline.'
      : 'Saved. The original references stay.')
  }

  return (
    <div className="space-y-1 rounded border border-white/10 p-2 text-[10px] text-white/60">
      <p className="uppercase tracking-wider text-white/35">Multi-reference shot</p>
      <p>{MULTI_VIDEO_LIMIT}</p>
      <div className="flex flex-wrap gap-1">
        {images.filter((row) => row.imageUrl).map((row) => (
          <label key={`${row.kind}-${row.name}`} className="flex items-center gap-1">
            <input type="checkbox" checked={picked.includes(row.imageUrl)} onChange={() => toggle(row.imageUrl)} />
            {row.kind} · {row.name}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {([
          ['elements', 'Combine 2–4 images'],
          ['reference', 'One image to video'],
          ['condition', 'One clip + stills'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" className={`rounded border px-1 ${mode === id ? 'border-[#00e5c8] text-[#00e5c8]' : 'border-white/10'}`} onClick={() => { setMode(id); setArmed(false) }}>
            {label}
          </button>
        ))}
      </div>
      <input value={prompt} onChange={(event) => { setPrompt(event.target.value); setArmed(false) }} placeholder="What the shot should do with these references" className="w-full rounded border border-white/10 bg-black/30 px-1 py-0.5" />
      {mode === 'condition' && (
        <input value={videoUrl} onChange={(event) => { setVideoUrl(event.target.value); setArmed(false) }} placeholder="One clip address" className="w-full rounded border border-white/10 bg-black/30 px-1 py-0.5" />
      )}
      {mode === 'reference' && (
        <select value={tier} onChange={(event) => { setTier(event.target.value === '4k' ? '4k' : 'standard'); setArmed(false) }} className="rounded border border-white/10 bg-black/30 px-1">
          <option value="standard">Kling reference · standard</option>
          <option value="4k">Kling reference · 4K</option>
        </select>
      )}
      {mode === 'condition' && (
        <select value={resolution} onChange={(event) => { setResolution(event.target.value === '720p' || event.target.value === '580p' ? event.target.value : '480p'); setArmed(false) }} className="rounded border border-white/10 bg-black/30 px-1">
          <option value="480p">480p</option>
          <option value="580p">580p</option>
          <option value="720p">720p</option>
        </select>
      )}
      <input type="number" min={3} max={mode === 'elements' ? 10 : 15} value={seconds} onChange={(event) => { setSeconds(Number(event.target.value)); setArmed(false) }} className="w-16 rounded border border-white/10 bg-black/30 px-1" />
      <button
        type="button"
        disabled={!consent}
        className="rounded border border-white/10 px-2 py-0.5 disabled:opacity-40"
        onClick={() => void run().catch((err: unknown) => {
          console.warn('[multi-ref]', err instanceof Error ? err.message : err)
          setNote('The reference shot did not run')
        })}
      >
        {armed ? 'Confirm reference shot' : 'Quote reference shot'}
      </button>
      {note && <p>{note}</p>}
    </div>
  )
}
