import { NextRequest, NextResponse } from 'next/server'
import { importTimeline } from '@/lib/interchange/OTIOClient'

// POST multipart: file (.edl, .xml, .fcpxml, .aaf, .otioz)
// Returns TimelineRecipe JSON for loading into the editor
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    console.warn("[caught] src/app/api/interchange/import/route.ts:13", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const supported = ['edl', 'xml', 'fcpxml', 'aaf', 'otioz']
  if (!supported.includes(ext)) {
    return NextResponse.json(
      { error: `Unsupported format. Supported: ${supported.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const recipe = await importTimeline(file, file.name)
    return NextResponse.json(recipe)
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/interchange/import/route.ts:32", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Import failed'
    // If OTIO service is unavailable, surface a clear message
    if (msg.includes('fetch') || msg.includes('ECONNREFUSED')) {
      return NextResponse.json(
        { error: 'OTIO service unavailable. Ensure the Python service is running on port 7432.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
