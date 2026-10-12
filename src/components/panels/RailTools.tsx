'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { LOCAL_TRANSITIONS, applyLocalTransition, setClipVolume } from '@/lib/editor/foundation'
import { proposeReel, type ReelPick } from '@/lib/highlight/propose'
import { CGIInsertTool } from '@/components/ultimate/CGIInsertTool'
import { appendTimelineClipToPlayback } from '@/lib/timeline/syncToPlayback'
import { useEditorStore } from '@/store/editor'
import { usePlaybackStore } from '@/store/playbackStore'
import type { TimelineRecipe } from '@/lib/timeline/schema'

const NodeCompositor = dynamic(() => import('@/components/studio/NodeCompositor'), { ssr: false })

const PEXELS_LICENCE = 'Pexels License — free to use. Attribution is stored with the library copy. Stock is not used for training.'
const BASIC = ['cut', 'dissolve', 'fade', 'fade-in', 'fade-out'] as const
const CINEMATIC = ['wipe', 'slide', 'push', 'zoom', 'whip', 'spin', 'glitch', 'blur', 'film_burn', 'light_leak'] as const

function selectedClip() {
  const id = useEditorStore.getState().selectedClipId
  const recipe = usePlaybackStore.getState().recipe
  if (!id || !recipe) return null
  for (const track of recipe.tracks) {
    const clip = track.clips.find((row) => row.id === id)
    if (clip) return clip
  }
  return null
}

function selectFirstVideo() {
  const recipe = usePlaybackStore.getState().recipe
  const clip = recipe?.tracks.flatMap((track) => track.clips).find((row) => row.sourceUrl)
  if (!clip) return false
  useEditorStore.getState().selectClip(clip.id)
  return true
}

function EmptyClip({ title, action }: { title: string; action: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <p className="text-[12px] text-[var(--text-primary)]">{title}</p>
      <button type="button" className="rounded bg-[var(--teal-bright)] px-2 py-1 text-[11px] text-black" onClick={() => { if (!selectFirstVideo()) return }}>
        {action}
      </button>
    </div>
  )
}

export function ComingPanel({ label, run }: { label: string; run: string }) {
  return (
    <div className="p-4 text-[11px] text-[var(--text-secondary)]">
      <p className="text-[12px] text-[var(--text-primary)]">{label}</p>
      <p className="mt-1">Coming — {run}. This rail item does not open a placeholder.</p>
    </div>
  )
}

export function TransitionsPanel() {
  const recipe = usePlaybackStore((state) => state.recipe)
  const clipId = useEditorStore((state) => state.selectedClipId)
  const [note, setNote] = useState('')
  if (!recipe || !clipId) return <EmptyClip title="Transitions sit on the selected clip joint." action="Select a video clip" />

  function apply(type: (typeof LOCAL_TRANSITIONS)[number]) {
    const current = usePlaybackStore.getState().recipe
    if (!current || !clipId) return
    usePlaybackStore.getState().commitRecipe(applyLocalTransition(current, clipId, type, 0.5))
    setNote(type === 'generative-bridge'
      ? 'The joint is marked. A generative bridge take is not started from here and spends nothing.'
      : `${type} is on the clip. Export reads this transition. Preview does not.`)
  }

  return (
    <div className="space-y-3 overflow-y-auto p-3 text-[11px]">
      <Group title="Basic" types={BASIC} onApply={apply} />
      <Group title="Cinematic" types={CINEMATIC} onApply={apply} />
      <Group title="Generative" types={['generative-bridge']} onApply={apply} />
      {note && <p className="text-[var(--text-tertiary)]">{note}</p>}
    </div>
  )
}

function Group({ title, types, onApply }: { title: string; types: readonly string[]; onApply: (type: (typeof LOCAL_TRANSITIONS)[number]) => void }) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase text-[var(--text-tertiary)]">{title}</p>
      <div className="flex flex-wrap gap-1">
        {types.map((type) => (
          <button key={type} type="button" className="rounded border border-[var(--border)] px-2 py-1" onClick={() => onApply(type as (typeof LOCAL_TRANSITIONS)[number])}>{type}</button>
        ))}
      </div>
    </div>
  )
}

