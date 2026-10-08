'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Layers, Upload, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { greenScreenGraph } from '@/lib/greenscreen/graph'
import { applyMatte, compositeSubject, dominantScreen, matchColour } from '@/lib/greenscreen/matte'
import { placeGreenScreenLayers } from '@/lib/greenscreen/place'
import { useEditorStore } from '@/store/editor'
import { usePlaybackStore } from '@/store/playbackStore'

type BackgroundType = 'location' | 'generated' | 'image' | 'video' | 'gradient' | 'solid' | 'transparent'
type KeyingMethod = 'luma' | 'chroma_green' | 'chroma_blue' | 'ai_rembg' | 'depth' | 'sam'

const STARTER_PRESETS = [
  'Cinema night street', 'Studio office', 'Luxury apartment', 'Mountain vista',
  'Space station', 'Forest clearing', 'Beach sunset', 'Urban rooftop',
  'Futuristic city', 'Ancient temple', 'Underwater coral', 'Snowy tundra',
]

const DISABLED: Partial<Record<KeyingMethod, string>> = {
  depth: 'Depth-Anything-v2 is not in the registry. OpenAPI returned 404, so this method stays off.',
  sam: 'No click-to-track video model is in the registry. sam-3/3d-objects builds a mesh, not a matte.',
}

const METHODS: Array<{ id: KeyingMethod; label: string; desc: string }> = [
  { id: 'chroma_green', label: 'Chroma Green', desc: 'Local, free' },
  { id: 'chroma_blue', label: 'Chroma Blue', desc: 'Local, free' },
  { id: 'luma', label: 'Luma Key', desc: 'Local, free' },
  { id: 'ai_rembg', label: 'Remove background', desc: 'One still, BiRefNet' },
  { id: 'depth', label: 'Depth Matte', desc: 'Unavailable' },
  { id: 'sam', label: 'SAM click', desc: 'Unavailable' },
]

interface LocationRow {
  id: string
  name: string
  imageUrl: string | null
}

interface Quote {
  label: string
  estimateCredits: number
  note: string
  run: () => Promise<void>
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = src
  })
}

async function uploadBlob(file: File, kind: 'image' | 'video'): Promise<string> {
  const form = new FormData()
  form.set(kind, file)
  const res = await fetch(`/api/upload/${kind}`, { method: 'POST', body: form, credentials: 'include' })
  const body = await res.json() as { url?: string; error?: string }
  if (!res.ok || !body.url) throw new Error(body.error || 'Upload failed')
  return body.url
}

function colourFile(paint: (ctx: CanvasRenderingContext2D) => void): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Could not draw the plate'))
  paint(ctx)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Could not draw the plate'))
      else resolve(new File([blob], 'plate.png', { type: 'image/png' }))
    }, 'image/png')
  })
}

