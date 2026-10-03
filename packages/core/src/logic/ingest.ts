import { parsePremiseLock, type PremiseElement, type PremiseLock } from './premiseLock'
import { PLATFORM_TRAINS_ON_USER_CONTENT } from './importRights'

export const INGEST_TYPES = [
  'script',
  'treatment',
  'character_ref',
  'location_ref',
  'rough_cut',
  'style_ref',
  'link',
  'pdf',
  'audio_sample',
  'unknown',
] as const

export type IngestType = (typeof INGEST_TYPES)[number]

export const INGEST_UNDERSTAND_SOURCE = 'ingest.understand'
export const INGEST_EMBED_SOURCE = 'ingest.embed'

export function isIngestType(value: string): value is IngestType {
  return (INGEST_TYPES as readonly string[]).includes(value)
}

export class IngestConsentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IngestConsentError'
  }
}

/** Uploaded media is the user's. Platform models are not trained on it. */
export function assertIngestConsent(consent: boolean): void {
  if (consent !== true) {
    throw new IngestConsentError('Confirm this upload is yours before ingesting it into the project')
  }
  if (PLATFORM_TRAINS_ON_USER_CONTENT) {
    throw new IngestConsentError('Platform training on user content is forbidden')
  }
}

export interface DetectInput {
  filename?: string
  mime?: string
  url?: string
  text?: string
  magic?: string
}

const IMAGE_MIME = /^image\//i
const VIDEO_MIME = /^video\//i
const AUDIO_MIME = /^audio\//i
const PDF_MIME = /pdf/i
const SCENE_HEADING = /^\s*(INT\.|EXT\.|INT\/EXT\.|I\/E\.)(?:\s|$)/im
const CHARACTER_CUE = /^[A-Z][A-Z0-9 '#.-]{1,48}$/

export function detectType(input: DetectInput): IngestType {
  const filename = (input.filename ?? '').toLowerCase()
  const mime = (input.mime ?? '').toLowerCase()
  const url = (input.url ?? '').trim()
  const text = input.text ?? ''
  const magic = (input.magic ?? '').toLowerCase()

  if (url && !filename && !mime && !text && !looksLikeFileUrl(url)) return 'link'
  if (magic === 'pdf' || mime.includes('pdf') || filename.endsWith('.pdf')) {
    if (SCENE_HEADING.test(text)) return 'script'
    if (looksLikeTreatment(text, filename)) return 'treatment'
    return 'pdf'
  }
  if (AUDIO_MIME.test(mime) || magic === 'audio' || /\.(wav|mp3|m4a|aac|ogg|flac)$/.test(filename)) {
    return 'audio_sample'
  }
  if (VIDEO_MIME.test(mime) || magic === 'video' || /\.(mp4|mov|webm|m4v|mkv)$/.test(filename)) {
    if (/(rough|cut|assembly|edit|offline)/.test(filename)) return 'rough_cut'
    if (/(style|look|mood|grade|ref)/.test(filename)) return 'style_ref'
    if (/(character|cast|portrait|headshot|actor)/.test(filename)) return 'character_ref'
    return 'rough_cut'
  }
  if (IMAGE_MIME.test(mime) || magic === 'image' || /\.(jpe?g|png|webp|gif|bmp|tiff?)$/.test(filename)) {
    if (/(location|plate|establishing|set|exterior|interior|venue)/.test(filename)) return 'location_ref'
    if (/(style|look|mood|grade|palette|lut|refboard)/.test(filename)) return 'style_ref'
    return 'character_ref'
  }
  const sniffed = sniffTextType(text, filename)
  if (sniffed !== 'unknown') return sniffed
  if (url && looksLikeFileUrl(url)) return detectType({ filename: urlPath(url), mime, text, magic })
  if (url) return 'link'
  return 'unknown'
}

export function sniffTextType(text: string, filename = ''): IngestType {
  const name = filename.toLowerCase()
  if (name.endsWith('.fountain') || name.endsWith('.fdx')) return 'script'
  if (SCENE_HEADING.test(text) || countCharacterCues(text) >= 3) return 'script'
  if (looksLikeTreatment(text, name)) return 'treatment'
  if (text.trim()) return 'unknown'
  return 'unknown'
}

export interface ParsedScript {
  scenes: Array<{ heading: string; body: string }>
  characters: string[]
  locations: string[]
  text: string
}

export function parseFountainLocal(text: string): ParsedScript {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const scenes: ParsedScript['scenes'] = []
  const characters = new Set<string>()
  const locations = new Set<string>()
  let current: { heading: string; body: string } | null = null
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (SCENE_HEADING.test(line)) {
      if (current) scenes.push(current)
      current = { heading: line.trim(), body: '' }
      const loc = line.replace(SCENE_HEADING, '').replace(/\s*-\s*(DAY|NIGHT|DAWN|DUSK|CONTINUOUS).*$/i, '').trim()
      if (loc) locations.add(titleCase(loc))
      continue
    }
    if (current) current.body += (current.body ? '\n' : '') + line
    const cue = line.trim()
    if (CHARACTER_CUE.test(cue) && !SCENE_HEADING.test(cue) && cue.length < 40 && !/^(INT|EXT|FADE|CUT|DISSOLVE)/.test(cue)) {
      characters.add(titleCase(cue.replace(/\s*\(.*\)$/, '').trim()))
    }
  }
  if (current) scenes.push(current)
  return {
    scenes,
    characters: [...characters],
    locations: [...locations],
    text,
  }
}