export function AudioStudioPanel() {
  const clipId = useEditorStore((state) => state.selectedClipId)
  const recipe = usePlaybackStore((state) => state.recipe)
  const clip = recipe?.tracks.flatMap((track) => track.clips).find((row) => row.id === clipId)
  const [volume, setVolume] = useState(clip?.audioSettings?.volume ?? 1)
  const [low, setLow] = useState(clip?.audioSettings?.eq?.low ?? 0)
  const [mid, setMid] = useState(clip?.audioSettings?.eq?.mid ?? 0)
  const [high, setHigh] = useState(clip?.audioSettings?.eq?.high ?? 0)
  if (!recipe || !clip) return <EmptyClip title="Audio studio sets volume on the selected clip." action="Select a clip with audio" />

  function write(nextVolume: number, eq: { low: number; mid: number; high: number }) {
    const current = usePlaybackStore.getState().recipe
    if (!current || !clip) return
    const withVolume = setClipVolume(current, clip.id, nextVolume)
    usePlaybackStore.getState().commitRecipe({
      ...withVolume,
      tracks: withVolume.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((row) => row.id === clip.id
          ? { ...row, audioSettings: { volume: nextVolume, pan: row.audioSettings?.pan ?? 0, fadeIn: row.audioSettings?.fadeIn, fadeOut: row.audioSettings?.fadeOut, eq } }
          : row),
      })),
    })
  }

  return (
    <div className="space-y-2 p-3 text-[11px]">
      <p>Volume is applied on export. Preview does not play it.</p>
      <label className="block">Volume {volume.toFixed(2)}
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); write(value, { low, mid, high }) }} className="w-full" />
      </label>
      <p className="text-[var(--text-tertiary)]">EQ is applied on export. This preview does not play the EQ.</p>
      {([['Low', low, setLow], ['Mid', mid, setMid], ['High', high, setHigh]] as const).map(([label, value, set]) => (
        <label key={label} className="block">{label} {value}
          <input type="range" min={-12} max={12} value={value} onChange={(event) => {
            const next = Number(event.target.value)
            set(next)
            const eq = { low: label === 'Low' ? next : low, mid: label === 'Mid' ? next : mid, high: label === 'High' ? next : high }
            write(volume, eq)
          }} className="w-full" />
        </label>
      ))}
      <p className="text-[var(--text-tertiary)]">Desktop still has the deeper audio suite. This is the web mix.</p>
    </div>
  )
}

export function VfxPanel() {
  const clip = selectedClip()
  return (
    <div className="h-full overflow-hidden">
      <p className="px-2 py-1 text-[10px] text-[var(--text-tertiary)]">Web node graph. Desktop-only nodes stay disabled inside it.</p>
      <NodeCompositor sourceUrl={clip?.sourceUrl} />
    </div>
  )
}

export function CgiPanel() {
  const clipId = useEditorStore((state) => state.selectedClipId)
  const recipe = usePlaybackStore((state) => state.recipe)
  const clip = recipe?.tracks.flatMap((track) => track.clips).find((row) => row.id === clipId)
  if (!clip?.sourceUrl) return <EmptyClip title="Select a video clip to insert CGI into it." action="Select a video clip" />
  return (
    <CGIInsertTool
      sourceVideoUrl={clip.sourceUrl}
      videoDuration={Math.max(1, clip.endTime - clip.startTime)}
      onInsertComplete={() => undefined}
    />
  )
}

