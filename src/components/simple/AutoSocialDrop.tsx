'use client'

import { useState, useCallback } from 'react'

interface Props {
  onFilesDropped: (files: File[]) => void
  accept?:        string
  maxFiles?:      number
  disabled?:      boolean
}

export function AutoSocialDrop({ onFilesDropped, accept = 'image/*,video/*', maxFiles = 30, disabled = false }: Props) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return

    const files = Array.from(e.dataTransfer.files)
      .filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .slice(0, maxFiles)

    if (files.length > 0) onFilesDropped(files)
  }, [disabled, maxFiles, onFilesDropped])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, maxFiles)
    if (files.length > 0) onFilesDropped(files)
    e.target.value = ''
  }

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center gap-3
        border-2 border-dashed rounded-2xl p-10 text-center
        transition-all cursor-pointer select-none
        ${isDragging
          ? 'border-[#00e5c8] bg-[#00e5c8]/5 scale-[1.01]'
          : 'border-[#2a3040] hover:border-[#00e5c8]/50 hover:bg-[#00e5c8]/2'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
      `}
    >
      <input
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        onChange={handleFileInput}
        disabled={disabled}
      />
      <div className="text-4xl">{isDragging ? '🎬' : '📁'}</div>
      <div>
        <p className="text-sm font-semibold text-white">
          {isDragging ? 'Drop to add media' : 'Drop photos & videos here'}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Up to {maxFiles} files · click to browse
        </p>
      </div>
    </label>
  )
}
