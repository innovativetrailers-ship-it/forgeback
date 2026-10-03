import { NextRequest, NextResponse } from 'next/server'
import {
  createBin,
  getBinsForProject,
  deleteBin,
  addClipToBin,
  moveToBin,
  updateClipRating,
  updateClipTags,
  removeClipFromBin,
  findClips,
  autoOrganiseBins,
  type BinClip,
} from '@/lib/media/BinManager'

type BinAction =
  | 'list'
  | 'create'
  | 'delete'
  | 'add_clip'
  | 'move_clips'
  | 'rate_clip'
  | 'tag_clip'
  | 'remove_clip'
  | 'search'
  | 'auto_organise'

interface BinsRequestBody {
  action: BinAction
  projectId?: string
  binId?: string
  name?: string
  colour?: string
  parentId?: string
  clip?: Omit<BinClip, 'id'>
  clipIds?: string[]
  clipId?: string
  rating?: 1 | 2 | 3 | 4 | 5 | null
  tags?: string[]
  query?: string
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: BinsRequestBody
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/media/bins/route.ts:50", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action, projectId } = body

  if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 })

  try {
    switch (action) {
      case 'list': {
        if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
        const bins = await getBinsForProject(projectId)
        return NextResponse.json({ bins })
      }

      case 'create': {
        if (!projectId || !body.name) {
          return NextResponse.json({ error: 'projectId and name required' }, { status: 400 })
        }
        const bin = await createBin({
          name: body.name,
          projectId,
          parentId: body.parentId,
          colour: body.colour,
        })
        return NextResponse.json({ bin })
      }

      case 'delete': {
        if (!body.binId) return NextResponse.json({ error: 'binId required' }, { status: 400 })
        await deleteBin(body.binId)
        return NextResponse.json({ ok: true })
      }

      case 'add_clip': {
        if (!body.binId || !body.clip) {
          return NextResponse.json({ error: 'binId and clip required' }, { status: 400 })
        }
        const clip = await addClipToBin({ binId: body.binId, clip: body.clip })
        return NextResponse.json({ clip })
      }

      case 'move_clips': {
        if (!body.clipIds?.length || !body.binId) {
          return NextResponse.json({ error: 'clipIds and binId required' }, { status: 400 })
        }
        await moveToBin(body.clipIds, body.binId)
        return NextResponse.json({ ok: true, moved: body.clipIds.length })
      }

      case 'rate_clip': {
        if (!body.clipId) return NextResponse.json({ error: 'clipId required' }, { status: 400 })
        await updateClipRating(body.clipId, body.rating ?? null)
        return NextResponse.json({ ok: true })
      }

      case 'tag_clip': {
        if (!body.clipId || !body.tags) {
          return NextResponse.json({ error: 'clipId and tags required' }, { status: 400 })
        }
        await updateClipTags(body.clipId, body.tags)
        return NextResponse.json({ ok: true })
      }

      case 'remove_clip': {
        if (!body.clipId) return NextResponse.json({ error: 'clipId required' }, { status: 400 })
        await removeClipFromBin(body.clipId)
        return NextResponse.json({ ok: true })
      }

      case 'search': {
        if (!projectId || !body.query) {
          return NextResponse.json({ error: 'projectId and query required' }, { status: 400 })
        }
        const clips = await findClips(body.query, projectId)
        return NextResponse.json({ clips })
      }

      case 'auto_organise': {
        if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
        const result = await autoOrganiseBins(projectId)
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/media/bins/route.ts:138", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Bin operation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
