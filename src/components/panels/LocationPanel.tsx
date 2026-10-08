'use client'

import { useEffect, useRef, useState } from 'react'
import { GOOGLE_IMAGERY_NOTE, MAPILLARY_LICENCE, type GeoHit, type ScoutFrame } from '@cinema/core'
import { Camera, Loader2, MapPin, Search } from 'lucide-react'

interface SearchBody {
  location: GeoHit
  suggestions: GeoHit[]
  streetView: ScoutFrame[]
  filtered: ScoutFrame[]
  satellite: { closeUp: string; district: string; regional: string }
  viewer: { lat: number; lng: number; label: string }
  meta: { streetViewCount: number; filteredCount: number; licence: string; google: string; unavailable: string[] }
}

interface CameraCapture {
  lat: number
  lng: number
  label?: string
  height: number
  heading: number
  pitch: number
  fov: number
  time: string
  season: string
  weather: string
}

export function LocationPanel() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<GeoHit[]>([])
  const [result, setResult] = useState<SearchBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<ScoutFrame | null>(null)
  const [camera, setCamera] = useState<CameraCapture | null>(null)
  const [note, setNote] = useState('')
  const [describe, setDescribe] = useState('')
  const [consent, setConsent] = useState(false)
  const [quote, setQuote] = useState<{ prompt: string; estimateCredits: number; body: Record<string, unknown> } | null>(null)
  const [refs, setRefs] = useState<string[]>([])
  const [lastAssetId, setLastAssetId] = useState<string | null>(null)

  useEffect(() => {
    const read = () => {
      const raw = localStorage.getItem('cinema-scout-camera')
      if (!raw) return
      try {
        setCamera(JSON.parse(raw) as CameraCapture)
      } catch (err) {
        console.warn('[scout]', err instanceof Error ? err.message : err)
      }
    }
    read()
    window.addEventListener('focus', read)
    window.addEventListener('storage', read)
    return () => {
      window.removeEventListener('focus', read)
      window.removeEventListener('storage', read)
    }
  }, [])

  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([])
      return
    }
    const timer = window.setTimeout(() => {
      void fetch(`/api/location/suggest?q=${encodeURIComponent(query.trim())}`, { credentials: 'include' })
        .then(async (res) => {
          const body = await res.json() as { suggestions?: GeoHit[]; error?: string }
          if (!res.ok) throw new Error(body.error || 'Geocoder failed')
          setSuggestions(body.suggestions ?? [])
        })
        .catch((err) => {
          console.warn('[scout]', err instanceof Error ? err.message : err)
        })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [query])

  async function search(hit?: GeoHit) {
    setLoading(true)
    setError(null)
    setPage(0)
    try {
      const res = await fetch('/api/location/search', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hit
          ? { query: hit.displayName, lat: hit.lat, lng: hit.lng, line: hit.line }
          : { query }),
      })
      const data = await res.json() as SearchBody & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setResult(data)
      setSuggestions(data.suggestions ?? [])
    } catch (err) {
      console.warn('[scout]', err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  function nudge(dLat: number, dLng: number) {
    if (!result) return
    const hit: GeoHit = { ...result.location, lat: result.location.lat + dLat, lng: result.location.lng + dLng, line: undefined }
    void search(hit)
  }

  async function saveFrame(frame: ScoutFrame) {
    const res = await fetch('/api/vault/location/save', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: frame.fullUrl || frame.thumbUrl,
        type: 'street',
        location: {
          ...result?.location,
          displayName: result?.location.displayName,
          licence: frame.licence,
          cameraType: frame.cameraType,
          capturedAt: frame.capturedAt,
        },
      }),
    })
    const body = await res.json() as { error?: string }
    if (!res.ok) {
      setError(body.error || 'The plate was not saved')
      return
    }
    setNote('Saved to your locations on R2. The Mapillary URL was not stored. Nothing was placed on the timeline.')
  }

  async function quotePlate(extra: Record<string, unknown>) {
    const name = result?.location.displayName || describe || camera?.label || ''
    const res = await fetch('/api/studio/location/scout-plate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.slice(0, 80),
        note: describe,
        lat: camera?.lat ?? result?.location.lat,
        lng: camera?.lng ?? result?.location.lng,
        street: result?.location.street,
        height: camera?.height,
        heading: camera?.heading,
        pitch: camera?.pitch,
        fov: camera?.fov,
        time: camera?.time,
        season: camera?.season,
        weather: camera?.weather,
        referenceUrls: refs,
        ...extra,
        confirm: false,
      }),
    })
    const body = await res.json() as { error?: string; prompt?: string; estimateCredits?: number }
    if (!res.ok) {
      setError(body.error || 'Could not quote the plate')
      return
    }
    setQuote({
      prompt: body.prompt || '',
      estimateCredits: body.estimateCredits ?? 1,
      body: {
        name: name.slice(0, 80),
        note: describe,
        lat: camera?.lat ?? result?.location.lat,
        lng: camera?.lng ?? result?.location.lng,
        street: result?.location.street,
        height: camera?.height,
        heading: camera?.heading,
        pitch: camera?.pitch,
        fov: camera?.fov,
        time: camera?.time,
        season: camera?.season,
        weather: camera?.weather,
        referenceUrls: refs,
        ...extra,
        confirm: true,
        consent,
      },
    })
  }

  async function confirmPlate() {
    if (!quote) return
    setLoading(true)
    try {
      const res = await fetch('/api/studio/location/scout-plate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quote.body),
      })
      const body = await res.json() as { error?: string; assetId?: string }
      if (!res.ok) throw new Error(body.error || 'The plate did not run')
      if (body.assetId) setLastAssetId(body.assetId)
      setNote('Plate saved in Locations. It is available to Green Screen and the Training locations tab. Nothing was placed on the timeline.')
      setQuote(null)
    } catch (err) {
      console.warn('[scout]', err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : 'The plate did not run')
    } finally {
      setLoading(false)
    }
  }

  const frames = showRaw ? [...(result?.streetView ?? []), ...(result?.filtered ?? [])] : (result?.streetView ?? [])
  const visible = frames.slice(page * 24, page * 24 + 24)

  return (
    <div className="relative flex h-full flex-col bg-[#0a0a12] text-white">
      <div className="space-y-2 border-b border-white/10 p-3">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/50">
          <MapPin className="h-3.5 w-3.5 text-[#00e5c8]" /> Location Scout
        </div>
        <div className="flex gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search() }} placeholder="King St, Melbourne, Victoria, 3000" className="flex-1 rounded-lg border border-[#2a3040] bg-[#0d1117] px-3 py-2 text-sm" />
          <button type="button" disabled={loading || !query.trim()} onClick={() => void search()} className="rounded-lg bg-[#00e5c8] px-3 text-black disabled:opacity-40">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="space-y-1">
            {suggestions.slice(0, 5).map((hit) => (
              <button key={`${hit.lat}-${hit.lng}-${hit.displayName}`} type="button" className="block w-full truncate text-left text-[10px] text-white/70 hover:text-[#00e5c8]" onClick={() => void search(hit)}>
                {hit.displayName}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mx-3 mt-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}

      {result && (
        <div className="space-y-2 border-b border-white/10 px-3 py-2">
          <p className="text-xs">{result.location.displayName}</p>
          <p className="text-[10px] text-white/50">{result.location.lat.toFixed(5)}, {result.location.lng.toFixed(5)} · {result.location.kind}</p>
          <div className="flex gap-1 text-[10px]">
            <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => nudge(0.0004, 0)}>N</button>
            <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => nudge(-0.0004, 0)}>S</button>
            <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => nudge(0, -0.0004)}>W</button>
            <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => nudge(0, 0.0004)}>E</button>
            <button type="button" className="rounded border border-[#00e5c8]/40 px-2 py-1 text-[#00e5c8]" onClick={() => window.open(`/location/aerial?lat=${result.viewer.lat}&lng=${result.viewer.lng}&label=${encodeURIComponent(result.viewer.label)}`, '_blank')}>
              Open 3D aerial viewer
            </button>
          </div>
          <label className="flex items-center gap-2 text-[10px] text-white/60">
            <input type="checkbox" checked={showRaw} onChange={(event) => { setShowRaw(event.target.checked); setPage(0) }} />
            Show raw ({result.meta.filteredCount} filtered: fisheye, low resolution, near-duplicates)
          </label>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {visible.length > 0 && (
          <>
            <p className="text-[10px] text-white/50">{result?.meta.streetViewCount} kept · {MAPILLARY_LICENCE}</p>
            <div className="grid grid-cols-2 gap-2">
              {visible.map((frame) => (
                <button key={frame.id + (frame.filteredReason ?? '')} type="button" className="overflow-hidden rounded border border-white/10 text-left" onClick={() => setOpen(frame)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frame.thumbUrl || frame.fullUrl} alt="" className="aspect-video w-full object-cover" />
                  <span className="block px-1 py-1 text-[9px] text-white/50">
                    {frame.isPano ? 'pano' : frame.cameraType} · {frame.capturedAt.slice(0, 10) || 'date unknown'}
                    {frame.filteredReason ? ` · ${frame.filteredReason}` : ''}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 text-[10px]">
              <button type="button" disabled={page === 0} className="rounded bg-white/10 px-2 py-1" onClick={() => setPage((n) => Math.max(0, n - 1))}>Previous</button>
              <button type="button" disabled={(page + 1) * 24 >= frames.length} className="rounded bg-white/10 px-2 py-1" onClick={() => setPage((n) => n + 1)}>Next</button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-1">
            <p className="text-[10px] text-white/40">Satellite is a view. It is not sent to generation.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.satellite.closeUp} alt="Satellite" className="w-full rounded" />
          </div>
        )}

        <div className="space-y-2 rounded border border-white/10 p-2">
          <p className="text-[11px]">Generate a plate</p>
          {camera && <p className="text-[10px] text-[#00e5c8]">Camera captured: {camera.height}m · heading {camera.heading} · {camera.time} {camera.weather}</p>}
          <input value={describe} onChange={(event) => setDescribe(event.target.value)} placeholder="Describe a location, or add a note to the street" className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px]" />
          <label className="block text-[10px] text-white/50">
            Your photos
            <input type="file" accept="image/*" multiple className="mt-1 block text-[10px]" onChange={(event) => {
              const files = [...(event.target.files ?? [])]
              void Promise.all(files.map(async (file) => {
                const form = new FormData()
                form.set('image', file)
                const res = await fetch('/api/upload/image', { method: 'POST', body: form, credentials: 'include' })
                const body = await res.json() as { url?: string; error?: string }
                if (!res.ok || !body.url) throw new Error(body.error || 'Upload failed')
                return body.url
              })).then((urls) => setRefs(urls)).catch((err) => {
                console.warn('[scout]', err instanceof Error ? err.message : err)
                setError(err instanceof Error ? err.message : 'Upload failed')
              })
            }} />
          </label>
          <label className="flex items-center gap-2 text-[10px]">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            I can use the selected photos as references
          </label>
          <button type="button" className="rounded bg-white/10 px-2 py-1 text-[11px]" onClick={() => void quotePlate({})}>Quote plate</button>
          {lastAssetId && <button type="button" className="ml-2 rounded bg-white/10 px-2 py-1 text-[11px]" disabled={!consent} onClick={() => void quotePlate({ parentId: lastAssetId, note: `${describe} variation` })}>Quote variation</button>}
          {result && <button type="button" className="ml-2 rounded bg-white/10 px-2 py-1 text-[11px]" disabled={!consent} onClick={() => void quotePlate({ referenceUrls: [...refs, ...result.streetView.slice(0, 3).map((frame) => frame.fullUrl)], parentId: undefined })}>Quote from 3 scout photos</button>}
          {quote && (
            <div className="space-y-1 text-[10px]">
              <p>{quote.estimateCredits} credits</p>
              <p className="text-white/50">{quote.prompt}</p>
              <button type="button" className="rounded bg-[#00e5c8] px-2 py-1 text-black" disabled={loading || (refs.length > 0 && !consent)} onClick={() => void confirmPlate()}>Confirm plate</button>
            </div>
          )}
          <p className="text-[10px] text-white/40">{GOOGLE_IMAGERY_NOTE}</p>
          {result?.meta.unavailable.map((line) => <p key={line} className="text-[10px] text-white/40">{line}</p>)}
          {note && <p className="text-[10px] text-[#00e5c8]">{note}</p>}
        </div>
      </div>

      {open && (
        <div className="absolute inset-0 z-20 flex flex-col bg-black/95 p-3">
          <button type="button" className="mb-2 text-left text-[11px]" onClick={() => setOpen(null)}>Close</button>
          {open.isPano ? <Pano url={open.fullUrl || open.thumbUrl} /> : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={open.fullUrl || open.thumbUrl} alt="" className="max-h-[60vh] w-full object-contain" />
          )}
          <p className="mt-2 text-[10px] text-white/60">
            <Camera className="mr-1 inline h-3 w-3" />
            {open.cameraType} · {open.capturedAt || 'date unknown'} · {open.licence}
            {open.isPano ? ' · drag to look around' : ''}
          </p>
          <button type="button" className="mt-2 rounded bg-[#00e5c8] px-2 py-1 text-[11px] text-black" onClick={() => void saveFrame(open)}>Save plate to library</button>
        </div>
      )}
    </div>
  )
}

