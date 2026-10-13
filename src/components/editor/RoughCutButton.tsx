'use client'

import { useState, lazy, Suspense } from 'react'

const RoughCutDialog = lazy(() =>
  import('./RoughCutDialog').then((m) => ({ default: m.RoughCutDialog })),
)

export function RoughCutButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="AI Rough Cut Copilot"
        className="flex items-center gap-1.5 rounded-md border border-white/10 bg-[#1a1f2e] px-2.5 py-1 text-[10px] font-medium text-white/60 transition hover:border-[#00e5c8]/40 hover:text-[#00e5c8]"
      >
        <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
        Rough Cut
      </button>

      {open && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00e5c8]/30 border-t-[#00e5c8]" />
          </div>
        }>
          <RoughCutDialog open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