export function StockPanel() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'photo' | 'video'>('video')
  const [rows, setRows] = useState<Array<{ id: string; url: string; thumbUrl: string; author: string; type: string }>>([])
  const [note, setNote] = useState('Pixabay, Unsplash, and Freesound have no key configured, so they are not searched.')
  const [preview, setPreview] = useState<string | null>(null)

  async function search() {
    const res = await fetch(`/api/stock?query=${encodeURIComponent(query)}&type=${type}`, { credentials: 'include' })
    const body = await res.json() as { results?: typeof rows; error?: string }
    if (!res.ok) {
      setNote(body.error || 'Pexels search failed')
      return
    }
    setRows(body.results ?? [])
    setNote(PEXELS_LICENCE)
  }

  async function save(row: (typeof rows)[number]) {
    const res = await fetch('/api/stock/import', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: row.url, author: row.author, type: row.type, title: `Pexels ${row.id}` }),
    })
    const body = await res.json() as { error?: string; licence?: string }
    setNote(body.error || body.licence || 'Saved on R2. Drag it from the library. It was not placed on the timeline.')
  }

  return (
    <div className="space-y-2 overflow-y-auto p-3 text-[11px]">
      <div className="flex gap-1">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Pexels" className="flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1" />
        <select value={type} onChange={(event) => setType(event.target.value as 'photo' | 'video')} className="bg-transparent"><option value="video">video</option><option value="photo">photo</option></select>
        <button type="button" className="rounded bg-[var(--teal-bright)] px-2 text-black" onClick={() => void search()}>Search</button>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="rounded border border-[var(--border)] p-1">
          <button type="button" onClick={() => setPreview(row.thumbUrl || row.url)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.thumbUrl} alt="" className="aspect-video w-full object-cover" />
          </button>
          <p className="text-[10px] text-[var(--text-tertiary)]">{row.author} · Pexels</p>
          <button type="button" className="text-[var(--teal-bright)]" onClick={() => void save(row)}>Add to library</button>
        </div>
      ))}
      {preview && <p className="text-[10px]">Preview uses the Pexels image until you save. The library copy is on R2.</p>}
      <p className="text-[var(--text-tertiary)]">{note}</p>
    </div>
  )
}

export function BrandKitPanel() {
  const [kits, setKits] = useState<Array<{ id: string; name: string; primaryColor: string; secondaryColor: string; accentColor: string; fontFamily: string }>>([])
  const [name, setName] = useState('Brand')
  const [primary, setPrimary] = useState('#00e5c8')
  const [font, setFont] = useState('Inter')
  const [note, setNote] = useState('Your marks stay yours. This does not apply itself.')

  async function load() {
    const res = await fetch('/api/brand', { credentials: 'include' })
    const body = await res.json() as { kits?: typeof kits; error?: string }
    if (!res.ok) setNote(body.error || 'Could not load kits')
    else setKits(body.kits ?? [])
  }

  useEffect(() => { void load() }, [])

  async function create() {
    const res = await fetch('/api/brand', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, primaryColor: primary, secondaryColor: '#111111', accentColor: primary, fontFamily: font }),
    })
    const body = await res.json() as { error?: string }
    setNote(body.error || 'Kit saved. Nothing on the timeline changed.')
    await load()
  }

  function linkSelected(kitId: string, color: string, family: string) {
    const clip = selectedClip()
    if (!clip) {
      setNote('Select a title or caption first. Nothing was changed.')
      return
    }
    useEditorStore.getState().updateClip(clip.id, {
      metadata: { ...(clip.metadata ?? {}), brandKitId: kitId, brandColor: color, brandFont: family },
    })
    setNote('The clip points at the kit. The media file was not changed.')
  }

  async function saveColour(kit: (typeof kits)[number]) {
    const res = await fetch('/api/brand', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: kit.id, primaryColor: primary, fontFamily: font }),
    })
    if (!res.ok) {
      setNote('The colour was not saved')
      return
    }
    const recipe = usePlaybackStore.getState().recipe
    if (recipe) {
      const next: TimelineRecipe = {
        ...recipe,
        tracks: recipe.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((row) => row.metadata?.brandKitId === kit.id
            ? { ...row, metadata: { ...row.metadata, brandColor: primary, brandFont: font } }
            : row),
        })),
      }
      usePlaybackStore.getState().commitRecipe(next)
    }
    setNote('Linked clips now use the new colour. Unlinked clips were left alone.')
    await load()
  }

  return (
    <div className="space-y-2 overflow-y-auto p-3 text-[11px]">
      <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" />
      <input type="color" value={primary} onChange={(event) => setPrimary(event.target.value)} />
      <select value={font} onChange={(event) => setFont(event.target.value)} className="bg-transparent">
        {['Inter', 'Roboto', 'Playfair Display'].map((item) => <option key={item}>{item}</option>)}
      </select>
      <button type="button" className="rounded bg-[var(--teal-bright)] px-2 py-1 text-black" onClick={() => void create()}>Save kit</button>
      <p className="text-[var(--text-tertiary)]">Font files and vision extract are not in this panel. Watermark burn-in is stored on the kit and is not burned by the current export.</p>
      {kits.map((kit) => (
        <div key={kit.id} className="rounded border border-[var(--border)] p-2">
          <p>{kit.name} · {kit.primaryColor} · {kit.fontFamily}</p>
          <button type="button" className="mr-2 text-[var(--teal-bright)]" onClick={() => linkSelected(kit.id, primary, font)}>Link selected clip</button>
          <button type="button" onClick={() => void saveColour(kit)}>Update linked titles</button>
        </div>
      ))}
      <p>{note}</p>
    </div>
  )
}

