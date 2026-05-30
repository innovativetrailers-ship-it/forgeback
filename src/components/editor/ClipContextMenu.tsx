'use client'

import { useUIStore } from '@/store/ui'
import { useEditorStore } from '@/store/editor'
import { cn } from '@/lib/utils'

interface MenuItem {
  label?:    string
  icon?:     string
  action?:   string
  separator?: boolean
  danger?:   boolean
}

const CLIP_CONTEXT_ITEMS: MenuItem[] = [
  { label: 'Repaint segment',       action: 'open_repaint' },
  { label: 'Clip Extend →',         action: 'open_extend' },
  { label: 'Retime clip',           action: 'open_retime' },
  { label: 'Stabilise',             action: 'open_stabilise' },
  { label: 'Upscale',               action: 'open_upscale' },
  { label: 'Remove object...',      action: 'open_object_removal' },
  { label: 'Recast character',      action: 'open_recast' },
  { label: 'Apply SFX makeup',      action: 'open_makeup' },
  { label: 'Duplicate clip',        action: 'duplicate_clip' },
  { label: 'Detach audio',          action: 'detach_audio' },
  { label: 'Add shoppable tag',     action: 'add_shoppable_tag' },
  { separator: true },
  { label: 'Download clip',         action: 'download_clip' },
  { label: 'Copy grade to all',     action: 'copy_grade' },
  { label: 'Remove from timeline',  action: 'remove_clip', danger: true },
]

interface Props {
  clipId:  string
  x:       number
  y:       number
  onClose: () => void
}

export function ClipContextMenu({ clipId, x, y, onClose }: Props) {
  const { setActiveRightPanel } = useUIStore()
  const { openRepaintModal, removeClip } = useEditorStore()

  const handleAction = (action: string) => {
    onClose()
    switch (action) {
      case 'open_repaint':
        openRepaintModal({ clipId, startSeconds: 0, endSeconds: 1 })
        break
      case 'open_extend':
      case 'open_retime':
        setActiveRightPanel('retime')
        break
      case 'open_stabilise':
        setActiveRightPanel('stabilise')
        break
      case 'open_upscale':
        setActiveRightPanel('upscale')
        break
      case 'open_object_removal':
        setActiveRightPanel('object_removal')
        break
      case 'open_recast':
        setActiveRightPanel('makeup')
        break
      case 'open_makeup':
        setActiveRightPanel('makeup')
        break
      case 'duplicate_clip':
        window.dispatchEvent(new CustomEvent('duplicate-clip', { detail: { clipId } }))
        break
      case 'detach_audio':
        window.dispatchEvent(new CustomEvent('detach-audio', { detail: { clipId } }))
        break
      case 'add_shoppable_tag':
        setActiveRightPanel('shoppable')
        break
      case 'download_clip':
        window.dispatchEvent(new CustomEvent('download-clip', { detail: { clipId } }))
        break
      case 'copy_grade':
        window.dispatchEvent(new CustomEvent('copy-grade', { detail: { clipId } }))
        break
      case 'remove_clip':
        removeClip(clipId)
        break
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Menu */}
      <div
        className="fixed z-50 min-w-[180px] bg-[#0d1117] border border-[#2a3040] rounded-lg shadow-2xl py-1 text-sm"
        style={{ top: y, left: x }}
      >
        {CLIP_CONTEXT_ITEMS.map((item, i) => {
          if (item.separator) {
            return <div key={i} className="my-1 border-t border-[#2a3040]" />
          }
          return (
            <button
              key={i}
              onClick={() => item.action && handleAction(item.action)}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs transition hover:bg-[#1a2030]',
                item.danger ? 'text-red-400 hover:text-red-300' : 'text-gray-200'
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </>
  )
}
