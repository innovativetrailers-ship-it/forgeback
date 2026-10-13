# CINEMATIC FORGE — LOCATION SYSTEM
## Cursor Agent Prompt
### Real-world location search · Street view (Mapillary) · Satellite (Cesium + ArcGIS) · GPS + Address input

---

## WHAT THIS BUILDS

A fully connected location scouting system:
1. User searches by address/place name OR GPS coordinates
2. App geocodes the address → lat/lng (Nominatim — free, no key needed)
3. App fetches street-level photos from Mapillary around that point
4. App generates satellite tile image from ArcGIS World Imagery (free, no key)
5. App generates Cesium 3D aerial config for the interactive viewer
6. User can save any image as a Location Plate to their vault

Uses: `MAPILLARY_ACCESS_TOKEN`, `CESIUM_ION_ACCESS_TOKEN` (already in env).
Satellite imagery via ArcGIS World Imagery — free, no API key required.

---

## STEP 1 — GEOCODING ENGINE

**Create** `src/lib/engines/geocode.ts`:

```typescript
// src/lib/engines/geocode.ts
// Convert address or GPS string → lat/lng
// Uses Nominatim (OpenStreetMap) — completely free, no API key

export interface GeoLocation {
  lat:         number
  lng:         number
  displayName: string
  country:     string
  city:        string
  address:     string
}

// Parse GPS coordinate input: "-33.8688, 151.2093" or "33.8688°S 151.2093°E"
function parseGPSInput(input: string): { lat: number; lng: number } | null {
  // Decimal degrees: "-33.8688, 151.2093" or "-33.8688 151.2093"
  const decimalMatch = input.match(
    /^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/
  )
  if (decimalMatch) {
    return { lat: parseFloat(decimalMatch[1]), lng: parseFloat(decimalMatch[2]) }
  }

  // DMS format: "33°52'7.68"S 151°12'33.48"E"
  const dmsMatch = input.match(
    /(\d+)[°](\d+)['](\d+\.?\d*)["]([NS])\s*(\d+)[°](\d+)['](\d+\.?\d*)["]([EW])/i
  )
  if (dmsMatch) {
    const lat = (parseFloat(dmsMatch[1]) + parseFloat(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600)
      * (dmsMatch[4].toUpperCase() === 'S' ? -1 : 1)
    const lng = (parseFloat(dmsMatch[5]) + parseFloat(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600)
      * (dmsMatch[8].toUpperCase() === 'W' ? -1 : 1)
    return { lat, lng }
  }

  return null
}

export async function geocodeLocation(query: string): Promise<GeoLocation> {
  query = query.trim()

  // Try GPS coordinates first
  const gps = parseGPSInput(query)
  if (gps) {
    // Reverse geocode to get display name
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${gps.lat}&lon=${gps.lng}&format=json`,
      { headers: { 'User-Agent': 'CinematicForge/1.0' } }
    )
    const data = await res.json()
    return {
      lat:         gps.lat,
      lng:         gps.lng,
      displayName: data.display_name ?? `${gps.lat}, ${gps.lng}`,
      country:     data.address?.country ?? '',
      city:        data.address?.city ?? data.address?.town ?? data.address?.village ?? '',
      address:     data.display_name ?? '',
    }
  }

  // Text search via Nominatim
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`
  const res  = await fetch(url, {
    headers: { 'User-Agent': 'CinematicForge/1.0' },
  })
  const results = await res.json()

  if (!results.length) {
    throw new Error(`Location not found: "${query}"`)
  }

  const r = results[0]
  return {
    lat:         parseFloat(r.lat),
    lng:         parseFloat(r.lon),
    displayName: r.display_name,
    country:     r.address?.country ?? '',
    city:        r.address?.city ?? r.address?.town ?? r.address?.village ?? '',
    address:     r.display_name,
  }
}
```

---

## STEP 2 — SATELLITE IMAGE ENGINE

**Create** `src/lib/engines/satellite.ts`:

