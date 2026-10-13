import type { FCCCharacter } from './fccSchema'

export function matchCharacterForShot(
  characters: FCCCharacter[],
  description: string,
  prompt: string,
  consistencyId: string | null,
): FCCCharacter | null {
  if (consistencyId) {
    const byId = characters.find((c) => c.id === consistencyId)
    if (byId) return byId
    const byName = characters.find((c) => c.name.toLowerCase() === consistencyId.toLowerCase())
    if (byName) return byName
  }

  const hay = `${description} ${prompt}`.toLowerCase()
  const sorted = [...characters].sort((a, b) => b.name.length - a.name.length)
  for (const c of sorted) {
    const name = c.name.trim().toLowerCase()
    if (name.length >= 2 && hay.includes(name)) return c
  }
  return null
}