export function AvatarPanel() {
  const [imageUrl, setImageUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [seconds, setSeconds] = useState(8)
  const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p')
  const [script, setScript] = useState('')
  const [likeness, setLikeness] = useState(false)
  const [rights, setRights] = useState(false)
  const [notMinor, setNotMinor] = useState(false)
  const [quote, setQuote] = useState<number | null>(null)
  const [note, setNote] = useState('OmniHuman v1.5. 1080p stops at 30s. 720p stops at 60s. A longer script is split, not cut off.')

  const spoken = Math.max(seconds, Math.ceil(script.trim().split(/\s+/).filter(Boolean).length / 2.2))

  async function upload(file: File, kind: 'image' | 'video' | 'audio') {
    const form = new FormData()
    form.set(kind === 'audio' ? 'audio' : kind, file)
    const res = await fetch(`/api/upload/${kind === 'audio' ? 'audio' : kind}`, { method: 'POST', body: form, credentials: 'include' })
    const body = await res.json() as { url?: string; error?: string }
    if (!res.ok || !body.url) throw new Error(body.error || 'Upload failed')
    return body.url
  }

  async function run(confirm: boolean) {
    const res = await fetch('/api/studio/avatar', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        imageUrl, audioUrl, seconds: spoken, resolution, prompt: script,
        likenessConsent: likeness, audioRights: rights, notMinor, confirm,
      }),
    })
    const body = await res.json() as { error?: string; estimateCredits?: number; videoUrl?: string; note?: string; parts?: number[] }
    if (!confirm) {
      setQuote(body.estimateCredits ?? null)
      setNote(body.error || (body.parts ? `Segments: ${body.parts.join('s, ')}s` : 'Quoted. Nothing was submitted.'))
      return
    }
    if (!res.ok || !body.videoUrl) {
      setNote(body.error || 'The avatar did not run')
      return
    }
    setNote(body.note || 'New take stored. It was not placed on the timeline.')
    setQuote(null)
    ;(window as unknown as { __avatarUrl?: string }).__avatarUrl = body.videoUrl
  }

  return (
    <div className="space-y-2 overflow-y-auto p-3 text-[11px]">
      <input type="file" accept="image/*" onChange={(event) => {
        const file = event.target.files?.[0]
        if (!file) return
        void upload(file, 'image').then(setImageUrl).catch((err) => { console.warn('[avatar]', err instanceof Error ? err.message : err); setNote(err instanceof Error ? err.message : 'Upload failed') })
      }} />
      <input type="file" accept="audio/*" onChange={(event) => {
        const file = event.target.files?.[0]
        if (!file) return
        void upload(file, 'audio').then(setAudioUrl).catch((err) => { console.warn('[avatar]', err instanceof Error ? err.message : err); setNote(err instanceof Error ? err.message : 'Upload failed') })
      }} />
      <textarea value={script} onChange={(event) => setScript(event.target.value)} placeholder="Script. A long script shows its split and is not submitted as one cut-down clip." className="h-16 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" />
      <label className="block">Seconds {seconds}<input type="range" min={1} max={120} value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} className="w-full" /></label>
      <select value={resolution} onChange={(event) => setResolution(event.target.value as '1080p' | '720p')} className="bg-transparent"><option value="1080p">1080p · 30s</option><option value="720p">720p · 60s</option></select>
      <label className="flex gap-2"><input type="checkbox" checked={likeness} onChange={(event) => setLikeness(event.target.checked)} /> Likeness consent</label>
      <label className="flex gap-2"><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} /> Audio rights</label>
      <label className="flex gap-2"><input type="checkbox" checked={notMinor} onChange={(event) => setNotMinor(event.target.checked)} /> Portrait is not a minor</label>
      <p>Spoken length used for the quote: {spoken}s</p>
      <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void run(false)}>Quote</button>
      <button type="button" className="ml-2 rounded bg-[var(--teal-bright)] px-2 py-1 text-black" disabled={!likeness || !rights || !notMinor} onClick={() => void run(true)}>Confirm</button>
      {quote != null && <p>{quote} credits</p>}
      <button type="button" className="block text-[var(--teal-bright)]" onClick={() => {
        const url = (window as unknown as { __avatarUrl?: string }).__avatarUrl
        if (!url) { setNote('Generate a take first. Nothing was placed.'); return }
        appendTimelineClipToPlayback({ id: crypto.randomUUID(), sourceUrl: url, durationSec: spoken, label: 'Avatar' })
        setNote('Added at the playhead. The original files stay.')
      }}>Add take to timeline</button>
      <p className="text-[var(--text-tertiary)]">{note}</p>
    </div>
  )
}

