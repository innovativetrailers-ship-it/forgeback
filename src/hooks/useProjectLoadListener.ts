'use client'

import { useEffect } from 'react'
import { PROJECT_LOADED_EVENT, type ProjectLoadedDetail } from '@/lib/projects/loadProject'

export function useProjectLoadListener(
  onLoad: (detail: ProjectLoadedDetail) => void,
): void {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ProjectLoadedDetail>).detail
      if (detail?.projectId && detail.recipe) onLoad(detail)
    }
    window.addEventListener(PROJECT_LOADED_EVENT, handler)
    return () => window.removeEventListener(PROJECT_LOADED_EVENT, handler)
  }, [onLoad])
}
