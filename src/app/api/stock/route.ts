import { searchStock } from '@/lib/engines/pexels'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('query') ?? ''
  const type  = (searchParams.get('type') ?? 'photo') as 'photo' | 'video'

  if (!query) return Response.json({ error: 'query required' }, { status: 400 })

  const results = await searchStock({ query, type })
  return Response.json({ results })
}
