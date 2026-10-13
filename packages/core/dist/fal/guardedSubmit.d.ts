export interface GuardedFalSubmission {
    requestId: string;
    statusUrl: string;
    responseUrl: string;
    cancelUrl: string;
    endpoint: string;
}
/** The one FAL queue submit. Web and desktop both call this. */
export declare function guardedFalSubmit(input: {
    endpoint: string;
    input: Record<string, unknown>;
    source: string;
    falKey: string;
    pausedEnv?: string;
    webhookUrl?: string;
}): Promise<GuardedFalSubmission>;
