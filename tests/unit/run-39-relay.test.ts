import { describe, expect, it } from '@jest/globals'
import { spawnSync } from 'node:child_process'
import { allocationDraw, assertEstimate, serverEstimate, settleWithinHold, withinConcurrent } from '../../src/lib/billing/relayPolicy'
import { pauseReason, resolveRelayTarget } from '../../src/lib/desktop/relayTarget'
import { isUngatedAccount, ALLOWED_INTERNAL_EMAIL } from '../../src/lib/billing/accountAllow'
import { RelayRefused, runMetered } from '../../src/lib/billing/relayMeter'

describe('relay policy', () => {
  it('computes the estimate on the server', () => {
    expect(serverEstimate('video')).toBe(20)
    expect(() => assertEstimate(0)).toThrow('allowed size')
    expect(() => assertEstimate(10_000)).toThrow('allowed size')
  })

  it('refuses a provider path that is not in the registry', () => {
    expect(() => resolveRelayTarget('fal-ai/not-a-real-model')).toThrow(RelayRefused)
  })

  it('accepts the language registry key', () => {
    expect(resolveRelayTarget('claude').category).toBe('llm')
  })

  it('treats an unset pause flag as paused', () => {
    expect(pauseReason('')).toBe('Generation is paused.')
    expect(pauseReason('false')).toBeNull()
  })

  it('draws allocation before purchased credits', () => {
    expect(allocationDraw(3, 10, 5)).toEqual({ allocation: 0, purchased: 8 })
    expect(allocationDraw(1, 1, 5)).toBeNull()
  })

  it('does not charge above the hold', () => {
    expect(settleWithinHold(10, 12).exceeded).toBe(true)
    expect(settleWithinHold(10, 4)).toEqual({ charge: 4, release: 6, exceeded: false })
  })

  it('caps concurrent holds', () => {
    expect(withinConcurrent(2)).toBe(true)
    expect(withinConcurrent(3)).toBe(false)
  })

  it('unfunded call refused before any provider request', async () => {
    const run = jest.fn()
    await expect(runMetered({
      balance: 0,
      isInternal: false,
      estimate: 10,
      run,
      openHold: async () => {},
      settle: async () => {},
      release: async () => {},
    })).rejects.toThrow('Insufficient credits')
    expect(run).not.toHaveBeenCalled()
  })

  it('funded call holds then settles', async () => {
    const steps: string[] = []
    const value = await runMetered({
      balance: 100,
      isInternal: false,
      estimate: 10,
      run: async () => { steps.push('run'); return 'ok' },
      openHold: async () => { steps.push('hold') },
      settle: async () => { steps.push('settle') },
      release: async () => { steps.push('release') },
    })
    expect(value).toBe('ok')
    expect(steps).toEqual(['hold', 'run', 'settle'])
  })

  it('release exactly once', async () => {
    let releases = 0
    await expect(runMetered({
      balance: 100,
      isInternal: false,
      estimate: 10,
      run: async () => { throw new Error('provider failed') },
      openHold: async () => {},
      settle: async () => {},
      release: async () => { releases += 1 },
    })).rejects.toThrow('provider failed')
    expect(releases).toBe(1)
  })

  it('other email can never be marked internal by the script', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { assertInternalEmail, ALLOWED_INTERNAL_EMAIL } from './scripts/grant-internal.mjs'
      let refused = false
      try { assertInternalEmail('other@example.com') } catch { refused = true }
      if (!refused) process.exit(2)
      if (assertInternalEmail(ALLOWED_INTERNAL_EMAIL) !== ALLOWED_INTERNAL_EMAIL) process.exit(3)
    `], { cwd: process.cwd(), encoding: 'utf8' })
    expect(result.status).toBe(0)
  })

  it('an internal flag on another email is ignored', () => {
    expect(isUngatedAccount('other@example.com', true)).toBe(false)
    expect(isUngatedAccount(ALLOWED_INTERNAL_EMAIL.toUpperCase(), true)).toBe(true)
    expect(isUngatedAccount(ALLOWED_INTERNAL_EMAIL, false)).toBe(false)
  })
})
