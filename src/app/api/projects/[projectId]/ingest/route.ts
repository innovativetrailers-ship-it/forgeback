import { NextRequest, NextResponse } from 'next/server'
import { IngestConsentError } from '@cinema/core'
import { ingest } from '@/lib/ingest'
import { isGenerationPausedError } from '@/lib/generation/pause'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await context.params
  const contentType = request.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const consent = form.get('consent') === 'true' || form.get('consent') === '1'
      const url = str(form.get('url'))
      const text = str(form.get('text'))
      const file = form.get('file')
      let uploaded: { buffer: Buffer; filename: string; mime: string } | undefined
      if (file instanceof File && file.size > 0) {
        uploaded = {
          buffer: Buffer.from(await file.arrayBuffer()),
          filename: file.name,
          mime: file.type || 'application/octet-stream',
        }
      }
      if (!uploaded && !url && !text) {
        return NextResponse.json({ error: 'A file, url, or text is required' }, { status: 400 })
      }
      const result = await ingest({ projectId, userId, consent, file: uploaded, url, text })
      return NextResponse.json(result)
    }

    const body = await request.json().catch((err) => {
      console.warn("[caught] src/app/api/projects/[id]/ingest/route.ts:40", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (({}))
    }) as {
      consent?: boolean
      url?: string
      text?: string
    }
    if (!body.url && !body.text) {
      return NextResponse.json({ error: 'A file, url, or text is required' }, { status: 400 })
    }
    const result = await ingest({
      projectId,
      userId,
      consent: body.consent === true,
      url: body.url,
      text: body.text,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.warn("[caught] src/app/api/projects/[id]/ingest/route.ts:56", err instanceof Error ? { name: err.name, message: err.message } : err)

    if (err instanceof IngestConsentError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Generation paused' }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : 'Ingest failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function str(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
