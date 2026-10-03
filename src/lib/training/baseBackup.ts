import type { TrainedLoRA } from '@/lib/assets/shape'

/** Apache-2.0 Wan 2.2. The key is our copy. Hosted ids are not the weights. */
export const WAN22_BACKUP_KEY = 'bases/wan-2.2/Wan2.2-T2V-A14B'

export function serveLoRABase(input: {
  trainedLoRA: TrainedLoRA
  hostedUp: boolean
}): { source: 'hosted' | 'backup'; key: string } {
  if (input.hostedUp) return { source: 'hosted', key: input.trainedLoRA.baseModel }
  if (!input.trainedLoRA.baseBackupKey) {
    throw new Error(`Base ${input.trainedLoRA.baseModel} was pulled and this LoRA has no backup`)
  }
  return { source: 'backup', key: input.trainedLoRA.baseBackupKey }
}
