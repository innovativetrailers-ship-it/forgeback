// ArcGIS World Imagery satellite tile engine — free, no API key, global coverage

function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number; z: number } {
  const n     = Math.pow(2, zoom)
  const xTile = Math.floor((lng + 180) / 360 * n)
  const yTile = Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI)
    / 2 * n
  )
  return { x: xTile, y: yTile, z: zoom }
}

export function getSatelliteTileUrl(lat: number, lng: number, zoom = 15): string {
  const { x, y, z } = latLngToTile(lat, lng, zoom)
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
}

export function getSatelliteImageUrls(lat: number, lng: number): {
  closeUp:  string   // zoom 17 — street-level detail
  district: string   // zoom 14 — neighbourhood
  regional: string   // zoom 11 — regional overview
} {
  return {
    closeUp:  getSatelliteTileUrl(lat, lng, 17),
    district: getSatelliteTileUrl(lat, lng, 14),
    regional: getSatelliteTileUrl(lat, lng, 11),
  }
}

export interface CesiumConfig {
  token:       string | undefined
  destination: { lat: number; lng: number; height: number }
  label:       string
  assetId:     number
  tilesetId:   number
}

export function getCesiumConfig(lat: number, lng: number, displayName: string): CesiumConfig {
  return {
    token:       process.env.CESIUM_ION_ACCESS_TOKEN,
    destination: { lat, lng, height: 500 },
    label:       displayName,
    assetId:     1,   // Cesium World Terrain
    tilesetId:   2,   // Cesium World Buildings
  }
}
