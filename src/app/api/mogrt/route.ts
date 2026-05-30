import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { generateMoGRT,
         MOGRT_TEMPLATES }           from '@/lib/mogrt/MoGRTGenerator'

/** GET /api/mogrt — list all 200 templates */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const category = searchParams.get('category')
  const search   = searchParams.get('q')?.toLowerCase()

  let templates = MOGRT_TEMPLATES as typeof MOGRT_TEMPLATES

  if (category) templates = templates.filter(t => t.category === category)
  if (search)   templates = templates.filter(t => t.name.toLowerCase().includes(search))

  return NextResponse.json({ templates, total: templates.length })
}

/** POST /api/mogrt — AI-generate a custom template from description (E06) */
export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { description } = await req.json() as { description: string }
  if (!description?.trim()) return NextResponse.json({ error: 'description required' }, { status: 400 })

  await checkAndDeductCredits(userId, 'mogrt_generate')

  try {
    const config = await generateMoGRT(description)
    return NextResponse.json({ config })
  } catch (err) {
    await refundCredits(userId, 15, 'MoGRT generation failed')
    console.error('[mogrt]', err)
    return NextResponse.json({ error: 'Template generation failed' }, { status: 500 })
  }
}
