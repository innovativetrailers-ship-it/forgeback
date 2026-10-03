import { type NextRequest, NextResponse } from 'next/server'
import { uploadToR2 } from '@/lib/storage/r2'
import { buildUE5Manifest, generateSequencerXml, generateManifestJson } from '@/lib/ue5/UnrealExport'
import type { TimelineRecipe } from '@/lib/timeline/schema'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/ue5/export/route.ts:11", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const o = raw as Record<string, unknown>
  if (typeof o.projectId !== 'string' || !o.projectId.trim())
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  if (typeof o.recipe !== 'object' || o.recipe === null)
    return NextResponse.json({ error: 'recipe is required' }, { status: 400 })

  const projectId = o.projectId.trim()
  const recipe = o.recipe as TimelineRecipe

  try {
    const manifest = buildUE5Manifest(recipe, projectId)
    const xmlContent = generateSequencerXml(manifest)
    const jsonContent = generateManifestJson(manifest)

    const xmlKey = `ue5/${projectId}/${manifest.sequencerName}.udatasmith`
    const jsonKey = `ue5/${projectId}/${manifest.sequencerName}.manifest.json`

    const [sequencerUrl, manifestUrl] = await Promise.all([
      uploadToR2(Buffer.from(xmlContent, 'utf8'), xmlKey, 'application/xml'),
      uploadToR2(Buffer.from(jsonContent, 'utf8'), jsonKey, 'application/json'),
    ])

    return NextResponse.json({
      sequencerUrl,
      manifestUrl,
      sequencerName: manifest.sequencerName,
      clipCount: manifest.clips.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Export failed'
    console.error('[ue5/export]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
