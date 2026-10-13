export declare class GenerationPausedError extends Error {
    readonly code: "GENERATION_PAUSED";
    constructor(message: string);
}
export declare class PaidCallRefusedError extends Error {
    constructor(message: string);
}
/** Shared pause predicate. Omitted or any value other than false/0/off means paused. */
export declare function generationPausedFromEnv(value: string | undefined): boolean;
/** Every paid call must name its caller. Hosts throw their own error type around this. */
export declare function requireCallerSource(source: string | undefined): string;
export interface PaidCallContext {
    source: string;
    billableClass?: 'interactive' | 'eval' | 'background';
}
