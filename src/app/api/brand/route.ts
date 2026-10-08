import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { createBrandKit,
         listBrandKits }             from '@/lib/brand/BrandKitApply'

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const kits = await listBrandKits(userId)
  return NextResponse.json({ kits })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    name:              string
    primaryColor:      string
    secondaryColor:    string
    accentColor:       string
    fontFamily:        string
    logoUrl?:          string
    watermarkUrl?:     string
    watermarkPosition?: string
    watermarkOpacity?:  number
    introClipUrl?:     string
    outroClipUrl?:     string
  }

  if (!body.name || !body.primaryColor) {
    return NextResponse.json({ error: 'name and primaryColor required' }, { status: 400 })
  }

  try {
    const kit = await createBrandKit(userId, {
      ...body,
      secondaryColor:    body.secondaryColor ?? '#ffffff',
      accentColor:       body.accentColor    ?? body.primaryColor,
      fontFamily:        body.fontFamily     ?? 'Inter',
      watermarkPosition: body.watermarkPosition ?? 'bottom-right',
      watermarkOpacity:  body.watermarkOpacity  ?? 0.6,
    })
    return NextResponse.json({ kit }, { status: 201 })
  } catch (err) {
    console.error('[brand]', err)
    return NextResponse.json({ error: 'Failed to create brand kit' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  const userId = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[brand]', err instanceof Error ? err.message : err)
    return null
  }) as { id?: string; primaryColor?: string; secondaryColor?: string; accentColor?: string; fontFamily?: string } | null
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { db } = await import('@/lib/db')
  const existing = await db.brandKit.findFirst({ where: { id: body.id, userId } })
  if (!existing) return NextResponse.json({ error: 'Kit not found' }, { status: 404 })
  const kit = await db.brandKit.update({
    where: { id: existing.id },
    data: {
      primaryColor: body.primaryColor ?? existing.primaryColor,
      secondaryColor: body.secondaryColor ?? existing.secondaryColor,
      accentColor: body.accentColor ?? existing.accentColor,
      fontFamily: body.fontFamily ?? existing.fontFamily,
      lowerThirdStyle: { font: body.fontFamily ?? existing.fontFamily, color: body.primaryColor ?? existing.primaryColor },
    },
  })
  return NextResponse.json({ kit })
}
