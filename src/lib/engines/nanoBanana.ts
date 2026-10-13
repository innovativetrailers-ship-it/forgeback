import { generateImage } from '@/lib/engines/imageGen'
import { uploadToR2 } from '@/lib/storage/r2'

export interface NanoBananaParams {
  prompt:             string
  referenceImageUrl?: string
  style?:             'photorealistic' | 'cinematic' | 'illustrated' | 'stylised'
  quality?:           'standard' | 'pro'
}

export async function generateWithNanoBanana(
  params: NanoBananaParams
): Promise<{ imageUrl: string }> {
  const stylePrefix: Record<string, string> = {
    photorealistic: 'Professional photorealistic photograph: ',
    cinematic:      'Cinematic film still, shot on ARRI Alexa: ',
    illustrated:    'Detailed concept art illustration: ',
    stylised:       'Stylised artistic render: ',
  }

  const [rawUrl] = await generateImage(
    `${stylePrefix[params.style ?? 'cinematic']}${params.prompt}`,
    {
      quality: params.quality === 'pro' ? 'production' : 'reference',
      refImageUrl: params.referenceImageUrl,
    },
  )
  if (!rawUrl) throw new Error('Nano Banana: no image returned from FAL')

  const imageBuffer = await fetch(rawUrl).then(r => r.arrayBuffer())
  const imageUrl    = await uploadToR2(
    Buffer.from(imageBuffer),
    `generated/${Date.now()}.jpg`,
    'image/jpeg'
  )

  return { imageUrl }
}
