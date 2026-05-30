/**
 * POST /api/color/cdl — apply ASC CDL grade to a clip
 * Body: { videoUrl, cdl: CDLValues, outputFormat?: string }
 * Returns: { gradedUrl }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { cdlToFFmpeg,
         validateCDL }               from '@/lib/color/CDLWheels'
import type { CDLValues }            from '@/lib/color/CDLWheels'
import { uploadToR2 }                from '@/lib/storage/r2'
import { execSync }                  from 'child_process'
import { mkdirSync, rmSync }         from 'fs'
import { join }                      from 'path'
import { randomUUID }                from 'crypto'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    videoUrl:      string
    cdl:           CDLValues
    outputFormat?: 'mp4' | 'prores'
    previewOnly?:  boolean
  }

  const { videoUrl, cdl, previewOnly = false } = body
  if (!videoUrl || !cdl) return NextResponse.json({ error: 'videoUrl and cdl required' }, { status: 400 })

  const { valid, errors } = validateCDL(cdl)
  if (!valid) return NextResponse.json({ error: `Invalid CDL: ${errors.join(', ')}` }, { status: 400 })

  if (!previewOnly) await checkAndDeductCredits(userId, 'color_grade')

  const filter  = cdlToFFmpeg(cdl)
  const tmpDir  = `/tmp/cdl-${randomUUID()}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    const outFile = join(tmpDir, 'graded.mp4')
    execSync(
      `ffmpeg -i "${videoUrl}" -vf "${filter}" -c:v libx264 -preset fast -crf 22 -c:a copy "${outFile}" -y 2>/dev/null`,
      { timeout: 120_000 },
    )

    const key      = `color/cdl/${randomUUID()}.mp4`
    const buffer   = require('fs').readFileSync(outFile) as Buffer
    const gradedUrl = await uploadToR2(buffer, key, 'video/mp4')

    return NextResponse.json({ gradedUrl, filter })
  } catch (err) {
    if (!previewOnly) await refundCredits(userId, 5, 'CDL grading failed')
    console.error('[color/cdl]', err)
    return NextResponse.json({ error: 'CDL grading failed' }, { status: 500 })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
