import { suggestPlaybookAdditions, type PlaybookSuggestion } from '@cinema/core'
import { tasteProfileFor } from '@/lib/cognition/shotRatings'
import { loadActivePlaybook, savePlaybook } from './load'

export async function playbookSuggestionsFor(userId: string, projectId?: string): Promise<PlaybookSuggestion[]> {
  const taste = await tasteProfileFor(userId)
  const active = await loadActivePlaybook(userId, projectId)
  const suggestions = suggestPlaybookAdditions(taste)
  return suggestions.filter((suggestion) => !alreadyCovered(active, suggestion))
}

export async function acceptPlaybookSuggestion(input: {
  userId: string
  projectId?: string | null
  suggestion: PlaybookSuggestion
  playbookId?: string
}): Promise<void> {
  const active = await loadActivePlaybook(input.userId, input.projectId)
  const rules = [...(active?.rules ?? []), ...(input.suggestion.patch.rules ?? [])]
  await savePlaybook({
    userId: input.userId,
    id: input.playbookId ?? active?.id,
    projectId: input.projectId ?? active?.projectId ?? null,
    name: active?.name ?? 'Playbook',
    style: { ...active?.style, ...input.suggestion.patch.style },
    generation: {
      ...active?.generation,
      ...input.suggestion.patch.generation,
      modelPreferences: {
        ...active?.generation?.modelPreferences,
        ...input.suggestion.patch.generation?.modelPreferences,
      },
    },
    language: { ...active?.language, ...input.suggestion.patch.language },
    rules,
  })
}

function alreadyCovered(active: Awaited<ReturnType<typeof loadActivePlaybook>>, suggestion: PlaybookSuggestion): boolean {
  if (!active) return false
  const wantRules = suggestion.patch.rules ?? []
  if (wantRules.some((rule) => (active.rules ?? []).includes(rule))) return true
  const wantModel = suggestion.patch.generation?.modelPreferences
  if (wantModel) {
    for (const [purpose, model] of Object.entries(wantModel)) {
      if (active.generation?.modelPreferences?.[purpose as keyof typeof wantModel] === model) return true
    }
  }
  if (
    suggestion.patch.generation?.defaultQualityTier
    && active.generation?.defaultQualityTier === suggestion.patch.generation.defaultQualityTier
  ) return true
  return false
}
