import type { GeneratedClip } from '@/components/simple/types'
import { usePlaybackStore } from '@/store/playbackStore'

interface SimpleClipsState {
  clips: GeneratedClip[]
  setClips: (clips: GeneratedClip[]) => void
  upsertClip: (clip: GeneratedClip) => void
  removeClip: (id: string) => void
  removeFailedClips: () => void
}

function view(state: {
  library: GeneratedClip[]
  upsertLibrary: (clip: GeneratedClip) => void
  removeLibrary: (id: string) => void
  removeFailedLibrary: () => void
}): SimpleClipsState {
  return {
    clips: state.library,
    setClips: (clips) => usePlaybackStore.setState({ library: clips }),
    upsertClip: state.upsertLibrary,
    removeClip: state.removeLibrary,
    removeFailedClips: state.removeFailedLibrary,
  }
}

/** Simple Results is a view of playbackStore.library. Not a second clip store. */
export function useSimpleClipsStore<T>(selector: (state: SimpleClipsState) => T): T {
  return usePlaybackStore((state) => selector(view(state)))
}
