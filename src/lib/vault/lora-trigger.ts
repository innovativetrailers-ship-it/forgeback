import { db } from '../db'

export async function incrementRenderCount(characterId: string): Promise<void> {
  await db.vaultCharacter.update({
    where: { id: characterId },
    data: { renderCount: { increment: 1 } },
  })
}
