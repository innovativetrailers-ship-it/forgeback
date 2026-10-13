import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface TrackedJob {
  jobId:     string
  prompt:    string
  mode:      string
  clipId?:   string
  trackId?:  string
  startedAt: number
}

interface JobStore {
  activeJobs: TrackedJob[]
  addJob:     (job: TrackedJob) => void
  removeJob:  (jobId: string) => void
  clearDone:  () => void
}

export const useJobStore = create<JobStore>()(
  persist(
    (set) => ({
      activeJobs: [],
      addJob: (job) =>
        set((s) => ({
          activeJobs: s.activeJobs.some((j) => j.jobId === job.jobId)
            ? s.activeJobs
            : [...s.activeJobs, job],
        })),
      removeJob: (jobId) =>
        set((s) => ({ activeJobs: s.activeJobs.filter((j) => j.jobId !== jobId) })),
      clearDone: () => set({ activeJobs: [] }),
    }),
    { name: 'cinema-active-jobs' },
  ),
)
