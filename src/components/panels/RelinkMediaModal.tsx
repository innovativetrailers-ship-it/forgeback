'use client'
import { useState } from 'react'

interface RelinkMediaModalProps {
  offlineMedia: string[]
  onRelinked: (relinks: Record<string, string>) => void
  onClose: () => void
}

export function RelinkMediaModal({ offlineMedia, onRelinked, onClose }: RelinkMediaModalProps) {
  const [relinks, setRelinks] = useState<Record<string, string>>({})
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  const handleFileUpload = (offlinePath: string, file: File) => {
    setUploadProgress((p) => ({ ...p, [offlinePath]: 0 }))

    const form = new FormData()
    form.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress((p) => ({
          ...p,
          [offlinePath]: Math.round((e.loaded / e.total) * 100),
        }))
      }
    }
    xhr.onload = () => {
      try {
        const { url } = JSON.parse(xhr.responseText) as { url: string }
        setRelinks((r) => ({ ...r, [offlinePath]: url }))
        setUploadProgress((p) => ({ ...p, [offlinePath]: 100 }))
      } catch (err) {
        console.warn("[caught] src/components/panels/RelinkMediaModal.tsx:34", err instanceof Error ? { name: err.name, message: err.message } : err)

        setUploadProgress((p) => ({ ...p, [offlinePath]: -1 }))
      }
    }
    xhr.onerror = () => setUploadProgress((p) => ({ ...p, [offlinePath]: -1 }))
    xhr.open('POST', '/api/upload/media')
    xhr.send(form)
  }

  const linkedCount = Object.keys(relinks).length

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-[#151b24] border border-[#1a2030] rounded-xl w-[600px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[#1a2030]">
          <div>
            <h3 className="text-white font-semibold">Re-link Offline Media</h3>
            <p className="text-gray-400 text-xs mt-0.5">
              {offlineMedia.length} file{offlineMedia.length !== 1 ? 's' : ''} could not be
              found. Upload them to continue.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {offlineMedia.map((filePath) => {
            const filename = filePath.split('/').pop() ?? filePath
            const isLinked = !!relinks[filePath]
            const progress = uploadProgress[filePath]
            const failed = progress === -1

            return (
              <div
                key={filePath}
                className={`p-3 rounded-lg border flex items-center gap-3 ${
                  isLinked
                    ? 'border-[#00e5c8]/30 bg-[#00e5c8]/5'
                    : failed
                    ? 'border-red-500/30 bg-red-500/5'
                    : 'border-[#2a3040] bg-[#0d1117]'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isLinked ? 'bg-[#00e5c8]' : failed ? 'bg-red-500' : 'bg-red-400'
                  }`}
                />

                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm truncate">{filename}</div>
                  <div className="text-gray-500 text-xs truncate">{filePath}</div>
                  {progress !== undefined && progress >= 0 && progress < 100 && (
                    <div className="mt-1.5 h-0.5 bg-[#1a2030] rounded overflow-hidden">
                      <div
                        className="h-full bg-[#00e5c8] rounded transition-all duration-150"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                  {failed && (
                    <div className="text-red-400 text-xs mt-0.5">Upload failed — try again</div>
                  )}
                </div>

                {isLinked ? (
                  <span className="text-[#00e5c8] text-xs flex-shrink-0">✓ Linked</span>
                ) : (
                  <label className="px-3 py-1.5 text-xs rounded border border-[#2a3040] text-gray-300 hover:border-[#00e5c8] hover:text-white cursor-pointer flex-shrink-0 transition">
                    Upload
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFileUpload(filePath, file)
                      }}
                    />
                  </label>
                )}
              </div>
            )
          })}
        </div>

        <div className="p-4 border-t border-[#1a2030] flex justify-between items-center">
          <span className="text-xs text-gray-400">
            {linkedCount} / {offlineMedia.length} re-linked
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
            >
              Skip for now
            </button>
            <button
              onClick={() => onRelinked(relinks)}
              disabled={linkedCount === 0}
              className="px-4 py-2 text-sm bg-[#00e5c8] text-black font-semibold rounded-lg disabled:opacity-40 hover:bg-[#00e5c8]/90 transition"
            >
              Apply Re-links
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
