export type SceneCategory =
  | 'human_emotional_closeup' | 'human_talking_audio' | 'human_sports_athletic'
  | 'human_hands_task' | 'human_character_continuity' | 'human_group_multi'
  | 'human_wide_background' | 'human_portrait_photorealistic'
  | 'human_walking_running' | 'human_dance_choreography'
  | 'animal_photorealistic_texture' | 'animal_moving_wildlife'
  | 'animal_large_multi' | 'animal_closeup_macro' | 'animal_in_weather'
  | 'environment_establishing' | 'environment_cinematic_hero'
  | 'environment_trees_foliage' | 'environment_aerial_landscape'
  | 'environment_water_ocean' | 'environment_arid_desert' | 'environment_golden_hour'
  | 'urban_dense_cyberpunk' | 'urban_architectural_detail' | 'urban_building_hero'
  | 'urban_crowd' | 'urban_night_neon' | 'urban_aerial_flyover' | 'urban_interior'
  | 'physics_rain' | 'physics_water_fluid' | 'physics_fire_explosion'
  | 'physics_smoke_fog' | 'physics_snow_blizzard' | 'physics_wind_cloth'
  | 'physics_lightning_storm'
  | 'vehicle_car_chase' | 'vehicle_aerial_drone' | 'vehicle_aircraft'
  | 'vehicle_crash_impact' | 'vehicle_spacecraft' | 'vehicle_macro_detail'
  | 'text_in_frame' | 'text_neon_sign' | 'text_digital_display' | 'text_document'
  | 'vfx_stylized' | 'vfx_practical_explosion' | 'vfx_particles'
  | 'vfx_abstract_surreal' | 'vfx_fantasy_magic'
  | 'audio_native_required' | 'audio_dialogue_lipsync'
  | 'audio_ambient_critical' | 'audio_music_video'
  | 'duration_extended_30s_plus' | 'duration_long_form'
  | 'draft_proxy' | 'draft_social'
  | 'v2v_face_repair' | 'v2v_style_transfer' | 'v2v_region_fix' | 'v2v_base_upgrade'

export type ModelId =
  | 'seedance_2_0' | 'veo_3_1' | 'kling_3_0' | 'runway_gen4_5' | 'skyreels_v1'
  | 'hunyuan_1_5' | 'wan_2_2' | 'ltx_2_3' | 'pika_2_2'
  | 'minimax_hailuo' | 'mochi_1' | 'pixverse'

export type OutcomeTier = 'Draft' | 'Studio' | 'Blockbuster'

export interface Shot {
  shot_id: string
  sequence_index: number
  description: string
  duration_seconds: number
  scene_category: SceneCategory
  secondary_categories: SceneCategory[]
  has_text_in_frame: boolean
  has_human_primary: boolean
  has_human_background: boolean
  has_fluid_physics: boolean
  has_fire_explosion: boolean
  has_animal: boolean
  has_crowd: boolean
  has_audio_requirement: boolean
  has_dialogue: boolean
  has_vehicle: boolean
  is_hero_shot: boolean
  is_long_form: boolean
  character_ids: string[]
  location_id?: string
  reference_image_count: number
  shot_type: 'ECU' | 'CU' | 'MCU' | 'MS' | 'WS' | 'EWS' | 'POV' | 'OTS' | 'INSERT'
  camera_motion: string
  mood: string
  assigned_model?: ModelId
  estimated_cost_credits: number
  requires_post_lipsync: boolean
  requires_face_enhance: boolean
  requires_relight: boolean
  v2v_source_url?: string
  prompt_raw: string
  prompt_enhanced?: string
  generated_url?: string
  quality_score?: number
  needs_repaint?: boolean
  stitch_config: StitchConfig
}

export interface StitchConfig {
  transition: 'cut' | 'dissolve' | 'match_cut' | 'smash_cut' | 'wipe' | 'fade'
  duration_ms: number
  motion_match: boolean
  colour_match: boolean
}

export interface ShotList {
  project_id: string
  tier: OutcomeTier
  total_duration_seconds: number
  shots: Shot[]
  estimated_total_credits: number
  model_distribution: Record<ModelId, number>
  cost_breakdown: Record<ModelId, number>
}

export interface SwarmResult {
  shot_id: string
  model_used: ModelId
  output_url: string
  proxy_url: string
  generation_ms: number
  cost_credits: number
  quality_score: number
  needs_repaint: boolean
  repaint_regions: RepaintRegion[]
}

export interface RepaintRegion {
  description: string
  x: number
  y: number
  width: number
  height: number
  start_time: number
  end_time: number
  repair_prompt: string
  suggested_model: ModelId
}

export interface TimelineEditRequest {
  project_id: string
  clip_id: string
  clip_url: string
  start_time: number
  end_time: number
  user_instruction: string
  tier: OutcomeTier
  character_ids?: string[]
}
