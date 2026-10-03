export declare class NonTextChatError extends Error {
    constructor();
}
/** Anthropic ids use claude-haiku-4-5. OpenRouter examples use anthropic/claude-haiku-4.5. */
export declare function openRouterModelId(model: string): string;
/**
 * Verified FAL `openrouter/router` input: model, prompt, system_prompt, max_tokens.
 * Image and tool blocks are refused so they are not dropped on the floor.
 */
export declare function openRouterChatInput(args: {
    model: string;
    system?: unknown;
    messages: unknown[];
    maxTokens?: number;
}): {
    model: string;
    prompt: string;
    system_prompt?: string;
    max_tokens?: number;
};
export declare function openRouterOutputText(data: unknown): string;
