import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { KeyboardHandler } from '@/components/layout/KeyboardHandler'
import { CreditPurchaseModal } from '@/components/layout/CreditPurchaseModal'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { CollabOverlay } from '@/components/editor/CollabOverlay'

export const metadata: Metadata = {
  title: 'Cinematic Forge — Editor',
  robots: { index: false },
}

export default function EditorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-base)]">
      <div className="flex flex-col flex-1 overflow-hidden">
        {children}
      </div>
      {/* Global overlays — shown/hidden by Zustand state */}
      <CreditPurchaseModal />
      <ContextMenu />
      {/* Global keyboard handler — no UI rendered */}
      <KeyboardHandler />
      {/* Real-time presence indicators + conflict notifications */}
      <CollabOverlay />
    </div>
  )
}
