/** The only account that is not charged. Not read from client input. */
export const ALLOWED_INTERNAL_EMAIL = 'innovative.trailers@gmail.com'

export function isUngatedAccount(email: string | null | undefined, isInternal: boolean): boolean {
  return isInternal === true && (email ?? '').trim().toLowerCase() === ALLOWED_INTERNAL_EMAIL
}
