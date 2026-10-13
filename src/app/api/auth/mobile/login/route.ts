import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { authSecret } from '@/lib/auth/requiredEnv'
import { db } from '@/lib/db'
import { allowRate } from '@/lib/http/rateLimit'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!allowRate(`mobile-login:${ip}`, 10, 15 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  try {
    const body = await req.json() as unknown
    const { email, password } = schema.parse(body)

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Sign a JWT for mobile use (30-day expiry)
    const secret = new TextEncoder().encode(authSecret())
    const token = await new SignJWT({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret)

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        credits: user.creditBalance,
        image: user.avatarUrl,
      },
    })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    console.error('[mobile/login]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
