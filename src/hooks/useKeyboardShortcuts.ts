import { useEffect } from 'react'
import { useUIStore } from '@/store/ui'

interface KeyboardShortcut {
  key:    string
  meta:   boolean
  shift:  boolean
  action: string
  label:  string
}

const SHORTCUTS: KeyboardShortcut[] = [
  // Tools
  { key: 'r', meta: false, shift: false, action: 'tool_retime',         label: 'Retime tool' },
  { key: 'v', meta: false, shift: true,  action: 'tool_stabilise',      label: 'Stabilise tool' },
  { key: 'n', meta: false, shift: true,  action: 'tool_morph_cut',      label: 'Morph Cut tool' },

  // Panels
  { key: 'e', meta: false, shift: true,  action: 'open_emotion_lattice', label: 'Emotion Guide' },
  { key: 'o', meta: true,  shift: true,  action: 'open_object_removal',  label: 'Object Removal' },
  { key: 't', meta: true,  shift: true,  action: 'toggle_transcript',    label: 'Toggle transcript' },

  // AI actions
  { key: 'f', meta: true,  shift: false, action: 'remove_fillers',       label: 'Remove filler words' },
  { key: 'u', meta: true,  shift: false, action: 'remove_silence',       label: 'Remove silence' },
  { key: 'p', meta: true,  shift: true,  action: 'publish_social',       label: 'Publish to social' },
]

export function useKeyboardShortcuts() {
  const { setActiveTool, setActiveRightPanel, togglePanel } = useUIStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta  = e.metaKey || e.ctrlKey
      const isShift = e.shiftKey
      const key     = e.key.toLowerCase()

      const match = SHORTCUTS.find(
        s => s.key === key && s.meta === isMeta && s.shift === isShift
      )
      if (!match) return

      // Don't fire while user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      e.preventDefault()

      switch (match.action) {
        case 'tool_retime':
          setActiveTool('retime')
          break
        case 'tool_stabilise':
          setActiveTool('stabilise')
          break
        case 'tool_morph_cut':
          setActiveTool('morph_cut')
          break
        case 'open_emotion_lattice':
          setActiveRightPanel('emotion')
          break
        case 'open_object_removal':
          setActiveRightPanel('object_removal')
          break
        case 'toggle_transcript':
          togglePanel('transcript')
          break
        case 'remove_fillers':
        case 'remove_silence':
        case 'publish_social':
          window.dispatchEvent(new CustomEvent(match.action.replace(/_/g, '-')))
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveTool, setActiveRightPanel, togglePanel])
}

export { SHORTCUTS }
