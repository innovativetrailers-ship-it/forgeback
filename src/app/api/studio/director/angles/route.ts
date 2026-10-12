import { buildQwenAnglesInput } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkAccess } from '@/lib/access/guard'
import { IMAGE_FAL_TIMEOUT_MS, runFal } from '@/lib/fal/client'
import { uploadToR2 } from '@/lib/storage/r2'
import { loadWizardRefs, saveWizardRefs } from '@/lib/orchestration/checkpoints'
import { requireUser } from '@/lib/auth/requireUser'

const PRESETS: Record<string, { horizontal: number; label: string }> = {
  front: { horizontal: 0, label: 'front' },
  threeQuarter: { horizontal: 45, label: '3/4' },
  side: { horizontal: 90, label: 'side' },
  back: { horizontal: 180, label: 'back' },
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[wizard] angles body', err instanceof Error ? err.message : err)
    return null
  }) as {
    jobId?: string
    imageUrl?: string
    parentName?: string
    kind?: string
    presets?: string[]
    consent?: boolean
  } | null
  const jobId = body?.jobId?.trim()
  const imageUrl = body?.imageUrl?.trim()
  const parentName = body?.parentName?.trim()
  if (!jobId || !imageUrl || !parentName) {
    return NextResponse.json({ error: 'jobId, imageUrl, and parentName are required' }, { status: 400 })
  }
  if (!body?.consent) return NextResponse.json({ error: 'Consent is required before generating angles' }, { status: 400 })
  const job = await db.renderJob.findFirst({ where: { id: jobId, userId }, select: { id: true } })
  if (!job) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const asked = (body.presets?.length ? body.presets : ['front']).filter((id) => id in PRESETS).slice(0, 4)
  if (!asked.length) return NextResponse.json({ error: 'Choose an angle' }, { status: 400 })
  const access = await checkAccess(userId, asked.length)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })

  const kind = body.kind === 'location' ? 'location' : 'character'
  const current = await loadWizardRefs(jobId) ?? { characters: [], locations: [] }
  const bucket = kind === 'location' ? current.locations : current.characters

  for (const id of asked) {
    const preset = PRESETS[id]!
    const built = buildQwenAnglesInput({ imageUrl, horizontalAngle: preset.horizontal })
    const result = await runFal<{ images?: Array<{ url?: string }> }>(
      built.endpoint,
      built.input,
      undefined,
      IMAGE_FAL_TIMEOUT_MS,
      undefined,
      undefined,
      'wizard.angles',
    )
    const remote = result.images?.[0]?.url?.trim()
    if (!remote) return NextResponse.json({ error: `Angle ${preset.label} returned no image` }, { status: 502 })
    const bytes = Buffer.from(await (await fetch(remote)).arrayBuffer())
    const stored = await uploadToR2(bytes, `assets/${userId}/angles/${Date.now()}-${preset.label}.png`, 'image/png')
    bucket.push({ name: `${parentName} · ${preset.label}`, imageUrl: stored })
  }

  await saveWizardRefs(jobId, current)
  return NextResponse.json({ references: current, count: asked.length })
}
