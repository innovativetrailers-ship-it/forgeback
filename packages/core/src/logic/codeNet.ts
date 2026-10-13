export class BoundaryError extends Error {
  readonly code = 'BOUNDARY_INVALID' as const
  constructor(message: string) {
    super(message)
    this.name = 'BoundaryError'
  }
}

/** Missing arrays degrade to [] — never crash on .map/.length. */
export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function parseJsonObject(raw: string, label = 'payload'): Record<string, unknown> {
  const text = raw.replace(/```json|```/g, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new BoundaryError(`${label} is not a JSON object`)
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BoundaryError(`${label} is not a JSON object`)
    }
    return parsed as Record<string, unknown>
  } catch (err) {
    if (err instanceof BoundaryError) throw err
    throw new BoundaryError(`${label} is malformed JSON`)
  }
}

export interface SchemaShape {
  required?: string[]
  properties: string[] | Record<string, unknown>
  enums?: Record<string, Array<string | number>>
}

export interface PayloadSchemaReport {
  ok: boolean
  extra: string[]
  missing: string[]
  enumFails: string[]
}

/** Offline contract: payload keys must exist on the schema; required fields present. */
export function payloadFitsSchema(
  payload: Record<string, unknown>,
  schema: SchemaShape,
): PayloadSchemaReport {
  const properties = Array.isArray(schema.properties)
    ? schema.properties
    : Object.keys(schema.properties)
  const allowed = new Set(properties)
  const extra = Object.keys(payload).filter((key) => !allowed.has(key))
  const missing = (schema.required ?? []).filter((key) => payload[key] == null || payload[key] === '')
  const enumFails: string[] = []
  for (const [key, allowedValues] of Object.entries(schema.enums ?? {})) {
    if (!(key in payload)) continue
    if (!allowedValues.includes(payload[key] as string | number)) {
      enumFails.push(`${key}=${String(payload[key])}`)
    }
  }
  return {
    ok: extra.length === 0 && missing.length === 0 && enumFails.length === 0,
    extra,
    missing,
    enumFails,
  }
}

export function assertPayloadFitsSchema(
  payload: Record<string, unknown>,
  schema: SchemaShape,
  label = 'payload',
): void {
  const report = payloadFitsSchema(payload, schema)
  if (report.ok) return
  const parts = [
    report.extra.length ? `unknown ${report.extra.join(',')}` : '',
    report.missing.length ? `missing ${report.missing.join(',')}` : '',
    report.enumFails.length ? `enum ${report.enumFails.join(',')}` : '',
  ].filter(Boolean)
  throw new BoundaryError(`${label}: ${parts.join('; ')}`)
}
