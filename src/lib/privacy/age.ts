export function ageYears(dateOfBirth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear()
  const month = now.getUTCMonth() - dateOfBirth.getUTCMonth()
  if (month < 0 || (month === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) age -= 1
  return age
}
