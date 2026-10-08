'use client'

import { createContext, useContext } from 'react'

export type TimelineDockMode = 'full' | 'compact' | 'hidden'

const TimelineDockContext = createContext<{
  mode: TimelineDockMode
  setMode: (mode: TimelineDockMode) => void
}>({ mode: 'full', setMode: () => undefined })

export function TimelineDockProvider({
  mode,
  setMode,
  children,
}: {
  mode: TimelineDockMode
  setMode: (mode: TimelineDockMode) => void
  children: React.ReactNode
}) {
  return <TimelineDockContext.Provider value={{ mode, setMode }}>{children}</TimelineDockContext.Provider>
}

export function useTimelineDock() {
  return useContext(TimelineDockContext)
}
