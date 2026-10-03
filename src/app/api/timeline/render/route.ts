import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkAndDeductCredits } from '@/lib/credits'
import { buildExportJob } from '@/lib/timeline/export'
import type { ExportSettings } from '@/lib/timeline/schema'

const schema = z.object({
  projectId: z.string(),
  recipe: z.record(z.string(), z.unknown()),
  format: z.enum(['mp4_h264', 'mp4_h265', 'prores_422', 'prores_4444', 'dcp']).default('mp4_h264'),
  resolution: z.object({ width: z.number(), height: z.number() }).default({ width: 1920, height: 1080 }),
})

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { projectId, recipe, format, resolution } = parsed.data

  const costKey = format === 'mp4_h264' ? 'export_1080p' : format === 'dcp' ? 'export_dcp' : 'export_4k'
  try {
    await checkAndDeductCredits(userId, costKey)
  } catch (err) {
    console.warn("[caught] src/app/api/timeline/render/route.ts:27", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  const settings: ExportSettings = {
    format,
    resolution,
    bitrate: format === 'mp4_h264' ? 8000 : 50000,
    audioCodec: format === 'dcp' ? 'pcm' : 'aac',
    metadata: {},
  }

  const { jobId } = await buildExportJob(
    recipe as unknown as Parameters<typeof buildExportJob>[0],
    settings,
    userId,
    projectId
  )

  return NextResponse.json({ jobId })
}
