'use client'

import {
  MousePointer2, Scissors, Paintbrush2, Type, Wind,
  Hand, ZoomIn, ZoomOut, Undo2, Redo2,
} from 'lucide-react'
import { useUIStore, type ToolId } from '@/store/ui'
import { useEditorStore } from '@/store/editor'
import { RoughCutButton } from '@/components/editor/RoughCutButton'
import { usePlaybackStore } from '@/store/playbackStore'

const TOOLS: Array<{ id: ToolId; icon: React.ReactNode; label: string; shortcut: string }> = [
  { id: 'select',       icon: <MousePointer2 size={14} />, label: 'Select',       shortcut: 'V' },
  { id: 'razor',        icon: <Scissors size={14} />,      label: 'Razor',        shortcut: 'C' },
  { id: 'repaint',      icon: <Paintbrush2 size={14} />,   label: 'Repaint',      shortcut: 'R' },
  { id: 'text',         icon: <Type size={14} />,          label: 'Text',         shortcut: 'T' },
  { id: 'motion_brush', icon: <Wind size={14} />,          label: 'Motion Brush', shortcut: 'M' },
  { id: 'hand',         icon: <Hand size={14} />,          label: 'Hand',         shortcut: 'H' },
  { id: 'zoom',         icon: <ZoomIn size={14} />,        label: 'Zoom',         shortcut: 'Z' },
]

export function EditToolbar() {
  const { activeTool, setActiveTool } = useUIStore()
  const { zoomLevel, setZoomLevel, addTrack } = useEditorStore()

  return (
    <div className="flex items-center gap-0.5 h-8 border-b border-[#1a1f2e] px-2 shrink-0">
      {/* Tool buttons */}
      {TOOLS.map(({ id, icon, label, shortcut }) => (
        <button
          key={id}
          onClick={() => setActiveTool(id)}
          title={`${label} (${shortcut})`}
          className={`w-7 h-6 rounded flex items-center justify-center transition ${
            activeTool === id
              ? 'bg-[#00e5c8]/20 text-[#00e5c8]'
              : 'text-[var(--text-tertiary)] hover:text-white hover:bg-white/5'
          }`}
        >
          {icon}
        </button>
      ))}

      <div className="mx-1.5 w-px h-4 bg-[#1a1f2e]" />

      {/* Undo / Redo */}
      <button
        onClick={() => usePlaybackStore.getState().undo()}
        title="Undo (Cmd+Z)"
        className="w-7 h-6 rounded flex items-center justify-center text-[var(--text-tertiary)] hover:text-white hover:bg-white/5"
      >
        <Undo2 size={13} />
      </button>
      <button
        onClick={() => usePlaybackStore.getState().redo()}
        title="Redo (Cmd+Shift+Z)"
        className="w-7 h-6 rounded flex items-center justify-center text-[var(--text-tertiary)] hover:text-white hover:bg-white/5"
      >
        <Redo2 size={13} />
      </button>

      <div className="mx-1.5 w-px h-4 bg-[#1a1f2e]" />

      {/* Zoom */}
      <button
        onClick={() => setZoomLevel(Math.min(500, zoomLevel * 1.25))}
        title="Zoom in (+)"
        className="w-7 h-6 rounded flex items-center justify-center text-[var(--text-tertiary)] hover:text-white hover:bg-white/5"
      >
        <ZoomIn size={13} />
      </button>
      <span className="text-[10px] text-[var(--text-tertiary)] w-9 text-center font-mono">
        {Math.round(zoomLevel)}%
      </span>
      <button
        onClick={() => setZoomLevel(Math.max(20, zoomLevel * 0.8))}
        title="Zoom out (-)"
        className="w-7 h-6 rounded flex items-center justify-center text-[var(--text-tertiary)] hover:text-white hover:bg-white/5"
      >
        <ZoomOut size={13} />
      </button>

      {/* Add Track + AI Rough Cut — push to far right */}
      <div className="ml-auto flex items-center gap-1.5">
        <RoughCutButton />
        <div className="w-px h-4 bg-[#1a1f2e]" />
        <button
          onClick={() => addTrack('video')}
          className="text-[10px] px-2 py-1 text-[var(--text-tertiary)] hover:text-white hover:bg-white/5 rounded"
        >
          + Video
        </button>
        <button
          onClick={() => addTrack('audio')}
          className="text-[10px] px-2 py-1 text-[var(--text-tertiary)] hover:text-white hover:bg-white/5 rounded"
        >
          + Audio
        </button>
      </div>
    </div>
  )
}
