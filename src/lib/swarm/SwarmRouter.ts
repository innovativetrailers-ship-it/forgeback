import { falEndpoint } from '@cinema/core/endpoints'
import { EventEmitter } from 'events'
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
import { Shot, ShotList, ModelId, OutcomeTier, SceneCategory, SwarmResult } from './types'
import { CASTING_DIRECTOR_PROMPT, ART_DIRECTOR_PROMPT, QA_INSPECTOR_PROMPT, STITCH_COORDINATOR_PROMPT } from './brain-prompts'
import { runModel1 } from '../brain/model1'
import { callCouncil } from '../brain/council'
import { redis, channelKey } from '../redis'
import { db } from '../db'
import { runFal } from '../fal/client'
import { extractVideoFrame } from '../fal/frameExtract'
import { relightImage } from '../fal/lighting'
import * as models from '../models'
import { captureFlywheelSignal } from '../telemetry/flywheel'

// ── Simple concurrency limiter ───────────────────────────────
function createLimiter(concurrency: number) {
  let active = 0
  const queue: Array<() => void> = []
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>(resolve => queue.push(resolve))
    }
    active++
    try {
      return await fn()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}

// ── Tier permissions ─────────────────────────────────────────
const TIER_MODELS: Record<OutcomeTier, Set<ModelId>> = {
  Draft:       new Set(['ltx_2_3', 'wan_2_2', 'pika_2_2', 'mochi_1', 'pixverse']),
  Studio:      new Set(['wan_2_2', 'hunyuan_1_5', 'pixverse', 'kling_3_0', 'seedance_2_0', 'skyreels_v1', 'minimax_hailuo', 'pika_2_2', 'mochi_1', 'pixverse']),
  Blockbuster: new Set(['seedance_2_0', 'veo_3_1', 'kling_3_0', 'runway_gen4_5', 'skyreels_v1', 'hunyuan_1_5', 'wan_2_2', 'pixverse', 'ltx_2_3', 'pika_2_2', 'minimax_hailuo', 'mochi_1', 'pixverse']),
}

// ── Canonical routing table ──────────────────────────────────
const SCENE_TO_MODEL: Partial<Record<SceneCategory, ModelId>> = {
  human_emotional_closeup:       'skyreels_v1',
  human_talking_audio:           'seedance_2_0',
  human_sports_athletic:         'kling_3_0',
  human_hands_task:              'kling_3_0',
  human_character_continuity:    'runway_gen4_5',
  human_group_multi:             'hunyuan_1_5',
  human_wide_background:         'wan_2_2',
  human_portrait_photorealistic: 'seedance_2_0',
  human_walking_running:         'kling_3_0',
  human_dance_choreography:      'kling_3_0',
  animal_photorealistic_texture: 'wan_2_2',
  animal_moving_wildlife:        'wan_2_2',
  animal_large_multi:            'hunyuan_1_5',
  animal_closeup_macro:          'veo_3_1',
  animal_in_weather:             'veo_3_1',
  environment_establishing:      'wan_2_2',
  environment_cinematic_hero:    'veo_3_1',
  environment_trees_foliage:     'veo_3_1',
  environment_aerial_landscape:  'wan_2_2',
  environment_water_ocean:       'veo_3_1',
  environment_arid_desert:       'wan_2_2',
  environment_golden_hour:       'veo_3_1',
  urban_dense_cyberpunk:         'hunyuan_1_5',
  urban_architectural_detail:    'pixverse',
  urban_building_hero:           'veo_3_1',
  urban_crowd:                   'hunyuan_1_5',
  urban_night_neon:              'hunyuan_1_5',
  urban_aerial_flyover:          'wan_2_2',
  urban_interior:                'seedance_2_0',
  physics_rain:                  'veo_3_1',
  physics_water_fluid:           'veo_3_1',
  physics_fire_explosion:        'veo_3_1',
  physics_smoke_fog:             'veo_3_1',
  physics_snow_blizzard:         'veo_3_1',
  physics_wind_cloth:            'veo_3_1',
  physics_lightning_storm:       'veo_3_1',
  vehicle_car_chase:             'hunyuan_1_5',
  vehicle_aerial_drone:          'wan_2_2',
  vehicle_aircraft:              'hunyuan_1_5',
  vehicle_crash_impact:          'veo_3_1',
  vehicle_spacecraft:            'hunyuan_1_5',
  vehicle_macro_detail:          'veo_3_1',
  text_in_frame:                 'pixverse',
  text_neon_sign:                'pixverse',
  text_digital_display:          'pixverse',
  text_document:                 'pixverse',
  vfx_stylized:                  'seedance_2_0',
  vfx_practical_explosion:       'veo_3_1',
  vfx_particles:                 'veo_3_1',
  vfx_abstract_surreal:          'ltx_2_3',
  vfx_fantasy_magic:             'seedance_2_0',
  audio_native_required:         'seedance_2_0',
  audio_dialogue_lipsync:        'seedance_2_0',
  audio_ambient_critical:        'veo_3_1',
  audio_music_video:             'kling_3_0',
  duration_extended_30s_plus:    'minimax_hailuo',
  duration_long_form:            'minimax_hailuo',
  v2v_face_repair:               'seedance_2_0',
  v2v_style_transfer:            'seedance_2_0',
  v2v_region_fix:                'seedance_2_0',
  v2v_base_upgrade:              'veo_3_1',
  draft_proxy:                   'ltx_2_3',
  draft_social:                  'pika_2_2',
}

