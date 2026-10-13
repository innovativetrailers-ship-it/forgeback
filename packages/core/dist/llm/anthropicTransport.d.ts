export declare class MissingApiKeyError extends Error {
    constructor();
}
export declare class MissingWorkspaceError extends Error {
    constructor();
}
export interface AnthropicContentBlock {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
    source?: unknown;
}
export interface AnthropicMessagesResult {
    id: string;
    type: 'message';
    role: 'assistant';
    model: string;
    content: AnthropicContentBlock[];
    stop_reason: string | null;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}
export interface AnthropicMessagesInput {
    model: string;
    maxTokens: number;
    system?: unknown;
    messages: unknown[];
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    timeoutMs?: number;
    /** Ignored. The router authenticates with FAL_KEY. */
    apiKey?: string;
    /** Ignored. Kept so older callers still type-check. */
    workspaceId?: string;
    falKey?: string;
    source: string;
    /** Set only after the caller already allowed a named interactive source. */
    ignorePause?: boolean;
    responseFormat?: 'json_object';
}
export declare function anthropicMessageText(result: AnthropicMessagesResult): string;
export declare function postAnthropicMessages(input: AnthropicMessagesInput): Promise<AnthropicMessagesResult>;
