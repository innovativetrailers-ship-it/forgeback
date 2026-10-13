import { nanoid } from 'nanoid'
import type { TimelineRecipe } from '../timeline/schema'
import { orchestrate } from '@/lib/orchestration'

type DirectorCharacter = {
  id: string
  name: string
}

type DirectorLocation = {
  id: string
  name: string
}

/** Builds an orchestrate plan. Model choice is delegate, inside orchestrate. */
export async function runAIDirector(params: {
  brief: string
  availableCharacters: DirectorCharacter[]
  availableLocations: DirectorLocation[]
  targetDuration: number
  style: string
  projectId: string
  userId: string
}): Promise<{ recipe: TimelineRecipe; directorNotes: string }> {
  const cast = params.availableCharacters.map((character) => character.name).filter(Boolean)
  const places = params.availableLocations.map((location) => location.name).filter(Boolean)
  const prompt = [
    params.brief.trim(),
    params.style.trim() ? `Style: ${params.style.trim()}` : '',
    cast.length ? `Characters: ${cast.join(', ')}` : '',
    places.length ? `Locations: ${places.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  const result = await orchestrate({
    prompt,
    totalDuration: params.targetDuration,
    selectedModels: [],
    userId: params.userId,
    projectId: params.projectId,
    planOnly: true,
    generationMode: 'draft',
  })

  const trackId = `track-${nanoid()}`
  let cursor = 0
  const clips = result.segments.map((segment) => {
    const duration = segment.duration > 0 ? segment.duration : params.targetDuration
    const startTime = cursor
    cursor += duration
    return {
      id: segment.shotId ?? nanoid(),
      trackId,
      startTime,
      endTime: startTime + duration,
      sourceUrl: '',
      prompt: prompt.slice(0, 1500),
      modelUsed: segment.model,
    }
  })

  const recipe: TimelineRecipe = {
    id: nanoid(),
    projectId: params.projectId,
    fps: 24,
    resolution: { width: 1920, height: 1080 },
    durationSeconds: params.targetDuration,
    colorSpace: 'rec709',
    tracks: [{
      id: trackId,
      type: 'video',
      label: 'VIDEO 1',
      muted: false,
      locked: false,
      solo: false,
      clips,
    }],
  }

  const models = result.segments.map((segment) => segment.model).filter(Boolean)
  const directorNotes = `Planned ${result.segments.length} shot${result.segments.length === 1 ? '' : 's'}. ${models.join(', ')}`
  return { recipe, directorNotes }
}
