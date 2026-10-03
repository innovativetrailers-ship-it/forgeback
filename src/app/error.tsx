'use client'

import { useEffect, useState } from 'react'
import { reportBrowserCodeError } from '@/components/diagnostics/CodeErrorBridge'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: ErrorProps) {
  const [reported, setReported] = useState(false)
  const [copied, setCopied] = useState(false)
  const detail = [error.message, error.digest ? `digest: ${error.digest}` : ''].filter(Boolean).join('\n')
  useEffect(() => {
    console.error('[GlobalError]', error)
    const raw = error.stack || error.message
    void reportBrowserCodeError(raw, 'app.error').then(setReported)
  }, [error])

  const copyDetails = () => {
    void navigator.clipboard.writeText(detail).then(() => {
      setCopied(true)
    })
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-center px-6">
      <div className="flex gap-2 mb-12 opacity-40">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="w-5 h-5 bg-red-600 rounded-sm" />
        ))}
      </div>

      <p className="text-red-400 text-sm font-mono tracking-[0.3em] uppercase mb-4">
        500 — Production Error
      </p>

      <h1 className="text-6xl sm:text-8xl font-bold text-white tracking-tight mb-6">
        Take 2.
      </h1>

      <p className="text-zinc-200 text-lg max-w-lg mb-3 break-words">
        {error.message || 'Something unexpected happened on set.'}
      </p>

      {error.digest && (
        <p className="text-zinc-500 text-xs font-mono mb-3">
          digest: {error.digest}
        </p>
      )}

      <p className="text-zinc-500 text-sm max-w-md mb-6">
        {reported ? 'The crew has this report.' : 'Please try again.'}
      </p>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={copyDetails}
          className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium transition-colors"
        >
          {copied ? 'Copied' : 'Copy details'}
        </button>
        <button
          onClick={reset}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
        >
          Try Again
        </button>
        <a
          href="/simple"
          className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium transition-colors"
        >
          Back to Studio
        </a>
      </div>

      <div className="flex gap-2 mt-12 opacity-40">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="w-5 h-5 bg-red-600 rounded-sm" />
        ))}
      </div>
    </div>
  )
}
