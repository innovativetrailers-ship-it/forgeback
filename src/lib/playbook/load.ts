import {
  classifyRules,
  mergePlaybooks,
  parsePlaybook,
  stripUnsafeRules,
  type Playbook,
} from '@cinema/core'
import { db } from '@/lib/db'
import { isGenerationPaused } from '@/lib/generation/pause'
import { classifyPlaybookRules } from './classify'

export async function loadActivePlaybook(userId: string, projectId?: string | null): Promise<Playbook | null> {
  const [projectRow, globalRow] = await Promise.all([
    projectId
      ? db.playbook.findFirst({
        where: { userId, projectId },
        orderBy: { updatedAt: 'desc' },
      })
      : Promise.resolve(null),
    db.playbook.findFirst({
      where: { userId, projectId: null },
      orderBy: { updatedAt: 'desc' },
    }),
  ])
  return mergePlaybooks(toPlaybook(globalRow), toPlaybook(projectRow))
}

export async function listPlaybooks(userId: string, projectId?: string): Promise<Playbook[]> {
  const rows = await db.playbook.findMany({
    where: projectId
      ? { userId, retiredAt: null, OR: [{ projectId }, { projectId: null }] }
      : { userId, retiredAt: null },
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map(toPlaybook).filter((row): row is Playbook => Boolean(row))
}

export async function savePlaybook(input: {
  userId: string
  id?: string
  projectId?: string | null
  name: string
  style?: Playbook['style']
  generation?: Playbook['generation']
  language?: Playbook['language']
  rules?: string[]
}): Promise<Playbook> {
  const { kept, rejected } = stripUnsafeRules(input.rules ?? [])
  if (rejected.length && !kept.length && !(input.style || input.generation || input.language)) {
    throw new Error('Playbook rules cannot disable safety, billing, pause, or honest flagging')
  }
  let classified = classifyRules(kept)
  if (kept.length && !isGenerationPaused()) {
    classified = await classifyPlaybookRules(kept)
  }
  const data = {
    name: input.name.trim() || 'Playbook',
    projectId: input.projectId ?? null,
    style: input.style ? JSON.parse(JSON.stringify(input.style)) : undefined,
    generation: input.generation ? JSON.parse(JSON.stringify(input.generation)) : undefined,
    language: input.language ? JSON.parse(JSON.stringify(input.language)) : undefined,
    rules: kept,
    ruleActions: JSON.parse(JSON.stringify(classified)),
  }
  let row
  if (input.id) {
    const existing = await db.playbook.findFirst({
      where: { id: input.id, userId: input.userId },
      select: { id: true },
    })
    if (!existing) throw new Error('Playbook not found')
    row = await db.playbook.update({ where: { id: input.id }, data })
  } else {
    row = await db.playbook.create({
      data: { userId: input.userId, ...data },
    })
  }
  const parsed = toPlaybook(row)
  if (!parsed) throw new Error('Playbook could not be saved')
  return parsed
}

function toPlaybook(row: {
  id: string
  userId: string
  projectId: string | null
  name: string
  style: unknown
  generation: unknown
  language: unknown
  rules: string[]
  ruleActions: unknown
} | null): Playbook | null {
  if (!row) return null
  return parsePlaybook({
    ...row,
    classifiedRules: row.ruleActions,
  })
}
