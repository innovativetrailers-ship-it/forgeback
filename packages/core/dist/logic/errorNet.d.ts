export declare const ERROR_STAGES: readonly ["submit", "poll", "completion", "assembly", "runtime"];
export type ErrorStage = (typeof ERROR_STAGES)[number];
export declare const ERROR_CATEGORIES: readonly ["content_flag", "payload_over_limit", "field_mismatch", "namespace_bad", "provider_transient", "auth_config", "unsupported_mode", "code_error", "unknown"];
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];
export declare const ERROR_ACTIONS: readonly ["retry", "alter_prompt", "reduce_refs", "change_model", "wait_retry", "reduce_duration"];
export type ErrorAction = (typeof ERROR_ACTIONS)[number];
export interface ShotError {
    shotId?: string;
    model?: string;
    mode?: string;
    purpose?: string;
    endpoint: string;
    stage: ErrorStage;
    httpStatus?: number;
    falRequestId?: string;
    rawError: string;
    providerLogs?: string[];
    payloadSnapshot?: Record<string, unknown>;
    timestamp?: string;
}
export interface InterpretedError {
    userMessage: string;
    suggestedAction: ErrorAction;
    category: ErrorCategory;
    correctable: boolean;
    correction?: string;
}
export declare function isErrorCategory(value: string): value is ErrorCategory;
export declare function isErrorAction(value: string): value is ErrorAction;
/** Strip ids/urls so the same class shares a cache key. */
export declare function normalizeErrorSignature(raw: string): string;
export declare function interpretErrorRules(rawError: string, httpStatus?: number): InterpretedError;
export declare function providerBodyText(body: unknown): string;
export declare function collectProviderLogs(body: unknown): string[];
/** FAL status/result URLs omit logs unless asked — `logs=1` is the with_logs subscribe equivalent. */
export declare function urlWithProviderLogs(url: string): string;
