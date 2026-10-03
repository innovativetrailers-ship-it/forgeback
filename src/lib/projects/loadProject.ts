import { nanoid } from 'nanoid'
import { buildDefaultRecipe, isTimelineRecipe } from '@/lib/timeline/defaultRecipe'
import { reconcileTimeline } from '@/lib/timeline/reconcileTimeline'
import type { ShotPlanCard } from '@/lib/studio/shotPlan'
import type { TimelineRecipe } from '@/lib/timeline/schema'
import { usePlaybackStore } from '@/store/playbackStore'
import { useScriptStore } from '@/store/scriptStore'

export const PROJECT_LOADED_EVENT = 'cinema:project-loaded'

export interface ProjectSummary {
  id: string
  name: string
  title?: string
  recipe?: unknown
  timelineJson?: unknown
}

export interface ProjectLoadedDetail {
  projectId: string
  recipe: TimelineRecipe
  project: ProjectSummary
  shots: ShotPlanCard[]
}

async function fetchProject(projectId: string): Promise<ProjectSummary> {
  const res = await fetch(`/api/projects/${projectId}`, { credentials: 'include' })
  if (!res.ok) {
    const body = await res.json().catch((err) => {
      console.warn("[caught] src/lib/projects/loadProject.ts:29", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (({}))
    }) as { error?: string }
    throw new Error(body.error ?? `Failed to load project (${res.status})`)
  }
  return res.json() as Promise<ProjectSummary>
}

async function fetchShots(projectId: string): Promise<ShotPlanCard[]> {
  const res = await fetch(`/api/projects/${projectId}/shots`, { credentials: 'include' })
  if (!res.ok) return []
  const data = await res.json() as { shots?: ShotPlanCard[] }
  return data.shots ?? []
}

function recipeHasClips(recipe: TimelineRecipe | null | undefined): boolean {
  return Boolean(recipe?.tracks.some((track) => track.clips.length > 0))
}

/** Mount may retag a populated recipe. It may not replace one with an empty recipe. */
export function adoptEditorRecipe(
  recipe: TimelineRecipe | null,
  editorId: string,
  emptyRecipe: TimelineRecipe,
): TimelineRecipe {
  if (!recipeHasClips(recipe) || !recipe) return emptyRecipe
  if (recipe.projectId === editorId) return recipe
  const clips = recipe.tracks.reduce((n, track) => n + track.clips.length, 0)
  console.log('[timeline_adopt]', JSON.stringify({ from: recipe.projectId, to: editorId, clips }))
  return { ...recipe, projectId: editorId }
}

async function waitForPlaybackHydration(): Promise<void> {
  if (usePlaybackStore.persist.hasHydrated()) return
  await new Promise<void>((resolve) => {
    const unsub = usePlaybackStore.persist.onFinishHydration(() => {
      unsub()
      resolve()
    })
  })
}

/**
 * The editor project is the one whose DB shots reconcile onto the timeline.
 * A fresh id is used only when this user has no project and no local clips.
 */
export async function ensureEditorProject(): Promise<{ projectId: string; shots: ShotPlanCard[] }> {
  await waitForPlaybackHydration()
  const state = usePlaybackStore.getState()
  let projectId = state.projectId ?? state.recipe?.projectId ?? null
  let shots = projectId ? await fetchShots(projectId) : []

  const localClips = recipeHasClips(state.recipe) && state.recipe?.projectId === projectId
  if (shots.length === 0 && !localClips) {
    const res = await fetch('/api/projects', { credentials: 'include' })
    if (res.ok) {
      const data = await res.json() as { projects?: { id: string }[] }
      for (const project of (data.projects ?? []).slice(0, 8)) {
        if (project.id === projectId) continue
        const found = await fetchShots(project.id)
        if (found.length > 0) {
          projectId = project.id
          shots = found
          break
        }
      }
    }
  }

  if (!projectId) projectId = nanoid()
  await persistEditorProject(projectId)
  if (state.projectId !== projectId) {
    usePlaybackStore.getState().setProjectId(projectId)
  }
  return { projectId, shots }
}

/** The editor id is a client nanoid until this upsert. Character and shot rows foreign-key to it. */
async function persistEditorProject(projectId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/save`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    const body = await res.json().catch((err) => {
      console.warn("[caught] src/lib/projects/loadProject.ts:100", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (({}))
    }) as { error?: string }
    throw new Error(body.error ?? 'Could not save the project')
  }
}

function recipeForProject(project: ProjectSummary, projectId: string): TimelineRecipe {
  const raw = project.recipe ?? project.timelineJson
  if (isTimelineRecipe(raw)) {
    return { ...raw, projectId }
  }
  return buildDefaultRecipe(projectId)
}

/** Load a saved project into editor stores and notify open editor pages. */
export async function loadProject(projectId: string): Promise<ProjectLoadedDetail> {
  const [project, shots] = await Promise.all([
    fetchProject(projectId),
    fetchShots(projectId),
  ])

  usePlaybackStore.getState().setProjectId(projectId)
  usePlaybackStore.getState().setPlayhead(0)

  const { scriptProjectId, setScriptProjectId, clearScript } = useScriptStore.getState()
  if (scriptProjectId && scriptProjectId !== projectId) {
    clearScript()
  }
  setScriptProjectId(projectId)

  const base = recipeForProject(project, projectId)
  const { recipe } = reconcileTimeline(shots, base)

  usePlaybackStore.getState().setRecipe(recipe)

  const detail: ProjectLoadedDetail = {
    projectId,
    recipe,
    project: { ...project, name: project.name ?? project.title ?? 'Untitled Project' },
    shots,
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PROJECT_LOADED_EVENT, { detail }))
  }

  return detail
}

/** Hydrate timeline from shots for the active project (no project switch). */
export async function hydrateTimelineFromShots(
  projectId: string,
  recipe: TimelineRecipe,
): Promise<TimelineRecipe> {
  const shots = await fetchShots(projectId)
  const { recipe: next } = reconcileTimeline(shots, { ...recipe, projectId })
  usePlaybackStore.getState().setRecipe(next)
  return next
}
