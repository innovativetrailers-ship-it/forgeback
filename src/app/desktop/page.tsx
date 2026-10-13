import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { DesktopAccess } from './DesktopAccess'

export const dynamic = 'force-dynamic'

export default async function DesktopPage() {
  const session = await auth()
  const userId = session?.user?.id
  let internal = false
  if (userId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true, isInternal: true },
    })
    internal = user?.role === 'ADMIN' || user?.isInternal === true
  }
  return (
    <DesktopAccess
      signedIn={Boolean(userId)}
      email={session?.user?.email ?? null}
      internal={internal}
    />
  )
}
