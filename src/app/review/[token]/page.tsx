'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface ReviewComment {
  id: string
  authorName: string
  timecode: number
  text: string
  resolved: boolean
  createdAt: string
}

interface ApprovalStep {
  role: string
  status: 'pending' | 'approved' | 'changes-requested'
  note?: string
}

interface ReviewData {
  title: string
  status: string
  allowDownload: boolean
  videoUrl: string | null
  watermark: string
  versions: { version: number; label: string; url: string }[]
  approvalChain: ApprovalStep[]
  comments: ReviewComment[]
}

export default function ReviewPage() {
  const { token } = useParams<{ token: string }>()
  const [review, setReview] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [commentText, setCommentText] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [authorEmail, setAuthorEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pin, setPin] = useState('')
  const [pinDraft, setPinDraft] = useState('')
  const [needsPin, setNeedsPin] = useState(false)
  const [annotation, setAnnotation] = useState<{ x: number; y: number } | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  async function loadReview(nextPin = pin) {
    const res = await fetch(`/api/review/${token}`, {
      headers: nextPin ? { 'x-review-pin': nextPin } : {},
    })
    const data = (await res.json()) as ReviewData & { error?: string }
    if (res.status === 401) {
      setNeedsPin(true)
      setReview(null)
      throw new Error(data.error ?? 'PIN required')
    }
    if (!res.ok) throw new Error(data.error ?? 'Review not found')
    setNeedsPin(false)
    setReview(data)
  }

  useEffect(() => {
    loadReview()
      .catch((err: Error) => {
        console.warn("[caught] src/app/review/[token]/page.tsx:46", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (setError(err.message))
      })
      .finally(() => setLoading(false))
  }, [token])

  function handleFrameClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setAnnotation({ x, y })
    videoRef.current?.pause()
  }

  async function submitComment() {
    if (!commentText.trim() || !authorName.trim() || !authorEmail.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/review/${token}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(pin ? { 'x-review-pin': pin } : {}),
        },
        body: JSON.stringify({
          authorName,
          authorEmail,
          timecode: currentTime,
          text: commentText,
          annotationData: annotation,
        }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to post comment')
      }
      setCommentText('')
      setAnnotation(null)
      await loadReview()
    } catch (err) {
      console.warn("[caught] src/app/review/[token]/page.tsx:80", err instanceof Error ? { name: err.name, message: err.message } : err)

      alert((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function submitDecision(decision: 'approved' | 'changes_requested') {
    if (!authorName.trim() || !authorEmail.trim()) {
      alert('Enter your name and email before approving or requesting changes.')
      return
    }
    const note =
      decision === 'changes_requested'
        ? window.prompt('What changes are needed?') ?? undefined
        : window.prompt('Optional approval note:') ?? undefined

    const res = await fetch(`/api/review/${token}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(pin ? { 'x-review-pin': pin } : {}),
      },
      body: JSON.stringify({
        decision,
        approverName: authorName,
        approverEmail: authorEmail,
        note,
      }),
    })
    const data = (await res.json()) as { status?: string; error?: string }
    if (!res.ok) {
      alert(data.error ?? 'Failed to submit decision')
      return
    }
    await loadReview()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c10] flex items-center justify-center">
        <div className="text-white text-lg">Loading review...</div>
      </div>
    )
  }

  if (needsPin || (error && !review)) {
    return (
      <div className="min-h-screen bg-[#0c0c10] flex items-center justify-center">
        <form
          className="w-full max-w-sm rounded-xl border border-white/10 bg-[#12121a] p-6"
          onSubmit={(event) => {
            event.preventDefault()
            setLoading(true)
            setError(null)
            setPin(pinDraft)
            void loadReview(pinDraft)
              .catch((err: Error) => {
                console.warn('[review]', err instanceof Error ? err.message : err)
                setError(err.message)
              })
              .finally(() => setLoading(false))
          }}
        >
          <h1 className="text-lg text-white">Review PIN</h1>
          <p className="mt-2 text-sm text-white/50">{error ?? 'Enter the PIN for this review.'}</p>
          <input
            value={pinDraft}
            onChange={(event) => setPinDraft(event.target.value)}
            className="mt-4 w-full rounded-lg bg-white/10 px-3 py-2 text-white outline-none"
            autoComplete="off"
          />
          <button type="submit" className="mt-4 w-full rounded-lg bg-[#00e5c8] py-2 text-sm font-medium text-black">
            Open review
          </button>
        </form>
      </div>
    )
  }

  if (!review) {
    return (
      <div className="min-h-screen bg-[#0c0c10] flex items-center justify-center">
        <div className="text-red-400 text-lg">{error ?? 'Review not found'}</div>
      </div>
    )
  }

  const statusColor: Record<string, string> = {
    pending: 'text-[#00e5c8]',
    approved: 'text-green-400',
    changes_requested: 'text-red-400',
  }

  const videoSrc = review.videoUrl ?? `/api/review/stream/${token}`

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white">
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{review.title}</h1>
          <span className={`text-sm capitalize ${statusColor[review.status] ?? 'text-gray-400'}`}>
            {review.status.replace('_', ' ')}
          </span>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/60">
            {review.approvalChain.map((step) => (
              <span key={step.role}>
                {step.role}: {step.status}{step.note ? ` — ${step.note}` : ''}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void submitDecision('approved')}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition-colors"
          >
            Approve {review.approvalChain.find((step) => step.status !== 'approved')?.role ?? 'step'}
          </button>
          <button
            type="button"
            onClick={() => void submitDecision('changes_requested')}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors"
          >
            Request Changes
          </button>
        </div>
      </div>

      <div className="flex gap-6 p-6">
        <div className="flex-1">
          <div className="relative bg-black rounded-xl overflow-hidden">
            <video
              ref={videoRef}
              className="w-full"
              controls
              onTimeUpdate={() => {
                if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
              }}
            >
              <source src={videoSrc} />
            </video>
            <canvas
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onClick={handleFrameClick}
            />
            <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/55 px-2 py-1 text-xs text-white/80">
              {review.watermark}
            </div>
            {annotation && (
              <div
                className="absolute w-6 h-6 rounded-full bg-[#00f0d5] border-2 border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
              />
            )}
          </div>

          {!review.videoUrl && (
            <p className="mt-2 text-xs text-amber-400">
              No export found yet — export the project in the editor, then refresh this page.
            </p>
          )}

          <div className="mt-4 bg-white/5 rounded-xl p-4 space-y-3">
            <div className="text-sm text-gray-400">
              Comment at {formatTime(currentTime)}
              {annotation
                ? ` · Pin at (${annotation.x.toFixed(0)}%, ${annotation.y.toFixed(0)}%)`
                : ''}
            </div>
            <div className="flex gap-3">
              <input
                className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-teal-400"
                placeholder="Your name"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
              />
              <input
                className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-teal-400"
                placeholder="Your email"
                type="email"
                value={authorEmail}
                onChange={(e) => setAuthorEmail(e.target.value)}
              />
            </div>
            <textarea
              className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-teal-400 resize-none"
              rows={3}
              placeholder="Leave a comment... (click on the video frame to pin an annotation)"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void submitComment()}
                disabled={submitting || !commentText.trim()}
                className="px-4 py-2 bg-[#00e5c8] hover:bg-[#00f0d5] disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {submitting ? 'Posting...' : 'Post comment'}
              </button>
            </div>
          </div>
        </div>

        <div className="w-80 flex-shrink-0 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
            Comments ({review.comments.length})
          </h2>
          {review.comments.length === 0 ? (
            <div className="text-gray-500 text-sm">No comments yet.</div>
          ) : (
            review.comments.map((c) => (
              <div
                key={c.id}
                className="bg-white/5 rounded-xl p-3 cursor-pointer hover:bg-white/10 transition-colors"
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = c.timecode
                    void videoRef.current.play()
                  }
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{c.authorName}</span>
                  <span className="text-xs text-[#00e5c8]">{formatTime(c.timecode)}</span>
                </div>
                <p className="text-sm text-gray-300">{c.text}</p>
                {c.resolved && (
                  <span className="text-xs text-green-400 mt-1 block">✓ Resolved</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
