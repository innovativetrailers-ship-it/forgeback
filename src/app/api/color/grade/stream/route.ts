/**
 * GET /api/color/grade/stream?projectId=... — SSE stream for collaborative grading
 */
import { NextRequest } from 'next/server'
import { auth }         from '@/lib/auth'
import { subscribeToGrades } from '@/lib/collab/GradeSync'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) return new Response('projectId required', { status: 400 })

  const stream = subscribeToGrades(projectId)

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
