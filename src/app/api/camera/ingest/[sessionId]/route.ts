import { type NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { uploadToR2 } from '@/lib/storage/r2'
import { recordChunkMetadata, getCameraSession } from '@/lib/camera/WirelessIngest'
import { renderQueue } from '@/lib/queue'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params
  const session = await getCameraSession(sessionId)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.status === 'stopped') return NextResponse.json({ error: 'Session stopped' }, { status: 409 })

  const rawIndex = req.headers.get('x-chunk-index')
  const chunkIndex = rawIndex !== null ? parseInt(rawIndex, 10) : session.chunkCount

  let bodyBuffer: Buffer
  try {
    const ab = await req.arrayBuffer()
    if (ab.byteLength === 0) return NextResponse.json({ error: 'Empty chunk' }, { status: 400 })
    bodyBuffer = Buffer.from(ab)
  } catch (err) {
    console.warn("[caught] src/app/api/camera/ingest/[sessionId]/route.ts:27", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Failed to read body' }, { status: 400 })
  }

  try {
    const chunkId = randomUUID()
    const contentType = req.headers.get('content-type') ?? 'video/webm'
    const ext = contentType.includes('mp4') ? 'mp4' : 'webm'
    const r2Key = `camera/${sessionId}/${chunkId}.${ext}`

    await uploadToR2(bodyBuffer, r2Key, contentType)
    await recordChunkMetadata({
      chunkId, sessionId, projectId: session.projectId,
      chunkIndex, durationSeconds: 5, r2Key,
    })
    await renderQueue.add('camera_transcode', { chunkId, sessionId, r2Key, projectId: session.projectId, userId: session.userId, ext }, { jobId: `transcode:${chunkId}` })

    return NextResponse.json({ chunkId, queued: true }, { status: 201 })
  } catch (err: unknown) {
    console.error(`[camera/ingest/${sessionId}]`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Chunk ingest failed' }, { status: 500 })
  }
}
