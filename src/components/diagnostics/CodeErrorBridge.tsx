'use client'

import { useEffect } from 'react'

export function reportBrowserCodeError(rawError: string, source: string): Promise<boolean> {
  return fetch('/api/dev/code', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawError, source }),
  }).then((res) => {
    if (!res.ok) {
      console.error('ERROR-CAPTURE-FAILED', source, res.status)
      return false
    }
    return true
  }).catch((err) => {
    console.error('ERROR-CAPTURE-FAILED', source, err)
    return false
  })
}

export function CodeErrorBridge() {
  useEffect(() => {
    function report(rawError: string, source: string) {
      void reportBrowserCodeError(rawError, source)
    }
    function onError(event: ErrorEvent) {
      const err: unknown = event.error
      report(err instanceof Error ? err.stack || err.message : event.message, 'window.onerror')
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason: unknown = event.reason
      report(reason instanceof Error ? reason.stack || reason.message : String(reason), 'window.onunhandledrejection')
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
