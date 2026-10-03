import { db } from '@/lib/db'

interface ProjectStore {
  project: {
    findUnique(args: { where: { id: string }; select: { userId: true } }): Promise<{ userId: string } | null>
    create(args: { data: { id: string; userId: string; title: string } }): Promise<unknown>
  }
}

/** Persist the editor project before a character or shot write. The id is the one reconcile and the vault already use. */
export async function ensureOwnedProject(
  userId: string,
  projectId: string,
  writer: ProjectStore = db,
): Promise<string> {
  const id = projectId.trim()
  if (!id || id === 'global' || id === 'pending') {
    throw new Error('A saved project is required')
  }

  const existing = await writer.project.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (existing && existing.userId !== userId) {
    throw new Error('Forbidden')
  }
  if (!existing) {
    await writer.project.create({
      data: { id, userId, title: 'Untitled project' },
    })
  }
  return id
}