export function chunkText(text: string, size = 1200, overlap = 120): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]
  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    const end = Math.min(clean.length, start + size)
    chunks.push(clean.slice(start, end))
    if (end >= clean.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks
}

export function mergePremiseLocks(base: PremiseLock, incoming: PremiseLock): PremiseLock {
  return {
    characters: mergeElements(base.characters, incoming.characters),
    settings: mergeElements(base.settings, incoming.settings),
    story: incoming.story.trim() || base.story,
    genre: incoming.genre.trim() || base.genre,
    tone: incoming.tone.trim() || base.tone,
  }
}

export function premiseFromTreatmentText(text: string): PremiseLock | null {
  const story = text.replace(/\s+/g, ' ').trim().slice(0, 800)
  if (story.length < 12) return null
  return parsePremiseLock({
    characters: [],
    settings: [],
    story,
    genre: pickField(text, /genre\s*[:—-]\s*(.+)/i),
    tone: pickField(text, /tone\s*[:—-]\s*(.+)/i),
  })
}

export function matchEntityName(name: string, existing: string[]): string | null {
  const needle = name.trim().toLowerCase()
  if (!needle) return null
  const exact = existing.find((row) => row.trim().toLowerCase() === needle)
  if (exact) return exact
  const contained = existing.find((row) => {
    const hay = row.trim().toLowerCase()
    return hay.includes(needle) || needle.includes(hay)
  })
  return contained ?? null
}

export interface MeasuredLook {
  palette: string[]
  contrast: 'low' | 'medium' | 'high'
  framing: string
  summary: string
}

export function measuredLookFromPalette(
  rgb: Array<{ r: number; g: number; b: number }>,
  framing = 'unspecified',
): MeasuredLook {
  const palette = rgb.slice(0, 5).map((c) => rgbHex(c.r, c.g, c.b))
  const lumas = rgb.map((c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b)
  const mean = lumas.reduce((a, b) => a + b, 0) / Math.max(lumas.length, 1)
  const variance = lumas.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(lumas.length, 1)
  const stdev = Math.sqrt(variance)
  const contrast: MeasuredLook['contrast'] = stdev > 70 ? 'high' : stdev < 28 ? 'low' : 'medium'
  const summary = [
    palette.length ? `palette ${palette.join(', ')}` : '',
    `${contrast} contrast`,
    framing !== 'unspecified' ? framing : '',
  ].filter(Boolean).join('; ')
  return { palette, contrast, framing, summary }
}

export interface UnderstandResult {
  role: string
  description: string
  type: IngestType
  links: {
    characterName?: string
    locationName?: string
    scene?: string
    style?: string
  }
}

export function parseUnderstandJson(raw: unknown, fallbackType: IngestType): UnderstandResult {
  if (!raw || typeof raw !== 'object') {
    return { role: fallbackType, description: '', type: fallbackType, links: {} }
  }
  const row = raw as Record<string, unknown>
  const type = typeof row.type === 'string' && isIngestType(row.type) ? row.type : fallbackType
  const linksRaw = row.links && typeof row.links === 'object' ? row.links as Record<string, unknown> : {}
  return {
    role: typeof row.role === 'string' && row.role.trim() ? row.role.trim() : type,
    description: typeof row.description === 'string' ? row.description.trim() : '',
    type,
    links: {
      characterName: str(linksRaw.characterName),
      locationName: str(linksRaw.locationName),
      scene: str(linksRaw.scene),
      style: str(linksRaw.style),
    },
  }
}

function looksLikeTreatment(text: string, filename: string): boolean {
  if (/(treatment|brief|logline|tone bible)/i.test(filename)) return true
  if (text.length < 80) return false
  if (SCENE_HEADING.test(text) && countCharacterCues(text) >= 3) return false
  return /(logline|treatment|tone|premise|genre)\s*[:—-]/i.test(text) || text.length > 400
}

function countCharacterCues(text: string): number {
  return text.split('\n').filter((line) => CHARACTER_CUE.test(line.trim())).length
}

function looksLikeFileUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return /\.[a-z0-9]{2,5}$/.test(path)
  } catch {
    return /\.[a-z0-9]{2,5}(\?|$)/i.test(url)
  }
}

function urlPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url)
  } catch {
    return url.split('/').pop() ?? url
  }
}

function mergeElements(base: PremiseElement[], incoming: PremiseElement[]): PremiseElement[] {
  const map = new Map<string, PremiseElement>()
  for (const el of [...base, ...incoming]) {
    const key = el.name.trim().toLowerCase()
    if (!key) continue
    const prev = map.get(key)
    map.set(key, prev
      ? { ...prev, description: el.description.trim() || prev.description }
      : el)
  }
  return [...map.values()]
}

function pickField(text: string, re: RegExp): string {
  const match = text.match(re)
  return match?.[1]?.split('\n')[0]?.trim().slice(0, 80) ?? ''
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (ch) => ch.toUpperCase())
}

function rgbHex(r: number, g: number, b: number): string {
  const n = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${n(r)}${n(g)}${n(b)}`
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
