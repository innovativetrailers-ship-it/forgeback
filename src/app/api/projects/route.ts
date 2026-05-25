import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projects = await db.project.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      status: true,
      durationSeconds: true,
      fps: true,
      resolution: true,
      isPublic: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    projects: projects.map((p) => ({ ...p, name: p.title })),
  })
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { title = 'Untitled Project', description, fps, resolution } = body

  const project = await db.project.create({
    data: {
      userId,
      title,
      description,
      fps: fps ?? 24,
      resolution: resolution ?? '1920x1080',
    },
  })

  return NextResponse.json({ project: { ...project, name: project.title } }, { status: 201 })
}
