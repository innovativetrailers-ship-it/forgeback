import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { uploadToR2 }                from '@/lib/storage/r2'
import { runArgv } from '@/lib/shell/argv'
import { mkdirSync, rmSync,
         readFileSync }              from 'fs'
import { join }                      from 'path'
import { randomUUID }                from 'crypto'
import { requireUser } from '@/lib/auth/requireUser'

interface StemBus {
  name:   'dialogue' | 'music' | 'sfx'
  tracks: string[]   // audio URLs
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = (await requireUser(req))?.id ??  session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { buses } = await req.json() as { buses: StemBus[] }
  if (!buses?.length) return NextResponse.json({ error: 'buses required' }, { status: 400 })

  await checkAndDeductCredits(userId, 'stem_export')

  const tmpDir = `/tmp/stems-${randomUUID()}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    const outputs: Record<string, string> = {}

    for (const bus of buses) {
      if (!bus.tracks.length) continue

      const outFile = join(tmpDir, `${bus.name}.wav`)

      // Build amix filter for this bus
      const args = ['-y']
      for (const url of bus.tracks) args.push('-i', url)
      if (bus.tracks.length > 1) args.push('-filter_complex', `amix=inputs=${bus.tracks.length}[out]`, '-map', '[out]')
      else args.push('-map', '0:a')
      args.push('-ar', '48000', '-sample_fmt', 's32', '-acodec', 'pcm_s24le', outFile)
      runArgv('ffmpeg', args)

      const buffer = readFileSync(outFile)
      const key    = `export/stems/${randomUUID()}-${bus.name}.wav`
      outputs[bus.name] = await uploadToR2(buffer, key, 'audio/wav')
    }

    return NextResponse.json({ stems: outputs })
  } catch (err) {
    await refundCredits(userId, 10, 'Stem export failed')
    console.error('[export/stems]', err)
    return NextResponse.json({ error: 'Stem export failed' }, { status: 500 })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
