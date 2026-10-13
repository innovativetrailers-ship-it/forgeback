import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { appendTimelineClipToPlayback, type TimelineClipInput } from '@/lib/timeline/syncToPlayback'
import type { GeneratedClip } from '@/components/simple/types'
import type { TimelineRecipe } from '@/lib/timeline/schema'

const HISTORY_LIMIT = 50

function recipeWithoutClip(recipe: TimelineRecipe, clipId: string): TimelineRecipe {
  return {
    ...recipe,
    tracks: recipe.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => {
        const meta = clip.metadata as { shotPlanId?: string } | undefined
        return clip.id !== clipId && meta?.shotPlanId !== clipId
      }),
    })),
  }
}

interface PlaybackState {
  recipe:        TimelineRecipe | null
  library:       GeneratedClip[]
  suppressedShotIds: string[]
  past:          TimelineRecipe[]
  future:        TimelineRecipe[]
  playheadTime:  number
  projectId:     string | null
  lastRecipeOrigin: 'local' | 'collab'
  setRecipe:     (recipe: TimelineRecipe, origin?: 'local' | 'collab') => void
  commitRecipe:  (recipe: TimelineRecipe) => void
  undo:          () => void
  redo:          () => void
  setPlayhead:   (sec: number) => void
  setProjectId:  (id: string) => void
  /** Sole timeline writer for Simple "+ Timeline". Requires sourceUrl. */
  addClip:       (clip: TimelineClipInput) => void
  removeTimelineClip: (clipId: string, recordHistory?: boolean) => void
  upsertLibrary: (clip: GeneratedClip) => void
  removeLibrary: (id: string) => void
  removeFailedLibrary: () => void
  suppressShot:  (id: string) => void
}

export const usePlaybackStore = create<PlaybackState>()(
  persist(
    (set, get) => ({
      recipe:       null,
      library:      [],
      suppressedShotIds: [],
      past:         [],
      future:       [],
      playheadTime: 0,
      projectId:    null,
      lastRecipeOrigin: 'local',
      setRecipe:    (recipe, origin = 'local') => {
        const current = get().recipe
        if (current === recipe) return
        if (current && JSON.stringify(current) === JSON.stringify(recipe) && get().lastRecipeOrigin === origin) return
        set({ recipe, lastRecipeOrigin: origin })
      },
      commitRecipe: (recipe) => {
        const { recipe: current, past } = get()
        if (current === recipe) return
        if (current && JSON.stringify(current) === JSON.stringify(recipe)) return
        const nextPast = current ? [...past, current].slice(-HISTORY_LIMIT) : past
        set({ past: nextPast, future: [], recipe, lastRecipeOrigin: 'local' })
      },
      undo: () => {
        const { past, future, recipe } = get()
        if (!recipe || past.length === 0) return
        const previous = past[past.length - 1]
        set({
          past: past.slice(0, -1),
          future: [...future, recipe].slice(-HISTORY_LIMIT),
          recipe: previous,
          lastRecipeOrigin: 'local',
        })
      },
      redo: () => {
        const { past, future, recipe } = get()
        if (!recipe || future.length === 0) return
        const next = future[future.length - 1]
        set({
          future: future.slice(0, -1),
          past: [...past, recipe].slice(-HISTORY_LIMIT),
          recipe: next,
          lastRecipeOrigin: 'local',
        })
      },
      setPlayhead:  (playheadTime) => set({ playheadTime }),
      setProjectId: (projectId) => set({ projectId }),
      addClip:      (clip) => {
        const { recipe: before } = get()
        appendTimelineClipToPlayback(clip)
        const { recipe: after, past } = get()
        if (before && after && before !== after) {
          set({ past: [...past, before].slice(-HISTORY_LIMIT), future: [] })
        }
      },
      removeTimelineClip: (clipId, recordHistory = true) => {
        const { recipe } = get()
        if (!recipe) return
        const next = recipeWithoutClip(recipe, clipId)
        if (recordHistory) get().commitRecipe(next)
        else set({ recipe: next, lastRecipeOrigin: 'local' })
      },
      upsertLibrary: (clip) => set((state) => {
        const idx = state.library.findIndex((row) => row.id === clip.id || (clip.jobId && row.jobId === clip.jobId))
        if (idx >= 0) {
          const library = [...state.library]
          library[idx] = { ...library[idx], ...clip }
          return { library }
        }
        return { library: [clip, ...state.library] }
      }),
      removeLibrary: (id) => set((state) => ({
        library: state.library.filter((row) => row.id !== id && row.jobId !== id),
      })),
      removeFailedLibrary: () => set((state) => ({
        library: state.library.filter((row) => row.status !== 'failed'),
      })),
      suppressShot: (id) => set((state) => ({
        suppressedShotIds: state.suppressedShotIds.includes(id)
          ? state.suppressedShotIds
          : [...state.suppressedShotIds, id],
      })),
    }),
    {
      name: 'cinema-playback-state',
      partialize: (state) => ({
        recipe:       state.recipe,
        library:      state.library,
        suppressedShotIds: state.suppressedShotIds,
        playheadTime: state.playheadTime,
        projectId:    state.projectId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.library = state.library.map((clip) => ({
          ...clip,
          createdAt: clip.createdAt instanceof Date ? clip.createdAt : new Date(clip.createdAt),
        }))
        if (state.library.length > 0 || typeof localStorage === 'undefined') return
        try {
          const raw = localStorage.getItem('cinema-simple-clips')
          if (!raw) return
          const parsed = JSON.parse(raw) as { state?: { clips?: GeneratedClip[] } }
          const clips = parsed.state?.clips
          if (!Array.isArray(clips) || clips.length === 0) return
          state.library = clips.map((clip) => ({
            ...clip,
            createdAt: clip.createdAt instanceof Date ? clip.createdAt : new Date(clip.createdAt),
          }))
        } catch (err) {
          console.warn("[caught] src/store/playbackStore.ts:149", err instanceof Error ? { name: err.name, message: err.message } : err)

          // legacy gallery persist is optional
        }
      },
    },
  ),
)
