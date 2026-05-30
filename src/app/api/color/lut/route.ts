/**
 * POST /api/color/lut — apply a .cube LUT to a video clip
 * Body: { videoUrl, lutUrl, intensity? } or { videoUrl, presetId }
 * Returns: { gradedUrl }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { FILM_EMULATION_PRESETS }    from '@/lib/color/LUTLoader'
import { uploadToR2 }                from '@/lib/storage/r2'
import { execSync }                  from 'child_process'
import { mkdirSync, rmSync,
         writeFileSync }             from 'fs'
import { join }                      from 'path'
import { randomUUID }                from 'crypto'

const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? ''

export async function GET() {
  // Return available film emulation presets
  return NextResponse.json({ presets: FILM_EMULATION_PRESETS })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    videoUrl:   string
    lutUrl?:    string       // custom .cube LUT URL
    presetId?:  string       // film emulation preset ID
    intensity?: number       // 0.0 – 1.0 (default 1.0)
  }

  const { videoUrl, intensity = 1.0 } = body
  if (!videoUrl) return NextResponse.json({ error: 'videoUrl required' }, { status: 400 })

  let lutPath: string

  if (body.presetId) {
    const preset = FILM_EMULATION_PRESETS.find(p => p.id === body.presetId)
    if (!preset) return NextResponse.json({ error: 'Unknown preset' }, { status: 400 })
    lutPath = `./public/luts/film/${preset.file}`
  } else if (body.lutUrl) {
    lutPath = body.lutUrl
  } else {
    return NextResponse.json({ error: 'presetId or lutUrl required' }, { status: 400 })
  }

  await checkAndDeductCredits(userId, 'color_lut')

  const tmpDir = `/tmp/lut-${randomUUID()}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    const outFile = join(tmpDir, 'graded.mp4')

    // Build intensity filter
    let vf: string
    if (intensity >= 1.0) {
      vf = `lut3d='${lutPath}'`
    } else {
      vf = `split[a][b],[b]lut3d='${lutPath}'[lut],[a][lut]blend=all_expr='A*(1-${intensity})+B*${intensity}'`
    }

    execSync(
      `ffmpeg -i "${videoUrl}" -vf "${vf}" -c:v libx264 -preset fast -crf 22 -c:a copy "${outFile}" -y 2>/dev/null`,
      { timeout: 120_000 },
    )

    const key      = `color/lut/${randomUUID()}.mp4`
    const buffer   = require('fs').readFileSync(outFile) as Buffer
    const gradedUrl = await uploadToR2(buffer, key, 'video/mp4')

    return NextResponse.json({ gradedUrl })
  } catch (err) {
    await refundCredits(userId, 5, 'LUT application failed')
    console.error('[color/lut]', err)
    return NextResponse.json({ error: 'LUT application failed' }, { status: 500 })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
