import { NextRequest, NextResponse } from 'next/server'
import {
  createFrameIOProject,
  uploadToFrameIO,
  syncFrameIOComments,
  getFrameIOTeams,
  getFrameIOProjects,
} from '@/lib/production/FrameIOClient'
import { requireUser } from '@/lib/auth/requireUser'

interface FrameIOBody {
  action: 'create_project' | 'upload' | 'sync_comments' | 'list_teams' | 'list_projects'
  teamId?: string
  name?: string
  projectId?: string
  videoUrl?: string
  description?: string
  frameRate?: number
  assetId?: string
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.FRAMEIO_TOKEN) {
    return NextResponse.json({ error: 'Frame.io integration not configured. Set FRAMEIO_TOKEN.' }, { status: 503 })
  }

  let body: FrameIOBody
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/production/frameio/route.ts:32", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    switch (body.action) {
      case 'list_teams': {
        const teams = await getFrameIOTeams()
        return NextResponse.json({ teams })
      }

      case 'list_projects': {
        if (!body.teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })
        const projects = await getFrameIOProjects(body.teamId)
        return NextResponse.json({ projects })
      }

      case 'create_project': {
        if (!body.name || !body.teamId) {
          return NextResponse.json({ error: 'name and teamId required' }, { status: 400 })
        }
        const projectId = await createFrameIOProject({ name: body.name, teamId: body.teamId })
        return NextResponse.json({ projectId })
      }

      case 'upload': {
        if (!body.videoUrl || !body.projectId || !body.name) {
          return NextResponse.json({ error: 'videoUrl, projectId, and name required' }, { status: 400 })
        }
        const result = await uploadToFrameIO({
          videoUrl: body.videoUrl,
          projectId: body.projectId,
          name: body.name,
          description: body.description,
          frameRate: body.frameRate ?? 24,
        })
        return NextResponse.json(result)
      }

      case 'sync_comments': {
        if (!body.assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 })
        const comments = await syncFrameIOComments({ assetId: body.assetId })
        return NextResponse.json({ comments })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
    }
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/production/frameio/route.ts:80", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Frame.io operation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
