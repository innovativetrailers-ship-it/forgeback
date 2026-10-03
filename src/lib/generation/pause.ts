/**
 * Global generation kill-switch — paused unless GENERATION_PAUSED=false.
 * Set GENERATION_PAUSED=false to allow shot/film generation.
 */

import { generationPausedFromEnv } from '@cinema/core'
export class GenerationPausedError extends Error {
  readonly code = 'GENERATION_PAUSED' as const

  constructor(message: string) {
    super(message)
    this.name = 'GenerationPausedError'
  }
}

export function isGenerationPaused(): boolean {
  return generationPausedFromEnv(process.env.GENERATION_PAUSED)
}

/** Throws before any billable provider submit — single chokepoint helper. */
export function assertGenerationNotPaused(endpoint?: string): void {
  if (!isGenerationPaused()) return
  throw new GenerationPausedError(
    `Blocked: GENERATION_PAUSED is ON${endpoint ? `. endpoint=${endpoint}` : ''}`,
  )
}

export function isGenerationPausedError(err: unknown): boolean {
  return err instanceof GenerationPausedError
    || (err instanceof Error && err.name === 'GenerationPausedError')
}
