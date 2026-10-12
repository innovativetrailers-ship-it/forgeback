import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BUILT_IN_TEMPLATES } from '@/lib/templates/catalog'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const built = BUILT_IN_TEMPLATES.find((item) => item.id === id)
  if (built) return NextResponse.json({ template: built })
  const userId = (await requireUser(req))?.id ?? null
  try {
    const row = await db.filmTemplate.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    if (!row.isPublic && row.ownerId !== userId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    return NextResponse.json({
      template: {
        id: row.id,
        name: row.name,
        category: row.category,
        format: row.format,
        breakdown: row.breakdown,
        style: row.style,
        captionStyle: row.captionStyle,
        isPublic: row.isPublic,
        createdBy: row.ownerId,
      },
    })
  } catch (err) {
    console.warn('[templates] read', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }
}