// ── Studio tier downgrades ───────────────────────────────────
const STUDIO_DOWNGRADE: Partial<Record<ModelId, ModelId>> = {
  veo_3_1:       'hunyuan_1_5',
  runway_gen4_5: 'kling_3_0',
  skyreels_v1:   'seedance_2_0',
}

// ── Credits per 5 seconds ────────────────────────────────────
const CREDITS: Record<ModelId, number> = {
  ltx_2_3: 1, wan_2_2: 2, mochi_1: 2, pixverse: 4,
  hunyuan_1_5: 4, pika_2_2: 5, minimax_hailuo: 5,
  skyreels_v1: 7, seedance_2_0: 7, kling_3_0: 9,
  runway_gen4_5: 9, veo_3_1: 18,
}

export class SwarmRouter extends EventEmitter {
  private limiter = createLimiter(8)

  async decompose(params: {
    userInput: string
    tier: OutcomeTier
    targetDuration?: number
    characterIds?: string[]
    userId?: string
  }): Promise<ShotList> {
    let raw: string
    try {
      const r = await runModel1({
        systemPrompt: CASTING_DIRECTOR_PROMPT,
        userMessage: `${params.userInput}\nTier: ${params.tier}${params.targetDuration ? `\nTarget: ~${params.targetDuration}s` : ''}`,
        requireJSON: true,
        useAgenticLoop: params.tier === 'Blockbuster',
      })
      raw = r.content
    } catch (err) {
      console.warn("[caught] src/lib/swarm/SwarmRouter.ts:141", err instanceof Error ? { name: err.name, message: err.message } : err)

      const r = await callCouncil({
        task: 'decompose',
        messages: [{ role: 'user', content: params.userInput }],
        requireJSON: true,
        reason: 'Model1 timeout',
      })
      raw = r.content
    }

    const parsed: { total_duration_seconds: number; shots: Shot[] } = JSON.parse(raw)

    const enhanced = await Promise.all(parsed.shots.map(async shot => {
      const model = this.routeShot(shot, params.tier)
      const prompt = await this.enhancePrompt(shot, model)
      const cost = Math.ceil((CREDITS[model] * shot.duration_seconds) / 5)
      return { ...shot, assigned_model: model, prompt_enhanced: prompt, estimated_cost_credits: cost }
    }))

    const dist: Record<ModelId, number> = {} as Record<ModelId, number>
    const costs: Record<ModelId, number> = {} as Record<ModelId, number>
    enhanced.forEach(s => {
      const m = s.assigned_model as ModelId
      dist[m] = (dist[m] ?? 0) + 1
      costs[m] = (costs[m] ?? 0) + s.estimated_cost_credits
    })

    return {
      project_id: '',
      tier: params.tier,
      total_duration_seconds: parsed.total_duration_seconds,
      shots: enhanced,
      estimated_total_credits: enhanced.reduce((a, s) => a + s.estimated_cost_credits, 0),
      model_distribution: dist,
      cost_breakdown: costs,
    }
  }

