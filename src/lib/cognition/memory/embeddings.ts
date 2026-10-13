// Embeddings via Voyage AI. A missing key, pause, or provider error is unavailable.
// Callers must handle that. A zero vector is not a result.

import { isGenerationPaused } from '@/lib/generation/pause'

const EMBED_DIM = 1024

export class EmbeddingsUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmbeddingsUnavailable'
  }
}

export async function embed(text: string): Promise<number[]> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) throw new EmbeddingsUnavailable('Embeddings are unavailable: the provider key is not set')
  if (isGenerationPaused()) throw new EmbeddingsUnavailable('Embeddings are unavailable while generation is paused')
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'voyage-3', input: text, output_dimension: EMBED_DIM }),
  })
  if (!res.ok) throw new EmbeddingsUnavailable('Embeddings are unavailable: the provider refused the request')
  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> }
  const vector = json.data?.[0]?.embedding
  if (!vector) throw new EmbeddingsUnavailable('Embeddings are unavailable: the provider returned no vector')
  return vector
}

// pgvector literal form for binding a number[] as a ::vector parameter.
export function toVector(vec: number[]): string {
  return `[${vec.join(',')}]`
}