export function GreenScreenPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceRef = useRef<ImageData | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const plateRef = useRef<HTMLInputElement>(null)
  const [bgType, setBgType] = useState<BackgroundType>('location')
  const [keyMethod, setKeyMethod] = useState<KeyingMethod>('chroma_green')
  const [tolerance, setTolerance] = useState(40)
  const [feather, setFeather] = useState(8)
  const [spill, setSpill] = useState(40)
  const [lightWrap, setLightWrap] = useState(30)
  const [shadow, setShadow] = useState(25)
  const [colourMatchAmt, setColourMatchAmt] = useState(20)
  const [colour, setColour] = useState('#00ff00')
  const [solid, setSolid] = useState('#1a1a2e')
  const [gradientTo, setGradientTo] = useState('#0e4d6c')
  const [invert, setInvert] = useState(false)
  const [holeFill, setHoleFill] = useState(false)
  const [matteView, setMatteView] = useState(false)
  const [pick, setPick] = useState(false)
  const [consent, setConsent] = useState(false)
  const [methodsOpen, setMethodsOpen] = useState(true)
  const [subjectUrl, setSubjectUrl] = useState<string | null>(null)
  const [subjectKind, setSubjectKind] = useState<'image' | 'video' | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [plateUrl, setPlateUrl] = useState<string | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [note, setNote] = useState('Local green, blue, and luma keys are free. Nothing is placed on the timeline until you add it.')
  const [busy, setBusy] = useState(false)
  const playhead = usePlaybackStore((state) => state.playheadTime)

  const localKey = keyMethod === 'chroma_green' || keyMethod === 'chroma_blue' || keyMethod === 'luma'

  const reloadLocations = useCallback(async () => {
    const res = await fetch('/api/studio/assets/t2i?kind=location&list=all', { credentials: 'include' })
    if (!res.ok) return
    const body = await res.json() as { assets?: LocationRow[] }
    setLocations(body.assets ?? [])
  }, [])

  useEffect(() => {
    void reloadLocations()
  }, [reloadLocations])

  const draw = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || !subjectUrl) return
    try {
      const subject = subjectKind === 'video'
        ? await frameFromVideo(subjectUrl)
        : await loadImage(subjectUrl)
      const width = Math.min(480, subject.width)
      const height = Math.max(1, Math.round(subject.height * (width / subject.width)))
      canvas.width = width
      canvas.height = height
      const off = document.createElement('canvas')
      off.width = width
      off.height = height
      const offCtx = off.getContext('2d')
      if (!offCtx) return
      offCtx.drawImage(subject, 0, 0, width, height)
      const frame = offCtx.getImageData(0, 0, width, height)
      sourceRef.current = new ImageData(new Uint8ClampedArray(frame.data), width, height)
      if (localKey) {
        applyMatte(frame.data, {
          mode: keyMethod === 'luma' ? 'luma' : 'chroma',
          colour: keyMethod === 'chroma_blue' ? '#0000ff' : keyMethod === 'chroma_green' ? colour : colour,
          tolerance: tolerance / 100,
          softness: feather / 100,
          spill: spill / 100,
          invert,
          holeFill,
          lumaLow: tolerance / 100,
          lumaHigh: Math.min(1, tolerance / 100 + Math.max(feather / 100, 0.05)),
          width,
          height,
        })
      }
      const plate = await plateImage(bgType, plateUrl, solid, gradientTo, width, height)
      if (matteView) {
        for (let i = 0; i < frame.data.length; i += 4) {
          const a = frame.data[i + 3]
          frame.data[i] = a
          frame.data[i + 1] = a
          frame.data[i + 2] = a
          frame.data[i + 3] = 255
        }
        ctx.putImageData(frame, 0, 0)
        return
      }
      if (plate && localKey) {
        const bg = plate.getImageData(0, 0, width, height)
        matchColour(frame.data, bg.data, colourMatchAmt / 100)
        const merged = compositeSubject(frame.data, bg.data, width, height, {
          lightWrap: lightWrap / 100,
          shadow: shadow / 100,
          colourMatch: colourMatchAmt / 100,
        })
        ctx.putImageData(new ImageData(new Uint8ClampedArray(merged), width, height), 0, 0)
        return
      }
      paintChecker(ctx, width, height)
      offCtx.putImageData(frame, 0, 0)
      ctx.drawImage(off, 0, 0)
    } catch (err) {
      console.warn('[greenscreen]', err instanceof Error ? err.message : err)
    }
  }, [bgType, colour, colourMatchAmt, feather, gradientTo, holeFill, invert, keyMethod, lightWrap, localKey, matteView, plateUrl, shadow, solid, spill, subjectKind, subjectUrl, tolerance])

  useEffect(() => {
    void draw()
  }, [draw])

  function graphInput(subject: string, plate: string | null) {
    const mode = keyMethod === 'luma' ? 'luma' : keyMethod === 'ai_rembg' ? 'ai' : 'chroma'
    return greenScreenGraph({
      mode,
      colour: keyMethod === 'chroma_blue' ? '#0000ff' : colour,
      tolerance: tolerance / 100,
      softness: feather / 100,
      spill: spill / 100,
      invert,
      shrink: 0,
      grow: 0,
      holeFill,
      backdrop: Boolean(plate),
      lightWrap: lightWrap / 100,
      shadow: shadow / 100,
      colourMatch: colourMatchAmt / 100,
      subjectUrl: subject,
      plateUrl: plate ?? '',
    })
  }

  async function ensureSubject(): Promise<string> {
    if (subjectKind === 'image' && subjectUrl && !subjectUrl.startsWith('blob:')) return subjectUrl
    if (!subjectUrl) throw new Error('Add a subject image or video first')
    if (subjectKind === 'video') {
      const frame = await frameFromVideo(subjectUrl)
      const blob = await new Promise<Blob>((resolve, reject) => {
        frame.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not read a frame'))), 'image/png')
      })
      return uploadBlob(new File([blob], 'frame.png', { type: 'image/png' }), 'image')
    }
    const res = await fetch(subjectUrl)
    const blob = await res.blob()
    return uploadBlob(new File([blob], 'subject.png', { type: blob.type || 'image/png' }), 'image')
  }

  async function ensurePlate(): Promise<string | null> {
    if (bgType === 'transparent') return null
    if (bgType === 'location') {
      const row = locations.find((item) => item.id === selectedLocation)
      if (!row?.imageUrl) throw new Error('Pick a location that already has a plate, or generate one first')
      return row.imageUrl
    }
    if ((bgType === 'image' || bgType === 'video') && plateUrl) {
      if (!plateUrl.startsWith('blob:')) return plateUrl
      const res = await fetch(plateUrl)
      const blob = await res.blob()
      const kind = bgType === 'video' ? 'video' : 'image'
      return uploadBlob(new File([blob], `plate.${kind === 'video' ? 'mp4' : 'png'}`, { type: blob.type }), kind)
    }
    if (bgType === 'solid') {
      return uploadBlob(await colourFile((ctx) => {
        ctx.fillStyle = solid
        ctx.fillRect(0, 0, 64, 64)
      }), 'image')
    }
    if (bgType === 'gradient') {
      return uploadBlob(await colourFile((ctx) => {
        const gradient = ctx.createLinearGradient(0, 0, 64, 64)
        gradient.addColorStop(0, solid)
        gradient.addColorStop(1, gradientTo)
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, 64, 64)
      }), 'image')
    }
    return null
  }

  async function bakeLocal() {
    setBusy(true)
    setQuote(null)
    try {
      const subject = await ensureSubject()
      const plate = bgType === 'video' ? null : await ensurePlate()
      const graph = graphInput(subject, plate)
      const mediaUrls: Record<string, string> = { subject }
      if (plate && bgType !== 'video') mediaUrls.plate = plate
      const res = await fetch('/api/studio/compositor/render', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ graph, mediaUrls }),
      })
      const body = await res.json() as { url?: string; error?: string }
      if (!res.ok || !body.url) throw new Error(body.error || 'The bake did not finish')
      const videoPlate = bgType === 'video' ? ' A video plate is added as its own timeline layer, not baked into this still.' : ''
      setNote(subjectKind === 'video'
        ? `Baked one frame. This is not a video matte. The original file was not replaced, and nothing was placed on the timeline.${videoPlate}`
        : `Baked a new still. The original file was not replaced, and nothing was placed on the timeline.${videoPlate}`)
    } catch (err) {
      console.warn('[greenscreen]', err instanceof Error ? err.message : err)
      setNote(err instanceof Error ? err.message : 'The bake did not finish')
    } finally {
      setBusy(false)
    }
  }

  async function quoteRemoveBackground() {
    setBusy(true)
    try {
      const subject = await ensureSubject()
      const plate = bgType === 'video' ? null : await ensurePlate().catch((err) => {
        console.warn('[greenscreen]', err instanceof Error ? err.message : err)
        return null
      })
      const graph = graphInput(subject, plate)
      const mediaUrls: Record<string, string> = {}
      if (plate) mediaUrls.plate = plate
      const res = await fetch('/api/studio/compositor/render', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ graph, mediaUrls, confirm: false }),
      })
      const body = await res.json() as { estimateCredits?: number; note?: string; error?: string }
      if (!res.ok) throw new Error(body.error || 'Could not quote the matte')
      setQuote({
        label: 'Remove background',
        estimateCredits: body.estimateCredits ?? 0,
        note: body.note || 'Per-frame BiRefNet on one still.',
        run: async () => {
          const confirmed = await fetch('/api/studio/compositor/render', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ graph, mediaUrls, confirm: true, consent: true }),
          })
          const done = await confirmed.json() as { url?: string; error?: string; note?: string }
          if (!confirmed.ok || !done.url) throw new Error(done.error || 'The matte did not run')
          setSubjectUrl(done.url)
          setSubjectKind('image')
          setNote(done.note || 'New still stored. The original file was not replaced.')
        },
      })
    } catch (err) {
      console.warn('[greenscreen]', err instanceof Error ? err.message : err)
      setNote(err instanceof Error ? err.message : 'Could not quote the matte')
    } finally {
      setBusy(false)
    }
  }

  async function quotePreset(name: string, parentId?: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/studio/assets/t2i', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'location',
          name,
          prompt: `${name}. Empty background plate, no people, wide photograph.`,
          parentId,
          confirm: false,
        }),
      })
      const body = await res.json() as { estimateCredits?: number; error?: string }
      if (!res.ok) throw new Error(body.error || 'Could not quote the plate')
      setQuote({
        label: parentId ? `Variation of ${name}` : name,
        estimateCredits: body.estimateCredits ?? 1,
        note: 'Generates a location plate into the library. It is not placed on the timeline.',
        run: async () => {
          const confirmed = await fetch('/api/studio/assets/t2i', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              kind: 'location',
              name,
              prompt: `${name}. Empty background plate, no people, wide photograph.`,
              parentId,
              confirm: true,
              consent: parentId ? true : undefined,
            }),
          })
          const done = await confirmed.json() as { error?: string }
          if (!confirmed.ok) throw new Error(done.error || 'The plate did not run')
          await reloadLocations()
          setNote(`${name} is saved as a location. Nothing was placed on the timeline.`)
        },
      })
    } catch (err) {
      console.warn('[greenscreen]', err instanceof Error ? err.message : err)
      setNote(err instanceof Error ? err.message : 'Could not quote the plate')
    } finally {
      setBusy(false)
    }
  }

  function onSubjectFile(file: File) {
    const url = URL.createObjectURL(file)
    setSubjectUrl(url)
    if (file.type.startsWith('video/')) {
      setSubjectKind('video')
      setVideoFile(file)
      setNote('Preview is one frame. A video-quality matte is not run from this panel.')
      return
    }
    setSubjectKind('image')
    setVideoFile(null)
  }

  function sample(event: MouseEvent<HTMLCanvasElement>) {
    if (!pick || !sourceRef.current || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.min(sourceRef.current.width - 1, Math.max(0, Math.round((event.clientX - rect.left) * (sourceRef.current.width / rect.width))))
    const y = Math.min(sourceRef.current.height - 1, Math.max(0, Math.round((event.clientY - rect.top) * (sourceRef.current.height / rect.height))))
    const i = (y * sourceRef.current.width + x) * 4
    const data = sourceRef.current.data
    const hex = `#${[data[i], data[i + 1], data[i + 2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`
    setColour(hex)
    setPick(false)
    const screen = dominantScreen(Uint8Array.from([data[i], data[i + 1], data[i + 2], 255]))
    if (screen === 'blue') setKeyMethod('chroma_blue')
    else setKeyMethod('chroma_green')
  }

  function matchScreen() {
    const frame = sourceRef.current
    if (!frame) return
    const screen = dominantScreen(frame.data)
    if (screen === 'blue') {
      setKeyMethod('chroma_blue')
      setColour('#0000ff')
      setNote('Dominant screen is blue. The key is local and free.')
      return
    }
    if (screen === 'green') {
      setKeyMethod('chroma_green')
      setColour('#00ff00')
      setNote('Dominant screen is green. The key is local and free.')
      return
    }
    setNote('No dominant green or blue. Use luma, or Remove background for a still.')
  }

  function saveOnClip() {
    const id = useEditorStore.getState().selectedClipId
    const recipe = usePlaybackStore.getState().recipe
    const clip = recipe?.tracks.flatMap((track) => track.clips).find((item) => item.id === id)
    if (!id || !clip) {
      setNote('Select a clip first. Nothing was changed.')
      return
    }
    useEditorStore.getState().updateClip(id, {
      metadata: {
        ...(clip.metadata ?? {}),
        greenScreen: {
          mode: keyMethod,
          colour,
          tolerance: tolerance / 100,
          softness: feather / 100,
          spill: spill / 100,
          invert,
          lightWrap: lightWrap / 100,
          shadow: shadow / 100,
          colourMatch: colourMatchAmt / 100,
          backdropUrl: plateUrl,
        },
      },
    })
    setNote('Key settings are stored on the selected clip. The media file was not replaced.')
  }

  async function addToTimeline() {
    if (!videoFile) {
      setNote('The timeline plays video. This still stays in the library. Nothing was placed.')
      return
    }
    setBusy(true)
    try {
      const subject = await uploadBlob(videoFile, 'video')
      let backdrop: string | null = null
      if (bgType === 'video' && plateUrl) backdrop = await ensurePlate()
      const placed = placeGreenScreenLayers({
        subjectUrl: subject,
        backdropUrl: backdrop,
        playhead,
        durationSec: 5,
        keyer: {
          mode: keyMethod,
          colour,
          tolerance: tolerance / 100,
          softness: feather / 100,
          spill: spill / 100,
          invert,
          lightWrap: lightWrap / 100,
          shadow: shadow / 100,
          colourMatch: colourMatchAmt / 100,
          backdropUrl: backdrop,
          perFrame: keyMethod === 'ai_rembg',
        },
      })
      setNote(placed.reason)
    } catch (err) {
      console.warn('[greenscreen]', err instanceof Error ? err.message : err)
      setNote(err instanceof Error ? err.message : 'Nothing was placed')
    } finally {
      setBusy(false)
    }
  }

  const selected = locations.find((item) => item.id === selectedLocation)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="panel-section">
        <p className="panel-label mb-2 flex items-center gap-1.5">
          <Layers size={10} className="text-[var(--teal-bright)]" />
          Green Screen & BG Swap
        </p>
        <p className="text-[10px] text-[var(--text-tertiary)] leading-snug">
          Local keys are free. Remove background submits one still to BiRefNet and says so. Ultra key, EXR, Cryptomatte, and OFX stay off in this web panel.
        </p>
      </div>

      <div className="border-b border-[var(--border)]">
        <button type="button" className="collapsible-trigger px-3 py-2" onClick={() => setMethodsOpen(!methodsOpen)}>
          <span>Keying Method</span>
          {methodsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {methodsOpen && (
          <div className="px-3 pb-3 space-y-1">
            {METHODS.map((method) => {
              const reason = DISABLED[method.id]
              return (
                <button
                  key={method.id}
                  type="button"
                  disabled={Boolean(reason)}
                  title={reason}
                  onClick={() => setKeyMethod(method.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded border text-left transition-all',
                    reason && 'opacity-50 cursor-not-allowed',
                    keyMethod === method.id
                      ? 'bg-[var(--teal-glow)] border-[var(--teal-border)]'
                      : 'border-[var(--border)] hover:bg-[var(--bg-hover)]'
                  )}
                >
                  <span className={cn('text-[11px] font-medium', keyMethod === method.id ? 'text-[var(--teal-bright)]' : 'text-[var(--text-secondary)]')}>
                    {method.label}
                  </span>
                  <span className="text-[9px] text-[var(--text-tertiary)]">{reason ?? method.desc}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {localKey && (
        <div className="panel-section space-y-3">
          <p className="panel-label">Key Controls</p>
          <Slider label="Tolerance" value={tolerance} max={100} onChange={setTolerance} />
          <Slider label="Edge feather" value={feather} max={40} onChange={setFeather} />
          <Slider label="Spill" value={spill} max={100} onChange={setSpill} />
          <label className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
            <input type="checkbox" checked={invert} onChange={(event) => setInvert(event.target.checked)} />
            Invert matte
          </label>
          <label className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
            <input type="checkbox" checked={holeFill} onChange={(event) => setHoleFill(event.target.checked)} />
            Fill small holes
          </label>
          <label className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
            <input type="checkbox" checked={matteView} onChange={(event) => setMatteView(event.target.checked)} />
            Matte view
          </label>
          <div className="flex gap-2">
            <button type="button" className="pill" onClick={() => setPick(true)}>Eyedropper</button>
            <button type="button" className="pill" onClick={matchScreen}>Match screen</button>
            <span className="text-[10px] text-[var(--teal-bright)]">{colour}</span>
          </div>
        </div>
      )}

      <div className="panel-section">
        <p className="panel-label mb-2">Subject</p>
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onSubjectFile(file)
        }} />
        <button type="button" className="w-full py-3 rounded-lg border border-dashed border-[var(--border)] text-[10px] text-[var(--text-tertiary)]" onClick={() => fileRef.current?.click()}>
          <Upload size={14} className="inline mr-1" /> Add image or video
        </button>
        <canvas
          ref={canvasRef}
          onClick={sample}
          className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--bg-hover)]"
          style={{ backgroundImage: 'linear-gradient(45deg,#2a2a2a 25%,transparent 25%),linear-gradient(-45deg,#2a2a2a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2a2a 75%),linear-gradient(-45deg,transparent 75%,#2a2a2a 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0' }}
        />
      </div>

      <div className="panel-section">
        <p className="panel-label mb-2">Background</p>
        <div className="pill-group mb-3 flex-wrap">
          {(['location', 'generated', 'image', 'video', 'gradient', 'solid', 'transparent'] as BackgroundType[]).map((type) => (
            <button key={type} type="button" onClick={() => setBgType(type)} className={cn('pill capitalize', bgType === type && 'active')}>
              {type}
            </button>
          ))}
        </div>
        {bgType === 'location' && (
          <div className="space-y-2">
            {locations.length === 0 && <p className="text-[10px] text-[var(--text-tertiary)]">No location plates yet.</p>}
            <div className="grid grid-cols-2 gap-1.5">
              {locations.map((row) => (
                <button key={row.id} type="button" onClick={() => { setSelectedLocation(row.id); setPlateUrl(row.imageUrl) }} className={cn('text-[10px] px-2 py-1.5 rounded border text-left', selectedLocation === row.id ? 'border-[var(--teal-border)] text-[var(--teal-bright)]' : 'border-[var(--border)] text-[var(--text-secondary)]')}>
                  {row.name}
                  {!row.imageUrl && ' · no plate'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)]">Starter names generate a plate on confirm. They are not thumbnails.</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STARTER_PRESETS.map((name) => (
                <button key={name} type="button" className="text-[10px] px-2 py-1.5 rounded border border-[var(--border)] text-left text-[var(--text-secondary)]" onClick={() => void quotePreset(name)}>
                  Generate {name}
                </button>
              ))}
            </div>
            {selected?.imageUrl && (
              <button type="button" className="pill" disabled={!consent} onClick={() => void quotePreset(`${selected.name} variation`, selected.id)}>
                Variation of this plate
              </button>
            )}
          </div>
        )}
        {bgType === 'generated' && (
          <div className="space-y-2">
            <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Empty street, dusk, no people" className="w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-[11px]" />
            <button type="button" className="pill" disabled={prompt.trim().length < 3} onClick={() => void quotePreset(prompt.trim().slice(0, 80))}>Quote a new location</button>
          </div>
        )}
        {(bgType === 'image' || bgType === 'video') && (
          <div>
            <input ref={plateRef} type="file" accept={bgType === 'image' ? 'image/*' : 'video/*'} className="hidden" onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) setPlateUrl(URL.createObjectURL(file))
            }} />
            <button type="button" className="w-full py-4 rounded-lg border border-dashed border-[var(--border)] text-[10px]" onClick={() => plateRef.current?.click()}>
              Upload {bgType}
            </button>
          </div>
        )}
        {(bgType === 'solid' || bgType === 'gradient') && (
          <div className="flex gap-2">
            <input type="color" value={solid} onChange={(event) => setSolid(event.target.value)} />
            {bgType === 'gradient' && <input type="color" value={gradientTo} onChange={(event) => setGradientTo(event.target.value)} />}
          </div>
        )}
        {bgType === 'transparent' && <p className="text-[10px] text-[var(--text-tertiary)]">Bake keeps the alpha in a PNG. ProRes 4444 is not written here.</p>}
      </div>

      {localKey && bgType !== 'transparent' && (
        <div className="panel-section space-y-3">
          <p className="panel-label">Integration</p>
          <Slider label="Colour match" value={colourMatchAmt} max={100} onChange={setColourMatchAmt} />
          <Slider label="Light wrap" value={lightWrap} max={100} onChange={setLightWrap} />
          <Slider label="Contact shadow" value={shadow} max={100} onChange={setShadow} />
          <p className="text-[10px] text-[var(--text-tertiary)]">Floor reflection, depth haze, grain match, and AI relight are not in this bake.</p>
        </div>
      )}

      <div className="panel-section space-y-2">
        <label className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          I have rights to matte this footage, including any real person in it.
        </label>
        {keyMethod === 'ai_rembg' ? (
          <button type="button" className="pill active" disabled={busy || !consent || !subjectUrl} onClick={() => void quoteRemoveBackground()}>
            Quote remove background
          </button>
        ) : (
          <button type="button" className="pill active" disabled={busy || !subjectUrl} onClick={() => void bakeLocal()}>
            Bake new still
          </button>
        )}
        <button type="button" className="pill" disabled={busy} onClick={saveOnClip}>Save key on selected clip</button>
        <button type="button" className="pill" disabled={busy} onClick={() => void addToTimeline()}>Add video layers to timeline</button>
        {quote && (
          <div className="rounded border border-[var(--teal-border)] p-2 space-y-1">
            <p className="text-[10px] text-[var(--text-secondary)]">{quote.label} · {quote.estimateCredits} credits</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">{quote.note}</p>
            <button type="button" className="pill active" disabled={busy || (quote.label === 'Remove background' && !consent)} onClick={() => {
              setBusy(true)
              void quote.run().catch((err) => {
                console.warn('[greenscreen]', err instanceof Error ? err.message : err)
                setNote(err instanceof Error ? err.message : 'The confirmed step did not run')
              }).finally(() => {
                setBusy(false)
                setQuote(null)
              })
            }}>Confirm</button>
          </div>
        )}
        <p className="text-[10px] text-[var(--text-tertiary)] leading-snug">{note}</p>
        <p className="text-[10px] text-[var(--text-tertiary)] leading-snug">
          Replacing a generated clip’s background is this same composite, as a new still. It does not inpaint the video, and it does not change the shot on its own.
        </p>
      </div>
    </div>
  )
}