```typescript
// src/lib/engines/satellite.ts
// Generate satellite tile imagery using ArcGIS World Imagery
// Free, no API key, global coverage

function latLngToTile(lat: number, lng: number, zoom: number) {
  const n    = Math.pow(2, zoom)
  const xTile = Math.floor((lng + 180) / 360 * n)
  const yTile = Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI)
    / 2 * n
  )
  return { x: xTile, y: yTile, z: zoom }
}

export function getSatelliteTileUrl(lat: number, lng: number, zoom = 15): string {
  const { x, y, z } = latLngToTile(lat, lng, zoom)
  // ArcGIS World Imagery — free satellite tiles, global coverage
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
}

export function getSatelliteImageUrls(lat: number, lng: number): {
  closeUp:    string    // zoom 17 — street level detail
  district:   string    // zoom 14 — neighbourhood
  regional:   string    // zoom 11 — regional overview
} {
  return {
    closeUp:  getSatelliteTileUrl(lat, lng, 17),
    district: getSatelliteTileUrl(lat, lng, 14),
    regional: getSatelliteTileUrl(lat, lng, 11),
  }
}

// Cesium 3D aerial config (for client-side viewer)
export function getCesiumConfig(lat: number, lng: number, displayName: string) {
  return {
    token:       process.env.CESIUM_ION_ACCESS_TOKEN,
    destination: { lat, lng, height: 500 },   // 500m altitude
    label:       displayName,
    assetId:     1,    // Cesium World Terrain
    tilesetId:   2,    // Cesium World Buildings
  }
}
```

---

## STEP 3 — UPDATE MAPILLARY ENGINE

**Edit** `src/lib/engines/mapillary.ts` — update to support radius-based search with pagination:

```typescript
// src/lib/engines/mapillary.ts

const MAPILLARY_BASE = 'https://graph.mapillary.com'

export interface MapillaryImage {
  id:         string
  thumbUrl:   string
  fullUrl:    string
  capturedAt: string
  lat:        number
  lng:        number
  compassAngle?: number
}

export async function searchStreetView(params: {
  lat:    number
  lng:    number
  radius?: number    // metres, default 150
  limit?:  number    // default 20
}): Promise<MapillaryImage[]> {
  const radius = params.radius ?? 150
  const limit  = params.limit  ?? 20

  // Build bounding box from lat/lng + radius
  const degOffset = radius / 111320
  const bbox = [
    params.lng - degOffset,
    params.lat - degOffset,
    params.lng + degOffset,
    params.lat + degOffset,
  ].join(',')

  const url = `${MAPILLARY_BASE}/images?` + new URLSearchParams({
    access_token:  process.env.MAPILLARY_ACCESS_TOKEN!,
    fields:        'id,thumb_1024_url,thumb_2048_url,captured_at,geometry,compass_angle',
    bbox,
    limit:         String(limit),
  })

  const res  = await fetch(url)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Mapillary search failed: ${err}`)
  }
  const data = await res.json()

  return (data.data ?? []).map((img: any) => ({
    id:           img.id,
    thumbUrl:     img.thumb_1024_url ?? '',
    fullUrl:      img.thumb_2048_url ?? img.thumb_1024_url ?? '',
    capturedAt:   img.captured_at ?? '',
    lat:          img.geometry?.coordinates?.[1] ?? params.lat,
    lng:          img.geometry?.coordinates?.[0] ?? params.lng,
    compassAngle: img.compass_angle,
  }))
}
```

---

## STEP 4 — LOCATION API ROUTE

**Create** (or replace) `src/app/api/location/search/route.ts`:

```typescript
// src/app/api/location/search/route.ts

import { geocodeLocation }            from '@/lib/engines/geocode'
import { searchStreetView }           from '@/lib/engines/mapillary'
import { getSatelliteImageUrls, getCesiumConfig } from '@/lib/engines/satellite'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { query, radius } = await req.json()

  if (!query?.trim()) {
    return Response.json({ error: 'query required' }, { status: 400 })
  }

  if (!process.env.MAPILLARY_ACCESS_TOKEN) {
    return Response.json({ error: 'MAPILLARY_ACCESS_TOKEN not configured' }, { status: 503 })
  }

  try {
    // 1. Geocode the search query → lat/lng
    const location = await geocodeLocation(query)

    // 2. Fetch street-level images from Mapillary
    const streetView = await searchStreetView({
      lat:    location.lat,
      lng:    location.lng,
      radius: radius ?? 150,
      limit:  24,
    })

    // 3. Generate satellite tile URLs (free, no key)
    const satellite = getSatelliteImageUrls(location.lat, location.lng)

    // 4. Cesium 3D config
    const cesium = getCesiumConfig(location.lat, location.lng, location.displayName)

    return Response.json({
      location,
      streetView,
      satellite,
      cesium,
      meta: {
        streetViewCount: streetView.length,
        hasStreetView:   streetView.length > 0,
        hasSatellite:    true,
      },
    })
  } catch (err: any) {
    console.error('[location/search]', err.message)
    return Response.json({ error: err.message }, { status: 400 })
  }
}
```

---

## STEP 5 — LOCATION PANEL COMPONENT

**Create** `src/components/panels/LocationPanel.tsx`:

```tsx
// src/components/panels/LocationPanel.tsx

