import type { ShotError } from './errorNet';
/** The only fields a local model is allowed to see. */
export interface LocalTaskPayload {
    shotPrompt: string;
    seed?: number;
    referenceImages?: string[];
    duration?: number;
    params?: Record<string, string | number | boolean>;
}
export declare class LocalModelRefusal extends Error {
    readonly shotError: ShotError;
    constructor(message: string, endpoint: string);
}
/** Whitelist builder. Unknown fields are dropped, including system text and other shots. */
export declare function buildLocalTaskPayload(input: Record<string, unknown>): LocalTaskPayload;
export declare function assertLocalPayloadClosed(payload: LocalTaskPayload): void;
/** Localhost, or an origin the user typed. No userinfo, no Forge credentials. */
export declare function assertLocalEndpoint(endpoint: string, allow?: readonly string[]): URL;
export declare function localRequestHeaders(): Record<string, string>;
/** ComfyUI workflow JSON is data. Slot text is substituted. Nothing is executed. */
export declare function injectWorkflowSlots(workflow: unknown, shotPrompt: string): unknown;
/** A return is a media URL or it is rejected. It is never treated as code. */
export declare function validateLocalResult(value: unknown, endpoint?: string): {
    mediaUrl: string;
};
export interface LocalSubmitInput {
    endpoint: string;
    allow?: readonly string[];
    task: Record<string, unknown>;
    workflow?: unknown;
    pausedEnv?: string;
    enabledEnv?: string;
}
/** Posts the whitelist only. Records a zero-cost local call. Does not send Forge credentials. */
export declare function submitLocalTask(input: LocalSubmitInput, fetchImpl?: typeof fetch): Promise<{
    mediaUrl: string;
}>;
