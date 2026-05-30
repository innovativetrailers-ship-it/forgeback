import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { publishToSocial }           from '@/lib/social/Publisher'
import type { SocialPlatform }       from '@/lib/social/Publisher'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    videoUrl:    string
    title:       string
    description: string
    hashtags?:   string[]
    platforms:   SocialPlatform[]
    scheduleAt?: string
  }

  const { videoUrl, title, description, platforms } = body
  if (!videoUrl || !title || !platforms?.length) {
    return NextResponse.json(
      { error: 'videoUrl, title, and at least one platform required' },
      { status: 400 },
    )
  }

  const validPlatforms: SocialPlatform[] = ['tiktok', 'instagram', 'youtube']
  const invalid = platforms.filter(p => !validPlatforms.includes(p))
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Unknown platforms: ${invalid.join(', ')}` }, { status: 400 })
  }

  try {
    const result = await publishToSocial({
      userId,
      videoUrl,
      title,
      description,
      hashtags:   body.hashtags ?? [],
      platforms,
      scheduleAt: body.scheduleAt ? new Date(body.scheduleAt) : undefined,
    })

    const status = result.failed > 0 && result.succeeded === 0 ? 500 : 207
    return NextResponse.json(result, { status })
  } catch (err) {
    console.error('[social/publish]', err)
    return NextResponse.json({ error: 'Publish failed' }, { status: 500 })
  }
}
