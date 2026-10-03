'use client'


import { logCaught } from '@/lib/diagnostics/caught'
import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import type { BranchingConfig, BranchNode, BranchChoice } from '@/lib/export/BranchingExport'

type PlayerState = 'playing' | 'choosing' | 'transitioning' | 'ended'

interface ThemeColors { bg: string; text: string; accent: string; cardBg: string; cardBorder: string }

const THEMES: Record<string, ThemeColors> = {
  dark:   { bg: '#0d1117', text: '#ffffff', accent: '#00e5c8', cardBg: '#1a1f2e', cardBorder: '#2d3548' },
  light:  { bg: '#f8f9fa', text: '#1a1f2e', accent: '#00e5c8', cardBg: '#ffffff', cardBorder: '#e2e8f0' },
  cinema: { bg: '#000000', text: '#ffffff', accent: '#00e5c8', cardBg: '#0d0d0d', cardBorder: '#1a1a1a' },
}

interface Props { config: BranchingConfig }

export function BranchingPlayer({ config }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [currentNodeId, setCurrentNodeId] = useState(config.startNodeId)
  const [playerState, setPlayerState] = useState<PlayerState>('playing')
  const [opacity, setOpacity] = useState(1)

  const theme = THEMES[config.embedTheme] ?? THEMES.dark

  const nodeMap = useMemo(() => new Map(config.nodes.map((n) => [n.id, n])), [config.nodes])
  const currentNode = nodeMap.get(currentNodeId)

  useEffect(() => () => { if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current) }, [])

  const handleChoice = useCallback((choice: BranchChoice) => {
    if (autoAdvanceRef.current) { clearTimeout(autoAdvanceRef.current); autoAdvanceRef.current = null }
    if (!choice.nextNodeId) { setPlayerState('ended'); return }

    setPlayerState('transitioning')
    setOpacity(0)
    setTimeout(() => {
      setCurrentNodeId(choice.nextNodeId as string)
      setPlayerState('playing')
      const video = videoRef.current
      if (video) { video.currentTime = 0; video.play().catch((err) => logCaught('components/branch/BranchingPlayer', err)) }
      setTimeout(() => setOpacity(1), 50)
    }, 400)
  }, [])

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || !currentNode || playerState !== 'playing') return
    if (video.currentTime >= currentNode.triggerAtSecond) {
      video.pause()
      const isTerminal = currentNode.choices.length === 0 || currentNode.choices.every((c) => !c.nextNodeId)
      if (isTerminal) { setPlayerState('ended'); return }
      setPlayerState('choosing')
      if (config.autoAdvanceMs) {
        autoAdvanceRef.current = setTimeout(() => {
          const first = currentNode.choices.find((c) => c.nextNodeId)
          if (first) handleChoice(first)
        }, config.autoAdvanceMs)
      }
    }
  }, [currentNode, playerState, config.autoAdvanceMs, handleChoice])

  const handleRestart = useCallback(() => {
    setCurrentNodeId(config.startNodeId)
    setPlayerState('playing')
    setOpacity(1)
    const video = videoRef.current
    if (video) { video.currentTime = 0; video.play().catch((err) => logCaught('components/branch/BranchingPlayer', err)) }
  }, [config.startNodeId])

  if (!currentNode) return (
    <div style={{ background: theme.bg, color: theme.text }} className="flex h-full w-full items-center justify-center">
      <p>Error: Node not found</p>
    </div>
  )

  return (
    <div className="relative mx-auto w-full overflow-hidden" style={{ background: theme.bg, aspectRatio: '16/9' }}>
      <video
        ref={videoRef} src={currentNode.clipUrl} autoPlay playsInline
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => { if (playerState === 'playing') setPlayerState('choosing') }}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ opacity, transition: 'opacity 0.4s' }}
      />

      <div className="absolute left-4 top-4 rounded-md px-3 py-1 text-xs font-medium backdrop-blur-sm"
        style={{ background: `${theme.cardBg}cc`, color: theme.text, border: `1px solid ${theme.cardBorder}` }}>
        {currentNode.label}
      </div>

      {playerState === 'choosing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-12">
          <div className="pointer-events-none absolute inset-0"
            style={{ background: `linear-gradient(transparent 40%, ${theme.bg}ee 100%)` }} />
          <div className="relative z-10 flex flex-wrap justify-center gap-3 px-4">
            {currentNode.choices.map((choice) => (
              <button key={choice.id} onClick={() => handleChoice(choice)}
                className="flex items-center gap-3 rounded-xl px-6 py-3 text-sm font-semibold transition-all hover:scale-105"
                style={{ background: theme.cardBg, color: theme.text, border: `2px solid ${theme.accent}60` }}>
                {choice.thumbnailUrl && <img src={choice.thumbnailUrl} alt="" className="h-8 w-8 rounded-md object-cover" />}
                <span>{choice.label}</span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4l4 4-4 4" stroke={theme.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
          {config.autoAdvanceMs && (
            <p className="relative z-10 mt-3 text-xs opacity-50" style={{ color: theme.text }}>
              Auto-advancing in {Math.round(config.autoAdvanceMs / 1000)}s…
            </p>
          )}
        </div>
      )}

      {playerState === 'transitioning' && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: theme.bg }}>
          <div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: `${theme.accent}40`, borderTopColor: theme.accent }} />
        </div>
      )}

      {playerState === 'ended' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ background: `${theme.bg}ee` }}>
          <p className="text-lg font-semibold" style={{ color: theme.text }}>{config.title}</p>
          <p className="text-sm opacity-60" style={{ color: theme.text }}>End of story</p>
          <button onClick={handleRestart} className="rounded-lg px-6 py-2 text-sm font-semibold transition hover:scale-105"
            style={{ background: theme.accent, color: theme.bg }}>
            Watch Again
          </button>
        </div>
      )}
    </div>
  )
}
