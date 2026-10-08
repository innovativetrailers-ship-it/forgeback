"use strict";
/** Display names for keymap presets. Internal ids stay stable so saved maps still load. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KEYMAP_PRESET_BLURBS = exports.KEYMAP_PRESET_LABELS = exports.KEYMAP_PRESET_IDS = void 0;
exports.migrateKeymapPreset = migrateKeymapPreset;
exports.KEYMAP_PRESET_IDS = ['premiere', 'resolve', 'fcp', 'forge'];
exports.KEYMAP_PRESET_LABELS = {
    premiere: 'Studio Track Editor',
    resolve: 'Colour & Finishing',
    fcp: 'Magnetic Timeline',
    forge: 'Forge',
};
exports.KEYMAP_PRESET_BLURBS = {
    premiere: 'Track-based layout and shortcuts for traditional timeline editors.',
    resolve: 'Page-style workflow and shortcuts for grading and finishing.',
    fcp: 'Magnetic-timeline workflow and shortcuts.',
    forge: "Forge's own keymap.",
};
const LEGACY_PRESET_IDS = {
    Premiere: 'premiere',
    Resolve: 'resolve',
    'Final Cut': 'fcp',
    Forge: 'forge',
    premiere: 'premiere',
    resolve: 'resolve',
    fcp: 'fcp',
    forge: 'forge',
    davinci: 'resolve',
    finalcut: 'fcp',
    avid: 'premiere',
};
function migrateKeymapPreset(saved) {
    if (saved && LEGACY_PRESET_IDS[saved])
        return LEGACY_PRESET_IDS[saved];
    return 'forge';
}
//# sourceMappingURL=keymapLabels.js.map