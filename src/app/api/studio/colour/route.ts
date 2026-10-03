import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { applyLUT, applyASCCDL, applyFilmEmulation, applyColourCorrection, FILM_EMULATION_LUTS } from '@/lib/studio/colour'
import { checkAndDeductCredits } from '@/lib/credits'

const lutSchema = z.object({
  operation: z.literal('lut'),
  videoUrl: z.string().url(),
  lutUrl: z.string().url(),
  intensity: z.number().min(0).max(1).default(1),
})

const cdlSchema = z.object({
  operation: z.literal('cdl'),
  videoUrl: z.string().url(),
  lift: z.tuple([z.number(), z.number(), z.number()]),
  gamma: z.tuple([z.number(), z.number(), z.number()]),
  gain: z.tuple([z.number(), z.number(), z.number()]),
  saturation: z.number().min(0).max(3).default(1),
})

const filmSchema = z.object({
  operation: z.literal('film_emulation'),
  videoUrl: z.string().url(),
  preset: z.enum(['kodak_5219', 'fuji_3510', 'kodak_2383', 'bw_contrast']),
  intensity: z.number().min(0).max(1).default(0.85),
})

const correctionSchema = z.object({
  operation: z.literal('correction'),
  videoUrl: z.string().url(),
  shadows: z.number().default(0),
  midtones: z.number().default(0),
  highlights: z.number().default(0),
  temperature: z.number().default(6500),
  tint: z.number().default(0),
})

const schema = z.discriminatedUnion('operation', [lutSchema, cdlSchema, filmSchema, correctionSchema])

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    await checkAndDeductCredits(userId, 'colour_grade')
  } catch (err) {
    console.warn("[caught] src/app/api/studio/colour/route.ts:51", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  const data = parsed.data

  switch (data.operation) {
    case 'lut':
      return NextResponse.json(await applyLUT(data))
    case 'cdl':
      return NextResponse.json(await applyASCCDL(data))
    case 'film_emulation':
      return NextResponse.json(await applyFilmEmulation(data.videoUrl, data.preset, data.intensity))
    case 'correction':
      return NextResponse.json(await applyColourCorrection(data))
  }
}

export async function GET() {
  return NextResponse.json({ presets: Object.keys(FILM_EMULATION_LUTS) })
}
