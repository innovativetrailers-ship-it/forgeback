import { NextRequest, NextResponse } from 'next/server'
import { acceptPlaybookSuggestion, playbookSuggestionsFor } from '@/lib/playbook'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const projectId = request.nextUrl.searchParams.get('projectId') ?? undefined
  const suggestions = await playbookSuggestionsFor(userId, projectId)
  return NextResponse.json({ suggestions })
}

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch((err) => {
    console.warn("[caught] src/app/api/playbooks/suggestions/route.ts:15", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  }) as {
    projectId?: string | null
    playbookId?: string
    suggestion?: {
      text: string
      reason: string
      patch: Record<string, unknown>
    }
  }
  if (!body.suggestion?.text || !body.suggestion.patch) {
    return NextResponse.json({ error: 'A suggestion to confirm is required' }, { status: 400 })
  }
  try {
    await acceptPlaybookSuggestion({
      userId,
      projectId: body.projectId,
      playbookId: body.playbookId,
      suggestion: {
        text: body.suggestion.text,
        reason: body.suggestion.reason ?? '',
        patch: body.suggestion.patch as never,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.warn("[caught] src/app/api/playbooks/suggestions/route.ts:39", err instanceof Error ? { name: err.name, message: err.message } : err)

    const message = err instanceof Error ? err.message : 'Could not accept suggestion'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
