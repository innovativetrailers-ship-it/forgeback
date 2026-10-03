import { db } from '../db'
import type { ShotList, SwarmResult, Shot, ModelId } from './types'

export class GrowthEngineCapture {

  async captureSwarmRun(params: {
    shotList: ShotList
    results: SwarmResult[]
    userId: string
    projectId: string
  }): Promise<void> {
    const { shotList, results, userId, projectId } = params

    // Routing decision records — most valuable signal over time
    for (const result of results) {
      const shot = shotList.shots.find(s => s.shot_id === result.shot_id)
      if (!shot) continue
      await db.trainingData.create({
        data: {
          userId,
          type: 'routing_decision',
          metadata: {
            scene_category: shot.scene_category,
            assigned_model: result.model_used,
            quality_score: result.quality_score,
            needed_repaint: result.needs_repaint,
            tier: shotList.tier,
            shot_type: shot.shot_type,
            duration: shot.duration_seconds,
            flags: {
              human: shot.has_human_primary,
              fluid: shot.has_fluid_physics,
              crowd: shot.has_crowd,
              text: shot.has_text_in_frame,
              audio: shot.has_audio_requirement,
              hero: shot.is_hero_shot,
            },
            generation_ms: result.generation_ms,
            cost_credits: result.cost_credits,
          },
          isProcessed: false,
        },
      }).catch((err) => {
        console.warn("[caught] src/lib/swarm/GrowthEngineCapture.ts:43", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ })
    }

    // Prompt enhancement pairs — teaches Art Director to improve
    for (const shot of shotList.shots) {
      if (!shot.prompt_enhanced || shot.prompt_enhanced === shot.prompt_raw) continue
      const result = results.find(r => r.shot_id === shot.shot_id)
      await db.trainingData.create({
        data: {
          userId,
          type: 'prompt_enhancement_pair',
          metadata: {
            scene_category: shot.scene_category,
            model: shot.assigned_model,
            prompt_raw: shot.prompt_raw,
            prompt_enhanced: shot.prompt_enhanced,
            quality_score: result?.quality_score ?? 0,
          },
          isProcessed: false,
        },
      }).catch((err) => {
        console.warn("[caught] src/lib/swarm/GrowthEngineCapture.ts:63", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ })
    }

    // Cross-model quality comparison — which model wins per scene type
    await db.trainingData.create({
      data: {
        userId,
        type: 'model_quality_comparison',
        metadata: {
          project_id: projectId,
          tier: shotList.tier,
          comparisons: results.map(r => ({
            scene_category: shotList.shots.find(s => s.shot_id === r.shot_id)?.scene_category,
            model: r.model_used,
            quality: r.quality_score,
            needed_repaint: r.needs_repaint,
          })),
        },
        isProcessed: false,
      },
    }).catch((err) => {
      console.warn("[caught] src/lib/swarm/GrowthEngineCapture.ts:83", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ })

    // Repaint delta — highest value training signal
    const repaintedShots = results.filter(r => r.needs_repaint && r.repaint_regions.length)
    for (const r of repaintedShots) {
      const shot = shotList.shots.find(s => s.shot_id === r.shot_id)!
      await db.trainingData.create({
        data: {
          userId,
          type: 'repaint_delta',
          originalUrl: r.output_url,
          instruction: `Scene: ${shot.description} — Issues: ${r.repaint_regions.map(rp => rp.description).join(', ')}`,
          metadata: JSON.parse(JSON.stringify({
            scene_category: shot.scene_category,
            original_model: r.model_used,
            repaint_regions: r.repaint_regions,
            quality_before: r.quality_score,
          })),
          isProcessed: false,
        },
      }).catch((err) => {
        console.warn("[caught] src/lib/swarm/GrowthEngineCapture.ts:103", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ })
    }
  }

  async captureUserFeedback(params: {
    shot_id: string
    project_id: string
    user_action: 'kept' | 'regenerated' | 'repainted'
    original_model: ModelId
    scene_category: string
    quality_score: number
    userId: string
  }): Promise<void> {
    await db.rLHFLog.create({
      data: {
        userId: params.userId,
        sessionId: params.project_id,
        promptText: params.scene_category,
        modelOptions: { model: params.original_model },
        selectedModel: params.user_action === 'kept' ? params.original_model : 'alternative',
        selectedIdx: params.user_action === 'kept' ? 0 : 1,
        context: {
          shot_id: params.shot_id,
          scene_category: params.scene_category,
          quality_score: params.quality_score,
          user_action: params.user_action,
        },
      },
    }).catch((err) => {
      console.warn("[caught] src/lib/swarm/GrowthEngineCapture.ts:131", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ })
  }
}
