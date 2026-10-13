import { logCaught } from '@/lib/diagnostics/caught'
import {
  isProjectRole,
  roleCanAssignRoles,
  roleCanComment,
  roleCanEditDoc,
  roleCanGenerate,
  type ProjectRole,
} from '@cinema/core'
import { db } from '@/lib/db'
import type { ProjectRole as DbProjectRole } from '@/generated/prisma/client'

const DB_TO_ROLE: Record<DbProjectRole, ProjectRole> = {
  OWNER: 'owner',
  DIRECTOR: 'director',
  EDITOR: 'editor',
  WRITER: 'writer',
  REVIEWER: 'reviewer',
  VIEWER: 'viewer',
}

const ROLE_TO_DB: Record<ProjectRole, DbProjectRole> = {
  owner: 'OWNER',
  director: 'DIRECTOR',
  editor: 'EDITOR',
  writer: 'WRITER',
  reviewer: 'REVIEWER',
  viewer: 'VIEWER',
}

export function dbRoleToProjectRole(role: DbProjectRole | string): ProjectRole {
  const mapped = DB_TO_ROLE[role as DbProjectRole]
  if (mapped) return mapped
  if (isProjectRole(String(role).toLowerCase())) return String(role).toLowerCase() as ProjectRole
  return 'viewer'
}

export function projectRoleToDb(role: ProjectRole): DbProjectRole {
  return ROLE_TO_DB[role]
}

export interface CollabAccess {
  role: ProjectRole
  ownerUserId: string
  projectId: string
}

export async function resolveCollabAccess(
  projectId: string,
  userId: string,
): Promise<CollabAccess | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true },
  })
  if (!project) return null

  if (project.userId === userId) {
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId, role: 'OWNER' },
      update: { role: 'OWNER' },
    }).catch((err) => logCaught('lib/collab/access', err))
    return { role: 'owner', ownerUserId: project.userId, projectId }
  }

  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  })
  if (!member) return null
  return {
    role: dbRoleToProjectRole(member.role),
    ownerUserId: project.userId,
    projectId,
  }
}

export function assertCanGenerate(access: CollabAccess): boolean {
  return roleCanGenerate(access.role)
}

export function assertCanEditDoc(access: CollabAccess): boolean {
  return roleCanEditDoc(access.role)
}

export function assertCanComment(access: CollabAccess): boolean {
  return roleCanComment(access.role)
}

export function assertCanAssignRoles(access: CollabAccess): boolean {
  return roleCanAssignRoles(access.role)
}

export { roleCanGenerate, roleCanEditDoc, roleCanComment, roleCanAssignRoles }
