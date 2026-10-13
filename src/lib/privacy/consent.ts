import { db } from '@/lib/db'
import { ageYears } from '@/lib/privacy/age'

export const CONSENT_TEXT_VERSION = '2026-10-13'
export { ageYears }

export async function recordConsent(userId: string, subject: string, scope: string): Promise<void> {
  await db.consentRecord.create({
    data: { userId, subject, scope, textVersion: CONSENT_TEXT_VERSION },
  })
}
