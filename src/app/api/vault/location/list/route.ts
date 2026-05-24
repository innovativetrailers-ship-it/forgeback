import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')

  const locations = await db.vaultLocation.findMany({
    where: {
      projectId: projectId ?? undefined,
      project: { userId: session.user.id },
    },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json({ locations })
}
