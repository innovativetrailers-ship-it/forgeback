import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = (await requireUser(req))?.id ??  session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    title: string
    type: string
    logline?: string
    synopsis?: string
    genre?: string[]
    targetRuntime: number
    rating?: string
    cinematicStyle?: string
    aspectRatio?: string
    musicStyle?: string
  }

  if (!body.title || !body.type || !body.targetRuntime) {
    return NextResponse.json({ error: 'title, type and targetRuntime are required' }, { status: 400 })
  }

  const validTypes = ['FEATURE_FILM', 'SHORT_FILM', 'DOCUMENTARY', 'MUSIC_VIDEO', 'COMMERCIAL', 'EXPERIMENTAL']
  if (!validTypes.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 })
  }

  const film = await db.filmProject.create({
    data: {
      userId,
      title: body.title,
      type: body.type as 'FEATURE_FILM' | 'SHORT_FILM' | 'DOCUMENTARY' | 'MUSIC_VIDEO' | 'COMMERCIAL' | 'EXPERIMENTAL',
      logline: body.logline,
      synopsis: body.synopsis,
      genre: body.genre ?? [],
      targetRuntime: body.targetRuntime,
      rating: body.rating,
      cinematicStyle: body.cinematicStyle,
      aspectRatio: body.aspectRatio ?? '2.39:1',
      musicStyle: body.musicStyle,
      status: 'DEVELOPMENT',
    },
    include: { acts: true, cast: true, locations: true },
  })

  return NextResponse.json({ film }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = (await requireUser(req))?.id ??  session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const films = await db.filmProject.findMany({
    where: { userId },
    include: { acts: { include: { sequences: { include: { scenes: true } } } }, cast: true, locations: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ films })
}
