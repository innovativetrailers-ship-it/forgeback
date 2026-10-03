export declare class MissingFalRouterKeyError extends Error {
    constructor();
}
export interface FalRouterMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{
        type: string;
        text?: string;
        image_url?: {
            url: string;
        };
    }>;
}
export interface FalRouterChatResult {
    content: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
}
export interface FalRouterChatInput {
    model: string;
    messages: FalRouterMessage[];
    maxTokens?: number;
    temperature?: number;
    source: string;
    /** Live web search on the text router. Vision calls ignore this. */
    webSearch?: boolean;
    ignorePause?: boolean;
    falKey?: string;
    timeoutMs?: number;
    /** OpenAI JSON mode. The router schema accepts any Chat Completions field. */
    responseFormat?: 'json_object';
}
/**
 * One LLM egress. Message-shaped calls use the OpenAI-compatible router.
 * Image parts use the vision family. Auth is FAL_KEY. Pause matches video.
 */
export declare function postFalRouterChat(input: FalRouterChatInput, fetchImpl?: typeof fetch): Promise<FalRouterChatResult>;
