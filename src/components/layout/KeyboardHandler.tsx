'use client'

import { useEffect, useCallback } from 'react'
import { useEditorStore } from '@/store/editor'
import { toEditorTimelineRecipe, useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'
import { usePlaybackStore } from '@/store/playbackStore'
import { useUIStore } from '@/store/ui'

async function saveProject() {
  const stored = usePlaybackStore.getState().recipe
  const recipe = stored ? toEditorTimelineRecipe(stored) : null
  if (!recipe) return
  try {
    await fetch(`/api/projects/${recipe.projectId}/save`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe }),
    })
  } catch (err) {
    console.warn("[caught] src/components/layout/KeyboardHandler.tsx:20", err instanceof Error ? { name: err.name, message: err.message } : err)

    // non-fatal
  }
}

/**
 * Global keyboard handler — mount ONCE in the editor layout.
 * Renders nothing; only registers/removes a keydown listener.
 */
export function KeyboardHandler() {
  const { setActiveTool, togglePanel, activePanel } = useUIStore()
  const {
    selectedClipId, playheadTime, isPlaying,
    setIsPlaying, setPlayheadTime, splitClip, removeClip, openRepaintModal,
  } = useEditorStore()
  const recipe = useEditorRecipeView()

  const totalDuration = recipe?.totalDuration ?? 0
  const fps = recipe?.fps ?? 24

  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      const frameDuration = 1 / fps
      setIsPlaying(false)
      setPlayheadTime(Math.max(0, Math.min(totalDuration, playheadTime + frameDuration * direction)))
    },
    [playheadTime, fps, totalDuration, setIsPlaying, setPlayheadTime]
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      const cmd = e.metaKey || e.ctrlKey
      const noPanelOpen = !activePanel

      switch (e.key) {
        // ── Tool shortcuts ─────────────────────────────────────────────────
        case 'v': case 'V':
          setActiveTool('select')
          break
        case 'c': case 'C':
          if (!cmd) setActiveTool('razor')
          break
        case 'r': case 'R': {
          setActiveTool('repaint')
          if (selectedClipId) {
            const clip = recipe?.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId)
            if (clip) openRepaintModal({ clipId: clip.id, startSeconds: clip.startTime, endSeconds: clip.startTime + clip.duration })
          }
          break
        }
        case 't': case 'T': setActiveTool('text'); break
        case 'h': case 'H': setActiveTool('hand'); break
        case 'z': case 'Z':
          if (!cmd) setActiveTool('zoom')
          break

        // ── Motion brush (M) — no conflict when no panel open ─────────────
        case 'm': case 'M':
          setActiveTool('motion_brush')
          break

        // ── Playback ───────────────────────────────────────────────────────
        case ' ':
          e.preventDefault()
          setIsPlaying(!isPlaying)
          break
        case 'ArrowLeft':
          e.preventDefault()
          setPlayheadTime(Math.max(0, playheadTime - (e.shiftKey ? 1 : 0.1)))
          break
        case 'ArrowRight':
          e.preventDefault()
          setPlayheadTime(Math.min(totalDuration, playheadTime + (e.shiftKey ? 1 : 0.1)))
          break

        // ── Preview: frame stepping (J/L — industry JKL, only when no panel) ──
        case 'j': case 'J':
          if (noPanelOpen) { e.preventDefault(); stepFrame(-1) }
          break
        case 'l': case 'L':
          // L = library panel when panel is open context; step frame when closed
          if (noPanelOpen) { e.preventDefault(); stepFrame(1) }
          else togglePanel('library')
          break

        // ── Preview: go to start / end ────────────────────────────────────
        case 'Home':
          e.preventDefault()
          setIsPlaying(false)
          setPlayheadTime(0)
          break
        case 'End':
          e.preventDefault()
          setIsPlaying(false)
          setPlayheadTime(totalDuration)
          break

        // ── Preview: fullscreen ────────────────────────────────────────────
        case 'f': case 'F':
          if (!cmd) {
            e.preventDefault()
            document.querySelector<HTMLButtonElement>('[title="Fullscreen (F)"]')?.click()
          }
          break

        // ── Clip editing ───────────────────────────────────────────────────
        case 'Backspace': case 'Delete':
          if (selectedClipId) removeClip(selectedClipId)
          break
        case 's': case 'S':
          if (cmd) { e.preventDefault(); void saveProject() }
          else if (selectedClipId) splitClip(selectedClipId, playheadTime)
          break

        // ── Panel shortcuts ────────────────────────────────────────────────
        case 'g': case 'G': togglePanel('generate'); break
        case 'u': case 'U': togglePanel('vault'); break

        default: break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    selectedClipId, playheadTime, isPlaying, recipe, activePanel,
    totalDuration, stepFrame,
    setActiveTool, togglePanel, setIsPlaying, setPlayheadTime,
    splitClip, removeClip, openRepaintModal,
  ])

  return null
}
