import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { allowRate } from '@/lib/http/rateLimit'
import { ageYears } from '@/lib/privacy/consent'

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth is required'),
})

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!allowRate(`register:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const body = await request.json()
  const parsed = registerSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { name, email, password, dateOfBirth } = parsed.data
  const born = new Date(`${dateOfBirth}T00:00:00.000Z`)
  if (Number.isNaN(born.getTime()) || ageYears(born) < 18) {
    return NextResponse.json({ error: { dateOfBirth: ['Accounts are for adults'] } }, { status: 400 })
  }

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: { email: ['Email already registered'] } },
      { status: 409 }
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const user = await db.user.create({
    data: { name, email, passwordHash, dateOfBirth: born },
    select: { id: true, email: true, name: true, role: true, creditBalance: true },
  })

  return NextResponse.json({ user }, { status: 201 })
}
