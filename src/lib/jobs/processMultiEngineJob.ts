import { db } from '@/lib/db'
import { dispatchClip } from '@/lib/routing/MediaDispatcher'
import { blendMultiEngineClip } from '@/lib/routing/SeamlessBlender'
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
import type { SceneSegment } from '@/lib/routing/types'

export async function processMultiEngineJob(input: {
  jobId: string
  segments: SceneSegment[]
  studioClipId?: string
}): Promise<void> {
  const { jobId, segments, studioClipId } = input
  console.log('[simple-generate] worker picked up', { jobId, model: 'multi_engine' })
  try {
    const results = await dispatchClip({ segments })
    const { blendedUrl } = await blendMultiEngineClip({
      segments: results.map((r) => ({
        segmentId: r.segmentId,
        videoUrl: r.videoUrl,
        engineId: segments.find((s) => s.segmentId === r.segmentId)?.engineId ?? refuseSilentModelSwap(r.segmentId, 'wan'),
      })),
    })
    await db.renderJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETE', outputUrl: blendedUrl },
    })
    if (studioClipId && blendedUrl) {
      const { completeGenerateShot } = await import('@/lib/studio/recordGenerateShot')
      await completeGenerateShot(studioClipId, blendedUrl)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Multi-engine generation failed'
    console.warn('[simple-generate] multi-engine failed', { jobId, message })
    await db.renderJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: message },
    })
    if (studioClipId) {
      const { failGenerateShot } = await import('@/lib/studio/recordGenerateShot')
      await failGenerateShot(studioClipId)
    }
    throw err
  }
}
