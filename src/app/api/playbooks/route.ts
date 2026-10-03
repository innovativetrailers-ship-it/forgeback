import { NextRequest, NextResponse } from 'next/server'
import { listPlaybooks, savePlaybook } from '@/lib/playbook'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const projectId = request.nextUrl.searchParams.get('projectId') ?? undefined
  const playbooks = await listPlaybooks(userId, projectId)
  return NextResponse.json({ playbooks })
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch((err) => {
    console.warn("[caught] src/app/api/playbooks/route.ts:15", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  }) as {
    name?: string
    projectId?: string | null
    style?: unknown
    generation?: unknown
    language?: unknown
    rules?: string[]
  }
  try {
    const playbook = await savePlaybook({
      userId,
      name: typeof body.name === 'string' ? body.name : 'Playbook',
      projectId: body.projectId,
      style: body.style as never,
      generation: body.generation as never,
      language: body.language as never,
      rules: Array.isArray(body.rules) ? body.rules.filter((r): r is string => typeof r === 'string') : [],
    })
    return NextResponse.json({ playbook }, { status: 201 })
  } catch (err) {
    console.warn("[caught] src/app/api/playbooks/route.ts:34", err instanceof Error ? { name: err.name, message: err.message } : err)

    const message = err instanceof Error ? err.message : 'Could not save playbook'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
