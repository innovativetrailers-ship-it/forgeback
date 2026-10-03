"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoundaryError = void 0;
exports.asArray = asArray;
exports.asRecord = asRecord;
exports.parseJsonObject = parseJsonObject;
exports.payloadFitsSchema = payloadFitsSchema;
exports.assertPayloadFitsSchema = assertPayloadFitsSchema;
class BoundaryError extends Error {
    code = 'BOUNDARY_INVALID';
    constructor(message) {
        super(message);
        this.name = 'BoundaryError';
    }
}
exports.BoundaryError = BoundaryError;
/** Missing arrays degrade to [] — never crash on .map/.length. */
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
}
function parseJsonObject(raw, label = 'payload') {
    const text = raw.replace(/```json|```/g, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start)
        throw new BoundaryError(`${label} is not a JSON object`);
    try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new BoundaryError(`${label} is not a JSON object`);
        }
        return parsed;
    }
    catch (err) {
        if (err instanceof BoundaryError)
            throw err;
        throw new BoundaryError(`${label} is malformed JSON`);
    }
}
/** Offline contract: payload keys must exist on the schema; required fields present. */
function payloadFitsSchema(payload, schema) {
    const properties = Array.isArray(schema.properties)
        ? schema.properties
        : Object.keys(schema.properties);
    const allowed = new Set(properties);
    const extra = Object.keys(payload).filter((key) => !allowed.has(key));
    const missing = (schema.required ?? []).filter((key) => payload[key] == null || payload[key] === '');
    const enumFails = [];
    for (const [key, allowedValues] of Object.entries(schema.enums ?? {})) {
        if (!(key in payload))
            continue;
        if (!allowedValues.includes(payload[key])) {
            enumFails.push(`${key}=${String(payload[key])}`);
        }
    }
    return {
        ok: extra.length === 0 && missing.length === 0 && enumFails.length === 0,
        extra,
        missing,
        enumFails,
    };
}
function assertPayloadFitsSchema(payload, schema, label = 'payload') {
    const report = payloadFitsSchema(payload, schema);
    if (report.ok)
        return;
    const parts = [
        report.extra.length ? `unknown ${report.extra.join(',')}` : '',
        report.missing.length ? `missing ${report.missing.join(',')}` : '',
        report.enumFails.length ? `enum ${report.enumFails.join(',')}` : '',
    ].filter(Boolean);
    throw new BoundaryError(`${label}: ${parts.join('; ')}`);
}
//# sourceMappingURL=codeNet.js.map