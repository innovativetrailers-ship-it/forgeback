'use client'

import { useState } from 'react'
import type { Clip } from '@/lib/timeline/schema'
import type { ChartBar, ClipControl } from '@/lib/timeline/controlLayer'
import { usePlaybackStore } from '@/store/playbackStore'

function parseBars(text: string): ChartBar[] {
  return text.split(',').flatMap((part) => {
    const [label, raw] = part.split(':')
    const value = Number(raw)
    if (!label?.trim() || !Number.isFinite(value)) return []
    return [{ label: label.trim(), value }]
  })
}

function writeControl(clipId: string, patch: ClipControl) {
  const recipe = usePlaybackStore.getState().recipe
  if (!recipe) return
  usePlaybackStore.getState().commitRecipe({
    ...recipe,
    tracks: recipe.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => clip.id === clipId
        ? { ...clip, control: { ...clip.control, ...patch } }
        : clip),
    })),
  })
}

/** Adds overlay, a held plane insert, and a post-camera move. Does not replace the clip. */
export function ClipControlBar({ clip }: { clip: Clip }) {
  const [title, setTitle] = useState(clip.control?.overlays?.[0]?.lowerThird?.title ?? '')
  const [subtitle, setSubtitle] = useState(clip.control?.overlays?.[0]?.lowerThird?.subtitle ?? '')
  const [bars, setBars] = useState('A:40, B:70')
  const [region, setRegion] = useState('0.25, 0.3, 0.4, 0.25')
  const [note, setNote] = useState('')

  function write(patch: ClipControl) {
    writeControl(clip.id, patch)
  }

  function saveOverlay() {
    const chartBars = parseBars(bars)
    write({
      overlays: [{
        id: clip.control?.overlays?.[0]?.id ?? `overlay-${clip.id}`,
        lowerThird: title.trim() ? { title: title.trim(), subtitle: subtitle.trim() || undefined } : undefined,
        chart: chartBars.length ? { title: 'Chart', bars: chartBars } : undefined,
      }],
    })
    setNote('Overlay saved on this clip.')
  }

  function pushIn() {
    const span = Math.max(0.1, clip.endTime - clip.startTime)
    write({
      transformKeys: [
        { timeSec: 0, x: 0, y: 0, scale: 1, rotation: 0, ease: 'bezier' },
        { timeSec: span, x: 0, y: 0, scale: 1.12, rotation: 0, ease: 'bezier' },
      ],
    })
    setNote('Slow push-in saved. Preview and export use the same ease.')
  }

  async function pin(file: File) {
    const parts = region.split(',').map((part) => Number(part.trim()))
    const [x, y, width, height] = parts
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      setNote('Region is x, y, width, height from 0 to 1.')
      return
    }
    const form = new FormData()
    form.set('image', file)
    const uploaded = await fetch('/api/upload/image', { method: 'POST', body: form })
    const stored = await uploaded.json() as { url?: string; error?: string }
    if (!uploaded.ok || !stored.url) {
      setNote(stored.error || 'Could not store the insert')
      return
    }
    const tracked = await fetch('/api/timeline/planar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        videoUrl: clip.sourceUrl,
        x, y, width, height,
        imageUrl: stored.url,
      }),
    })
    const body = await tracked.json() as { planarInsert?: ClipControl['planarInsert']; note?: string; error?: string }
    if (!tracked.ok || !body.planarInsert) {
      setNote(body.error || 'Could not pin the insert')
      return
    }
    write({ planarInsert: body.planarInsert })
    setNote(body.note || 'Insert pinned.')
  }

  return (
    <div className="space-y-1 border-t border-white/10 px-3 py-2 text-[10px] text-white/70">
      <p className="text-white/40">Control on the clip at the playhead. Generated and imported clips both take it. The picture stays.</p>
      <div className="flex flex-wrap gap-1">
        <input className="w-28 rounded bg-black/40 px-1 py-0.5" placeholder="Lower third" value={title} onChange={(event) => setTitle(event.target.value)} />
        <input className="w-28 rounded bg-black/40 px-1 py-0.5" placeholder="Subtitle" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
        <input className="w-36 rounded bg-black/40 px-1 py-0.5" placeholder="A:40, B:70" value={bars} onChange={(event) => setBars(event.target.value)} />
        <button type="button" className="rounded bg-white/10 px-2 py-0.5" onClick={saveOverlay}>Save overlay</button>
        <button type="button" className="rounded bg-white/10 px-2 py-0.5" onClick={pushIn}>Push in</button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <input className="w-40 rounded bg-black/40 px-1 py-0.5" value={region} onChange={(event) => setRegion(event.target.value)} title="x, y, width, height from 0 to 1" />
        <label className="cursor-pointer rounded bg-white/10 px-2 py-0.5">
          Pin image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void pin(file)
            }}
          />
        </label>
      </div>
      {note && <p>{note}</p>}
    </div>
  )
}
