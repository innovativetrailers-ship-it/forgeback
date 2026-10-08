'use client'

import { useEffect, useRef, useState } from 'react'
import { getSatelliteTileUrl } from '@/lib/engines/satellite'

const CESIUM_BASE = 'https://cesium.com/downloads/cesiumjs/releases/1.113/Build/Cesium/'

interface CesiumCamera {
  height: number
  heading: number
  pitch: number
  fov: number
}

export default function AerialViewerPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<InstanceType<CesiumApi['Viewer']> | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reason, setReason] = useState('Loading the 3D tiles…')
  const [place, setPlace] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [camera, setCamera] = useState<CesiumCamera>({ height: 80, heading: 0, pitch: -35, fov: 60 })
  const [time, setTime] = useState('dusk')
  const [season, setSeason] = useState('summer')
  const [weather, setWeather] = useState('clear')

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const lat = Number(q.get('lat'))
    const lng = Number(q.get('lng'))
    const label = q.get('label') || 'Location'
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setStatus('error')
      setReason('3D tiles unavailable: no place was passed to the viewer.')
      return
    }
    setPlace({ lat, lng, label })
    let cancelled = false
    let viewer: InstanceType<CesiumApi['Viewer']> | null = null

    const boot = async () => {
      const probe = document.createElement('canvas')
      if (!probe.getContext('webgl') && !probe.getContext('webgl2')) {
        setStatus('error')
        setReason('3D tiles unavailable: WebGL is not available in this browser.')
        return
      }
      const tokenRes = await fetch('/api/location/viewer', { credentials: 'include' })
      const tokenBody = await tokenRes.json() as { token?: string; error?: string }
      if (!tokenRes.ok || !tokenBody.token) {
        setStatus('error')
        setReason(tokenBody.error || '3D tiles unavailable: token rejected')
        return
      }
      try {
        const Cesium = await loadCesium()
        if (cancelled || !containerRef.current) return
        Cesium.Ion.defaultAccessToken = tokenBody.token
        const terrain = await Cesium.createWorldTerrainAsync()
        if (cancelled || !containerRef.current) return
        viewer = new Cesium.Viewer(containerRef.current, {
          terrainProvider: terrain,
          animation: false,
          timeline: false,
          baseLayerPicker: false,
        })
        viewerRef.current = viewer
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lng, lat, 500),
          duration: 1.5,
        })
        if (!cancelled) {
          setStatus('ready')
          setReason('')
        }
      } catch (err) {
        console.warn('[cesium]', err instanceof Error ? err.message : err)
        if (!cancelled) {
          setStatus('error')
          setReason(`3D tiles unavailable: ${err instanceof Error ? err.message : 'the viewer failed'}`)
        }
      }
    }
    void boot()
    return () => {
      cancelled = true
      viewer?.destroy()
      viewerRef.current = null
    }
  }, [])

  function applyCamera() {
    const Cesium = (window as unknown as { Cesium?: CesiumApi }).Cesium
    const viewer = viewerRef.current
    if (!Cesium || !viewer || !place) return
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(place.lng, place.lat, camera.height),
      orientation: {
        heading: Cesium.Math.toRadians(camera.heading),
        pitch: Cesium.Math.toRadians(camera.pitch),
        roll: 0,
      },
    })
    if (viewer.camera.frustum) viewer.camera.frustum.fov = Cesium.Math.toRadians(camera.fov)
  }

  function capture() {
    if (!place) return
    localStorage.setItem('cinema-scout-camera', JSON.stringify({
      ...place,
      ...camera,
      time,
      season,
      weather,
      at: Date.now(),
    }))
    setReason('Camera view saved. Return to Location Scout and generate the plate. The globe itself does not relight for time of day.')
  }

  const satellite = place ? getSatelliteTileUrl(place.lat, place.lng, 17) : ''

  return (
    <div className="relative w-screen h-screen bg-black text-white">
      <div ref={containerRef} className="w-full h-full" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
          <p className="text-sm">{status === 'loading' ? 'Loading the 3D tiles…' : reason}</p>
          {status === 'error' && satellite && (
            <div>
              <p className="mb-2 text-xs text-white/60">2D satellite view</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={satellite} alt="Satellite fallback" className="max-h-[50vh] rounded border border-white/20" />
            </div>
          )}
        </div>
      )}
      <div className="absolute left-3 top-3 w-64 space-y-2 rounded bg-black/70 p-3 text-[11px]">
        <p className="font-medium">{place?.label ?? 'Aerial viewer'}</p>
        <p className="text-white/50">Desktop does not host this Cesium page. The desktop scout still downloads Mapillary plates into the bin.</p>
        {(['height', 'heading', 'pitch', 'fov'] as const).map((key) => (
          <label key={key} className="block">
            {key} {camera[key]}
            <input type="range" min={key === 'height' ? 10 : key === 'fov' ? 20 : -180} max={key === 'height' ? 800 : key === 'fov' ? 100 : 180} value={camera[key]} onChange={(event) => setCamera({ ...camera, [key]: Number(event.target.value) })} className="w-full" />
          </label>
        ))}
        <select value={time} onChange={(event) => setTime(event.target.value)} className="w-full bg-black">{['dawn', 'day', 'dusk', 'night'].map((item) => <option key={item}>{item}</option>)}</select>
        <select value={season} onChange={(event) => setSeason(event.target.value)} className="w-full bg-black">{['summer', 'autumn', 'winter', 'spring'].map((item) => <option key={item}>{item}</option>)}</select>
        <select value={weather} onChange={(event) => setWeather(event.target.value)} className="w-full bg-black">{['clear', 'cloud', 'rain', 'fog'].map((item) => <option key={item}>{item}</option>)}</select>
        <button type="button" className="w-full rounded bg-white/10 py-1" onClick={applyCamera}>Aim camera</button>
        <button type="button" className="w-full rounded bg-[#00e5c8] py-1 text-black" onClick={capture}>Capture camera view</button>
        {status === 'ready' && reason && <p className="text-white/70">{reason}</p>}
      </div>
    </div>
  )
}

interface CesiumApi {
  Ion: { defaultAccessToken: string }
  Viewer: new (el: HTMLDivElement, opts: unknown) => {
    camera: { flyTo: (opts: unknown) => void; setView: (opts: unknown) => void; frustum?: { fov: number } }
    destroy: () => void
  }
  createWorldTerrainAsync: () => Promise<unknown>
  Cartesian3: { fromDegrees: (lng: number, lat: number, height: number) => unknown }
  Math: { toRadians: (deg: number) => number }
}

function loadCesium(): Promise<CesiumApi> {
  const existing = (window as unknown as { Cesium?: CesiumApi }).Cesium
  if (existing?.createWorldTerrainAsync) return Promise.resolve(existing)
  ;(window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = CESIUM_BASE
  if (!document.querySelector('link[data-cesium-widgets]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `${CESIUM_BASE}Widgets/widgets.css`
    link.dataset.cesiumWidgets = '1'
    document.head.appendChild(link)
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${CESIUM_BASE}Cesium.js`
    script.onload = () => {
      const Cesium = (window as unknown as { Cesium?: CesiumApi }).Cesium
      if (!Cesium?.createWorldTerrainAsync) reject(new Error('Cesium loaded without createWorldTerrainAsync'))
      else resolve(Cesium)
    }
    script.onerror = () => reject(new Error('the Cesium script did not load'))
    document.head.appendChild(script)
  })
}
