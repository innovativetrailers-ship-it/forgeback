import { NextRequest, NextResponse } from 'next/server'
import {
  testShotGridConnection,
  listShotGridProjects,
  syncShotListToShotGrid,
  updateShotStatus,
  createShotGridVersion,
  importShotsFromShotGrid,
  type ShotGridConfig,
  type ShotGridShot,
} from '@/lib/production/ShotGridClient'
import { requireUser } from '@/lib/auth/requireUser'

interface ShotGridBody {
  action: 'test' | 'list_projects' | 'sync_shots' | 'update_status' | 'create_version' | 'import_shots'
  config: ShotGridConfig
  shots?: ShotGridShot[]
  shotGridId?: number
  status?: 'wtg' | 'ip' | 'fin' | 'hld' | 'omt'
  outputVideoUrl?: string
  versionNote?: string
  shotGridShotId?: number
  videoUrl?: string
  versionName?: string
  frameRange?: string
  taskName?: string
  note?: string
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: ShotGridBody
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/production/shotgrid/route.ts:36", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action, config } = body
  if (!action || !config) {
    return NextResponse.json({ error: 'action and config are required' }, { status: 400 })
  }

  try {
    switch (action) {
      case 'test': {
        const connected = await testShotGridConnection(config)
        return NextResponse.json({ connected })
      }

      case 'list_projects': {
        const projects = await listShotGridProjects(config)
        return NextResponse.json({ projects })
      }

      case 'sync_shots': {
        if (!body.shots) return NextResponse.json({ error: 'shots array required' }, { status: 400 })
        const result = await syncShotListToShotGrid({ config, shots: body.shots })
        return NextResponse.json(result)
      }

      case 'update_status': {
        if (body.shotGridId == null) return NextResponse.json({ error: 'shotGridId required' }, { status: 400 })
        await updateShotStatus({
          config,
          shotGridId: body.shotGridId,
          status: body.status ?? 'wtg',
          outputVideoUrl: body.outputVideoUrl,
          versionNote: body.versionNote,
        })
        return NextResponse.json({ ok: true })
      }

      case 'create_version': {
        if (!body.shotGridShotId || !body.videoUrl) {
          return NextResponse.json({ error: 'shotGridShotId and videoUrl required' }, { status: 400 })
        }
        const versionId = await createShotGridVersion({
          config,
          shotGridShotId: body.shotGridShotId,
          videoUrl: body.videoUrl,
          versionName: body.versionName ?? `v${Date.now()}`,
          frameRange: body.frameRange ?? '1001-1096',
          taskName: body.taskName ?? 'Animation',
          note: body.note,
        })
        return NextResponse.json({ versionId })
      }

      case 'import_shots': {
        const shots = await importShotsFromShotGrid({ config })
        return NextResponse.json({ shots })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/production/shotgrid/route.ts:99", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'ShotGrid operation failed'
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
      return NextResponse.json(
        { error: 'ShotGrid service unavailable. Ensure the Python service is running on port 7434.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
