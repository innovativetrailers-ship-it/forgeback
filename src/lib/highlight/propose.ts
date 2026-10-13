export interface ReelSource {
  id: string
  prompt?: string
  start: number
  end: number
}

export interface ReelPick {
  id: string
  start: number
  end: number
  score: number
  reason: string
}

/** Local proposal. Does not write the timeline. */
export function proposeReel(clips: ReelSource[], targetSec: number, focus: string): ReelPick[] {
  const words = focus.toLowerCase().split(/\W+/).filter((word) => word.length > 2)
  const ranked = clips
    .map((clip) => {
      const span = Math.max(0, clip.end - clip.start)
      const text = (clip.prompt ?? '').toLowerCase()
      const hits = words.filter((word) => text.includes(word))
      const score = hits.length * 3 + Math.min(span, 8)
      const reason = hits.length
        ? `Matches “${hits.slice(0, 3).join(', ')}”.`
        : span >= 2
          ? 'Kept as a longer remaining shot.'
          : 'Short shot, used only if the reel still has room.'
      return { clip, span, score, reason }
    })
    .filter((row) => row.span > 0.4)
    .sort((a, b) => b.score - a.score)

  const picks: ReelPick[] = []
  let used = 0
  for (const row of ranked) {
    if (used >= targetSec) break
    const take = Math.min(row.span, targetSec - used)
    picks.push({
      id: row.clip.id,
      start: row.clip.start,
      end: row.clip.start + take,
      score: row.score,
      reason: row.reason,
    })
    used += take
  }
  return picks
}
