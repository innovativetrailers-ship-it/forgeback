import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = process.env.CESIUM_ION_ACCESS_TOKEN || process.env.CESIUM_ION_TOKEN
  if (!token) {
    return NextResponse.json({ error: '3D tiles unavailable: Cesium token is not set on the server.' }, { status: 503 })
  }
  return NextResponse.json({ token })
}
