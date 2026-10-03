import { type PremiseLock } from './premiseLock';
export declare const INGEST_TYPES: readonly ["script", "treatment", "character_ref", "location_ref", "rough_cut", "style_ref", "link", "pdf", "audio_sample", "unknown"];
export type IngestType = (typeof INGEST_TYPES)[number];
export declare const INGEST_UNDERSTAND_SOURCE = "ingest.understand";
export declare const INGEST_EMBED_SOURCE = "ingest.embed";
export declare function isIngestType(value: string): value is IngestType;
export declare class IngestConsentError extends Error {
    constructor(message: string);
}
/** Uploaded media is the user's. Platform models are not trained on it. */
export declare function assertIngestConsent(consent: boolean): void;
export interface DetectInput {
    filename?: string;
    mime?: string;
    url?: string;
    text?: string;
    magic?: string;
}
export declare function detectType(input: DetectInput): IngestType;
export declare function sniffTextType(text: string, filename?: string): IngestType;
export interface ParsedScript {
    scenes: Array<{
        heading: string;
        body: string;
    }>;
    characters: string[];
    locations: string[];
    text: string;
}
export declare function parseFountainLocal(text: string): ParsedScript;
export declare function chunkText(text: string, size?: number, overlap?: number): string[];
export declare function mergePremiseLocks(base: PremiseLock, incoming: PremiseLock): PremiseLock;
export declare function premiseFromTreatmentText(text: string): PremiseLock | null;
export declare function matchEntityName(name: string, existing: string[]): string | null;
export interface MeasuredLook {
    palette: string[];
    contrast: 'low' | 'medium' | 'high';
    framing: string;
    summary: string;
}
export declare function measuredLookFromPalette(rgb: Array<{
    r: number;
    g: number;
    b: number;
}>, framing?: string): MeasuredLook;
export interface UnderstandResult {
    role: string;
    description: string;
    type: IngestType;
    links: {
        characterName?: string;
        locationName?: string;
        scene?: string;
        style?: string;
    };
}
export declare function parseUnderstandJson(raw: unknown, fallbackType: IngestType): UnderstandResult;