'use client'

import { useState } from 'react'
import { MapPin, Search, Navigation, Satellite, Camera, Loader2, Save } from 'lucide-react'

interface LocationResult {
  location:    { lat: number; lng: number; displayName: string; city: string; country: string }
  streetView:  Array<{ id: string; thumbUrl: string; fullUrl: string; capturedAt: string; compassAngle?: number }>
  satellite:   { closeUp: string; district: string; regional: string }
  cesium:      { token: string; destination: any; assetId: number }
  meta:        { streetViewCount: number; hasStreetView: boolean }
}

type ViewMode = 'street' | 'satellite'

export function LocationPanel() {
  const [query,     setQuery]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState<LocationResult | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [viewMode,  setViewMode]  = useState<ViewMode>('street')
  const [selected,  setSelected]  = useState<string | null>(null)

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/location/search', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ query }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const saveToVault = async (imageUrl: string, type: 'street' | 'satellite') => {
    await fetch('/api/vault/location/save', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        type,
        location: result?.location,
      }),
    })
    setSelected(imageUrl)
  }

  const openCesiumViewer = () => {
    if (!result?.cesium) return
    // Store cesium config in sessionStorage for the viewer page
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

        {/* Format hints */}
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
              <p className="text-xs font-medium text-white truncate">{result.location.city || result.location.displayName}</p>
              <p className="text-[10px] text-gray-500">
                {result.location.lat.toFixed(4)}, {result.location.lng.toFixed(4)}
              </p>
            </div>
            <div className="flex gap-1.5">
              {/* Street / Satellite toggle */}
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

          {/* Cesium 3D button */}
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
                  {result.meta.streetViewCount} street photos · tap to save to vault
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

            {[
              { label: 'Close-up (street detail)', url: result.satellite.closeUp,  zoom: 17 },
              { label: 'District view',            url: result.satellite.district,  zoom: 14 },
              { label: 'Regional overview',        url: result.satellite.regional,  zoom: 11 },
            ].map(tile => (
              <button
                key={tile.zoom}
                onClick={() => saveToVault(tile.url, 'satellite')}
                className={`w-full rounded overflow-hidden border-2 transition group ${
                  selected === tile.url ? 'border-[#00e5c8]' : 'border-transparent hover:border-[#00e5c8]/40'
                }`}
              >
                <img
                  src={tile.url}
                  alt={tile.label}
                  className="w-full object-cover"
                  style={{ imageRendering: 'pixelated' }}
                  onError={(e) => {
                    e.currentTarget.parentElement!.innerHTML =
                      `<div class="py-6 text-center text-[10px] text-gray-600 bg-white/5">${tile.label}: tile unavailable</div>`
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
```

---

## STEP 6 — VAULT SAVE ROUTE

**Create** `src/app/api/vault/location/save/route.ts`:

```typescript
// src/app/api/vault/location/save/route.ts

import { db }        from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageUrl, type, location } = await req.json()

  // Download the image and store in R2 for permanence
  try {
    const imgBuffer = await fetch(imageUrl).then(r => r.arrayBuffer())
    const r2Url     = await uploadToR2(
      Buffer.from(imgBuffer),
      `location-plates/${userId}/${Date.now()}.jpg`
    )

    // Store in DB as a location plate
    const plate = await db.locationPlate.create({
      data: {
        userId,
        imageUrl:    r2Url,
        sourceUrl:   imageUrl,
        type,                          // 'street' | 'satellite'
        lat:         location?.lat,
        lng:         location?.lng,
        displayName: location?.displayName,
        city:        location?.city,
        country:     location?.country,
      },
    })

    return Response.json({ saved: true, plateId: plate.id, imageUrl: r2Url })
  } catch (err: any) {
    console.error('[vault/location/save]', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
```

---

## STEP 7 — VAULT LIST ROUTE

**Create** (or replace) `src/app/api/vault/location/list/route.ts`:

```typescript
// src/app/api/vault/location/list/route.ts

import { db } from '@/lib/db'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const plates = await db.locationPlate.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    take:    100,
  })

  return Response.json({ plates })
}
```

---

## STEP 8 — PRISMA SCHEMA ADDITION

**Add to** `prisma/schema.prisma`:

```prisma
model LocationPlate {
  id          String   @id @default(cuid())
  userId      String
  imageUrl    String   // R2 permanent URL
  sourceUrl   String   // original Mapillary or ArcGIS URL
  type        String   // 'street' | 'satellite'
  lat         Float?
  lng         Float?
  displayName String?
  city        String?
  country     String?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([type])
}
```

**Add to User model:**
```prisma
locationPlates LocationPlate[]
```

**Run:**
```bash
npx prisma migrate dev --name add_location_plates
npx prisma generate
```

---

## STEP 9 — WIRE LOCATION PANEL INTO THE EDITOR

Find where the Locations tab panel is rendered (probably in the main editor left panel or film toolbar). Replace the placeholder with the real component:

```tsx
// Wherever the Locations panel renders:
import { LocationPanel } from '@/components/panels/LocationPanel'

// Replace placeholder/empty content with:
{activeTab === 'locations' && <LocationPanel />}
```

---

## STEP 10 — CESIUM AERIAL VIEWER PAGE (bonus — opens in new tab)

**Create** `src/app/location/aerial/page.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'

export default function AerialViewerPage() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const config = JSON.parse(sessionStorage.getItem('cesium-config') ?? '{}')
    if (!config.token || !containerRef.current) return

    // Dynamically load Cesium viewer
    const script = document.createElement('script')
    script.src = 'https://cesium.com/downloads/cesiumjs/releases/1.113/Build/Cesium/Cesium.js'
    script.onload = () => {
      const Cesium = (window as any).Cesium
      Cesium.Ion.defaultAccessToken = config.token

      const viewer = new Cesium.Viewer(containerRef.current, {
        terrainProvider: Cesium.createWorldTerrain(),
        animation:       false,
        timeline:        false,
        baseLayerPicker: false,
      })

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          config.destination.lng,
          config.destination.lat,
          config.destination.height ?? 500
        ),
        duration: 2,
      })
    }
    document.head.appendChild(script)

    const link = document.createElement('link')
    link.rel  = 'stylesheet'
    link.href = 'https://cesium.com/downloads/cesiumjs/releases/1.113/Build/Cesium/Widgets/widgets.css'
    document.head.appendChild(link)
  }, [])

  return (
    <div className="w-screen h-screen bg-black">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
```

---

## VERIFICATION

```bash
# TypeScript passes
npx tsc --noEmit

# Prisma migrated
npx prisma migrate dev --name add_location_plates
npx prisma generate

# Test geocoding — address
curl -X POST http://localhost:3000/api/location/search \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"query": "Tokyo, Japan"}'
# Expected: { location: { lat: 35.68, lng: 139.69, ... }, streetView: [...], satellite: {...} }

# Test geocoding — GPS coordinates
curl -X POST http://localhost:3000/api/location/search \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"query": "-33.8688, 151.2093"}'
# Expected: { location: { city: "Sydney", country: "Australia", ... }, ... }

# Test vault save
curl -X POST http://localhost:3000/api/vault/location/save \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"imageUrl":"https://...", "type":"satellite", "location":{"lat":-33.86,"lng":151.20}}'
# Expected: { saved: true, plateId: "...", imageUrl: "https://r2..." }
```

---

## SUMMARY — FILES CREATED/EDITED

| Action | File |
|---|---|
| CREATE | `src/lib/engines/geocode.ts` |
| UPDATE | `src/lib/engines/mapillary.ts` |
| CREATE | `src/lib/engines/satellite.ts` |
| CREATE | `src/app/api/location/search/route.ts` |
| CREATE | `src/app/api/vault/location/save/route.ts` |
| CREATE | `src/app/api/vault/location/list/route.ts` |
| CREATE | `src/components/panels/LocationPanel.tsx` |
| CREATE | `src/app/location/aerial/page.tsx` |
| EDIT | `prisma/schema.prisma` — add LocationPlate model |
| EDIT | Editor — wire LocationPanel to Locations tab |

## WHAT USERS CAN NOW DO

```
Search:   "Paris, France"          → street photos + satellite tiles
Search:   "Shibuya Crossing Tokyo" → street photos + satellite tiles
Search:   "-33.8688, 151.2093"    → GPS → reverse geocoded → imagery
Search:   "48°51'30"N 2°21'3"E"  → DMS format → imagery
Save:     any image → saves to vault as Location Plate
3D view:  "Open aerial viewer" → Cesium 3D terrain in new tab
Generate: use any saved plate as reference for VLM generation
```
