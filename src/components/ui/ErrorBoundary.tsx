'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Generic error boundary for wrapping individual UI panels.
 * Prevents a single failing panel from crashing the whole editor.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    this.props.onError?.(error, info)
    void import('@/components/diagnostics/CodeErrorBridge').then(({ reportBrowserCodeError }) =>
      reportBrowserCodeError(`${error.stack || error.message}\n${info.componentStack ?? ''}`, 'error-boundary'),
    )
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
          <div className="text-3xl">🎬</div>
          <p className="text-sm text-zinc-400 max-w-xs">
            This panel encountered an error and has been paused.
          </p>
          {this.state.error && (
            <p className="text-xs text-zinc-600 font-mono max-w-xs truncate">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.reset}
            className="mt-2 text-xs px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
          >
            Reload Panel
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
