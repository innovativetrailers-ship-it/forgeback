import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkAndDeductCredits } from '@/lib/credits'
import { exportEDL, exportFCPXML, exportDaVinciXML } from '@/lib/interchange/NativeFormats'
import { exportTimeline, type InterchangeFormat } from '@/lib/interchange/OTIOClient'

// POST { projectId, format: 'edl'|'fcpxml'|'aaf'|'resolve_xml'|'otioz' }
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { projectId?: string; format?: string }
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/interchange/export/route.ts:15", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { projectId, format } = body
  if (!projectId || !format) {
    return NextResponse.json({ error: 'projectId and format are required' }, { status: 400 })
  }

  const validFormats: InterchangeFormat[] = ['edl', 'fcpxml', 'aaf', 'resolve_xml', 'otioz']
  if (!validFormats.includes(format as InterchangeFormat)) {
    return NextResponse.json({ error: `Invalid format. Use: ${validFormats.join(', ')}` }, { status: 400 })
  }

  const project = await db.project.findFirst({ where: { id: projectId, userId } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // AAF and OTIOZ cost 2 credits each (require Python service)
  const costMap: Record<string, string> = {
    edl: 'export_interchange_native',
    fcpxml: 'export_interchange_native',
    resolve_xml: 'export_interchange_native',
    aaf: 'export_interchange_aaf',
    otioz: 'export_interchange_aaf',
  }
  try {
    await checkAndDeductCredits(userId, costMap[format] ?? 'export_interchange_native')
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/interchange/export/route.ts:42", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Insufficient credits'
    return NextResponse.json({ error: msg }, { status: 402 })
  }

  // Reconstruct TimelineRecipe from project data
  const recipe = project.timelineJson as ReturnType<typeof JSON.parse> | null
  if (!recipe) return NextResponse.json({ error: 'No timeline data found for this project' }, { status: 422 })

  try {
    let fileBuffer: Buffer
    let contentType: string
    let filename: string

    const fmt = format as InterchangeFormat

    if (fmt === 'edl') {
      fileBuffer = Buffer.from(exportEDL(recipe), 'utf-8')
      contentType = 'text/plain'
      filename = `${projectId}.edl`
    } else if (fmt === 'fcpxml') {
      fileBuffer = Buffer.from(exportFCPXML(recipe), 'utf-8')
      contentType = 'application/xml'
      filename = `${projectId}.fcpxml`
    } else if (fmt === 'resolve_xml') {
      fileBuffer = Buffer.from(exportDaVinciXML(recipe), 'utf-8')
      contentType = 'application/xml'
      filename = `${projectId}_resolve.xml`
    } else {
      // AAF, OTIOZ — delegate to Python OTIO service
      fileBuffer = await exportTimeline({ recipe, format: fmt })
      contentType = fmt === 'aaf' ? 'application/octet-stream' : 'application/zip'
      filename = `${projectId}.${fmt === 'aaf' ? 'aaf' : 'otioz'}`
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(fileBuffer.byteLength),
      },
    })
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/interchange/export/route.ts:85", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Export failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
