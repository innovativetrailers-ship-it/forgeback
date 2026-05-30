/**
 * POST /api/color/grade/lock — claim exclusive grade lock on a clip
 * Body: { projectId, clipId, action: 'claim' | 'release' }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { claimGrade,
         broadcastGrade }            from '@/lib/collab/GradeSync'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, clipId, action } = await req.json() as {
    projectId: string
    clipId:    string
    action:    'claim' | 'release'
  }

  if (!projectId || !clipId || !action) {
    return NextResponse.json({ error: 'projectId, clipId, action required' }, { status: 400 })
  }

  if (action === 'claim') {
    const success = claimGrade(projectId, clipId, userId)
    if (!success) return NextResponse.json({ error: 'Clip is locked by another editor' }, { status: 409 })

    broadcastGrade({ type: 'grade_lock', projectId, clipId, userId, timestamp: Date.now() })
    return NextResponse.json({ locked: true })
  }

  // Release
  broadcastGrade({ type: 'grade_unlock', projectId, clipId, userId, timestamp: Date.now() })
  return NextResponse.json({ locked: false })
}
