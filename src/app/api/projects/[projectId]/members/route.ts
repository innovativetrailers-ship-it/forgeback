import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isProjectRole, type ProjectRole } from '@cinema/core'
import {
  resolveCollabAccess,
  assertCanAssignRoles,
  projectRoleToDb,
  dbRoleToProjectRole,
} from '@/lib/collab/access'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId } = await params
  const access = await resolveCollabAccess(projectId, userId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const members = await db.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  })
  return NextResponse.json({
    ownerUserId: access.ownerUserId,
    role: access.role,
    members: members.map((m) => ({
      userId: m.userId,
      role: dbRoleToProjectRole(m.role),
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
    })),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId } = await params
  const access = await resolveCollabAccess(projectId, userId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!assertCanAssignRoles(access)) {
    return NextResponse.json({ error: 'Only the owner can assign roles' }, { status: 403 })
  }

  const body = await request.json().catch((err) => {
    console.warn("[caught] src/app/api/projects/[id]/members/route.ts:51", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  }) as Record<string, unknown>
  const targetUserId = typeof body.userId === 'string' ? body.userId : typeof body.targetUserId === 'string' ? body.targetUserId : ''
  const roleRaw = typeof body.role === 'string' ? body.role.toLowerCase() : ''
  if (!targetUserId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  if (!isProjectRole(roleRaw)) {
    return NextResponse.json({ error: 'role must be owner|director|editor|writer|reviewer|viewer' }, { status: 400 })
  }
  const role = roleRaw as ProjectRole
  if (role === 'owner' && targetUserId !== access.ownerUserId) {
    return NextResponse.json({ error: 'Cannot transfer ownership via members API' }, { status: 400 })
  }

  const member = await db.projectMember.upsert({
    where: { projectId_userId: { projectId, userId: targetUserId } },
    create: { projectId, userId: targetUserId, role: projectRoleToDb(role) },
    update: { role: projectRoleToDb(role) },
  })
  return NextResponse.json({ userId: member.userId, role: dbRoleToProjectRole(member.role) })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId } = await params
  const access = await resolveCollabAccess(projectId, userId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!assertCanAssignRoles(access)) {
    return NextResponse.json({ error: 'Only the owner can remove members' }, { status: 403 })
  }

  const targetUserId = request.nextUrl.searchParams.get('userId') ?? ''
  if (!targetUserId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  if (targetUserId === access.ownerUserId) {
    return NextResponse.json({ error: 'Cannot remove the project owner' }, { status: 400 })
  }
  await db.projectMember.deleteMany({ where: { projectId, userId: targetUserId } })
  return NextResponse.json({ ok: true })
}
