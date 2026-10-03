import { detectType, type DetectInput, type IngestType } from '@cinema/core'

export interface HostDetectInput extends DetectInput {
  buffer?: Buffer
}

export function sniffMagic(buffer?: Buffer): DetectInput['magic'] {
  if (!buffer || buffer.length < 4) return undefined
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return 'pdf'
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image'
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    const kind = buffer.slice(8, 12).toString('ascii')
    if (kind === 'WAVE' || kind === 'WEBP') return kind === 'WAVE' ? 'audio' : 'image'
  }
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return 'audio'
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'audio'
  const ftyp = buffer.slice(4, 8).toString('ascii')
  if (ftyp === 'ftyp') return 'video'
  return undefined
}

export function detectIngestType(input: HostDetectInput): IngestType {
  return detectType({
    filename: input.filename,
    mime: input.mime,
    url: input.url,
    text: input.text,
    magic: input.magic ?? sniffMagic(input.buffer),
  })
}