  /** Long-form swarm picker. Director shots use delegate(), not this. */
  routeShot(shot: Shot, tier: OutcomeTier): ModelId {
    const permitted = TIER_MODELS[tier]

    if (shot.has_text_in_frame) {
      if (permitted.has('pixverse')) return 'pixverse'
      return refuseSilentModelSwap('pixverse', 'wan_2_2')
    }
    if (shot.duration_seconds > 30 || shot.is_long_form) {
      if (permitted.has('minimax_hailuo')) return 'minimax_hailuo'
      return refuseSilentModelSwap('minimax_hailuo', 'wan_2_2')
    }
    if (shot.has_fluid_physics && shot.is_hero_shot) {
      if (permitted.has('veo_3_1')) return 'veo_3_1'
      return refuseSilentModelSwap('veo_3_1', 'wan_2_2')
    }

    const primary = SCENE_TO_MODEL[shot.scene_category]
    if (!primary) return refuseSilentModelSwap(shot.scene_category, 'wan_2_2')
    if (permitted.has(primary)) return primary

    const downgraded = STUDIO_DOWNGRADE[primary]
    if (downgraded && permitted.has(downgraded)) return downgraded

    const ladder: ModelId[] = ['seedance_2_0', 'kling_3_0', 'skyreels_v1', 'hunyuan_1_5', 'wan_2_2', 'pixverse', 'ltx_2_3', 'mochi_1']
    return ladder.find(m => permitted.has(m)) ?? refuseSilentModelSwap(shot.scene_category, 'wan_2_2')
  }

  async enhancePrompt(shot: Shot, model: ModelId): Promise<string> {
    const r = await runModel1({
      systemPrompt: ART_DIRECTOR_PROMPT,
      userMessage: `Shot: ${shot.description}\nModel: ${model}\nType: ${shot.shot_type} ${shot.camera_motion}\nMood: ${shot.mood}\nFlags: human=${shot.has_human_primary}, fluid=${shot.has_fluid_physics}, text=${shot.has_text_in_frame}, audio=${shot.has_audio_requirement}`,
      requireJSON: false,
    })
    return r.content.trim()
  }

  async dispatch(params: {
    shotList: ShotList
    userId: string
    projectId: string
    onShotComplete?: (r: SwarmResult) => void
  }): Promise<SwarmResult[]> {
    let done = 0
    await redis.publish(channelKey(`swarm:${params.projectId}`), JSON.stringify({
      event: 'start',
      total: params.shotList.shots.length,
      distribution: params.shotList.model_distribution,
    }))

    const results = await Promise.allSettled(
      params.shotList.shots.map(shot => this.limiter(async () => {
        await redis.publish(channelKey(`swarm:${params.projectId}`), JSON.stringify({
          event: 'shot_start',
          shot_id: shot.shot_id,
        }))
        const r = await this.generateShot(shot, params.userId, params.projectId)
        done++
        params.onShotComplete?.(r)
        await redis.publish(channelKey(`swarm:${params.projectId}`), JSON.stringify({
          event: 'shot_done',
          shot_id: shot.shot_id,
          done,
          total: params.shotList.shots.length,
          r,
        }))
        return r
      }))
    )

    const ok: SwarmResult[] = []
    const failed: Shot[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') ok.push(r.value)
      else failed.push(params.shotList.shots[i])
    })

    if (failed.length) ok.push(...await this.retryFailed(failed, params.userId, params.projectId))

    const assessed = await this.qualityAssessAll(ok, params.shotList.shots)
    await this.computeStitchInstructions(assessed, params.shotList.shots)
    await this.applyPostProcessing(assessed, params.shotList.shots)

    const repaint = assessed.filter(r => r.needs_repaint)
    if (repaint.length) {
      await this.dispatchRepaint(repaint, params.shotList.shots, params.userId, params.projectId)
    }

