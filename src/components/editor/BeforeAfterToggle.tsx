'use client'

import { useState, useCallback } from 'react'

interface Props {
  clipId?: string
}

export function BeforeAfterToggle({ clipId }: Props) {
  const [showOriginal, setShowOriginal] = useState(false)

  const toggle = useCallback(() => {
    const next = !showOriginal
    setShowOriginal(next)

    // Apply/remove grade bypass on the preview video element
    const selector = clipId
      ? `video[data-clip-id="${clipId}"]`
      : 'video[data-preview-video]'
    const video = document.querySelector<HTMLVideoElement>(selector)

    if (video) {
      if (next) {
        video.setAttribute('data-grade-bypass', 'true')
        video.style.filter = 'none'
      } else {
        video.removeAttribute('data-grade-bypass')
        video.style.filter = ''
      }
    }
  }, [showOriginal, clipId])

  return (
    <div className="flex rounded-md overflow-hidden border border-white/10 h-6">
      <button
        onClick={() => { if (showOriginal) toggle() }}
        className={`px-2 text-[9px] font-medium transition flex-1 ${
          !showOriginal
            ? 'bg-[#00e5c8] text-black'
            : 'bg-transparent text-white/40 hover:text-white/60'
        }`}
      >
        Graded
      </button>
      <button
        onClick={() => { if (!showOriginal) toggle() }}
        className={`px-2 text-[9px] font-medium transition flex-1 ${
          showOriginal
            ? 'bg-white/20 text-white'
            : 'bg-transparent text-white/40 hover:text-white/60'
        }`}
      >
        Original
      </button>
    </div>
  )
}
