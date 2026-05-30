'use client'

import { useState } from 'react'

interface CameraAngle {
  id:      string
  label:   string
  clipUrl: string
  offset:  number
}

export function MultiCamPanel({ projectId }: { projectId: string }) {
  const [angles, setAngles] = useState<CameraAngle[]>([])
  const [active, setActive] = useState<string | null>(null)

  const syncAngles = async () => {
    const res  = await fetch('/api/multicam/sync', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ projectId }),
    })
    const data = await res.json() as { angles?: CameraAngle[] }
    setAngles(data.angles ?? [])
  }

  const switchAngle = (angleId: string) => {
    setActive(angleId)
    window.dispatchEvent(new CustomEvent('multicam-switch', { detail: { angleId } }))
  }

  return (
    <div className="flex flex-col h-full p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">Multi-Camera</span>
        <button
          onClick={() => void syncAngles()}
          className="text-xs px-2 py-1 bg-[#00e5c8] text-black rounded font-medium"
        >
          Sync angles
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 flex-1">
        {angles.map(angle => (
          <button
            key={angle.id}
            onClick={() => switchAngle(angle.id)}
            className={`relative rounded overflow-hidden border-2 transition ${
              active === angle.id ? 'border-[#00e5c8]' : 'border-transparent'
            }`}
          >
            <video src={angle.clipUrl} className="w-full h-full object-cover" muted />
            <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 px-1 rounded text-white">
              {angle.label}
            </span>
          </button>
        ))}
      </div>

      {angles.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-xs text-center">
          Import clips shot simultaneously,<br />then click &quot;Sync angles&quot;
        </div>
      )}
    </div>
  )
}
