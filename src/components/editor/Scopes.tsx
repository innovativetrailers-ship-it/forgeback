'use client'

import { useEffect, useRef, useState } from 'react'

type ScopeMode = 'waveform' | 'vectorscope' | 'parade'

interface Props {
  videoRef?: React.RefObject<HTMLVideoElement | null>
  mode?:     ScopeMode
}

export function Scopes({ videoRef, mode = 'waveform' }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const [activeMode, setMode] = useState<ScopeMode>(mode)
  const animRef     = useRef<number | null>(null)

  useEffect(() => {
    const canvas  = canvasRef.current
    const video   = videoRef?.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const offscreen = document.createElement('canvas')
    offscreen.width  = 256
    offscreen.height = 256
    const offCtx = offscreen.getContext('2d')
    if (!offCtx) return

    const draw = () => {
      if (video.paused && !video.currentTime) { animRef.current = requestAnimationFrame(draw); return }

      offCtx.drawImage(video, 0, 0, 256, 256)
      const imageData = offCtx.getImageData(0, 0, 256, 256)
      const { data }  = imageData

      const W = canvas.width
      const H = canvas.height

      ctx.fillStyle = '#0d1117'
      ctx.fillRect(0, 0, W, H)

      if (activeMode === 'waveform' || activeMode === 'parade') {
        // Waveform: luminance per column
        const channels = activeMode === 'parade'
          ? [{ label: 'R', color: '#ff4444', offset: 0 }, { label: 'G', color: '#44ff44', offset: W / 3 }, { label: 'B', color: '#4444ff', offset: (W / 3) * 2 }]
          : [{ label: 'Y', color: '#00e5c8', offset: 0 }]

        for (const ch of channels) {
          const colW = activeMode === 'parade' ? W / 3 : W
          ctx.globalAlpha = 0.6
          ctx.fillStyle   = ch.color

          for (let col = 0; col < 256; col++) {
            for (let row = 0; row < 256; row++) {
              const idx = (row * 256 + col) * 4
              let val: number

              if (activeMode === 'parade') {
                val = ch.label === 'R' ? data[idx] : ch.label === 'G' ? data[idx + 1] : data[idx + 2]
              } else {
                val = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114)
              }

              const x = ch.offset + (col / 256) * colW
              const y = H - (val / 255) * H
              ctx.fillRect(x, y, 1, 1)
            }
          }
        }
        ctx.globalAlpha = 1
      }

      if (activeMode === 'vectorscope') {
        // Vectorscope: Cb/Cr chrominance plot
        ctx.strokeStyle = '#333'
        ctx.beginPath()
        ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - 4, 0, Math.PI * 2)
        ctx.stroke()

        // Skin tone line
        ctx.strokeStyle = 'rgba(255, 200, 100, 0.5)'
        ctx.beginPath()
        ctx.moveTo(W / 2, H / 2)
        ctx.lineTo(W / 2 + 40, H / 2 - 20)
        ctx.stroke()

        ctx.globalAlpha = 0.4
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2]
          // YCbCr conversion
          const cb = 128 + (-0.169 * r - 0.331 * g + 0.5 * b)
          const cr = 128 + (0.5 * r - 0.419 * g - 0.081 * b)
          const x  = (cb / 255) * W
          const y  = (1 - cr / 255) * H
          ctx.fillStyle = `rgb(${r},${g},${b})`
          ctx.fillRect(x, y, 1, 1)
        }
        ctx.globalAlpha = 1
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [videoRef, activeMode])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1 px-1">
        {(['waveform', 'parade', 'vectorscope'] as ScopeMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 text-[9px] py-0.5 rounded capitalize ${
              activeMode === m ? 'bg-[#00e5c8] text-black' : 'bg-[#1a1f2e] text-gray-500 hover:text-white'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        width={240}
        height={120}
        className="rounded bg-[#0d1117] border border-[#1a1f2e]"
      />
    </div>
  )
}
