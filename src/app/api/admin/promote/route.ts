import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Only callable by existing admins — promotes another user to admin
export async function POST(req: NextRequest): Promise<NextResponse> {
  const callerId = req.headers.get('x-user-id')
  const role     = req.headers.get('x-user-role')

  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let email: string | undefined
  try {
    const body = await req.json() as { email?: unknown }
    email = typeof body.email === 'string' ? body.email : undefined
  } catch (err) {
    console.warn("[caught] src/app/api/admin/promote/route.ts:17", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  try {
    const user = await db.user.update({
      where: { email },
      data:  { role: 'ADMIN', creditBalance: 9_999_999 },
    })

    console.log(`[admin] ${callerId} promoted ${email} to ADMIN`)
    return NextResponse.json({ promoted: true, userId: user.id })
  } catch (err) {
    console.warn("[caught] src/app/api/admin/promote/route.ts:31", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: `User not found: ${email}` }, { status: 404 })
  }
}
