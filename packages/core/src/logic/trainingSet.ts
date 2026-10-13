import type { DatasetMedia, TrainerDef } from './trainerRegistry'

export interface TrainingMediaFile {
  name: string
  kind: DatasetMedia
  caption?: string
}

export function trainingCostUsd(trainer: TrainerDef, steps: number): number {
  const n = Number.isFinite(steps) ? Math.max(1, Math.round(steps)) : 1000
  return Number((n * trainer.costPerStep).toFixed(4))
}

export function trainerStepsField(trainer: TrainerDef): 'number_of_steps' | 'steps' {
  const id = trainer.id
  if (id.includes('flux') || id.includes('z-image') || id.includes('wan-22-image')) return 'steps'
  return 'number_of_steps'
}

export function validateTrainingSet(
  trainer: TrainerDef,
  files: TrainingMediaFile[],
  triggerPhrase?: string,
): string[] {
  const errors: string[] = []
  const allowed = new Set(trainer.dataset.types)
  const usable = files.filter((file) => allowed.has(file.kind))
  if (usable.length < trainer.dataset.minItems) {
    errors.push(`Need at least ${trainer.dataset.minItems} ${trainer.dataset.types.join('/')} files (got ${usable.length})`)
  }
  const extra = files.filter((file) => !allowed.has(file.kind))
  if (extra.length) {
    errors.push(`Trainer ${trainer.id} does not accept ${[...new Set(extra.map((f) => f.kind))].join(', ')}`)
  }
  if (trainer.dataset.captions) {
    const missing = usable.filter((file) => !file.caption?.trim() && !triggerPhrase?.trim())
    if (missing.length) {
      errors.push('Captions are required (or a trigger phrase that stands in for uncaptioned files)')
    }
  }
  if (trainer.dataset.triggerPhrase && trainer.dataset.triggerField && !triggerPhrase?.trim() && trainer.dataset.captions) {
    // H3 t2v: captions OR trigger. Already covered.
  } else if (trainer.dataset.triggerPhrase && trainer.dataset.triggerField === 'trigger_word' && !triggerPhrase?.trim()) {
    errors.push('trigger_word is required')
  } else if (trainer.id.includes('wan-22-image') && !triggerPhrase?.trim()) {
    errors.push('trigger_phrase is required')
  }
  return errors
}

export function captionForFile(file: TrainingMediaFile, triggerPhrase?: string): string {
  const caption = file.caption?.trim()
  if (caption) return caption
  return triggerPhrase?.trim() ?? ''
}

export function zipEntryName(file: TrainingMediaFile, index: number): { media: string; caption: string } {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : kindExt(file.kind)
  const base = `clip_${String(index + 1).padStart(3, '0')}`
  return { media: `${base}${ext}`, caption: `${base}.txt` }
}

function kindExt(kind: DatasetMedia): string {
  if (kind === 'video') return '.mp4'
  if (kind === 'audio') return '.wav'
  return '.jpg'
}

export function buildTrainerInput(
  trainer: TrainerDef,
  dataUrl: string,
  opts: { triggerPhrase?: string; steps: number },
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    [trainer.dataset.urlField]: dataUrl,
  }
  const stepsField = trainerStepsField(trainer)
  input[stepsField] = opts.steps
  if (trainer.dataset.triggerField && opts.triggerPhrase?.trim()) {
    input[trainer.dataset.triggerField] = opts.triggerPhrase.trim()
  }
  return input
}

export function costsMatch(expected: number, confirmed: number, epsilon = 0.01): boolean {
  return Number.isFinite(confirmed) && Math.abs(expected - confirmed) <= epsilon
}