    // Flywheel telemetry — routing decisions + quality scores feed the training pipeline
    captureFlywheelSignal('swarm_dispatch', {
      distribution: params.shotList.model_distribution,
      tier: params.shotList.tier,
      quality: assessed.map(r => ({ id: r.shot_id, score: r.quality_score })),
    }, params.userId).catch((err) => {
      console.warn("[caught] src/lib/swarm/SwarmRouter.ts:273", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ })

    return assessed.sort((a, b) => {
      const ia = params.shotList.shots.find(s => s.shot_id === a.shot_id)!.sequence_index
      const ib = params.shotList.shots.find(s => s.shot_id === b.shot_id)!.sequence_index
      return ia - ib
    })
  }

  private async generateShot(shot: Shot, userId: string, projectId: string): Promise<SwarmResult> {
    const start = Date.now()
    const model = shot.assigned_model!
    const prompt = shot.prompt_enhanced ?? shot.description
    let url: string

    try {
      url = await this.callModel(model, prompt, shot)
    } catch (err) {
      console.warn("[caught] src/lib/swarm/SwarmRouter.ts:288", err instanceof Error ? { name: err.name, message: err.message } : err)

      const fallback = this.routeShot(shot, 'Studio')
      url = await this.callModel(fallback, prompt, shot)
    }

    if (shot.requires_face_enhance) {
      const res = await runFal(falEndpoint('codeformer'), { image_url: url, fidelity: 0.75 }) as { image?: { url: string } }
      url = res.image?.url ?? url
    }
    if (shot.requires_relight) {
      const res = await relightImage({ imageUrl: url, prompt: `match ${shot.mood} mood` })
      url = res.imageUrl
    }

    const proxy = await this.makeProxy(url)
    const credits = Math.ceil((CREDITS[model] * shot.duration_seconds) / 5)

    await db.apiUsageLog.create({
      data: {
        provider: model,
        model,
        userId,
        costCents: credits * 0.5,
        latencyMs: Date.now() - start,
        success: true,
      },
    }).catch((err) => {
      console.warn("[caught] src/lib/swarm/SwarmRouter.ts:318", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ })

    return {
      shot_id: shot.shot_id,
      model_used: model,
      output_url: url,
      proxy_url: proxy,
      generation_ms: Date.now() - start,
      cost_credits: credits,
      quality_score: 0,
      needs_repaint: false,
      repaint_regions: [],
    }
  }

  async callModel(model: ModelId, prompt: string, shot: Shot): Promise<string> {
    const base = {
      prompt,
      negativePrompt: 'blurry, watermark, duplicate faces, overexposed',
      duration: shot.duration_seconds,
      aspectRatio: '16:9' as const,
      characterRefs: [],
      seed: undefined,
    }
    switch (model) {
      case 'seedance_2_0':   return models.generateSeedance20(base)
      case 'veo_3_1':        return models.generateVeo3(base)
      case 'kling_3_0':      return models.generateKling30(base)
      case 'runway_gen4_5':  return models.generateRunway(base)
      case 'skyreels_v1':    return models.generateSkyReelsSwarm(base)
      case 'hunyuan_1_5':    return models.generateHunyuan(base)
      case 'wan_2_2':        return models.generateWan22(base)
      case 'ltx_2_3':        return models.generateLTXSwarm(base)
      case 'pika_2_2':       return models.generatePika(base)
      case 'minimax_hailuo': return models.generateMinimax(base)
      case 'mochi_1':        return models.generateMochi(base)
      case 'pixverse':       return models.generatePixverse(base)
      default: throw new Error(`Unknown model: ${model}`)
    }
  }

  private async makeProxy(url: string): Promise<string> {
    try {
      return await extractVideoFrame(url, { timestamp: 0.5 })
    } catch (err) {
      console.warn("[caught] src/lib/swarm/SwarmRouter.ts:358", err instanceof Error ? { name: err.name, message: err.message } : err)

      return url
    }
  }

  private async qualityAssessAll(results: SwarmResult[], shots: Shot[]): Promise<SwarmResult[]> {
    return Promise.all(results.map(async r => {
      try {
        const shot = shots.find(s => s.shot_id === r.shot_id)!
        const frame = await this.makeProxy(r.output_url)
        const qa = await runModel1({
          systemPrompt: QA_INSPECTOR_PROMPT,
          userMessage: `Shot: ${shot.description}\nPrompt: ${shot.prompt_enhanced}`,
          images: [frame],
          requireJSON: true,
        })
        const parsed = JSON.parse(qa.content)
        return { ...r, quality_score: parsed.quality_score, needs_repaint: parsed.needs_repaint, repaint_regions: parsed.repaint_regions ?? [] }
      } catch (err) {
        console.warn("[caught] src/lib/swarm/SwarmRouter.ts:376", err instanceof Error ? { name: err.name, message: err.message } : err)

        return r
      }
    }))
  }

  private async computeStitchInstructions(results: SwarmResult[], shots: Shot[]): Promise<void> {
    for (let i = 0; i < shots.length - 1; i++) {
      try {
        const r = await runModel1({
          systemPrompt: STITCH_COORDINATOR_PROMPT,
          userMessage: `Shot A (${shots[i].assigned_model}): ${shots[i].description}\nShot B (${shots[i + 1].assigned_model}): ${shots[i + 1].description}`,
          requireJSON: true,
        })
        const stitch = JSON.parse(r.content)
        shots[i].stitch_config = {
          transition: stitch.transition_type,
          duration_ms: stitch.transition_duration_ms,
          motion_match: stitch.motion_match_needed,
          colour_match: stitch.colour_normalise,
        }
        if (stitch.colour_normalise) {
          const res = results.find(res => res.shot_id === shots[i].shot_id)
          if (res) {
            await relightImage({ imageUrl: res.output_url, prompt: stitch.ic_light_instruction }).catch((err) => {
              console.warn("[caught] src/lib/swarm/SwarmRouter.ts:408", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ })
          }
        }
      } catch (err) {
        console.warn("[caught] src/lib/swarm/SwarmRouter.ts:403", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal — keep default stitch config */ }
    }
  }

  private async applyPostProcessing(results: SwarmResult[], shots: Shot[]): Promise<void> {
    await Promise.all(results.map(async r => {
      const shot = shots.find(s => s.shot_id === r.shot_id)!
      if (shot.requires_post_lipsync && shot.has_dialogue) {
        await redis.publish(channelKey('audio:lipsync:queue'), JSON.stringify({
          shot_id: shot.shot_id,
          video_url: r.output_url,
          character_ids: shot.character_ids,
        })).catch((err) => {
          console.warn("[caught] src/lib/swarm/SwarmRouter.ts:425", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ })
      }
    }))
  }

  private async retryFailed(shots: Shot[], userId: string, projectId: string): Promise<SwarmResult[]> {
    return Promise.all(shots.map(shot => {
      const selected = shot.assigned_model
      if (!selected) refuseSilentModelSwap(shot.shot_id, 'wan_2_2')
      const downgrade = STUDIO_DOWNGRADE[selected] ?? refuseSilentModelSwap(shot.shot_id, 'wan_2_2')
      if (downgrade !== selected) {
        console.warn('[costGuard] visible model downgrade', { selected, wouldHaveBeen: downgrade })
      }
      shot.assigned_model = downgrade
      return this.generateShot(shot, userId, projectId)
    }))
  }

  private async dispatchRepaint(
    repaintQueue: SwarmResult[],
    shots: Shot[],
    userId: string,
    projectId: string
  ): Promise<void> {
    await Promise.all(repaintQueue.flatMap(r =>
      r.repaint_regions.map(async region => {
        const shot = shots.find(s => s.shot_id === r.shot_id)!
        const repaired = await models.generateSeedance20({
          prompt: region.repair_prompt,
          negativePrompt: 'low quality, inconsistent',
          duration: region.end_time - region.start_time,
          aspectRatio: '16:9',
          characterRefs: [],
          seed: undefined,
        })
        await redis.publish(channelKey(`swarm:${projectId}`), JSON.stringify({
          event: 'repaint_done',
          shot_id: r.shot_id,
          repaired_url: repaired,
        }))
      })
    ))
  }
}
