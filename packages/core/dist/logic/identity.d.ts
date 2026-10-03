export interface PromptCharacter {
    name: string;
    descriptor?: string;
    wardrobe?: string;
}
export interface PromptLocation {
    label: string;
    descriptor?: string;
}
export interface PromptCamera {
    angle?: string;
    movement?: string;
    shotSize?: string;
    lens?: string;
    speed?: string;
}
export declare function cameraSentence(camera?: PromptCamera | null): string | undefined;
/** OpenAPI maxLength wins. Known families cover cached schemas that omitted it. */
export declare function maxPromptCharsForEndpoint(endpoint: string, schemaMax?: number): number | undefined;
/** Shorten on a word boundary. A single oversized token is cut at the limit. */
export declare function capPromptText(text: string, max: number): string;
/**
 * Deterministic prompt merge. No model call.
 * Base action stays first. Camera, then a short character clause, then
 * location are added only while they fit maxChars.
 */
export declare function composeShotPrompt(prompt: string, characters: PromptCharacter[], location?: PromptLocation | null, camera?: PromptCamera | null, maxChars?: number, style?: string | null): string;
