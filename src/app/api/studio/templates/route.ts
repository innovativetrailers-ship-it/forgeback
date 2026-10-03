import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { BUILT_IN_TEMPLATES, TEMPLATE_CATEGORIES, stripMediaText, type FilmTemplateRecord, type TemplateCategory } from '@/lib/templates/catalog'

function fromRow(row: {
  id: string
  ownerId: string | null
  name: string
  category: string
  format: unknown
  breakdown: unknown
  style: unknown
  captionStyle: string | null
  isPublic: boolean
}): FilmTemplateRecord | null {
  const format = row.format as unknown as FilmTemplateRecord['format']
  const breakdown = row.breakdown as unknown as FilmTemplateRecord['breakdown']
  const style = row.style as unknown as FilmTemplateRecord['style']
  if (!format || !breakdown || !style) return null
  return {
    id: row.id,
    name: row.name,
    category: (TEMPLATE_CATEGORIES.includes(row.category as TemplateCategory) ? row.category : 'Cinematic') as TemplateCategory,
    format,
    breakdown,
    style,
    captionStyle: row.captionStyle ?? undefined,
    isPublic: row.isPublic,
    createdBy: row.ownerId,
  }
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  const category = req.nextUrl.searchParams.get('category') ?? ''
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()
  let saved: FilmTemplateRecord[] = []
  if (userId) {
    try {
      const rows = await db.filmTemplate.findMany({
        where: { OR: [{ ownerId: userId }, { isPublic: true }] },
        orderBy: { createdAt: 'desc' },
        take: 80,
      })
      saved = rows.flatMap((row) => {
        const parsed = fromRow(row)
        return parsed ? [parsed] : []
      })
    } catch (err) {
      console.warn('[templates] list', err instanceof Error ? err.message : err)
    }
  }
  const all = [...saved, ...BUILT_IN_TEMPLATES.filter((item) => !saved.some((row) => row.id === item.id))]
  const templates = all.filter((item) => {
    if (category && item.category !== category) return false
    if (q && !`${item.name} ${item.category} ${item.style.look}`.toLowerCase().includes(q)) return false
    return true
  })
  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[templates] body', err instanceof Error ? err.message : err)
    return null
  }) as { name?: string; category?: string; format?: FilmTemplateRecord['format']; breakdown?: FilmTemplateRecord['breakdown']; style?: FilmTemplateRecord['style']; isPublic?: boolean } | null
  const name = body?.name?.trim()
  const category = TEMPLATE_CATEGORIES.includes(body?.category as TemplateCategory) ? body?.category as TemplateCategory : null
  if (!name || !category || !body?.breakdown?.scenes?.length || !body.format || !body.style?.look) {
    return NextResponse.json({ error: 'A name, category, format, style, and breakdown are required' }, { status: 400 })
  }
  const breakdown = JSON.parse(stripMediaText(JSON.stringify(body.breakdown))) as FilmTemplateRecord['breakdown']
  const style = JSON.parse(stripMediaText(JSON.stringify(body.style))) as FilmTemplateRecord['style']
  try {
    const row = await db.filmTemplate.create({
      data: {
        ownerId: userId,
        name,
        category,
        format: body.format as unknown as Prisma.InputJsonValue,
        breakdown: breakdown as unknown as Prisma.InputJsonValue,
        style: style as unknown as Prisma.InputJsonValue,
        isPublic: Boolean(body.isPublic),
      },
    })
    return NextResponse.json({
      id: row.id,
      sharePath: row.isPublic ? `/api/studio/templates/${row.id}` : null,
    })
  } catch (err) {
    console.warn('[templates] save', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not save the template' }, { status: 500 })
  }
}
