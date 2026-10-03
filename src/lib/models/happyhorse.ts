import type { GenerateVideoInput, GenerateVideoOutput } from './types'

const BENCHED = 'HappyHorse payloads are sealed and it stays out of the routing pool until one clean generation.'

export async function generateVideo(_input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  throw new Error(BENCHED)
}

export async function pollStatus(externalJobId: string): Promise<GenerateVideoOutput> {
  throw new Error(
    `HappyHorse ${externalJobId} has no confirmed video URL. Refusing to report success.`,
  )
}
