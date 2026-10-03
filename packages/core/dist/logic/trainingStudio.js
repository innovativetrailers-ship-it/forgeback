"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STUDIO_SUBCATEGORIES = exports.STUDIO_TABS = void 0;
exports.isStudioTab = isStudioTab;
exports.assetTypeForTab = assetTypeForTab;
exports.defaultSubcategory = defaultSubcategory;
exports.recommendTrainer = recommendTrainer;
const trainerRegistry_1 = require("./trainerRegistry");
const importRights_1 = require("./importRights");
exports.STUDIO_TABS = ['cast', 'styles', 'assets', 'voices', 'music'];
exports.STUDIO_SUBCATEGORIES = {
    cast: [
        { id: 'lead', label: 'Lead' },
        { id: 'supporting', label: 'Supporting' },
        { id: 'creature', label: 'Creature' },
        { id: 'ensemble', label: 'Ensemble' },
    ],
    assets: [
        { id: 'vehicle', label: 'Vehicle' },
        { id: 'prop', label: 'Prop / weapon' },
        { id: 'product', label: 'Product' },
        { id: 'set-piece', label: 'Set piece' },
    ],
    styles: [
        { id: 'movie', label: 'Movie' },
        { id: 'tv', label: 'TV' },
        { id: 'anime', label: 'Anime' },
        { id: 'documentary', label: 'Documentary' },
        { id: 'sport', label: 'Sport' },
        { id: 'racing', label: 'Racing' },
    ],
    voices: [
        { id: 'dialogue', label: 'Dialogue' },
        { id: 'narration', label: 'Narrator' },
        { id: 'announcer', label: 'Announcer' },
    ],
    music: [
        { id: 'score', label: 'Score style' },
        { id: 'sfx', label: 'SFX palette' },
    ],
};
function isStudioTab(value) {
    return exports.STUDIO_TABS.includes(value);
}
function assetTypeForTab(tab) {
    if (tab === 'styles')
        return 'style';
    if (tab === 'music')
        return 'audio_style';
    return 'character';
}
function defaultSubcategory(tab) {
    return exports.STUDIO_SUBCATEGORIES[tab][0]?.id ?? '';
}
/**
 * Orchestrator handoff: the sidebar collects tab + subcategory + media.
 * This picks the verified trainer. The UI does not choose a raw FAL id.
 */
function recommendTrainer(input) {
    const kinds = new Set(input.kinds ?? []);
    if (input.tab === 'music') {
        const trainer = (0, trainerRegistry_1.trainerDef)('stable-audio-3');
        if (!trainer)
            throw new Error('stable-audio-3 trainer missing');
        return { trainerKey: 'stable-audio-3', trainer };
    }
    if (input.tab === 'styles') {
        const domain = (0, importRights_1.domainFromSubcategory)(input.subcategory);
        if (domain) {
            const prep = (0, importRights_1.importPrep)({ domain, kinds: input.kinds, tab: 'styles' });
            return { trainerKey: prep.trainerKey, trainer: prep.trainer };
        }
        if (kinds.has('video') || !kinds.size) {
            const trainer = (0, trainerRegistry_1.trainerDef)('wan-22');
            if (!trainer)
                throw new Error('wan-22 trainer missing');
            return { trainerKey: 'wan-22', trainer };
        }
        const trainer = (0, trainerRegistry_1.trainerDef)('flux-2');
        if (!trainer)
            throw new Error('flux-2 trainer missing');
        return { trainerKey: 'flux-2', trainer };
    }
    if (input.tab === 'voices') {
        throw new Error('Voices clone or design — they are not LoRA trainers');
    }
    const trainer = (0, trainerRegistry_1.primaryCastTrainer)();
    return { trainerKey: 'wan-22', trainer };
}
//# sourceMappingURL=trainingStudio.js.map