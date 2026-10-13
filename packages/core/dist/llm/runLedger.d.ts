export interface PaidCallRecord {
    seq: number;
    runId: string;
    kind: string;
    purpose: string;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    ms: number;
    caller: string;
}
export declare function llmBudgetForScenes(scenes: number): number;
export declare function beginLlmRun(id: string, nextBudget?: number): void;
export declare function assertLlmBudget(purpose: string): void;
export declare function falCallKind(endpoint: string): string;
export declare function recordPaidCall(entry: Omit<PaidCallRecord, 'seq' | 'runId'>): void;
export declare function recordLlmRetry(step: string): void;
export declare function recordLlmCall(entry: Omit<PaidCallRecord, 'seq' | 'runId' | 'kind'> & {
    kind?: string;
}): void;
export declare function finishLlmRun(): number;
