const MAGIC: Array<{ ext: string; mime: string; bytes: number[] }> = [
  { ext: 'png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'jpg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'webp', mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  { ext: 'mp4', mime: 'video/mp4', bytes: [0x00, 0x00, 0x00] },
  { ext: 'wav', mime: 'audio/wav', bytes: [0x52, 0x49, 0x46, 0x46] },
  { ext: 'mp3', mime: 'audio/mpeg', bytes: [0x49, 0x44, 0x33] },
]

export function sniffMedia(buffer: Buffer): { ext: string; mime: string } | null {
  const head = buffer.subarray(0, 16).toString('utf8').trimStart().toLowerCase()
  if (head.startsWith('<svg') || head.startsWith('<!doctype') || head.startsWith('<html')) return null
  for (const kind of MAGIC) {
    if (kind.bytes.every((byte, index) => buffer[index] === byte)) {
      if (kind.ext === 'webp' && buffer.subarray(8, 12).toString() !== 'WEBP') continue
      if (kind.ext === 'wav' && buffer.subarray(8, 12).toString() !== 'WAVE') continue
      if (kind.ext === 'mp4' && buffer.subarray(4, 8).toString() !== 'ftyp') continue
      return { ext: kind.ext, mime: kind.mime }
    }
  }
  return null
}

export function opaqueObjectKey(ext: string): string {
  const { randomBytes } = require('node:crypto') as typeof import('node:crypto')
  return `media/${randomBytes(16).toString('hex')}.${ext}`
}
