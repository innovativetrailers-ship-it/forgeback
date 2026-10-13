import { db } from '@/lib/db'

export interface OrchestrationScriptSource {
  prompt?: string
  script?: string
}

/** Resolve script for director orchestration — queue payload first, then this job's renderJob row. */
export async function resolveOrchestrationScript(
  jobId: string,
  data: OrchestrationScriptSource,
): Promise<string> {
  const fromQueue = (data.prompt ?? data.script ?? '').trim()
  if (fromQueue.length >= 10) return fromQueue

  const row = await db.renderJob.findUnique({
    where: { id: jobId },
    select: { prompt: true },
  })
  const fromJob = row?.prompt?.trim() ?? ''
  if (fromJob.length >= 10) {
    console.warn(
      `[orchestrate] Job ${jobId}: queue payload missing prompt — using renderJob.prompt`,
    )
    return fromJob
  }

  throw new Error(
    `[orchestrate] Job ${jobId} has no script in payload. ` +
      `Ensure /api/generate passes prompt/script in the queue payload.`,
  )
}
