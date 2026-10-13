export declare class BoundaryError extends Error {
    readonly code: "BOUNDARY_INVALID";
    constructor(message: string);
}
/** Missing arrays degrade to [] — never crash on .map/.length. */
export declare function asArray<T = unknown>(value: unknown): T[];
export declare function asRecord(value: unknown): Record<string, unknown>;
export declare function parseJsonObject(raw: string, label?: string): Record<string, unknown>;
export interface SchemaShape {
    required?: string[];
    properties: string[] | Record<string, unknown>;
    enums?: Record<string, Array<string | number>>;
}
export interface PayloadSchemaReport {
    ok: boolean;
    extra: string[];
    missing: string[];
    enumFails: string[];
}
/** Offline contract: payload keys must exist on the schema; required fields present. */
export declare function payloadFitsSchema(payload: Record<string, unknown>, schema: SchemaShape): PayloadSchemaReport;
export declare function assertPayloadFitsSchema(payload: Record<string, unknown>, schema: SchemaShape, label?: string): void;
