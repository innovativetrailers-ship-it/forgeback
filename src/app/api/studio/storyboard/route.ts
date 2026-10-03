import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateStoryboard, renderStoryboardFrames, storyboardToPDF } from '@/lib/studio/storyboard'
import { checkAndDeductCredits } from '@/lib/credits'

const schema = z.object({
  scriptText: z.string().min(20).max(50000),
  style: z.string().default('cinematic'),
  targetDuration: z.number().min(10).max(600).optional(),
  renderFrames: z.boolean().default(false),
  exportPdf: z.boolean().default(false),
})

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { scriptText, style, targetDuration, renderFrames, exportPdf } = parsed.data

  try {
    await checkAndDeductCredits(userId, 'storyboard_gen')
  } catch (err) {
    console.warn("[caught] src/app/api/studio/storyboard/route.ts:26", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  let result = await generateStoryboard({ scriptText, style, targetDuration })

  if (renderFrames) {
    result = { ...result, shots: await renderStoryboardFrames(result.shots) }
  }

  if (exportPdf) {
    const pdfBuffer = await storyboardToPDF(result.shots)
    return new Response(pdfBuffer.toString('utf-8'), {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': 'attachment; filename="storyboard.html"',
      },
    })
  }

  return NextResponse.json(result)
}