export function HighlightPanel() {
  const recipe = usePlaybackStore((state) => state.recipe)
  const [target, setTarget] = useState(60)
  const [focus, setFocus] = useState('')
  const [picks, setPicks] = useState<ReelPick[]>([])
  const [note, setNote] = useState('Local scoring is free. Nothing is written until you create the sequence.')

  function build() {
    if (!recipe) return
    const clips = recipe.tracks.flatMap((track) => track.clips).filter((clip) => clip.sourceUrl).map((clip) => ({
      id: clip.id,
      prompt: clip.prompt,
      start: clip.startTime,
      end: clip.endTime,
    }))
    setPicks(proposeReel(clips, target, focus))
  }

  function createSequence() {
    const current = usePlaybackStore.getState().recipe
    if (!current || !picks.length) return
    const trackId = 't-reel'
    const tracks = current.tracks.some((track) => track.id === trackId)
      ? current.tracks
      : [...current.tracks, { id: trackId, type: 'video' as const, label: 'REEL', muted: false, locked: false, solo: false, clips: [] }]
    let cursor = 0
    const added = picks.flatMap((pick) => {
      const source = current.tracks.flatMap((track) => track.clips).find((clip) => clip.id === pick.id)
      if (!source?.sourceUrl) return []
      const span = pick.end - pick.start
      const clip = {
        ...source,
        id: crypto.randomUUID(),
        trackId,
        startTime: cursor,
        endTime: cursor + span,
        metadata: { ...(source.metadata ?? {}), highlightReason: pick.reason, highlightOf: source.id },
      }
      cursor += span
      return [clip]
    })
    usePlaybackStore.getState().commitRecipe({
      ...current,
      tracks: tracks.map((track) => track.id === trackId ? { ...track, clips: [...track.clips, ...added] } : track),
    })
    setNote('A new REEL track was added. The original clips were not changed.')
  }

  return (
    <div className="space-y-2 overflow-y-auto p-3 text-[11px]">
      {!recipe && <p>Open a timeline. This proposes a reel from its clips.</p>}
      <label className="block">Target {target}s
        <input type="range" min={15} max={90} step={15} value={target} onChange={(event) => setTarget(Number(event.target.value))} className="w-full" />
      </label>
      <input value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="Focus, such as the founder speaking" className="w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" />
      <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={build}>Propose</button>
      {picks.map((pick, index) => (
        <div key={pick.id} className="rounded border border-[var(--border)] p-1">
          <p>{index + 1}. {pick.reason}</p>
          <p className="text-[var(--text-tertiary)]">{(pick.end - pick.start).toFixed(1)}s · score {pick.score}</p>
        </div>
      ))}
      <button type="button" className="rounded bg-[var(--teal-bright)] px-2 py-1 text-black" disabled={!picks.length} onClick={createSequence}>Create sequence</button>
      <p className="text-[var(--text-tertiary)]">LLM ranking is not run from this panel. Beat-sync and auto-captions are not applied here.</p>
      <p>{note}</p>
    </div>
  )
}
