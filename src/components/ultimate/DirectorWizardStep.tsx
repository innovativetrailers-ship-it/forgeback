'use client'

import { useEffect, useState } from 'react'
import type { ShotTransitionKind, StructuredShot } from '@/lib/orchestration/types'
import { GlbCapture } from '@/components/ultimate/GlbCapture'

const SIZES = ['ECU', 'CU', 'MCU', 'MS', 'MLS', 'WS', 'EWS']
const ANGLES = ['eye_level', 'low', 'high', 'overhead', 'dutch', 'pov']
const MOVES = ['static', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'dolly_in', 'dolly_out', 'truck_left', 'crane_up', 'handheld', 'orbit']
const TRANSITIONS = ['cut', 'dissolve', 'fade-in', 'fade-out', 'match', 'flash']

interface NamedImage { name: string; imageUrl: string }

interface RunBody {
  phase?: string | null
  message?: string | null
  spendCredits?: number
  ownLicence?: boolean
  subjectConsent?: boolean
  references?: { characters: NamedImage[]; locations: NamedImage[] } | null
  library?: Array<{ name: string; kind: string; imageUrl: string }>
  selectedModels?: string[]
  shots?: StructuredShot[]
  sequenceFlags?: boolean[]
  error?: string
}

export function DirectorWizardStep({
  jobId,
  onResume,
}: {
  jobId: string
  onResume: () => void
}) {
  const [shots, setShots] = useState<StructuredShot[]>([])
  const [flags, setFlags] = useState<boolean[]>([])
  const [phase, setPhase] = useState('')
  const [spend, setSpend] = useState(0)
  const [refs, setRefs] = useState<{ characters: NamedImage[]; locations: NamedImage[] }>({ characters: [], locations: [] })
  const [library, setLibrary] = useState<Array<{ name: string; kind: string; imageUrl: string }>>([])
  const [models, setModels] = useState<string[]>([])
  const [consent, setConsent] = useState(false)
  const [importName, setImportName] = useState('')
  const [importKind, setImportKind] = useState<'character' | 'location'>('character')
  const [modifier, setModifier] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'screenplay'>('list')
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [libraryName, setLibraryName] = useState('')

  useEffect(() => {
    let cancel = false
    void fetch(`/api/studio/director/run?jobId=${encodeURIComponent(jobId)}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((body: RunBody) => {
        if (cancel) return
        setShots(body.shots ?? [])
        setFlags(body.sequenceFlags ?? [])
        setPhase(body.phase ?? '')
        setSpend(body.spendCredits ?? 0)
        setRefs(body.references ?? { characters: [], locations: [] })
        setLibrary(body.library ?? [])
        setModels(body.selectedModels ?? [])
        setConsent(Boolean(body.ownLicence && body.subjectConsent))
      })
      .catch((err) => {
        console.warn('[wizard] run load failed', err instanceof Error ? err.message : err)
        if (!cancel) setError('Could not load this step')
      })
    return () => { cancel = true }
  }, [jobId])

  const stage = phase.replace('awaiting_user:', '') || 'script'
  const sequenceCount = flags.filter(Boolean).length

  function update(index: number, patch: Partial<StructuredShot>) {
    setShots((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function storeStill(file: File, label: string) {
    if (!consent || !importName.trim()) throw new Error('Name the subject and tick consent first')
    const form = new FormData()
    form.append('image', file)
    const uploaded = await fetch('/api/upload/image', { method: 'POST', body: form, credentials: 'include' })
    const fileBody = await uploaded.json() as { url?: string; error?: string }
    if (!uploaded.ok || !fileBody.url) throw new Error(fileBody.error ?? 'Upload failed')
    const saved = await fetch('/api/studio/director/run', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        consent: true,
        importRef: { name: `${importName.trim()} · ${label}`, kind: importKind, imageUrl: fileBody.url },
      }),
    })
    const imported = await saved.json() as RunBody
    if (!saved.ok) throw new Error(imported.error ?? 'Could not add the reference')
    setRefs(imported.references ?? { characters: [], locations: [] })
  }

  function modeLabel(shot: StructuredShot): string {
    return shot.storyboardUrl
      ? 'still present → first frame or reference, not text-to-video'
      : 'no still → text-to-video'
  }

  async function vary(imageUrl: string, parentName: string, kind: 'character' | 'location') {
    if (!consent || modifier.trim().length < 3) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/studio/director/variation', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          imageUrl,
          parentName,
          kind,
          modifier: modifier.trim(),
          consent: true,
        }),
      })
      const body = await res.json() as RunBody
      if (!res.ok) throw new Error(body.error ?? 'Could not derive the variation')
      setRefs(body.references ?? refs)
    } catch (err) {
      console.warn('[wizard] variation failed', err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : 'Could not derive the variation')
    } finally {
      setBusy(false)
    }
  }

  async function useAsKeyframe(shotIndex: number, imageUrl: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/studio/director/run', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, consent: true, keyframe: { shotIndex, imageUrl } }),
      })
      const body = await res.json() as RunBody
      if (!res.ok) throw new Error(body.error ?? 'Could not set the keyframe')
      setShots((rows) => rows.map((row) => row.shotIndex === shotIndex ? { ...row, storyboardUrl: imageUrl } : row))
    } catch (err) {
      console.warn('[wizard] keyframe failed', err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : 'Could not set the keyframe')
    } finally {
      setBusy(false)
    }
  }

  async function generateAngles(imageUrl: string, parentName: string, kind: 'character' | 'location', presets: string[]) {
    if (!consent) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/studio/director/angles', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, imageUrl, parentName, kind, presets, consent: true }),
      })
      const body = await res.json() as RunBody
      if (!res.ok) throw new Error(body.error ?? 'Could not generate angles')
      setRefs(body.references ?? refs)
    } catch (err) {
      console.warn('[wizard] angles failed', err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : 'Could not generate angles')
    } finally {
      setBusy(false)
    }
  }

  async function saveAndExit() {
    setBusy(true)
    setError(null)
    try {
      const saved = await fetch('/api/studio/director/run', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, shots }),
      })
      const body = await saved.json() as RunBody
      if (!saved.ok) throw new Error(body.error ?? 'Could not save this step')
      setSavedNote('Saved. This run stays paused until you press Next.')
    } catch (err) {
      console.warn('[wizard] save failed', err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  async function saveToLibrary(imageUrl: string, kind: string) {
    const name = libraryName.trim()
    if (!name || !imageUrl.startsWith('http')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/studio/director/run', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          saveLibrary: { name, kind, imageUrl, usableAsReference: true, trainable: true },
        }),
      })
      const body = await res.json() as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Could not save to the library')
      setSavedNote(`${name} is in the library for later runs and training.`)
      setLibraryName('')
    } catch (err) {
      console.warn('[wizard] library save failed', err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : 'Could not save to the library')
    } finally {
      setBusy(false)
    }
  }

  async function saveAndResume() {
    setBusy(true)
    setError(null)
    try {
      if (stage === 'script' || stage === 'shots') {
        const saved = await fetch('/api/studio/director/run', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, shots }),
        })
        const body = await saved.json() as RunBody
        if (!saved.ok) throw new Error(body.error ?? 'Could not save the shot list')
        setFlags(body.sequenceFlags ?? [])
      }
      const resumed = await fetch('/api/studio/director/resume', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      const body = await resumed.json() as { error?: string }
      if (!resumed.ok) throw new Error(body.error ?? 'Could not resume')
      onResume()
    } catch (err) {
      console.warn('[wizard] step failed', err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : 'Could not continue')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#00e5c8]/30 bg-[#00e5c8]/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-[#00e5c8]">Wizard · {stage}</p>
        <p className="text-[10px] text-white/40">Next stage est. {spend || '—'} credits</p>
      </div>
      {stage === 'script' && (
        <>
          <p className="text-[10px] text-white/45">
            {shots.length} shot{shots.length === 1 ? '' : 's'}
            {sequenceCount > 0 ? ` · ${sequenceCount} prompt${sequenceCount === 1 ? '' : 's'} look like more than one action` : ''}
          </p>
          <div className="flex gap-1">
            <button type="button" className={`rounded border px-2 py-0.5 text-[10px] ${view === 'screenplay' ? 'border-[#00e5c8]/40 text-[#00e5c8]' : 'border-white/10 text-white/50'}`} onClick={() => setView('screenplay')}>Screenplay</button>
            <button type="button" className={`rounded border px-2 py-0.5 text-[10px] ${view === 'list' ? 'border-[#00e5c8]/40 text-[#00e5c8]' : 'border-white/10 text-white/50'}`} onClick={() => setView('list')}>Shot list</button>
          </div>
          <button
            type="button"
            className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/70"
            onClick={() => setShots((rows) => [...rows, {
              shotIndex: rows.length,
              startSeconds: 0,
              endSeconds: 5,
              duration: 5,
              contentType: 'physical_action',
              visualPrompt: 'New shot',
              cameraMove: 'static',
              motionLevel: 'medium',
              hasDialogue: false,
              hasFaces: false,
              hasAudio: false,
              hasCGI: false,
              charactersPresent: [],
              locationsPresent: [],
              lighting: 'natural_day',
              mood: 'calm',
              bridgeRequired: rows.length > 0,
              continuityGroup: 0,
              isChainStart: rows.length === 0,
              transition: { kind: 'cut' },
            }])}
          >
            Add shot
          </button>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {shots.map((shot, index) => (
              <div key={`${shot.shotIndex}-${index}`} className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-2">
                <div className="flex items-center justify-between text-[10px] text-white/40">
                  <span>Shot {index + 1}</span>
                  <span className="flex gap-1">
                    <button type="button" className="px-1" onClick={() => setShots((rows) => index === 0 ? rows : rows.map((row, i) => i === index - 1 ? rows[index]! : i === index ? rows[index - 1]! : row))}>Up</button>
                    <button type="button" className="px-1" onClick={() => setShots((rows) => index === rows.length - 1 ? rows : rows.map((row, i) => i === index ? rows[index + 1]! : i === index + 1 ? rows[index]! : row))}>Down</button>
                    <button type="button" className="px-1" onClick={() => setShots((rows) => [...rows.slice(0, index + 1), {
                      shotIndex: index + 1,
                      startSeconds: 0,
                      endSeconds: 5,
                      duration: 5,
                      contentType: 'physical_action',
                      visualPrompt: 'New shot',
                      cameraMove: 'static',
                      motionLevel: 'medium',
                      hasDialogue: false,
                      hasFaces: false,
                      hasAudio: false,
                      hasCGI: false,
                      charactersPresent: [],
                      locationsPresent: [],
                      lighting: 'natural_day',
                      mood: 'calm',
                      bridgeRequired: true,
                      continuityGroup: shot.continuityGroup,
                      isChainStart: false,
                      transition: { kind: 'cut' },
                    }, ...rows.slice(index + 1)])}>Insert</button>
                    <button type="button" className="px-1" onClick={() => setShots((rows) => {
                      const half = Math.max(1, Math.floor(shot.duration / 2))
                      const rest = Math.max(1, shot.duration - half)
                      const second = { ...shot, duration: rest, shotIndex: index + 1, isChainStart: false, bridgeRequired: true }
                      return [...rows.slice(0, index), { ...shot, duration: half }, second, ...rows.slice(index + 1)]
                    })}>Split</button>
                    <button type="button" className="px-1" onClick={() => setShots((rows) => [...rows.slice(0, index + 1), { ...shot, shotIndex: index + 1, isChainStart: false }, ...rows.slice(index + 1)])}>Duplicate</button>
                    <button type="button" className="px-1" onClick={() => setShots((rows) => rows.filter((_, i) => i !== index))}>Delete</button>
                  </span>
                </div>
                <textarea
                  value={shot.visualPrompt}
                  rows={2}
                  onChange={(event) => update(index, { visualPrompt: event.target.value })}
                  className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/80"
                />
                {flags[index] && <p className="text-[10px] text-amber-300">This prompt reads as more than one action.</p>}
                {view === 'screenplay' && (
                  <p className="text-[10px] uppercase tracking-wide text-white/35">
                    {(shot.locationsPresent[0] || 'INT. LOCATION')} — {shot.shotSize ?? 'MS'}
                  </p>
                )}
                <input
                  value={shot.charactersPresent.join(', ')}
                  placeholder="Characters in this shot"
                  onChange={(event) => update(index, { charactersPresent: event.target.value.split(',').map((name) => name.trim()).filter(Boolean) })}
                  className="w-full rounded border border-white/10 bg-black/30 px-2 py-0.5 text-[10px]"
                />
                <div className="flex flex-wrap gap-1">
                  <input
                    type="number"
                    min={1}
                    value={shot.duration}
                    onChange={(event) => update(index, { duration: Number(event.target.value) })}
                    className="w-14 rounded border border-white/10 bg-black/30 px-1 py-0.5 text-[10px]"
                  />
                  <select value={shot.shotSize ?? 'MS'} onChange={(event) => update(index, { shotSize: event.target.value })} className="rounded border border-white/10 bg-black/30 px-1 text-[10px]">
                    {SIZES.map((size) => <option key={size}>{size}</option>)}
                  </select>
                  <select value={shot.cameraAngle ?? 'eye_level'} onChange={(event) => update(index, { cameraAngle: event.target.value })} className="rounded border border-white/10 bg-black/30 px-1 text-[10px]">
                    {ANGLES.map((angle) => <option key={angle}>{angle}</option>)}
                  </select>
                  <select value={shot.cameraMove ?? 'static'} onChange={(event) => update(index, { cameraMove: event.target.value })} className="rounded border border-white/10 bg-black/30 px-1 text-[10px]">
                    {MOVES.map((move) => <option key={move}>{move}</option>)}
                  </select>
                  <select
                    value={shot.transition?.kind ?? 'cut'}
                    onChange={(event) => update(index, { transition: { kind: event.target.value as ShotTransitionKind } })}
                    className="rounded border border-white/10 bg-black/30 px-1 text-[10px]"
                  >
                    {TRANSITIONS.map((kind) => <option key={kind}>{kind}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {stage === 'references' && (
        <div className="space-y-2">
          <p className="text-[11px] text-white/60">These references are the primaries. Next generates keyframes from them. Nothing is placed on the timeline.</p>
          <div className="grid grid-cols-2 gap-2">
            {[...refs.characters.map((row) => ({ ...row, kind: 'Character' })), ...refs.locations.map((row) => ({ ...row, kind: 'Location' }))].map((row) => (
              <figure key={`${row.kind}-${row.name}`} className="overflow-hidden rounded border border-white/10">
                {row.imageUrl && <img src={row.imageUrl} alt={row.name} className="h-20 w-full object-cover" />}
                <figcaption className="space-y-1 px-1 py-0.5 text-[10px] text-white/60">
                  <div>{row.kind} · {row.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {(['front', 'side', 'back'] as const).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={!consent || busy}
                        onClick={() => void generateAngles(row.imageUrl, row.name, row.kind === 'Location' ? 'location' : 'character', [preset])}
                        className="rounded border border-white/10 px-1 disabled:opacity-40"
                      >
                        {preset} · 1 credit
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={!consent || busy}
                      onClick={() => void generateAngles(row.imageUrl, row.name, row.kind === 'Location' ? 'location' : 'character', ['front', 'threeQuarter', 'side', 'back'])}
                      className="rounded border border-white/10 px-1 disabled:opacity-40"
                    >
                      turnaround · 4 credits
                    </button>
                    <button
                      type="button"
                      disabled={!consent || busy || modifier.trim().length < 3}
                      onClick={() => void vary(row.imageUrl, row.name, row.kind === 'Location' ? 'location' : 'character')}
                      className="rounded border border-white/10 px-1 disabled:opacity-40"
                    >
                      variation · 1 credit
                    </button>
                    <button
                      type="button"
                      disabled={busy || !libraryName.trim()}
                      className="rounded border border-white/10 px-1 disabled:opacity-40"
                      onClick={() => void saveToLibrary(row.imageUrl, row.kind === 'Location' ? 'location' : 'character')}
                    >
                      save
                    </button>
                    <button
                      type="button"
                      className="rounded border border-white/10 px-1"
                      onClick={() => {
                        const kind = row.kind === 'Location' ? 'location' : 'character'
                        void fetch('/api/studio/director/run', {
                          method: 'PATCH',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ jobId, deleteRef: { name: row.name, kind } }),
                        }).then((res) => res.json()).then((body: RunBody) => {
                          if (body.references) setRefs(body.references)
                        }).catch((err) => {
                          console.warn('[wizard] delete ref failed', err instanceof Error ? err.message : err)
                        })
                      }}
                    >
                      delete
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <input
              value={importName}
              onChange={(event) => setImportName(event.target.value)}
              placeholder="Name"
              className="w-24 rounded border border-white/10 bg-black/30 px-1 py-0.5 text-[10px]"
            />
            <select value={importKind} onChange={(event) => setImportKind(event.target.value === 'location' ? 'location' : 'character')} className="rounded border border-white/10 bg-black/30 px-1 text-[10px]">
              <option value="character">Character</option>
              <option value="location">Location</option>
            </select>
            <label className={`rounded border border-white/10 px-2 py-0.5 text-[10px] ${consent && importName.trim() ? 'cursor-pointer text-white/70' : 'cursor-not-allowed text-white/30'}`}>
              Import image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={!consent || !importName.trim() || busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (!file) return
                  void (async () => {
                    setBusy(true)
                    setError(null)
                    try {
                      await storeStill(file, 'import')
                      setImportName('')
                    } catch (err) {
                      console.warn('[wizard] import failed', err instanceof Error ? err.message : err)
                      setError(err instanceof Error ? err.message : 'Could not add the reference')
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              />
            </label>
            <input
              value={modifier}
              onChange={(event) => setModifier(event.target.value)}
              placeholder="Variation, e.g. helmet open"
              className="min-w-32 flex-1 rounded border border-white/10 bg-black/30 px-1 py-0.5 text-[10px]"
            />
            <input
              value={libraryName}
              onChange={(event) => setLibraryName(event.target.value)}
              placeholder="Library name"
              className="w-28 rounded border border-white/10 bg-black/30 px-1 py-0.5 text-[10px]"
            />
            <select
              defaultValue=""
              disabled={!consent || busy}
              onChange={(event) => {
                const [kind, imageUrl, name] = event.target.value.split('|')
                event.target.value = ''
                if (!imageUrl || !name) return
                void fetch('/api/studio/director/run', {
                  method: 'PATCH',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ jobId, consent: true, importRef: { name, kind, imageUrl } }),
                }).then(async (res) => {
                  const body = await res.json() as RunBody
                  if (!res.ok) throw new Error(body.error ?? 'Could not use that library item')
                  setRefs(body.references ?? refs)
                }).catch((err) => {
                  console.warn('[wizard] library pick failed', err instanceof Error ? err.message : err)
                  setError(err instanceof Error ? err.message : 'Could not use that library item')
                })
              }}
              className="rounded border border-white/10 bg-black/30 px-1 text-[10px]"
            >
              <option value="">Select existing</option>
              {library.map((item) => (
                <option key={item.imageUrl} value={`${item.kind}|${item.imageUrl}|${item.name}`}>{item.kind} · {item.name}</option>
              ))}
            </select>
            <label className={`rounded border border-white/10 px-2 py-0.5 text-[10px] ${consent && importName.trim() ? 'cursor-pointer text-white/70' : 'cursor-not-allowed text-white/30'}`}>
              Import video frame · 1 credit
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                disabled={!consent || !importName.trim() || busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (!file) return
                  void (async () => {
                    setBusy(true)
                    setError(null)
                    try {
                      const form = new FormData()
                      form.append('video', file)
                      const uploaded = await fetch('/api/upload/video', { method: 'POST', body: form, credentials: 'include' })
                      const fileBody = await uploaded.json() as { url?: string; error?: string }
                      if (!uploaded.ok || !fileBody.url) throw new Error(fileBody.error ?? 'Upload failed')
                      const saved = await fetch('/api/studio/director/run', {
                        method: 'PATCH',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          jobId,
                          consent: true,
                          videoFrame: { videoUrl: fileBody.url, name: importName.trim(), kind: importKind },
                        }),
                      })
                      const imported = await saved.json() as RunBody
                      if (!saved.ok) throw new Error(imported.error ?? 'Could not extract a frame')
                      setRefs(imported.references ?? refs)
                    } catch (err) {
                      console.warn('[wizard] video frame failed', err instanceof Error ? err.message : err)
                      setError(err instanceof Error ? err.message : 'Could not extract a frame')
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              />
            </label>
          </div>
          <GlbCapture
            disabled={!consent || !importName.trim() || busy}
            onCapture={async (file, label) => {
              setBusy(true)
              setError(null)
              try {
                await storeStill(file, label)
              } catch (err) {
                console.warn('[wizard] 3d capture failed', err instanceof Error ? err.message : err)
                setError(err instanceof Error ? err.message : 'Could not save the 3D still')
              } finally {
                setBusy(false)
              }
            }}
          />
          {refs.characters.length + refs.locations.length === 0 && (
            <p className="text-[10px] text-white/40">No stills yet. The names are on the shots. Next continues with prompt-only references where a still is missing.</p>
          )}
        </div>
      )}
      {stage === 'keyframes' && (
        <div className="space-y-2">
          {shots.map((shot, index) => {
            const stills = [...refs.characters, ...refs.locations]
            return (
              <figure key={shot.shotIndex} className="space-y-1 rounded border border-white/10 p-1">
                {shot.storyboardUrl && <img src={shot.storyboardUrl} alt="" className="h-20 w-full object-cover" />}
                <figcaption className="text-[10px] text-white/60">Shot {index + 1} · {modeLabel(shot)}</figcaption>
                <button
                  type="button"
                  disabled={!consent || busy}
                  className="rounded border border-white/10 px-1 text-[10px] disabled:opacity-40"
                  onClick={() => {
                    void (async () => {
                      setBusy(true)
                      setError(null)
                      try {
                        const res = await fetch('/api/studio/director/keyframe', {
                          method: 'POST',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ jobId, shotIndex: shot.shotIndex, prompt: shot.visualPrompt, consent: true }),
                        })
                        const body = await res.json() as { imageUrl?: string; error?: string }
                        if (!res.ok || !body.imageUrl) throw new Error(body.error ?? 'Could not regenerate the keyframe')
                        setShots((rows) => rows.map((row) => row.shotIndex === shot.shotIndex ? { ...row, storyboardUrl: body.imageUrl } : row))
                      } catch (err) {
                        console.warn('[wizard] keyframe regen failed', err instanceof Error ? err.message : err)
                        setError(err instanceof Error ? err.message : 'Could not regenerate the keyframe')
                      } finally {
                        setBusy(false)
                      }
                    })()
                  }}
                >
                  Regenerate still · 1 credit
                </button>
                {shot.storyboardUrl && (
                  <button
                    type="button"
                    disabled={busy || !libraryName.trim()}
                    className="ml-1 rounded border border-white/10 px-1 text-[10px] disabled:opacity-40"
                    onClick={() => void saveToLibrary(shot.storyboardUrl!, 'asset')}
                  >
                    Save still
                  </button>
                )}
                <p className="line-clamp-2 text-[10px] text-white/45">{shot.visualPrompt}</p>
                {stills.length > 0 && (
                  <select
                    defaultValue=""
                    disabled={!consent || busy}
                    onChange={(event) => {
                      const url = event.target.value
                      if (url) void useAsKeyframe(shot.shotIndex, url)
                    }}
                    className="w-full rounded border border-white/10 bg-black/30 px-1 text-[10px]"
                  >
                    <option value="">Use a reference as this frame</option>
                    {stills.map((still) => (
                      <option key={still.imageUrl} value={still.imageUrl}>{still.name}</option>
                    ))}
                  </select>
                )}
              </figure>
            )
          })}
        </div>
      )}
      {stage === 'shots' && (
        <div className="space-y-1">
          <p className="text-[11px] text-white/60">
            {shots.length} shot{shots.length === 1 ? '' : 's'} ready. Next renders the batch you set. Finished video lands in the library.
          </p>
          {shots.map((shot, index) => (
            <div key={shot.shotIndex}>
              <p className="text-[10px] text-white/45">
                Shot {index + 1} · {modeLabel(shot)}
                {shot.continuity === 'continuous' && shot.chainFrom ? ` · referencing ${shot.chainFrom}` : ''}
                {' · '}{shot.visualPrompt.slice(0, 80)}
              </p>
              {models.length > 0 && (
                <select
                  value={shot.modelOverride ?? ''}
                  onChange={(event) => update(index, { modelOverride: event.target.value || null })}
                  className="mb-1 rounded border border-white/10 bg-black/30 px-1 text-[10px]"
                >
                  <option value="">Delegated model</option>
                  {models.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      )}
      {stage !== 'script' && (
        <label className="flex items-center gap-2 text-[10px] text-white/60">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          I own or have consent for the people and places in this step
        </label>
      )}
      {error && <p className="text-[10px] text-red-300">{error}</p>}
      <button
        type="button"
        disabled={busy || (stage !== 'script' && !consent)}
        onClick={() => void saveAndResume()}
        className="w-full rounded-lg bg-[#00e5c8] py-2 text-[11px] font-semibold text-black disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Next'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void fetch('/api/studio/director/resume', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, auto: true }),
          }).then(async (res) => {
            const body = await res.json() as { error?: string }
            if (!res.ok) throw new Error(body.error ?? 'Could not run from here')
            onResume()
          }).catch((err) => {
            console.warn('[wizard] auto resume failed', err instanceof Error ? err.message : err)
            setError(err instanceof Error ? err.message : 'Could not run from here')
          })
        }}
        className="w-full rounded-lg border border-white/15 py-2 text-[11px] text-white/70 disabled:opacity-50"
      >
        Run from here
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void saveAndExit()}
        className="w-full rounded-lg border border-white/15 py-2 text-[11px] text-white/70 disabled:opacity-50"
      >
        Save and exit
      </button>
      {savedNote && <p className="text-[10px] text-white/50">{savedNote}</p>}
    </div>
  )
}
