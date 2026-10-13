'use client'

import { useState, useRef, useCallback } from 'react'
import { primaryCastTrainer, trainingCostUsd } from '@cinema/core'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Upload, User, Wand2, CheckCircle2, Loader2, Camera,
  ChevronLeft, ChevronRight, X, Sparkles,
} from 'lucide-react'

export interface CharacterOnboardingData {
  name: string
  description: string
  referenceImages: File[]
  modelFamily: 'kling' | 'seedance' | 'veo3' | 'any'
  triggerWord: string
  trainLora: boolean
  loraJobId?: string
  characterId?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (data: CharacterOnboardingData) => void
  projectId: string
}

type Step = 1 | 2 | 3 | 4 | 5 | 6

const STEPS = [
  { label: 'Name',       icon: <User size={14} /> },
  { label: 'Photos',     icon: <Camera size={14} /> },
  { label: 'Model Lock', icon: <Sparkles size={14} /> },
  { label: 'LoRA',       icon: <Wand2 size={14} /> },
  { label: 'Training',   icon: <Loader2 size={14} /> },
  { label: 'Done',       icon: <CheckCircle2 size={14} /> },
]

const MODEL_OPTIONS = [
  { id: 'any',      label: 'Auto (best for scene)',  desc: 'AI picks per shot' },
  { id: 'kling',    label: 'Kling 3.0',              desc: 'Best for dialogue & emotion' },
  { id: 'seedance', label: 'Seedance 2.0',           desc: 'Best for fast action' },
  { id: 'veo3',     label: 'Veo 3.1',                desc: 'Best for cinematic quality' },
] as const

