import { createWriteStream, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { pipeline } from 'node:stream/promises'
import ffmpeg from 'fluent-ffmpeg'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { uploadToR2 } from '@/lib/storage/r2'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({ sourceUrl: z.string().url() })

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'A proxy needs a media address' }, { status: 400 })

  const dir = path.join(tmpdir(), `cinema_proxy_${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  const input = path.join(dir, 'in.mp4')
  const output = path.join(dir, 'proxy.mp4')
  try {
    await download(parsed.data.sourceUrl, input)
    await transcode(input, output)
    const proxyUrl = await uploadToR2(readFileSync(output), `proxies/${userId}/${Date.now()}.mp4`, 'video/mp4')
    return NextResponse.json({ proxyUrl })
  } catch (err) {
    console.warn('[proxy]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Proxy transcode failed' }, { status: 500 })
  } finally {
    try { unlinkSync(input) } catch (err) { console.warn('[proxy]', err instanceof Error ? err.message : err) }
    try { unlinkSync(output) } catch (err) { console.warn('[proxy]', err instanceof Error ? err.message : err) }
  }
}

function download(url: string, dest: string): Promise<void> {
  const protocol = url.startsWith('https') ? https : http
  return new Promise((resolve, reject) => {
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Could not read the full-res source (${res.statusCode})`))
        return
      }
      const writer = createWriteStream(dest)
      pipeline(res, writer).then(resolve).catch(reject)
    }).on('error', reject)
  })
}

function transcode(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions(['-vf', 'scale=640:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32', '-c:a', 'aac', '-b:a', '64k'])
      .on('end', () => resolve())
      .on('error', reject)
      .save(output)
  })
}
