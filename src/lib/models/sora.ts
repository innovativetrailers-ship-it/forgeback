import type { GenerateVideoInput, GenerateVideoOutput } from './types'

const RETIRED = 'Sora 2 was deprecated in April 2026 and is not in the pool. Physics routes to veo-3.1.'

export async function generateVideo(_input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  throw new Error(RETIRED)
}

export async function pollStatus(_externalJobId: string): Promise<GenerateVideoOutput> {
  throw new Error(RETIRED)
}