function Slider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[10px] text-[var(--text-secondary)]">{label}</span>
        <span className="text-[10px] text-[var(--teal-bright)] tabular-nums">{value}</span>
      </div>
      <input type="range" min={0} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="cinema-slider" />
    </div>
  )
}

function paintChecker(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#2a2a2a'
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      if ((x + y) / 8 % 2 === 0) ctx.fillRect(x, y, 8, 8)
    }
  }
}

async function frameFromVideo(src: string): Promise<HTMLCanvasElement> {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.src = src
  video.muted = true
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('Could not read that video'))
  })
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth || 320
  canvas.height = video.videoHeight || 180
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function plateImage(type: BackgroundType, plateUrl: string | null, solid: string, gradientTo: string, width: number, height: number): Promise<CanvasRenderingContext2D | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx || type === 'transparent' || type === 'video') return null
  if (plateUrl && (type === 'location' || type === 'image' || type === 'generated')) {
    try {
      const img = await loadImage(plateUrl)
      ctx.drawImage(img, 0, 0, width, height)
      return ctx
    } catch (err) {
      console.warn('[greenscreen]', err instanceof Error ? err.message : err)
      return null
    }
  }
  if (type === 'gradient') {
    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, solid)
    gradient.addColorStop(1, gradientTo)
    ctx.fillStyle = gradient
  } else if (type === 'solid') {
    ctx.fillStyle = solid
  } else {
    return null
  }
  ctx.fillRect(0, 0, width, height)
  return ctx
}
