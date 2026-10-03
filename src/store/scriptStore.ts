import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ScriptScene } from '@/components/ultimate/ScriptEditor'
import type { StoryboardShot } from '@/components/ultimate/StoryboardViewer'

interface ScriptStore {
  scriptContent: string
  scriptProjectId: string | null
  parsedScenes:  ScriptScene[]
  parsedShots:   StoryboardShot[]
  isParsing:     boolean
  lastParsedAt:  number | null
  hasHydrated:   boolean
  lastScriptOrigin: 'local' | 'collab'
  setScript:     (content: string, origin?: 'local' | 'collab') => void
  setScriptProjectId: (projectId: string) => void
  invalidateBreakdown: () => void
  setParsed:     (scenes: ScriptScene[], shots?: StoryboardShot[]) => void
  setShots:      (shots: StoryboardShot[]) => void
  setIsParsing:  (v: boolean) => void
  setHasHydrated: (v: boolean) => void
  clearScript:   () => void
}

export const useScriptStore = create<ScriptStore>()(
  persist(
    (set) => ({
      scriptContent: '',
      scriptProjectId: null,
      parsedScenes:  [],
      parsedShots:   [],
      isParsing:     false,
      lastParsedAt:  null,
      hasHydrated:   false,
      lastScriptOrigin: 'local',
      setScript: (scriptContent, origin = 'local') =>
        set((state) => {
          if (state.scriptContent === scriptContent) {
            return { scriptContent, lastScriptOrigin: origin }
          }
          return {
            scriptContent,
            lastScriptOrigin: origin,
            parsedScenes: origin === 'collab' ? state.parsedScenes : [],
            parsedShots: origin === 'collab' ? state.parsedShots : [],
            lastParsedAt: origin === 'collab' ? state.lastParsedAt : null,
          }
        }),
      setScriptProjectId: (scriptProjectId) => set({ scriptProjectId }),
      invalidateBreakdown: () =>
        set({ parsedScenes: [], parsedShots: [], lastParsedAt: null }),
      setParsed:     (parsedScenes, parsedShots) =>
        set({
          parsedScenes,
          parsedShots:  parsedShots ?? [],
          lastParsedAt: Date.now(),
        }),
      setShots:      (parsedShots) => set({ parsedShots }),
      setIsParsing:  (isParsing) => set({ isParsing }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      clearScript: () =>
        set({
          scriptContent: '',
          parsedScenes: [],
          parsedShots: [],
          lastParsedAt: null,
        }),
    }),
    {
      name: 'cinema-script-state',
      partialize: (state) => ({
        scriptContent: state.scriptContent,
        scriptProjectId: state.scriptProjectId,
        parsedScenes:  state.parsedScenes,
        parsedShots:   state.parsedShots,
        lastParsedAt:  state.lastParsedAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
