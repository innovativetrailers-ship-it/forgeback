import { buildImagePayload } from '@cinema/core'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkAccess } from '@/lib/access/guard'
import { IMAGE_FAL_TIMEOUT_MS, runFal } from '@/lib/fal/client'
import { uploadToR2 } from '@/lib/storage/r2'
import { saveKeyframeCheckpoint } from '@/lib/orchestration/checkpoints'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[wizard] keyframe body', err instanceof Error ? err.message : err)
    return null
  }) as {
    jobId?: string
    shotIndex?: number
    prompt?: string
    consent?: boolean
  } | null
  const jobId = body?.jobId?.trim()
  const prompt = body?.prompt?.trim()
  const shotIndex = body?.shotIndex
  if (!jobId || !prompt || prompt.length < 3 || typeof shotIndex !== 'number') {
    return NextResponse.json({ error: 'jobId, shot, and a prompt are required' }, { status: 400 })
  }
  if (!body?.consent) return NextResponse.json({ error: 'Consent is required before regenerating a keyframe' }, { status: 400 })
  const job = await db.renderJob.findFirst({ where: { id: jobId, userId }, select: { id: true } })
  if (!job) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  const access = await checkAccess(userId, 1)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
  const built = buildImagePayload({ model: 'nano-banana', prompt, numImages: 1, aspectRatio: '16:9' })
  const result = await runFal<{ images?: Array<{ url?: string }> }>(
    built.endpoint,
    built.input,
    undefined,
    IMAGE_FAL_TIMEOUT_MS,
    undefined,
    undefined,
    'wizard.keyframe',
  )
  const remote = result.images?.[0]?.url?.trim()
  if (!remote) return NextResponse.json({ error: 'Keyframe returned no image' }, { status: 502 })
  const bytes = Buffer.from(await (await fetch(remote)).arrayBuffer())
  const stored = await uploadToR2(bytes, `assets/${userId}/keyframes/${Date.now()}.png`, 'image/png')
  await saveKeyframeCheckpoint(jobId, shotIndex, stored)
  return NextResponse.json({ shotIndex, imageUrl: stored })
}
