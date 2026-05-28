/* eslint-disable @typescript-eslint/no-explicit-any */
import { uploadToR2 } from '@/lib/storage/r2'

export interface NanoBananaParams {
  prompt:             string
  negativePrompt?:    string
  referenceImageUrl?: string
  aspectRatio?:       '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  style?:             'photorealistic' | 'cinematic' | 'illustrated' | 'stylised'
  quality?:           'standard' | 'pro'
}

export async function generateWithNanoBanana(
  params: NanoBananaParams
): Promise<{ imageUrl: string }> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

  const modelId = params.quality === 'pro'
    ? (process.env.NANO_BANANA_PRO_MODEL ?? 'gemini-3.0-pro-image')
    : (process.env.NANO_BANANA_MODEL     ?? 'gemini-2.5-flash-preview-05-20')

  const model = genAI.getGenerativeModel({ model: modelId })

  const stylePrefix: Record<string, string> = {
    photorealistic: 'Professional photorealistic photograph: ',
    cinematic:      'Cinematic film still, shot on ARRI Alexa: ',
    illustrated:    'Detailed concept art illustration: ',
    stylised:       'Stylised artistic render: ',
  }

  const fullPrompt = `${stylePrefix[params.style ?? 'cinematic']}${params.prompt}`

  let result: any
  if (params.referenceImageUrl) {
    const imgRes   = await fetch(params.referenceImageUrl)
    const imgBuf   = await imgRes.arrayBuffer()
    const base64   = Buffer.from(imgBuf).toString('base64')
    const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg'

    result = await model.generateContent([
      { text: fullPrompt },
      { inlineData: { mimeType, data: base64 } },
    ])
  } else {
    result = await model.generateContent(fullPrompt)
  }

  const imageData = result.response.candidates?.[0]?.content?.parts
    ?.find((p: any) => p.inlineData)?.inlineData

  if (!imageData?.data) throw new Error('Nano Banana returned no image data')

  const buffer   = Buffer.from(imageData.data, 'base64')
  const imageUrl = await uploadToR2(buffer, `generated/${Date.now()}.jpg`, 'image/jpeg')

  return { imageUrl }
}
