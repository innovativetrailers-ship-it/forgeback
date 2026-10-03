import type { PromptCamera } from './identity';
export declare const GENRE_FAMILIES: readonly ["movie", "tv", "anime", "documentary", "sport", "racing"];
export type GenreFamily = (typeof GENRE_FAMILIES)[number];
export interface GenrePreset {
    id: string;
    family: GenreFamily;
    label: string;
    stylePrompt: string;
    gradeParams: {
        look: string;
    };
    cameraDefaults: PromptCamera;
    pacing: string;
    grain: string;
}
export declare const GENRE_PRESETS: GenrePreset[];
export declare function isGenreFamily(value: string): value is GenreFamily;
export declare function isGenrePresetId(value: string): boolean;
export declare function genrePreset(id: string | null | undefined): GenrePreset | null;
export declare function presetsForFamily(family: GenreFamily): GenrePreset[];
export declare function mergeCameraDefaults(camera: PromptCamera | null | undefined, defaults?: PromptCamera): PromptCamera | null;
export declare function genreStyleFragment(id: string | null | undefined): string;
/** Instant presets are descriptors. Never a shipped LoRA of a studio's films. */
export declare const BRAND_REPLICATION_PRESETS = false;
