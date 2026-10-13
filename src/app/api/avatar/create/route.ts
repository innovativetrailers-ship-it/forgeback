import { falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkAndDeductCredits } from '@/lib/credits'
import { fal, falSubscribeBound} from '@/lib/fal/client'
import { requireUser } from '@/lib/auth/requireUser'
const falSubscribe = falSubscribeBound('app.api.avatar.create.route')
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = (await requireUser(req))?.id ??  session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageUrl, name, style } = await req.json() as {
    imageUrl: string
    name: string
    style?: 'realistic' | 'anime' | 'cartoon'
  }

  if (!imageUrl || !name) {
    return NextResponse.json({ error: 'imageUrl and name required' }, { status: 400 })
  }

  await checkAndDeductCredits(userId, 'avatar_create')

  try {
    const result = await falSubscribe(falEndpoint('instant-character'), {
      input: {
        image_url: imageUrl,
        prompt: `professional avatar portrait, ${style ?? 'realistic'} style, clean background`,
        image_size: 'portrait_4_3',
        negative_prompt: 'blurry, deformed, ugly, watermark',
        num_images: 1,
      },
    })

    const avatarUrl = (result.data as { images?: Array<{ url: string }> }).images?.[0]?.url
    if (!avatarUrl) {
      return NextResponse.json({ error: 'Avatar generation failed' }, { status: 500 })
    }

    const avatar = await db.avatar.create({
      data: {
        userId,
        name,
        type: style ?? 'realistic',
        videoUrl: avatarUrl,
        thumbnailUrl: imageUrl,
      },
    })

    return NextResponse.json({ avatar, avatarUrl }, { status: 201 })
  } catch (err) {
    console.error('[avatar/create]', err)
    return NextResponse.json({ error: 'Avatar creation failed' }, { status: 500 })
  }
}
