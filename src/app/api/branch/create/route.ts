import { NextRequest, NextResponse } from 'next/server'
import { generateBranchingEmbed, isBranchingConfig } from '@/lib/export/BranchingExport'
import { checkAndDeductCredits, refundCredits } from '@/lib/credits'

const CREDIT_COST = 5

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Missing x-user-id header' }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/branch/create/route.ts:14", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isBranchingConfig(raw)) {
    return NextResponse.json(
      { error: 'Invalid BranchingConfig. Required: projectId, title, startNodeId, nodes[], embedTheme' },
      { status: 400 },
    )
  }

  try {
    await checkAndDeductCredits(userId, 'branching_export', CREDIT_COST, 'Interactive branching video export')
  } catch (err) {
    console.warn("[caught] src/app/api/branch/create/route.ts:27", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: `Insufficient credits. Branching export costs ${CREDIT_COST} credits.` }, { status: 402 })
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const embed = await generateBranchingEmbed(raw, baseUrl)
    return NextResponse.json({ embedId: embed.embedId, embedUrl: embed.embedUrl, iframeHtml: embed.iframeHtml })
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/branch/create/route.ts:35", err instanceof Error ? { name: err.name, message: err.message } : err)

    await refundCredits(userId, CREDIT_COST, 'Branching export failed')
    const message = err instanceof Error ? err.message : 'Branching export failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