export function CharacterOnboarding({ open, onOpenChange, onComplete, projectId }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [modelFamily, setModelFamily] = useState<CharacterOnboardingData['modelFamily']>('any')
  const [triggerWord, setTriggerWord] = useState('')
  const [trainLora, setTrainLora] = useState(true)
  const [isTraining, setIsTraining] = useState(false)
  const [trainingProgress, setTrainingProgress] = useState(0)
  const [loraJobId, setLoraJobId] = useState<string | undefined>()
  const [characterId, setCharacterId] = useState<string | undefined>()
  const [trainingError, setTrainingError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = useCallback((files: FileList | null) => {
    if (!files) return
    const newFiles = Array.from(files).slice(0, 20 - images.length)
    setImages((prev) => [...prev, ...newFiles])
    setPreviews((prev) => [...prev, ...newFiles.map((f) => URL.createObjectURL(f))])
  }, [images])

  const removeImage = (idx: number) => {
    URL.revokeObjectURL(previews[idx])
    setImages((prev) => prev.filter((_, i) => i !== idx))
    setPreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const submitCharacter = async () => {
    if (images.length === 0 && description.trim().length < 12) {
      setTrainingError('Add a description (step 1) or upload reference photos.')
      setStep(6)
      return
    }
    setIsTraining(trainLora)
    setTrainingProgress(0)
    setTrainingError(null)
    try {
      const formData = new FormData()
      formData.append('name', name)
      if (description.trim()) formData.append('description', description.trim())
      formData.append('triggerWord', triggerWord || name.toLowerCase().replace(/\s+/g, '_'))
      formData.append('projectId', projectId)
      formData.append('modelFamily', modelFamily)
      formData.append('trainLora', trainLora ? 'true' : 'false')
      if (trainLora) {
        formData.append('confirmedCostUsd', String(trainingCostUsd(primaryCastTrainer(), 1000)))
        formData.append('subjectConsent', 'true')
      }
      images.forEach((img) => formData.append('images', img))

      const res = await fetch('/api/vault/character/create', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      const json = await res.json() as { id?: string; jobId?: string; error?: string }
      if (!res.ok || json.error) throw new Error(json.error ?? 'Character creation failed')
      if (json.id) setCharacterId(json.id)
      setLoraJobId(json.jobId)

      if (trainLora && json.jobId) {
        const sse = new EventSource(`/api/jobs/${json.jobId}/stream`)
        sse.onmessage = (e) => {
          const data = JSON.parse(e.data) as { status: string; progress?: number }
          if (data.progress) setTrainingProgress(data.progress)
          if (data.status === 'complete') {
            setTrainingProgress(100)
            setIsTraining(false)
            setStep(6)
            sse.close()
          } else if (data.status === 'failed') {
            setTrainingError('Training failed. You can still use the character without LoRA.')
            setIsTraining(false)
            setStep(6)
            sse.close()
          }
        }
        sse.onerror = () => {
          setTrainingError('Connection lost. Training may still be running in background.')
          setIsTraining(false)
          setStep(6)
          sse.close()
        }
      } else {
        setIsTraining(false)
        setStep(6)
      }
    } catch (err) {
      console.warn("[caught] src/components/vault/CharacterOnboarding.tsx:137", err instanceof Error ? { name: err.name, message: err.message } : err)

      setTrainingError(err instanceof Error ? err.message : 'Character creation failed')
      setIsTraining(false)
      setStep(6)
    }
  }

  const handleNext = async () => {
    if (step === 4) {
      setStep(5)
      await submitCharacter()
      return
    }
    if (step < 6) setStep((s) => (s + 1) as Step)
  }

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step)
  }

  const handleFinish = () => {
    onComplete({
      name,
      description,
      referenceImages: images,
      modelFamily,
      triggerWord: triggerWord || name.toLowerCase().replace(/\s+/g, '_'),
      trainLora,
      loraJobId,
      characterId,
    })
    onOpenChange(false)
    // Reset
    setStep(1); setName(''); setDescription(''); setImages([]); setPreviews([])
    setModelFamily('any'); setTriggerWord(''); setTrainLora(true)
    setIsTraining(false); setTrainingProgress(0); setLoraJobId(undefined); setCharacterId(undefined)
    setTrainingError(null)
  }

  const canNext = (() => {
    if (step === 1) return name.trim().length > 0 && description.trim().length >= 12
    if (step === 2) return images.length >= 3 || description.trim().length >= 12
    return true
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-[var(--border)]">
          <DialogTitle className="text-sm font-semibold text-[var(--text-primary)]">Add Character to Vault</DialogTitle>
          {/* Step progress */}
          <div className="flex items-center gap-1 mt-3">
            {STEPS.map((s, i) => {
              const idx = i + 1
              const done = step > idx
              const active = step === idx
              return (
                <div key={s.label} className="flex items-center">
                  <div className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-all',
                    done ? 'bg-[var(--teal-bright)] text-[#03080e]'
                      : active ? 'bg-[var(--teal-glow)] border border-[var(--teal-border)] text-[var(--teal-bright)]'
                      : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-tertiary)]'
                  )}>
                    {done ? <CheckCircle2 size={12} /> : idx}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={cn('h-px w-8 mx-1 transition-all', done ? 'bg-[var(--teal-bright)]' : 'bg-[var(--border)]')} />
                  )}
                </div>
              )
            })}
          </div>
        </DialogHeader>

        {/* Step content */}
        <div className="px-5 py-4 min-h-[280px] flex flex-col">
          {step === 1 && (
            <StepName name={name} description={description} onNameChange={setName} onDescriptionChange={setDescription} />
          )}
          {step === 2 && (
            <StepPhotos
              images={images} previews={previews}
              onUpload={handleImageUpload} onRemove={removeImage}
              fileRef={fileRef}
            />
          )}
          {step === 3 && (
            <StepModelLock model={modelFamily} onChange={setModelFamily} />
          )}
          {step === 4 && (
            <StepLoRA
              name={name} triggerWord={triggerWord} trainLora={trainLora}
              onTriggerChange={setTriggerWord} onTrainChange={setTrainLora}
            />
          )}
          {step === 5 && (
            <StepTraining
              isTraining={isTraining} progress={trainingProgress}
              error={trainingError}
            />
          )}
          {step === 6 && (
            <StepDone name={name} loraJobId={loraJobId} error={trainingError} />
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-5 pb-5 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={step === 1 || step === 5}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={12} /> Back
          </button>

          <span className="text-[10px] text-[var(--text-tertiary)]">
            {STEPS[step - 1]?.label}
          </span>

          {step < 6 ? (
            <button
              onClick={handleNext}
              disabled={!canNext || isTraining}
              className="flex items-center gap-1 px-4 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--teal-bright)] text-[#03080e] hover:bg-[#00f0d5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isTraining ? <><Loader2 size={11} className="animate-spin" /> Training…</> : <>Next <ChevronRight size={12} /></>}
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center gap-1 px-4 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--teal-bright)] text-[#03080e] hover:bg-[#00f0d5] transition-colors"
            >
              <CheckCircle2 size={11} /> Finish
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Step sub-components ─────────────────────────────────────────────

function StepName({
  name, description, onNameChange, onDescriptionChange,
}: {
  name: string
  description: string
  onNameChange: (v: string) => void
  onDescriptionChange: (v: string) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Character Name</p>
        <p className="text-[11px] text-[var(--text-tertiary)] mb-3">Used for LoRA trigger words and vault organisation.</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Detective Chen, Aria, The Stranger…"
          className="cinema-input"
        />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Appearance Description</p>
        <p className="text-[11px] text-[var(--text-tertiary)] mb-3">
          Describe look, age, wardrobe, and vibe. Required for text-born characters; improves photo-based casting.
        </p>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="e.g. Woman in her 30s, sharp jawline, dark bob haircut, leather jacket, weary detective energy…"
          rows={4}
          className="cinema-input resize-none"
        />
      </div>
    </div>
  )
}

function StepPhotos({
  images, previews, onUpload, onRemove, fileRef,
}: {
  images: File[]; previews: string[]
  onUpload: (f: FileList | null) => void
  onRemove: (i: number) => void
  fileRef: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div>
      <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Reference Photos</p>
      <p className="text-[11px] text-[var(--text-tertiary)] mb-3">
        Upload 3–20 photos for best LoRA quality — or skip if you described the character on step 1 (we generate a reference plate).
      </p>

      <input
        ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => onUpload(e.target.files)}
      />

      {images.length < 20 && (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full py-6 rounded-lg border-2 border-dashed border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--teal-dark)] hover:text-[var(--text-secondary)] transition-colors flex flex-col items-center gap-1.5 mb-3"
        >
          <Upload size={18} />
          <span className="text-[11px]">Click to upload ({images.length}/20)</span>
        </button>
      )}

      {previews.length > 0 && (
        <div className="grid grid-cols-5 gap-1.5 max-h-36 overflow-y-auto">
          {previews.map((url, i) => (
            <div key={i} className="relative group">
              <img src={url} alt="" className="w-full aspect-square object-cover rounded" />
              <button
                onClick={() => onRemove(i)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && images.length < 3 && (
        <p className="text-[10px] text-[var(--warning)] mt-2">Add at least {3 - images.length} more photo{3 - images.length !== 1 ? 's' : ''}</p>
      )}
    </div>
  )
}

function StepModelLock({
  model, onChange,
}: { model: CharacterOnboardingData['modelFamily']; onChange: (m: CharacterOnboardingData['modelFamily']) => void }) {
  return (
    <div>
      <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Model Lock</p>
      <p className="text-[11px] text-[var(--text-tertiary)] mb-3">Lock this character to a specific generation model for consistency across shots. After 3 renders, the model will be locked automatically.</p>
      <div className="space-y-2">
        {MODEL_OPTIONS.map((m) => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all text-left',
              model === m.id
                ? 'bg-[var(--teal-glow)] border-[var(--teal-border)]'
                : 'border-[var(--border)] hover:bg-[var(--bg-hover)]'
            )}
          >
            <span className={cn('text-[12px] font-medium', model === m.id ? 'text-[var(--teal-bright)]' : 'text-[var(--text-secondary)]')}>
              {m.label}
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function StepLoRA({
  name, triggerWord, trainLora, onTriggerChange, onTrainChange,
}: {
  name: string; triggerWord: string; trainLora: boolean
  onTriggerChange: (v: string) => void; onTrainChange: (v: boolean) => void
}) {
  const autoTrigger = name.toLowerCase().replace(/\s+/g, '_')
  return (
    <div>
      <p className="text-sm font-medium text-[var(--text-primary)] mb-1">LoRA Training</p>
      <p className="text-[11px] text-[var(--text-tertiary)] mb-3">Training a LoRA fine-tunes the AI on your character&apos;s face. This costs credits but dramatically improves likeness.</p>

      <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] mb-3">
        <div>
          <p className="text-[12px] font-medium text-[var(--text-primary)]">Train character LoRA</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">
            ${trainingCostUsd(primaryCastTrainer(), 1000).toFixed(2)} FAL + 50 credits. Needs 10 reference images. Turning this on confirms the subject consents.
          </p>
        </div>
        <button
          onClick={() => onTrainChange(!trainLora)}
          className={cn(
            'w-10 h-5 rounded-full transition-colors relative',
            trainLora ? 'bg-[var(--teal-bright)]' : 'bg-[var(--bg-active)]'
          )}
        >
          <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', trainLora ? 'left-5' : 'left-0.5')} />
        </button>
      </div>

      {trainLora && (
        <div>
          <p className="text-[10px] text-[var(--text-secondary)] mb-1">Trigger word</p>
          <input
            value={triggerWord}
            onChange={(e) => onTriggerChange(e.target.value)}
            placeholder={autoTrigger}
            className="cinema-input text-[11px]"
          />
          <p className="text-[9px] text-[var(--text-tertiary)] mt-1">
            Use this word in prompts to activate the character. Default: <code className="text-[var(--teal-bright)]">{autoTrigger}</code>
          </p>
        </div>
      )}
    </div>
  )
}

function StepTraining({ isTraining, progress, error }: { isTraining: boolean; progress: number; error: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 py-8">
      {isTraining ? (
        <>
          <div className="relative w-16 h-16">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="var(--bg-surface)" strokeWidth="4" />
              <circle
                cx="32" cy="32" r="28" fill="none"
                stroke="var(--teal-bright)" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 28}`}
                strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress / 100)}`}
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[13px] font-bold text-[var(--teal-bright)] tabular-nums">{progress}%</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[12px] font-medium text-[var(--text-primary)]">Training LoRA…</p>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1">This usually takes 10–20 minutes</p>
          </div>
        </>
      ) : (
        <div className="text-center">
          <Loader2 size={32} className="text-[var(--teal-bright)] mx-auto mb-3" />
          <p className="text-[12px] text-[var(--text-secondary)]">Starting training…</p>
        </div>
      )}
      {error && (
        <p className="text-[11px] text-[var(--warning)] text-center max-w-xs">{error}</p>
      )}
    </div>
  )
}

function StepDone({ name, loraJobId, error }: { name: string; loraJobId?: string; error: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8 text-center">
      <div className="w-14 h-14 rounded-full bg-[var(--teal-glow)] border border-[var(--teal-border)] flex items-center justify-center">
        <CheckCircle2 size={28} className="text-[var(--teal-bright)]" />
      </div>
      <p className="text-[15px] font-semibold text-[var(--text-primary)]">{name} added to Vault!</p>
      {loraJobId && !error && (
        <p className="text-[11px] text-[var(--text-secondary)]">LoRA training queued. You&apos;ll be notified when it&apos;s ready.</p>
      )}
      {error && (
        <p className="text-[11px] text-[var(--warning)] max-w-xs">{error}</p>
      )}
      <p className="text-[10px] text-[var(--text-tertiary)]">You can now use this character in Generate or assign them to shots.</p>
    </div>
  )
}
