'use client'

import { useState } from 'react'
import { MapPin, Search, Navigation, Satellite, Camera, Loader2, Save } from 'lucide-react'

interface LocationResult {
  location:   { lat: number; lng: number; displayName: string; city: string; country: string }
  streetView: Array<{ id: string; thumbUrl: string; fullUrl: string; capturedAt: string; compassAngle?: number }>
  satellite:  { closeUp: string; district: string; regional: string }
  cesium:     { token: string; destination: { lat: number; lng: number; height: number }; assetId: number }
  meta:       { streetViewCount: number; hasStreetView: boolean }
}

type ViewMode = 'street' | 'satellite'

export function LocationPanel() {
  const [query,    setQuery]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<LocationResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('street')
  const [selected, setSelected] = useState<string | null>(null)

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res  = await fetch('/api/location/search', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ query }),
      })
      const data = await res.json() as LocationResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setResult(data)
    } catch (err: unknown) {
      console.warn("[caught] src/components/panels/LocationPanel.tsx:40", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const saveToVault = async (imageUrl: string, type: 'street' | 'satellite') => {
    try {
      await fetch('/api/vault/location/save', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, type, location: result?.location }),
      })
      setSelected(imageUrl)
    } catch (err) {
      console.warn("[caught] src/components/panels/LocationPanel.tsx:56", err instanceof Error ? { name: err.name, message: err.message } : err)

      // silent — tile saved indicator will not activate
    }
  }

  const openCesiumViewer = () => {
    if (!result?.cesium) return
    sessionStorage.setItem('cesium-config', JSON.stringify(result.cesium))
    window.open('/location/aerial', '_blank')
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a12]">

      {/* Search bar */}
      <div className="p-3 border-b border-white/8 space-y-2">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-[#00e5c8]" />
          <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
            Location Scout
          </span>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="Tokyo, Japan  or  -33.8688, 151.2093"
              className="w-full px-3 py-2 pr-8 bg-[#0d1117] border border-[#2a3040] rounded-lg text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#00e5c8]/50"
            />
            <Navigation className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
          </div>
          <button
            onClick={search}
            disabled={loading || !query.trim()}
            className="px-3 py-2 bg-[#00e5c8] text-black rounded-lg disabled:opacity-40 flex items-center gap-1.5"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Search className="w-3.5 h-3.5" />
            }
          </button>
        </div>

        <div className="flex gap-3 text-[10px] text-gray-600">
          <span>• City, Country</span>
          <span>• Street address</span>
          <span>• lat, lng</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Result header */}
      {result && (
        <div className="px-3 py-2 border-b border-white/8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white truncate">
                {result.location.city || result.location.displayName}
              </p>
              <p className="text-[10px] text-gray-500">
                {result.location.lat.toFixed(4)}, {result.location.lng.toFixed(4)}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setViewMode('street')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition ${
                  viewMode === 'street' ? 'bg-[#00e5c8] text-black' : 'bg-white/5 text-gray-400'
                }`}
              >
                <Camera className="w-3 h-3" /> Street
              </button>
              <button
                onClick={() => setViewMode('satellite')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition ${
                  viewMode === 'satellite' ? 'bg-[#00e5c8] text-black' : 'bg-white/5 text-gray-400'
                }`}
              >
                <Satellite className="w-3 h-3" /> Satellite
              </button>
            </div>
          </div>

          <button
            onClick={openCesiumViewer}
            className="mt-2 w-full py-1.5 border border-[#00e5c8]/30 text-[#00e5c8] text-[10px] rounded hover:bg-[#00e5c8]/10 transition"
          >
            Open 3D aerial viewer →
          </button>
        </div>
      )}

      {/* Images grid */}
      <div className="flex-1 overflow-y-auto">

        {/* Street view photos */}
        {result && viewMode === 'street' && (
          <div className="p-2">
            {result.meta.streetViewCount === 0 ? (
              <div className="py-8 text-center text-xs text-gray-600">
                No street view photos found near this location.<br />
                Try a larger radius or a different address.
              </div>
            ) : (
              <>
                <p className="text-[10px] text-gray-600 mb-2 px-1">
                  {result.meta.streetViewCount} street photos · tap to save as a location
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {result.streetView.map(img => (
                    <button
                      key={img.id}
                      onClick={() => saveToVault(img.fullUrl, 'street')}
                      className={`relative rounded overflow-hidden aspect-video group border-2 transition ${
                        selected === img.fullUrl ? 'border-[#00e5c8]' : 'border-transparent hover:border-[#00e5c8]/40'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.thumbUrl}
                        alt="Street view"
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                        <Save className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition" />
                      </div>
                      {selected === img.fullUrl && (
                        <div className="absolute top-1 right-1 w-3 h-3 bg-[#00e5c8] rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Satellite view */}
        {result && viewMode === 'satellite' && (
          <div className="p-2 space-y-2">
            <p className="text-[10px] text-gray-600 px-1">Satellite imagery · ArcGIS World Imagery</p>

            {([
              { label: 'Close-up (street detail)', url: result.satellite.closeUp,  zoom: 17 },
              { label: 'District view',            url: result.satellite.district,  zoom: 14 },
              { label: 'Regional overview',        url: result.satellite.regional,  zoom: 11 },
            ] as const).map(tile => (
              <button
                key={tile.zoom}
                onClick={() => saveToVault(tile.url, 'satellite')}
                className={`w-full rounded overflow-hidden border-2 transition group ${
                  selected === tile.url ? 'border-[#00e5c8]' : 'border-transparent hover:border-[#00e5c8]/40'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tile.url}
                  alt={tile.label}
                  className="w-full object-cover"
                  style={{ imageRendering: 'pixelated' }}
                  onError={(e) => {
                    const parent = e.currentTarget.parentElement
                    if (parent) parent.innerHTML = `<div class="py-6 text-center text-[10px] text-gray-600 bg-white/5">${tile.label}: tile unavailable</div>`
                  }}
                />
                <div className="px-2 py-1.5 text-left bg-black/40 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">{tile.label}</span>
                  <Save className="w-3 h-3 text-gray-500 group-hover:text-[#00e5c8] transition" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
            <MapPin className="w-8 h-8 text-gray-700 mb-3" />
            <p className="text-xs text-gray-500 mb-1">Search any real-world location</p>
            <p className="text-[10px] text-gray-700">
              Street view photos from Mapillary<br />
              Satellite imagery from ArcGIS<br />
              3D aerial viewer from Cesium
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
