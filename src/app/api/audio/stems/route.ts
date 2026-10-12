import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkAndDeductCredits, OPERATION_COSTS } from '@/lib/credits'
import { renderStemPackage, exportProToolsSessionXML, exportOMF } from '@/lib/audio/ProToolsExport'
import type { StemRenderParams } from '@/lib/audio/ProToolsExport'
import { requireUser } from '@/lib/auth/requireUser'

type StemAction = 'render_stems' | 'export_pt_xml' | 'export_omf'

interface StemsRequestBody {
  projectId: string
  action?: StemAction
  sampleRate?: 48000 | 96000
  bitDepth?: 16 | 24 | 32
  deliveryFormat?: 'stereo' | '5.1' | '7.1' | 'atmos'
  selectedStems?: Array<'dialogue' | 'music' | 'sfx' | 'mx' | 'full_mix' | 'atmos'>
  embedMedia?: boolean
  handleLength?: number
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: StemsRequestBody
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/audio/stems/route.ts:27", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    projectId,
    action = 'render_stems',
    sampleRate = 48000,
    bitDepth = 24,
    deliveryFormat = 'stereo',
    selectedStems,
    embedMedia = false,
    handleLength = 2,
  } = body

  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })

  const project = await db.project.findFirst({ where: { id: projectId, userId } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const recipe = project.timelineJson as ReturnType<typeof JSON.parse> | null
  if (!recipe) return NextResponse.json({ error: 'No timeline data for this project' }, { status: 422 })

  // Credit costs per action
  const costKey = action === 'render_stems'
    ? 'stem_render'
    : action === 'export_omf'
    ? 'export_omf'
    : 'export_pt_xml'

  try {
    await checkAndDeductCredits(userId, costKey)
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/audio/stems/route.ts:59", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Insufficient credits'
    return NextResponse.json({ error: msg }, { status: 402 })
  }

  try {
    if (action === 'export_pt_xml') {
      const xml = exportProToolsSessionXML(recipe)
      return new NextResponse(xml, {
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': `attachment; filename="${projectId}_protools.xml"`,
        },
      })
    }

    if (action === 'export_omf') {
      const url = await exportOMF({ recipe, embedMedia, handleLength })
      return NextResponse.json({ url })
    }

    // Default: render_stems
    const stemParams: StemRenderParams = {
      recipe,
      fps: recipe.fps ?? 24,
      sampleRate,
      bitDepth,
      deliveryFormat,
      selectedStems,
    }
    const stems = await renderStemPackage(stemParams)
    return NextResponse.json({ stems })
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/audio/stems/route.ts:91", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Stem render failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
