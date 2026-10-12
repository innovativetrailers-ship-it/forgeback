/** Desktop cognition relays are paid. Internal accounts are not charged. */

export class RelayRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RelayRefused'
  }
}

export async function runMetered<T>(input: {
  balance: number
  isInternal: boolean
  estimate: number
  run: () => Promise<T>
  openHold: (amount: number) => Promise<void>
  settle: () => Promise<void>
  release: () => Promise<void>
}): Promise<T> {
  const held = Math.ceil(input.estimate * 1.2)
  if (!input.isInternal && input.balance < held) {
    throw new RelayRefused('Insufficient credits')
  }
  await input.openHold(input.estimate)
  try {
    const value = await input.run()
    await input.settle()
    return value
  } catch (err) {
    await input.release()
    throw err
  }
}

/** Two holds against one balance. The second is refused when the first already took the funds. */
export function debitIfCovered(balance: number, amount: number): { ok: boolean; balance: number } {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, balance }
  if (balance < amount) return { ok: false, balance }
  return { ok: true, balance: balance - amount }
}

export function subscriptionCreditData(credits: number): { creditBalance: { increment: number } } {
  return { creditBalance: { increment: credits } }
}

export function jobIdsToRelease(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
}
