/** Pure rules for the paid relay. No database and no provider calls. */

export const MAX_ESTIMATE = 200
export const MAX_CONCURRENT_HOLDS = 3
export const SUBMITS_PER_MINUTE = 10

export function serverEstimate(category: string): number {
  if (category === 'video') return 20
  if (category === 'image') return 4
  if (category === 'audio') return 3
  if (category === 'llm') return 2
  return 8
}

export function assertEstimate(estimate: number): void {
  if (!Number.isFinite(estimate) || estimate <= 0 || estimate > MAX_ESTIMATE) {
    throw new Error('That job is outside the allowed size.')
  }
}

export function withinConcurrent(activeHolds: number): boolean {
  return activeHolds < MAX_CONCURRENT_HOLDS
}

/** Draw the monthly allocation first, then purchased credits. */
export function allocationDraw(
  allocation: number,
  purchased: number,
  amount: number,
): { allocation: number; purchased: number } | null {
  if (!Number.isFinite(amount) || amount < 0) return null
  if (allocation + purchased < amount) return null
  const fromAllocation = Math.min(Math.max(0, allocation), amount)
  return {
    allocation: allocation - fromAllocation,
    purchased: purchased - (amount - fromAllocation),
  }
}

/** Never charge more than the hold. An overrun cancels instead of overdrawing. */
export function settleWithinHold(held: number, actual: number): { charge: number; release: number; exceeded: boolean } {
  if (actual > held) return { charge: 0, release: held, exceeded: true }
  const charge = Math.max(0, actual)
  return { charge, release: held - charge, exceeded: false }
}
