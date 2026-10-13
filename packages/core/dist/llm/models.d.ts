export type LlmTier = 'mechanical' | 'creative' | 'hard';
/** One place to retune director models. Env overrides the routing-table default. */
export declare function llmModelForTier(tier?: LlmTier): string;
