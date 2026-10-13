import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { importProject } from '@/lib/importers/ProjectImporter'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    filename: string
    data: number[]
    projectName?: string
  }

  if (!body.filename || !Array.isArray(body.data)) {
    return NextResponse.json({ error: 'filename and data are required' }, { status: 400 })
  }

  const buffer = Buffer.from(body.data)

  try {
    const result = await importProject({
      filename: body.filename,
      buffer,
      userId: session.user.id,
      projectName: body.projectName,
    })

    const project = await db.project.create({
      data: {
        userId: session.user.id,
        title: body.projectName ?? body.filename.replace(/\.[^.]+$/, ''),
        timelineJson: result.recipe as never,
        status: result.offlineMedia.length > 0 ? 'needs_relink' : 'active',
      },
    })

    result.recipe.projectId = project.id

    return NextResponse.json(result)
  } catch (err) {
    console.warn("[caught] src/app/api/import/project/route.ts:44", err instanceof Error ? { name: err.name, message: err.message } : err)

    const message = err instanceof Error ? err.message : 'Import failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
