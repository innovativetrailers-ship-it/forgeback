import { detectFormat } from '@/lib/importers/ProjectImporter'
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/requireUser'
import { allowRate } from '@/lib/http/rateLimit'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allowRate(`import-detect:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const { filename, sampleBytes } = await req.json() as {
    filename: string
    sampleBytes: number[]
  }

  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 })

  const buffer = Buffer.from(sampleBytes ?? [])
  const format = await detectFormat(filename, buffer)
  return NextResponse.json({ format })
}
