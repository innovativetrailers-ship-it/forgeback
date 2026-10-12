import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { linkExpired } from '@/lib/desktop/linkCode'
import { DesktopAccess } from '../DesktopAccess'

export const dynamic = 'force-dynamic'

export default async function DesktopLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const params = await searchParams
  const code = params.code?.trim() ?? ''
  const session = await auth()
  if (!session?.user?.id) {
    const back = code ? `/desktop/link?code=${encodeURIComponent(code)}` : '/desktop/link'
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}`)
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isInternal: true },
  })
  const row = code
    ? await db.desktopLinkCode.findUnique({ where: { code } })
    : null
  const waiting = Boolean(row && !row.consumedAt && !linkExpired(row.expiresAt))
  return (
    <DesktopAccess
      signedIn
      email={session.user.email ?? null}
      internal={user?.role === 'ADMIN' || user?.isInternal === true}
      initialCode={code}
      deviceName={waiting ? row?.deviceName ?? 'this computer' : null}
    />
  )
}
