import { type LocalTaskPayload } from './localIsolation';
export declare const LOCAL_MODEL_ROLES: readonly ["t2v", "i2v", "image", "upscale"];
export type LocalModelRole = (typeof LOCAL_MODEL_ROLES)[number];
export interface LocalModelRecord {
    id: string;
    name: string;
    endpoint: string;
    role: LocalModelRole;
    enabled: boolean;
    workflow?: unknown;
    /** A locally trained LoRA name. It is config, not Forge training data. */
    lora?: string;
    status: 'unknown' | 'reachable' | 'down';
}
export declare function routableLocalModels(models: readonly LocalModelRecord[]): LocalModelRecord[];
export declare function upsertLocalModel(models: readonly LocalModelRecord[], next: LocalModelRecord): LocalModelRecord[];
export declare function setLocalModelEnabled(models: readonly LocalModelRecord[], id: string, enabled: boolean): LocalModelRecord[];
export declare function localModelForRole(models: readonly LocalModelRecord[], role: LocalModelRole): LocalModelRecord | null;
/** A chosen local model that is down fails here. Nothing else is substituted. */
export declare function requireLocalModel(models: readonly LocalModelRecord[], id: string): LocalModelRecord;
export declare function probeLocalModel(endpoint: string, fetchImpl?: typeof fetch): Promise<'reachable' | 'down'>;
export interface LocalShotRequest {
    model: LocalModelRecord;
    shotPrompt: string;
    seed?: number;
    referenceImages?: string[];
    duration?: number;
    pausedEnv?: string;
}
/** Leaf submit. The meter is $0. Pause still applies. The body is the whitelist only. */
export declare function runLocalShot(request: LocalShotRequest, fetchImpl?: typeof fetch): Promise<{
    mediaUrl: string;
    costUsd: 0;
    libraryTake: true;
}>;
export type { LocalTaskPayload };
