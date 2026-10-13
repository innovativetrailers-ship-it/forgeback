/**
 * OpenEXR loader for the node compositor.
 * Parses .exr files (via Python EXR service) to extract channel data
 * for deep compositing, depth-of-field, and Cryptomatte operations.
 */

import { cryptomatteCoverage } from './vfx'

export interface EXRData {
  width: number
  height: number
  channels: string[]           // e.g. ['R', 'G', 'B', 'A', 'Z', 'id.red', 'id.green', 'id.blue']
  hasDepth: boolean            // Z channel present — enables Defocus node
  hasCryptomatte: boolean      // id.* / crypto.* channels — enables Cryptomatte node
  channelData: Record<string, number[]>   // raw float32 pixel data per channel
  metadataOnly?: boolean       // true when OpenEXR lib not installed (no pixel data)
}

const EXR_SERVICE = process.env.EXR_SERVICE_URL ?? 'http://localhost:7435'

export async function loadEXRFromFile(file: File): Promise<EXRData> {
  const formData = new FormData()
  formData.append('file', file, file.name)

  const res = await fetch(`${EXR_SERVICE}/parse`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch((err) => {
      console.warn("[caught] src/lib/compositor/EXRLoader.ts:28", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (({ error: res.statusText }))
    }) as { error?: string }
    throw new Error(`EXR parse failed: ${err.error ?? res.statusText}`)
  }
  return res.json() as Promise<EXRData>
}

export async function loadEXRFromURL(url: string): Promise<EXRData> {
  const res = await fetch(`${EXR_SERVICE}/parse_url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) {
    const err = await res.json().catch((err) => {
      console.warn("[caught] src/lib/compositor/EXRLoader.ts:41", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (({ error: res.statusText }))
    }) as { error?: string }
    throw new Error(`EXR parse failed: ${err.error ?? res.statusText}`)
  }
  return res.json() as Promise<EXRData>
}

/** Extract the depth (Z) channel as a normalised Float32Array for use in Defocus. */
export function extractDepthChannel(exr: EXRData): Float32Array | null {
  const z = exr.channelData['Z'] ?? exr.channelData['depth']
  if (!z) return null
  const arr = new Float32Array(z)
  // Normalise depth to 0-1 range
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]
    if (isFinite(v)) { if (v < min) min = v; if (v > max) max = v }
  }
  if (max === min) return arr
  const range = max - min
  for (let i = 0; i < arr.length; i++) {
    arr[i] = (arr[i] - min) / range
  }
  return arr
}

/** Extract a Cryptomatte matte for a given object name. */
export function extractCryptomatteMatte(exr: EXRData, objectName: string): Float32Array | null {
  const name = objectName.trim()
  if (!name) return null
  const idRed = exr.channelData['id.red'] ?? exr.channelData['crypto_object00.R']
  if (!idRed) return null
  return cryptomatteCoverage(idRed, name)
}

export async function checkEXRHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${EXR_SERVICE}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch (err) {
    console.warn("[caught] src/lib/compositor/EXRLoader.ts:80", err instanceof Error ? { name: err.name, message: err.message } : err)

    return false
  }
}
