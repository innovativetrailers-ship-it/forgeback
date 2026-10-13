import { logCaught } from '@/lib/diagnostics/caught'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  chunkText,
  measuredLookFromPalette,
  parseFountainLocal,
  type IngestType,
  type MeasuredLook,
  type ParsedScript,
} from '@cinema/core'
import { exec } from '@/lib/media/ffmpegExec'
import { safeFetch } from '@/lib/net/safeFetch'

const MAX_FETCH_BYTES = 2_000_000
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1)/i

export interface ParsedIngest {
  type: IngestType
  text: string
  chunks: string[]
  script?: ParsedScript
  frames: string[]
  boundaries: Array<{ start: number; end: number }>
  look?: MeasuredLook
  sourceUrl?: string
}

export async function parseIngest(input: {
  type: IngestType
  buffer?: Buffer
  text?: string
  url?: string
  filename?: string
  mime?: string
}): Promise<ParsedIngest> {
  const type = input.type
  if (type === 'link' && input.url) {
    const fetched = await fetchPublicText(input.url)
    return base(type, fetched, { sourceUrl: input.url })
  }
  if (type === 'pdf' || ((type === 'script' || type === 'treatment' || type === 'unknown') && isPdf(input))) {
    const text = input.text?.trim() || (input.buffer ? await extractPdfText(input.buffer) : '')
    const parsed = type === 'script' ? parseFountainLocal(text) : undefined
    return base(type === 'unknown' && text ? 'unknown' : type, text, { script: parsed, chunks: chunkText(text) })
  }
  if (type === 'script') {
    const text = input.text ?? bufferText(input.buffer)
    return base(type, text, { script: parseFountainLocal(text) })
  }
  if (type === 'treatment' || type === 'unknown') {
    const text = input.text ?? bufferText(input.buffer)
    return base(type, text, { chunks: chunkText(text) })
  }
  if (type === 'audio_sample') {
    return base(type, '', { sourceUrl: input.url })
  }
  if (type === 'character_ref' || type === 'location_ref' || type === 'style_ref') {
    const frames = input.url ? [input.url] : []
    return base(type, '', { frames, sourceUrl: input.url })
  }
  if (type === 'rough_cut') {
    const media = await analyseVideo(input.buffer, input.url)
    return base(type, media.look.summary, {
      frames: media.frames,
      boundaries: media.boundaries,
      look: media.look,
      sourceUrl: input.url,
    })
  }
  return base(type, input.text ?? bufferText(input.buffer))
}

function base(
  type: IngestType,
  text: string,
  extra?: Partial<ParsedIngest>,
): ParsedIngest {
  return {
    type,
    text,
    chunks: extra?.chunks ?? (text ? chunkText(text) : []),
    script: extra?.script,
    frames: extra?.frames ?? [],
    boundaries: extra?.boundaries ?? [],
    look: extra?.look,
    sourceUrl: extra?.sourceUrl,
  }
}

function isPdf(input: { filename?: string; mime?: string; buffer?: Buffer }): boolean {
  if (input.mime?.includes('pdf')) return true
  if (input.filename?.toLowerCase().endsWith('.pdf')) return true
  return Boolean(input.buffer && input.buffer.slice(0, 4).toString('ascii') === '%PDF')
}

function bufferText(buffer?: Buffer): string {
  if (!buffer?.length) return ''
  const sample = buffer.slice(0, 8).toString('utf8')
  if (sample.startsWith('%PDF')) return ''
  return buffer.toString('utf8')
}