function Pano({ url }: { url: string }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let disposed = false
    let cleanup = () => {}
    void import('three').then((THREE) => {
      if (disposed) return
      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(mount.clientWidth || 480, 260)
      mount.appendChild(renderer.domElement)
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(70, (mount.clientWidth || 480) / 260, 0.1, 100)
      const geometry = new THREE.SphereGeometry(8, 48, 32)
      geometry.scale(-1, 1, 1)
      const loader = new THREE.TextureLoader()
      loader.setCrossOrigin('anonymous')
      const material = new THREE.MeshBasicMaterial({
        map: loader.load(url, undefined, undefined, () => setFailed(true)),
      })
      scene.add(new THREE.Mesh(geometry, material))
      let yaw = 0
      let pitch = 0
      let dragging = false
      let lastX = 0
      let lastY = 0
      const down = (event: PointerEvent) => { dragging = true; lastX = event.clientX; lastY = event.clientY }
      const move = (event: PointerEvent) => {
        if (!dragging) return
        yaw += (event.clientX - lastX) * 0.005
        pitch = Math.max(-1, Math.min(1, pitch + (event.clientY - lastY) * 0.005))
        lastX = event.clientX
        lastY = event.clientY
      }
      const up = () => { dragging = false }
      renderer.domElement.addEventListener('pointerdown', down)
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      let frame = 0
      const loop = () => {
        camera.position.set(0, 0, 0)
        camera.lookAt(Math.sin(yaw), pitch, Math.cos(yaw))
        renderer.render(scene, camera)
        frame = requestAnimationFrame(loop)
      }
      loop()
      cleanup = () => {
        cancelAnimationFrame(frame)
        renderer.dispose()
        geometry.dispose()
        material.dispose()
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
    }).catch((err) => {
      console.warn('[scout-pano]', err instanceof Error ? err.message : err)
      setFailed(true)
    })
    return () => {
      disposed = true
      cleanup()
    }
  }, [url])
  if (failed) return <img src={url} alt="" className="max-h-[60vh] w-full object-contain" />
  return <div ref={mountRef} className="h-[260px] w-full" />
}
