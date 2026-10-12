import { buildImagePayload } from '@cinema/core'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkAccess } from '@/lib/access/guard'
import { IMAGE_FAL_TIMEOUT_MS, runFal } from '@/lib/fal/client'
import { uploadToR2 } from '@/lib/storage/r2'
import { loadWizardRefs, saveWizardRefs } from '@/lib/orchestration/checkpoints'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[wizard] variation body', err instanceof Error ? err.message : err)
    return null
  }) as {
    jobId?: string
    imageUrl?: string
    parentName?: string
    kind?: string
    modifier?: string
    consent?: boolean
  } | null
  const jobId = body?.jobId?.trim()
  const imageUrl = body?.imageUrl?.trim()
  const parentName = body?.parentName?.trim()
  const modifier = body?.modifier?.trim()
  if (!jobId || !imageUrl || !parentName || !modifier || modifier.length < 3) {
    return NextResponse.json({ error: 'jobId, image, name, and a modifier prompt are required' }, { status: 400 })
  }
  if (!body?.consent) return NextResponse.json({ error: 'Consent is required before a variation' }, { status: 400 })
  const job = await db.renderJob.findFirst({ where: { id: jobId, userId }, select: { id: true } })
  if (!job) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  const access = await checkAccess(userId, 1)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })

  const built = buildImagePayload({
    model: 'nano-banana-2-edit',
    prompt: modifier,
    imageUrls: [imageUrl],
    numImages: 1,
  })
  const result = await runFal<{ images?: Array<{ url?: string }> }>(
    built.endpoint,
    built.input,
    undefined,
    IMAGE_FAL_TIMEOUT_MS,
    undefined,
    undefined,
    'wizard.variation',
  )
  const remote = result.images?.[0]?.url?.trim()
  if (!remote) return NextResponse.json({ error: 'Variation returned no image' }, { status: 502 })
  const bytes = Buffer.from(await (await fetch(remote)).arrayBuffer())
  const stored = await uploadToR2(bytes, `assets/${userId}/variations/${Date.now()}.png`, 'image/png')
  const kind = body.kind === 'location' ? 'location' : 'character'
  const current = await loadWizardRefs(jobId) ?? { characters: [], locations: [] }
  const bucket = kind === 'location' ? current.locations : current.characters
  bucket.push({ name: `${parentName} · ${modifier.slice(0, 40)}`, imageUrl: stored })
  await saveWizardRefs(jobId, current)
  return NextResponse.json({ references: current })
}
