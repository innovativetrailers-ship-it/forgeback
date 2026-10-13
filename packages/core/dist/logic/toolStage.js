"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IDENTITY_REFERENCE_MODEL = void 0;
exports.toolPanelsFor = toolPanelsFor;
exports.linkedVoices = linkedVoices;
exports.buildPanelPreloads = buildPanelPreloads;
exports.IDENTITY_REFERENCE_MODEL = 'seedance-2.0';
function toolPanelsFor(control, silentOnly) {
    const panels = ['prompt', 'duration_resolution'];
    if (control.cameraControl === 'prompt_only')
        panels.push('camera_prompt');
    if (control.motionBrush)
        panels.push('camera_motion_brush');
    if (control.cameraControl === 'full' || control.cameraControl === 'params')
        panels.push('camera_path');
    if (control.cameraControl === 'presets')
        panels.push('camera_presets');
    if (control.referenceClass === 'true_reference' || control.maxReferenceImages > 0)
        panels.push('reference_images');
    if (control.firstLastFrame)
        panels.push('first_last_frame');
    if (control.referenceClass !== 'none' || control.firstLastFrame)
        panels.push('first_frame');
    return panels;
}
function linkedVoices(characters) {
    return characters.flatMap((character) => {
        const voiceId = character.voiceId?.trim();
        return voiceId ? [{ name: character.name, voiceId }] : [];
    });
}
function buildPanelPreloads(control, silentOnly, input) {
    const panels = toolPanelsFor(control, silentOnly);
    const referenceCapable = input.referenceCapable ?? control.referenceClass === 'true_reference';
    const slots = [];
    if (panels.includes('reference_images') && referenceCapable) {
        for (const character of input.characters) {
            for (const url of character.referenceUrls) {
                if (slots.length >= control.maxReferenceImages)
                    break;
                const trimmed = url.trim();
                if (trimmed)
                    slots.push({ label: character.name, url: trimmed });
            }
            if (slots.length >= control.maxReferenceImages)
                break;
        }
        const plate = input.location?.imageUrl.trim();
        if (plate && slots.length < control.maxReferenceImages) {
            slots.push({ label: input.location?.label || 'Location', url: plate });
        }
    }
    const hasIdentity = input.characters.some((character) => character.referenceUrls.some((url) => url.trim()));
    const identityNeedsTrueReference = hasIdentity && !referenceCapable;
    let firstFrameUrl = input.anchorFrameUrl?.trim() || undefined;
    if (!firstFrameUrl && control.referenceClass !== 'true_reference') {
        firstFrameUrl = input.location?.imageUrl.trim()
            || input.characters.flatMap((character) => character.referenceUrls).find((url) => url.trim())?.trim();
    }
    const lastFrameUrl = panels.includes('first_last_frame') && slots.length === 0
        ? input.endFrameUrl?.trim() || undefined
        : undefined;
    return { panels, referenceSlots: slots, firstFrameUrl, lastFrameUrl, identityNeedsTrueReference };
}
//# sourceMappingURL=toolStage.js.map