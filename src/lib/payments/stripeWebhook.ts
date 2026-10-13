export function hasStripeSignature(header: string | null): header is string {
  return Boolean(header && header.trim())
}
