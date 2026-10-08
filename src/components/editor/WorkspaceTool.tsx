'use client'

import dynamic from 'next/dynamic'
import { useUIStore } from '@/store/ui'
import { useEditorStore } from '@/store/editor'
import { RightPanel } from '@/components/layout/RightPanel'
import { SFXMakeupPanel } from '@/components/panels/SFXMakeupPanel'
import { GreenScreenPanel } from '@/components/panels/GreenScreenPanel'
import { LocationPanel } from '@/components/panels/LocationPanel'
import { ClipCommentsPanel } from '@/components/editor/ClipCommentsPanel'
import MotionBrush from '@/components/editor/MotionBrush'

const NodeCompositor = dynamic(() => import('@/components/studio/NodeCompositor'), { ssr: false })

export function WorkspaceTool({ workspace }: { workspace: string }) {
  const lookDev = useUIStore((state) => state.lookDev)
  const selected = useEditorStore((state) => state.selectedClipId)
  const needsClip = workspace === 'Colour' || workspace === 'Audio' || workspace === 'Motion'
  if (needsClip && !selected) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-white/70">
        Select a clip in the mini-strip. This workspace grades or edits that same clip.
      </div>
    )
  }
  if (workspace === 'Colour') return <RightPanel initialTab="colour" fill />
  if (workspace === 'Audio') return <RightPanel initialTab="audio" fill />
  if (workspace === 'Compositor' || workspace === 'VFX') return <div className="h-full min-h-0 overflow-auto"><NodeCompositor /></div>
  if (workspace === 'Motion') {
    return (
      <div className="flex h-full flex-col gap-2 overflow-auto p-3 text-[11px] text-white/70">
        <p>Camera-angle adjust is disabled. No novel-view model is in the registry.</p>
        <p>Motion brush preview stays on this canvas. Apply is off because that route is not the guarded submit.</p>
        <MotionBrush width={640} height={360} onRegionsChange={() => undefined} />
      </div>
    )
  }
  if (workspace === 'Look-dev') {
    if (lookDev === 'greenscreen') return <GreenScreenPanel />
    if (lookDev === 'location') return <LocationPanel />
    return <SFXMakeupPanel />
  }
  if (workspace === 'Review') return <div className="h-full overflow-auto"><ClipCommentsPanel /></div>
  return null
}