export async function fetchPublicText(url: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) links can be ingested')
  }
  if (PRIVATE_HOST.test(parsed.hostname) || parsed.hostname.endsWith('.local')) {
    throw new Error('That address is not allowed')
  }
  const res = await safeFetch(parsed.toString(), [], {
    headers: { 'User-Agent': 'CinematicForge-Ingest/1.0' },
  })
  if (!res.ok) throw new Error(`Could not fetch link (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_FETCH_BYTES) throw new Error('Link content is too large')
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('pdf') || buf.slice(0, 4).toString('ascii') === '%PDF') {
    return extractPdfText(buf)
  }
  const raw = buf.toString('utf8')
  return stripHtml(raw)
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const fromBin = await pdftotext(buffer)
  if (fromBin.trim()) return fromBin
  return extractPdfStrings(buffer)
}

async function pdftotext(buffer: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ingest-pdf-'))
  const pdfPath = path.join(dir, 'in.pdf')
  const txtPath = path.join(dir, 'out.txt')
  try {
    await writeFile(pdfPath, buffer)
    await exec('pdftotext', ['-layout', pdfPath, txtPath])
    return (await readFile(txtPath, 'utf8')).trim()
  } catch (err) {
    console.warn("[caught] src/lib/ingest/parse.ts:147", err instanceof Error ? { name: err.name, message: err.message } : err)

    return ''
  } finally {
    await rm(dir, { recursive: true, force: true }).catch((err) => logCaught('lib/ingest/parse', err))
  }
}

function extractPdfStrings(buffer: Buffer): string {
  const raw = buffer.toString('latin1')
  const bits: string[] = []
  const paren = /\((?:\\\)|[^)]){3,}\)/g
  let match: RegExpExecArray | null
  while ((match = paren.exec(raw))) {
    const inner = match[0].slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\[0-7]{1,3}/g, '')
    if (/[A-Za-z]{3,}/.test(inner)) bits.push(inner)
  }
  return bits.join(' ').replace(/\s+/g, ' ').trim().slice(0, 80_000)
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80_000)
}

async function analyseVideo(
  buffer?: Buffer,
  url?: string,
): Promise<{ frames: string[]; boundaries: Array<{ start: number; end: number }>; look: MeasuredLook }> {
  if (!buffer?.length && !url) {
    return { frames: url ? [url] : [], boundaries: [], look: measuredLookFromPalette([]) }
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ingest-cut-'))
  const videoPath = path.join(dir, 'in.mp4')
  try {
    if (buffer?.length) {
      await writeFile(videoPath, buffer)
    } else if (url) {
      const res = await safeFetch(url, [])
      if (!res.ok) throw new Error(`Video fetch failed (${res.status})`)
      await writeFile(videoPath, Buffer.from(await res.arrayBuffer()))
    }
    const boundaries = await sceneBoundaries(videoPath)
    const sampleAt = sampleTimes(boundaries)
    const swatches: Array<{ r: number; g: number; b: number }> = []
    for (const t of sampleAt) {
      const framePath = path.join(dir, `f-${t.toFixed(2)}.jpg`)
      try {
        await exec('ffmpeg', ['-y', '-ss', String(t), '-i', videoPath, '-frames:v', '1', '-q:v', '4', framePath])
        swatches.push(await averageRgb(framePath))
      } catch (err) {
        console.warn("[caught] src/lib/ingest/parse.ts:208", err instanceof Error ? { name: err.name, message: err.message } : err)

        // skip missing frame
      }
    }
    return {
      frames: url ? [url] : [],
      boundaries,
      look: measuredLookFromPalette(swatches, 'sampled frames'),
    }
  } catch (err) {
    console.warn("[caught] src/lib/ingest/parse.ts:217", err instanceof Error ? { name: err.name, message: err.message } : err)

    return { frames: url ? [url] : [], boundaries: [], look: measuredLookFromPalette([]) }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch((err) => logCaught('lib/ingest/parse', err))
  }
}

async function sceneBoundaries(videoPath: string): Promise<Array<{ start: number; end: number }>> {
  try {
    const { stderr } = await exec('ffmpeg', [
      '-i', videoPath,
        '-filter:v', 'select=gt(scene,0.35),showinfo',
      '-vsync', 'vfr',
      '-f', 'null',
      '-',
    ])
    const times = [...stderr.matchAll(/pts_time:([0-9.]+)/g)]
      .map((m) => parseFloat(m[1]))
      .filter((n) => Number.isFinite(n))
    const duration = await videoDuration(videoPath)
    const cuts = [0, ...times.filter((t) => t > 0.2), duration].filter((t, i, all) => i === 0 || t > all[i - 1] + 0.15)
    const bounds: Array<{ start: number; end: number }> = []
    for (let i = 0; i < cuts.length - 1; i++) {
      bounds.push({ start: cuts[i], end: cuts[i + 1] })
    }
    return bounds.length ? bounds : [{ start: 0, end: duration }]
  } catch (err) {
    console.warn("[caught] src/lib/ingest/parse.ts:243", err instanceof Error ? { name: err.name, message: err.message } : err)

    const duration = await videoDuration(videoPath).catch((err) => {
      console.warn("[caught] src/lib/ingest/parse.ts:252", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (0)
    })
    return duration > 0 ? [{ start: 0, end: duration }] : []
  }
}

async function videoDuration(videoPath: string): Promise<number> {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ])
  const n = parseFloat(stdout.trim())
  return Number.isFinite(n) ? n : 0
}

function sampleTimes(boundaries: Array<{ start: number; end: number }>): number[] {
  if (!boundaries.length) return [1]
  const mids = boundaries.slice(0, 6).map((b) => (b.start + b.end) / 2)
  return mids.length ? mids : [1]
}

async function averageRgb(framePath: string): Promise<{ r: number; g: number; b: number }> {
  const rawPath = `${framePath}.rgb`
  await exec('ffmpeg', ['-y', '-i', framePath, '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', rawPath])
  const buf = await readFile(rawPath)
  return { r: buf[0] ?? 0, g: buf[1] ?? 0, b: buf[2] ?? 0 }
}
