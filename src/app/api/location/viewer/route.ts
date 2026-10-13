import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = process.env.CESIUM_ION_ACCESS_TOKEN || process.env.CESIUM_ION_TOKEN
  if (!token) {
    return NextResponse.json({ error: '3D tiles unavailable: Cesium token is not set on the server.' }, { status: 503 })
  }
  return NextResponse.json({ token })
}
