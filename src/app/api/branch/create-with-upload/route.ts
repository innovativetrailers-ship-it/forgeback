import { type NextRequest, NextResponse } from 'next/server'
import {
  generateBranchingEmbed,
  isBranchingConfig,
  type BranchingConfig,
  type BranchNode,
} from '@/lib/export/BranchingExport'
import { checkAndDeductCredits, refundCredits } from '@/lib/credits'
import { uploadToR2 } from '@/lib/storage/r2'
import { requireUser } from '@/lib/auth/requireUser'

const CREDIT_COST = 5

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Missing x-user-id header' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch (err) {
    console.warn("[caught] src/app/api/branch/create-with-upload/route.ts:20", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const configRaw = form.get('config')
  if (typeof configRaw !== 'string') {
    return NextResponse.json({ error: 'config JSON is required' }, { status: 400 })
  }

  let partial: unknown
  try {
    partial = JSON.parse(configRaw)
  } catch (err) {
    console.warn("[caught] src/app/api/branch/create-with-upload/route.ts:32", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid config JSON' }, { status: 400 })
  }

  if (typeof partial !== 'object' || partial === null) {
    return NextResponse.json({ error: 'Invalid config' }, { status: 400 })
  }

  const base = partial as Record<string, unknown>
  const nodeStubs = Array.isArray(base.nodes) ? (base.nodes as Array<Record<string, unknown>>) : null
  if (!nodeStubs) {
    return NextResponse.json({ error: 'config.nodes is required' }, { status: 400 })
  }

  const nodes: BranchNode[] = []
  for (const stub of nodeStubs) {
    if (typeof stub.id !== 'string') {
      return NextResponse.json({ error: 'Each node requires an id' }, { status: 400 })
    }
    const clip = form.get(`clip_${stub.id}`)
    if (!(clip instanceof Blob) || clip.size === 0) {
      return NextResponse.json({ error: `Missing clip upload for node ${stub.id}` }, { status: 400 })
    }
    const buffer = Buffer.from(await clip.arrayBuffer())
    const ext = clip.type.includes('webm') ? 'webm' : 'mp4'
    const contentType = ext === 'webm' ? 'video/webm' : 'video/mp4'
    const key = `embeds/branch/${userId}/${stub.id}-${Date.now()}.${ext}`
    const clipUrl = await uploadToR2(buffer, key, contentType)
    nodes.push({
      id: stub.id,
      clipUrl,
      label: typeof stub.label === 'string' ? stub.label : stub.id,
      triggerAtSecond: typeof stub.triggerAtSecond === 'number' ? stub.triggerAtSecond : 0,
      choices: Array.isArray(stub.choices) ? (stub.choices as BranchNode['choices']) : [],
    })
  }

  const config: BranchingConfig = {
    projectId: typeof base.projectId === 'string' ? base.projectId : '',
    title: typeof base.title === 'string' ? base.title : 'Branching Video',
    startNodeId: typeof base.startNodeId === 'string' ? base.startNodeId : nodes[0]?.id ?? '',
    embedTheme:
      base.embedTheme === 'dark' || base.embedTheme === 'light' || base.embedTheme === 'cinema'
        ? base.embedTheme
        : 'cinema',
    autoAdvanceMs: typeof base.autoAdvanceMs === 'number' ? base.autoAdvanceMs : 15_000,
    nodes,
  }

  if (!isBranchingConfig(config)) {
    return NextResponse.json({ error: 'Invalid BranchingConfig after upload' }, { status: 400 })
  }

  try {
    await checkAndDeductCredits(userId, 'branching_export', CREDIT_COST, 'Interactive branching video export')
  } catch (err) {
    console.warn("[caught] src/app/api/branch/create-with-upload/route.ts:87", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json(
      { error: `Insufficient credits. Branching export costs ${CREDIT_COST} credits.` },
      { status: 402 },
    )
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const embed = await generateBranchingEmbed(config, appUrl)
    return NextResponse.json({
      embedId: embed.embedId,
      embedUrl: embed.embedUrl,
      iframeHtml: embed.iframeHtml,
    })
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/branch/create-with-upload/route.ts:102", err instanceof Error ? { name: err.name, message: err.message } : err)

    await refundCredits(userId, CREDIT_COST, 'Branching export failed')
    const message = err instanceof Error ? err.message : 'Branching export failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
