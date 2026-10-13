// Re-export canonical blending utilities from the swarm implementation.
// New code should import from here; the swarm location is considered legacy.
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
export { SeamlessBlender } from '../swarm/SeamlessBlender'
export type { BlendJob } from '../swarm/SeamlessBlender'

// Convenience wrapper — adapts simple segment array to BlendJob format
import { SeamlessBlender as _Blender } from '../swarm/SeamlessBlender'
import type { SwarmResult, Shot, ModelId } from '../swarm/types'

const _blender = new _Blender()

export async function blendMultiEngineClip(params: {
  segments: Array<{ segmentId: string; videoUrl: string; engineId: string }>
}): Promise<{ blendedUrl: string }> {
  const results: SwarmResult[] = params.segments.map((seg) => ({
    shot_id: seg.segmentId,
    model_used: (seg.engineId || refuseSilentModelSwap(seg.segmentId, 'wan_2_2')) as ModelId,
    output_url: seg.videoUrl,
    proxy_url: seg.videoUrl,
    generation_ms: 0,
    cost_credits: 0,
    quality_score: 0.8,
    needs_repaint: false,
    repaint_regions: [],
  }))

  const shots: Shot[] = params.segments.map((seg, idx) => ({
    shot_id: seg.segmentId,
    sequence_index: idx,
    description: '',
    duration_seconds: 5,
    scene_category: 'generic_scene' as Shot['scene_category'],
    secondary_categories: [],
    has_text_in_frame: false,
    has_human_primary: false,
    has_human_background: false,
    has_fluid_physics: false,
    has_fire_explosion: false,
    has_animal: false,
    has_crowd: false,
    has_audio_requirement: false,
    has_dialogue: false,
    has_vehicle: false,
    is_hero_shot: false,
    is_long_form: false,
    character_ids: [],
    reference_image_count: 0,
    shot_type: 'MS' as Shot['shot_type'],
    camera_motion: 'static',
    mood: 'neutral',
    assigned_model: (seg.engineId || refuseSilentModelSwap(seg.segmentId, 'wan_2_2')) as ModelId,
    estimated_cost_credits: 0,
    requires_post_lipsync: false,
    requires_face_enhance: false,
    requires_relight: false,
    prompt_raw: '',
    stitch_config: { transition: 'cut', duration_ms: 0, motion_match: false, colour_match: true },
  }))

  const blendedUrl = await _blender.blend({ results, shots, applyHouseLook: true })
  return { blendedUrl }
}
