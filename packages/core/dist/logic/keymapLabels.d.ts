/** Display names for keymap presets. Internal ids stay stable so saved maps still load. */
export declare const KEYMAP_PRESET_IDS: readonly ["premiere", "resolve", "fcp", "forge"];
export type KeymapPresetId = (typeof KEYMAP_PRESET_IDS)[number];
export declare const KEYMAP_PRESET_LABELS: Record<KeymapPresetId, string>;
export declare const KEYMAP_PRESET_BLURBS: Record<KeymapPresetId, string>;
export declare function migrateKeymapPreset(saved: string | null | undefined): KeymapPresetId;
