import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { orchestrate } from '@/lib/orchestration'
import { saveProductionBreakdown } from '@/lib/studio/productionBoard'

const schema = z.object({
  projectId: z.string().min(1),
  text: z.string().min(1).max(20000),
  totalDuration: z.number().min(1).max(600).default(30),
  selectedModels: z.array(z.string()).default([]),
})

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  const result = await orchestrate({
    ingest: true,
    prompt: parsed.data.text,
    totalDuration: parsed.data.totalDuration,
    selectedModels: parsed.data.selectedModels,
    userId,
    projectId: parsed.data.projectId,
    planOnly: true,
  })
  const breakdown = result.productionBreakdown
  if (!breakdown) return NextResponse.json({ error: 'Ingest produced no breakdown' }, { status: 500 })
  await saveProductionBreakdown(userId, parsed.data.projectId, breakdown)
  return NextResponse.json({ breakdown })
}
