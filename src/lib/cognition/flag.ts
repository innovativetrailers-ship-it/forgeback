/** Off only when COGNITION_ENABLED is false, 0, or off. A failed stage still degrades. */
export function cognitionEnabled(): boolean {
  const raw = process.env.COGNITION_ENABLED?.trim().toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off'
}
