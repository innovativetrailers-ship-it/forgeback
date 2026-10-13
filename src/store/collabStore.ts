import { create } from 'zustand'
import type { PresenceState } from '@/lib/collab/presence'

interface CollabState {
  peers: PresenceState[]
  setPeers: (peers: PresenceState[]) => void
  updatePeer: (userId: string, update: Partial<PresenceState>) => void
  removePeer: (userId: string) => void

  ownPlayheadTime: number
  ownSelectedClipId: string | null
  setOwnPlayheadTime: (t: number) => void
  setOwnSelectedClipId: (id: string | null) => void

  activeConflictCount: number
  setActiveConflictCount: (n: number) => void
}

export const useCollabStore = create<CollabState>((set) => ({
  peers: [],
  setPeers: (peers) => set({ peers }),
  updatePeer: (userId, update) =>
    set((state) => ({
      peers: state.peers.map((p) => (p.userId === userId ? { ...p, ...update } : p)),
    })),
  removePeer: (userId) =>
    set((state) => ({ peers: state.peers.filter((p) => p.userId !== userId) })),

  ownPlayheadTime: 0,
  ownSelectedClipId: null,
  setOwnPlayheadTime: (t) => set({ ownPlayheadTime: t }),
  setOwnSelectedClipId: (id) => set({ ownSelectedClipId: id }),

  activeConflictCount: 0,
  setActiveConflictCount: (n) => set({ activeConflictCount: n }),
}))
