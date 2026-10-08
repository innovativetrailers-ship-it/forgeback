'use client'

import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react'

const ProgramVideoContext = createContext<RefObject<HTMLVideoElement | null> | null>(null)

export function ProgramVideoProvider({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  return <ProgramVideoContext.Provider value={videoRef}>{children}</ProgramVideoContext.Provider>
}

export function useProgramVideoRef(): RefObject<HTMLVideoElement | null> {
  const shared = useContext(ProgramVideoContext)
  const local = useRef<HTMLVideoElement | null>(null)
  return shared ?? local
}

export function useProgramScopesMounted(): boolean {
  return useContext(ProgramVideoContext) != null
}
