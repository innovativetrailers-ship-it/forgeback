import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { denyUnlessCron } from '@/lib/cron-guard'
import { isUngatedAccount } from '@/lib/billing/accountAllow'

export async function auditInternalFlags(): Promise<string[]> {
  const rows = await db.user.findMany({
    where: { isInternal: true },
    select: { id: true, email: true },
  })
  return rows.filter((row) => !isUngatedAccount(row.email, true)).map((row) => row.id)
}

export async function GET(req: NextRequest) {
  const denied = denyUnlessCron(req)
  if (denied) return denied
  const ids = await auditInternalFlags()
  if (ids.length > 0) {
    console.error('[internal-audit] high-severity unexpected internal flag', ids.join(','))
  }
  return NextResponse.json({ unexpected: ids.length })
}
