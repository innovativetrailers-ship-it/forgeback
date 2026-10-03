/** Higher rank = higher visual tier; used for blender anchor + boundary repair. */
export const MODEL_TIER_RANK: Record<string, number> = {
  'veo-3.1': 10, veo3: 10,
  'sora-2': 9, sora: 9,
  'kling-o3': 8, 'kling-3.0': 8, kling_pro: 8, kling_o3: 8,
  'runway-gen4': 7, runway: 7, runway_gen4_5: 7,
  'grok-imagine-video': 6, grok_video: 6,
  'luma-ray3': 5, luma: 5,
  'seedance-2.0': 5, seedance: 5, seedance_2_0: 5,
  'minimax-2.3': 4, minimax: 4, minimax_hailuo: 4,
  'hailuo-2.3': 4, hailuo: 4,
  'skyreels-v3': 4, skyreels: 4, skyreels_v1: 4,
  'pika-2.5': 3, pika: 3, pika_2_2: 3,
  'wan-2.7': 2, 'wan-2.6': 2, wan: 2, wan_2_2: 2,
  'ltx-2.3': 1, ltx: 1, ltx_2_3: 1,
  'ltx-2.3-fast': 0,
}

export function modelTierRank(modelId: string): number {
  return MODEL_TIER_RANK[modelId] ?? 1
}
