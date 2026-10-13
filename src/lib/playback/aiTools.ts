// Client-side helpers for the interactive player. The browser only captures the
// current frame + selection mask as base64 and posts them to /api/clips/ai-edit,
// which runs the FAL models server-side. The FAL key is never exposed here.

import type { SelectionMask, MaskOperation, RelightParams } from './interactiveTypes'

interface CapturedFrame {
  frameB64: string
  maskB64?: string
}

// Capture the current video frame (and an optional fill mask from the selection).
export function captureFrame(video: HTMLVideoElement, mask?: SelectionMask): CapturedFrame {
  const W = video.videoWidth, H = video.videoHeight
  const fc = document.createElement('canvas')
  fc.width = W
  fc.height = H
  const ctx = fc.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.drawImage(video, 0, 0, W, H)
  const frameB64 = fc.toDataURL('image/jpeg', 0.95).split(',')[1]

  let maskB64: string | undefined
  if (mask && mask.points.length > 2) {
    const mc = document.createElement('canvas')
    mc.width = W
    mc.height = H
    const mctx = mc.getContext('2d')
    if (mctx) {
      mctx.fillStyle = '#000000'
      mctx.fillRect(0, 0, W, H)
      mctx.fillStyle = '#ffffff'
      mctx.beginPath()
      mask.points.forEach((p, i) =>
        i === 0 ? mctx.moveTo(p.x * W, p.y * H) : mctx.lineTo(p.x * W, p.y * H),
      )
      mctx.closePath()
      mctx.fill()
      maskB64 = mc.toDataURL('image/png').split(',')[1]
    }
  }

  return { frameB64, maskB64 }
}

interface EditRequest {
  operation: MaskOperation
  mask?:     SelectionMask
  prompt?:   string
  relight?:  RelightParams
}

async function postEdit(video: HTMLVideoElement, req: EditRequest): Promise<string> {
  const { frameB64, maskB64 } = captureFrame(video, req.mask)
  const res = await fetch('/api/clips/ai-edit', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      frameB64,
      maskB64,
      operation: req.operation,
      prompt: req.prompt,
      relight: req.relight
        ? { intensity: req.relight.intensity, colorTemp: req.relight.colorTemp, direction: req.relight.direction }
        : undefined,
    }),
  })
  const data = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !data.url) throw new Error(data.error ?? 'AI edit failed')
  return data.url
}

export const removeObject = (video: HTMLVideoElement, mask: SelectionMask) =>
  postEdit(video, { operation: 'remove', mask })

export const fillWithPrompt = (video: HTMLVideoElement, mask: SelectionMask, prompt: string) =>
  postEdit(video, { operation: 'fill_ai', mask, prompt })

export const correctDefects = (video: HTMLVideoElement, mask: SelectionMask) =>
  postEdit(video, { operation: 'correct', mask })

export const relightFrame = (video: HTMLVideoElement, relight: RelightParams) =>
  postEdit(video, { operation: 'relight_mask', relight })

export const addGoreEffect = (
  video: HTMLVideoElement,
  mask: SelectionMask,
  effectType: string,
  intensity: 'light' | 'medium' | 'heavy',
) => postEdit(video, { operation: 'add_gore', mask, prompt: `${effectType}, ${intensity} severity` })
