import { type NextRequest, NextResponse } from 'next/server'
import { isProjectRole } from '@cinema/core'
import {
  resolveCollabAccess,
  assertCanAssignRoles,
  dbRoleToProjectRole,
  projectRoleToDb,
} from '@/lib/collab/access'
import { db } from '@/lib/db'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId?.trim())
    return NextResponse.json({ error: 'projectId query param is required' }, { status: 400 })

  const access = await resolveCollabAccess(projectId.trim(), userId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const members = await db.projectMember.findMany({ where: { projectId: projectId.trim() } })
  return NextResponse.json({
    members: members.map((m) => ({ userId: m.userId, role: dbRoleToProjectRole(m.role) })),
  })
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/collab/permissions/route.ts:33", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const o = raw as Record<string, unknown>
  if (typeof o.projectId !== 'string' || !o.projectId.trim())
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  if (typeof o.targetUserId !== 'string' || !o.targetUserId.trim())
    return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 })
  const role = typeof o.role === 'string' ? o.role.toLowerCase() : ''
  if (!isProjectRole(role))
    return NextResponse.json({ error: 'role must be owner|director|editor|writer|reviewer|viewer' }, { status: 400 })
  if (role === 'owner')
    return NextResponse.json({ error: 'Cannot transfer ownership via members API' }, { status: 400 })

  const access = await resolveCollabAccess(o.projectId.trim(), userId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!assertCanAssignRoles(access))
    return NextResponse.json({ error: 'Only the owner can assign roles' }, { status: 403 })

  const member = await db.projectMember.upsert({
    where: { projectId_userId: { projectId: o.projectId.trim(), userId: o.targetUserId.trim() } },
    create: { projectId: o.projectId.trim(), userId: o.targetUserId.trim(), role: projectRoleToDb(role) },
    update: { role: projectRoleToDb(role) },
  })
  return NextResponse.json({ ok: true, role: dbRoleToProjectRole(member.role) })
}
